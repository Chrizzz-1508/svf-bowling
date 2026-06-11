using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Auth;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;

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
        auth.MapPost("/change-password", async (ChangePasswordRequest req, ClaimsPrincipal principal, AppDbContext db) =>
        {
            var user = await CurrentUser(principal, db);
            if (user is null) return Results.Unauthorized();
            if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
                return Results.BadRequest(new { message = "Aktuelles Passwort ist falsch." });
            if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
                return Results.BadRequest(new { message = "Neues Passwort muss mindestens 6 Zeichen haben." });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        // --- Benutzerverwaltung (nur Admin) ---
        var users = app.MapGroup("/api/admin/users").WithTags("Benutzer").RequireAuthorization("Admin");

        users.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.AdminUsers.OrderBy(u => u.Username).Select(u => ToDto(u)).ToListAsync()));

        users.MapPost("/", async (CreateUserRequest req, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { message = "Benutzername und Passwort sind erforderlich." });
            if (await db.AdminUsers.AnyAsync(u => u.Username == req.Username))
                return Results.Conflict(new { message = "Benutzername ist bereits vergeben." });

            var user = new AdminUser
            {
                Username = req.Username,
                Email = req.Email,
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

            if (req.Email is not null) user.Email = req.Email;
            if (req.Role is not null) user.Role = req.Role == "Admin" ? "Admin" : "Editor";
            if (req.IsActive is not null) user.IsActive = req.IsActive.Value;
            if (!string.IsNullOrWhiteSpace(req.Password))
                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);

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
}
