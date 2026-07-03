using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Auth;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;
using SvfBowling.Api.Services;

namespace SvfBowling.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth").WithTags("Auth");

        // --- Login ---
        auth.MapPost("/login", async (LoginRequest req, AppDbContext db, JwtTokenService tokens) =>
        {
            var user = await db.AdminUsers.FirstOrDefaultAsync(u => u.Username == req.Username);
            if (user is null || !user.IsActive || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Results.Unauthorized();

            user.LastLoginAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            var (token, expires) = tokens.CreateToken(user);
            return Results.Ok(new LoginResponse(token, expires, ToDto(user)));
        });

        // --- Aktuell angemeldeter Benutzer ---
        auth.MapGet("/me", async (ClaimsPrincipal principal, AppDbContext db) =>
        {
            var user = await CurrentUser(principal, db);
            return user is null ? Results.Unauthorized() : Results.Ok(ToDto(user));
        }).RequireAuthorization();

        // --- Eigenes Passwort ändern ---
        auth.MapPost("/change-password", async (ChangePasswordRequest req, ClaimsPrincipal principal, AppDbContext db, JwtTokenService tokens) =>
        {
            var user = await CurrentUser(principal, db);
            if (user is null) return Results.Unauthorized();
            if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
                return Results.BadRequest(new { message = "Aktuelles Passwort ist falsch." });
            if (!IsValidPassword(req.NewPassword))
                return Results.BadRequest(new { message = PasswordRequirement });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            user.TokenVersion++;
            ClearPasswordReset(user);
            await db.SaveChangesAsync();

            var (token, expires) = tokens.CreateToken(user);
            return Results.Ok(new LoginResponse(token, expires, ToDto(user)));
        }).RequireAuthorization();

        // Die Antwort ist für vorhandene und unbekannte Adressen absichtlich gleich,
        // damit über diesen Endpunkt keine Benutzerkonten ermittelt werden können.
        auth.MapPost("/forgot-password", async (
            ForgotPasswordRequest req,
            AppDbContext db,
            IPasswordResetEmailSender emailSender,
            IConfiguration config,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken) =>
        {
            if (!emailSender.IsConfigured)
                return Results.Json(new { message = "Passwort-Reset per E-Mail ist noch nicht eingerichtet." }, statusCode: 503);

            var genericResponse = Results.Ok(new
            {
                message = "Falls ein aktives Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen versendet."
            });

            var email = NormalizeEmail(req.Email);
            if (email is null) return genericResponse;

            var user = await db.AdminUsers.FirstOrDefaultAsync(
                u => u.IsActive && u.Email != null && u.Email.ToLower() == email,
                cancellationToken);
            if (user is null) return genericResponse;

            // Verhindert, dass ein Konto mit E-Mails bombardiert wird.
            if (user.PasswordResetRequestedAt is not null &&
                user.PasswordResetRequestedAt > DateTime.UtcNow.AddMinutes(-5))
                return genericResponse;

            var rawToken = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            user.PasswordResetTokenHash = HashResetToken(rawToken);
            user.PasswordResetTokenExpiresAt = DateTime.UtcNow.AddHours(1);
            user.PasswordResetRequestedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            var siteUrl = (config["PUBLIC_SITE_URL"] ?? "https://svf-bowling.de").TrimEnd('/');
            var resetUrl = $"{siteUrl}/admin/#reset={Uri.EscapeDataString(rawToken)}";

            try
            {
                await emailSender.SendAsync(user.Email!, resetUrl, cancellationToken);
            }
            catch (Exception ex)
            {
                ClearPasswordReset(user);
                await db.SaveChangesAsync(cancellationToken);
                loggerFactory.CreateLogger("PasswordReset").LogError(ex, "Passwort-Reset-E-Mail konnte nicht versendet werden.");
                return Results.Json(new { message = "Die E-Mail konnte gerade nicht versendet werden. Bitte später erneut versuchen." }, statusCode: 503);
            }

            return genericResponse;
        });

        auth.MapPost("/reset-password", async (ResetPasswordRequest req, AppDbContext db, CancellationToken cancellationToken) =>
        {
            if (!IsValidPassword(req.NewPassword))
                return Results.BadRequest(new { message = PasswordRequirement });
            if (string.IsNullOrWhiteSpace(req.Token))
                return Results.BadRequest(new { message = "Der Link ist ungültig oder abgelaufen." });

            var tokenHash = HashResetToken(req.Token);
            var user = await db.AdminUsers.FirstOrDefaultAsync(
                u => u.IsActive && u.PasswordResetTokenHash == tokenHash,
                cancellationToken);
            if (user is null || user.PasswordResetTokenExpiresAt is null || user.PasswordResetTokenExpiresAt <= DateTime.UtcNow)
                return Results.BadRequest(new { message = "Der Link ist ungültig oder abgelaufen." });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            user.TokenVersion++;
            ClearPasswordReset(user);
            await db.SaveChangesAsync(cancellationToken);
            return Results.NoContent();
        });

        // --- Benutzerverwaltung (nur Admin) ---
        var users = app.MapGroup("/api/admin/users").WithTags("Benutzer").RequireAuthorization("Admin");

        users.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.AdminUsers.OrderBy(u => u.Username).Select(u => ToDto(u)).ToListAsync()));

        users.MapPost("/", async (CreateUserRequest req, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Username) || !IsValidPassword(req.Password))
                return Results.BadRequest(new { message = $"Benutzername ist erforderlich. {PasswordRequirement}" });
            if (await db.AdminUsers.AnyAsync(u => u.Username == req.Username))
                return Results.Conflict(new { message = "Benutzername ist bereits vergeben." });

            var user = new AdminUser
            {
                Username = req.Username,
                Email = NormalizeEmail(req.Email),
                Role = req.Role == "Admin" ? "Admin" : "Editor",
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                IsActive = true
            };
            db.AdminUsers.Add(user);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/users/{user.Id}", ToDto(user));
        });

        users.MapPut("/{id:int}", async (int id, UpdateUserRequest req, AppDbContext db) =>
        {
            var user = await db.AdminUsers.FindAsync(id);
            if (user is null) return Results.NotFound();

            var invalidatesSessions = false;
            if (req.Email is not null) user.Email = NormalizeEmail(req.Email);
            if (req.Role is not null)
            {
                var role = req.Role == "Admin" ? "Admin" : "Editor";
                invalidatesSessions |= user.Role != role;
                user.Role = role;
            }
            if (req.IsActive is not null)
            {
                invalidatesSessions |= user.IsActive != req.IsActive.Value;
                user.IsActive = req.IsActive.Value;
            }
            if (!string.IsNullOrWhiteSpace(req.Password))
            {
                if (!IsValidPassword(req.Password))
                    return Results.BadRequest(new { message = PasswordRequirement });
                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
                invalidatesSessions = true;
                ClearPasswordReset(user);
            }

            if (invalidatesSessions) user.TokenVersion++;

            await db.SaveChangesAsync();
            return Results.Ok(ToDto(user));
        });

        users.MapDelete("/{id:int}", async (int id, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var user = await db.AdminUsers.FindAsync(id);
            if (user is null) return Results.NotFound();
            if (user.Id.ToString() == principal.FindFirstValue(ClaimTypes.NameIdentifier))
                return Results.BadRequest(new { message = "Das eigene Konto kann nicht gelöscht werden." });
            if (await db.AdminUsers.CountAsync(u => u.Role == "Admin") <= 1 && user.Role == "Admin")
                return Results.BadRequest(new { message = "Der letzte Admin kann nicht gelöscht werden." });

            db.AdminUsers.Remove(user);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<AdminUser?> CurrentUser(ClaimsPrincipal principal, AppDbContext db)
    {
        var idStr = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(idStr, out var id) ? await db.AdminUsers.FindAsync(id) : null;
    }

    private static UserDto ToDto(AdminUser u) =>
        new(u.Id, u.Username, u.Email, u.Role, u.IsActive, u.CreatedAt, u.LastLoginAt);

    private const string PasswordRequirement = "Das Passwort muss mindestens 8 Zeichen haben.";

    private static bool IsValidPassword(string? password) =>
        !string.IsNullOrWhiteSpace(password) && password.Length >= 8;

    private static string? NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    private static string HashResetToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static void ClearPasswordReset(AdminUser user)
    {
        user.PasswordResetTokenHash = null;
        user.PasswordResetTokenExpiresAt = null;
        user.PasswordResetRequestedAt = null;
    }
}
