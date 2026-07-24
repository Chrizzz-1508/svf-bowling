using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Endpoints;

public static class ContentEndpoints
{
    /// <summary>Vereinheitlichte Terminform für die öffentliche Liste (manuell + Teamup).</summary>
    public record PublicEventDto(int Id, string Source, string Title, string? Description,
        DateTime StartDate, DateTime? EndDate, string? Location, string? Category,
        int? ParticipantCount, bool SignupEnabled);

    public static void MapContentEndpoints(this WebApplication app)
    {
        MapSeasons(app);
        MapCategories(app);
        MapTeamsAndPlayers(app);
        MapEvents(app);
        MapPages(app);
        MapSettings(app);
    }

    /// <summary>UTC-Zeitpunkt von Mitternacht des heutigen Tages in deutscher Zeit.</summary>
    private static DateTime GermanMidnightUtc()
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin"); }
        catch
        {
            try { tz = TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time"); }
            catch { tz = TimeZoneInfo.Utc; }
        }
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var localMidnight = DateTime.SpecifyKind(localNow.Date, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(localMidnight, tz);
    }

    // ---------------- Saisons ----------------
    private static void MapSeasons(WebApplication app)
    {
        app.MapGet("/api/seasons", async (AppDbContext db) =>
            Results.Ok(await db.Seasons.OrderBy(s => s.SortOrder).ThenByDescending(s => s.Name).ToListAsync()))
            .WithTags("Saisons");

        var admin = app.MapGroup("/api/admin/seasons").WithTags("Saisons (Admin)").RequireAuthorization();
        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.Seasons.OrderBy(s => s.SortOrder).ThenByDescending(s => s.Name).ToListAsync()));
        admin.MapPost("/", async (Season input, AppDbContext db) =>
        {
            input.Id = 0;
            if (input.IsCurrent) await ClearCurrentSeason(db);
            db.Seasons.Add(input);
            await db.SaveChangesAsync();
            return Results.Created($"/api/seasons/{input.Id}", input);
        });
        admin.MapPut("/{id:int}", async (int id, Season input, AppDbContext db) =>
        {
            var s = await db.Seasons.FindAsync(id);
            if (s is null) return Results.NotFound();
            if (input.IsCurrent && !s.IsCurrent) await ClearCurrentSeason(db);
            s.Name = input.Name; s.StartDate = input.StartDate; s.EndDate = input.EndDate;
            s.IsCurrent = input.IsCurrent; s.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(s);
        });
        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var s = await db.Seasons.FindAsync(id);
            if (s is null) return Results.NotFound();
            db.Seasons.Remove(s);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task ClearCurrentSeason(AppDbContext db)
    {
        foreach (var s in await db.Seasons.Where(s => s.IsCurrent).ToListAsync())
            s.IsCurrent = false;
    }

    // ---------------- Kategorien ----------------
    private static void MapCategories(WebApplication app)
    {
        app.MapGet("/api/categories", async (AppDbContext db) =>
            Results.Ok(await db.Categories.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync()))
            .WithTags("Kategorien");

        var admin = app.MapGroup("/api/admin/categories").WithTags("Kategorien (Admin)").RequireAuthorization();
        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.Categories.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync()));
        admin.MapPost("/", async (Category input, AppDbContext db) =>
        {
            input.Id = 0; db.Categories.Add(input); await db.SaveChangesAsync();
            return Results.Created($"/api/categories/{input.Id}", input);
        });
        admin.MapPut("/{id:int}", async (int id, Category input, AppDbContext db) =>
        {
            var c = await db.Categories.FindAsync(id);
            if (c is null) return Results.NotFound();
            c.Name = input.Name; c.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(c);
        });
        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var c = await db.Categories.FindAsync(id);
            if (c is null) return Results.NotFound();
            db.Categories.Remove(c); await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    // ---------------- Mannschaften & Spieler ----------------
    private static void MapTeamsAndPlayers(WebApplication app)
    {
        app.MapGet("/api/teams", async (AppDbContext db) =>
            Results.Ok(await db.Teams.Where(t => t.IsActive).OrderBy(t => t.SortOrder).ToListAsync()))
            .WithTags("Mannschaften");

        app.MapGet("/api/teams/{id:int}", async (int id, AppDbContext db) =>
        {
            var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == id);
            if (team is null) return Results.NotFound();
            var players = await db.Players.Where(p => p.TeamId == id && p.IsActive)
                .OrderByDescending(p => p.Role != null &&
                    (p.Role.Contains("Mannschaftsführer") || p.Role.Contains("Trainer")))
                .ThenBy(p => p.SortOrder).ThenBy(p => p.LastName).ToListAsync();
            return Results.Ok(new { team, players });
        }).WithTags("Mannschaften");

        var admin = app.MapGroup("/api/admin/teams").WithTags("Mannschaften (Admin)").RequireAuthorization();
        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.Teams.OrderBy(t => t.SortOrder).ToListAsync()));
        admin.MapPost("/", async (Team input, AppDbContext db) =>
        {
            input.Id = 0; db.Teams.Add(input); await db.SaveChangesAsync();
            return Results.Created($"/api/teams/{input.Id}", input);
        });
        admin.MapPut("/{id:int}", async (int id, Team input, AppDbContext db) =>
        {
            var t = await db.Teams.FindAsync(id);
            if (t is null) return Results.NotFound();
            t.Name = input.Name; t.League = input.League; t.Description = input.Description;
            t.PhotoImageId = input.PhotoImageId; t.SortOrder = input.SortOrder; t.IsActive = input.IsActive;
            await db.SaveChangesAsync();
            return Results.Ok(t);
        });
        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var t = await db.Teams.FindAsync(id);
            if (t is null) return Results.NotFound();
            db.Teams.Remove(t); await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Spieler
        var players = app.MapGroup("/api/admin/players").WithTags("Spieler (Admin)").RequireAuthorization();
        players.MapGet("/", async (AppDbContext db, int? teamId) =>
        {
            var q = db.Players.AsQueryable();
            if (teamId is not null) q = q.Where(p => p.TeamId == teamId);
            return Results.Ok(await q
                .OrderByDescending(p => p.Role != null &&
                    (p.Role.Contains("Mannschaftsführer") || p.Role.Contains("Trainer")))
                .ThenBy(p => p.SortOrder).ThenBy(p => p.LastName).ToListAsync());
        });
        players.MapPost("/", async (Player input, AppDbContext db) =>
        {
            input.Id = 0; db.Players.Add(input); await db.SaveChangesAsync();
            return Results.Created($"/api/admin/players/{input.Id}", input);
        });
        players.MapPut("/{id:int}", async (int id, Player input, AppDbContext db) =>
        {
            var p = await db.Players.FindAsync(id);
            if (p is null) return Results.NotFound();
            p.FirstName = input.FirstName; p.LastName = input.LastName; p.TeamId = input.TeamId;
            p.Role = input.Role; p.SortOrder = input.SortOrder; p.IsActive = input.IsActive;
            p.Monatspokal = input.Monatspokal;
            await db.SaveChangesAsync();
            return Results.Ok(p);
        });
        players.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var p = await db.Players.FindAsync(id);
            if (p is null) return Results.NotFound();
            db.Players.Remove(p); await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    // ---------------- Termine ----------------
    private static void MapEvents(WebApplication app)
    {
        // Öffentliche Terminliste: manuell gepflegte Termine UND der gespiegelte
        // Teamup-Kalender, zusammengeführt und chronologisch sortiert.
        app.MapGet("/api/events", async (AppDbContext db, bool? upcoming) =>
        {
            var manual = await db.Events.Where(e => e.IsPublished).ToListAsync();
            var teamup = await db.TeamupEvents.ToListAsync();

            var all = manual
                .Select(e => new PublicEventDto(e.Id, "manual", e.Title, e.Description,
                    e.StartDate, e.EndDate, e.Location, null, null, false))
                .Concat(teamup.Select(t => new PublicEventDto(t.Id, "teamup", t.Title, null,
                    t.StartDate, t.EndDate, t.Location, t.Category, t.ParticipantCount, t.SignupEnabled)));

            if (upcoming == true)
            {
                // "Heute" in deutscher Zeit (nicht UTC), sonst gilt ein Termin nach
                // Mitternacht MEZ noch als "heute", weil es in UTC noch der Vortag ist.
                var todayDe = GermanMidnightUtc();
                all = all.Where(e => (e.EndDate ?? e.StartDate) >= todayDe);
            }
            return Results.Ok(all.OrderBy(e => e.StartDate).ToList());
        }).WithTags("Termine");

        var admin = app.MapGroup("/api/admin/events").WithTags("Termine (Admin)").RequireAuthorization();
        // Neueste Termine zuerst (Verwaltung)
        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.Events.OrderByDescending(e => e.StartDate).ToListAsync()));
        admin.MapPost("/", async (Event input, AppDbContext db) =>
        {
            input.Id = 0; db.Events.Add(input); await db.SaveChangesAsync();
            return Results.Created($"/api/events/{input.Id}", input);
        });
        admin.MapPut("/{id:int}", async (int id, Event input, AppDbContext db) =>
        {
            var e = await db.Events.FindAsync(id);
            if (e is null) return Results.NotFound();
            e.Title = input.Title; e.Description = input.Description; e.StartDate = input.StartDate;
            e.EndDate = input.EndDate; e.Location = input.Location; e.IsPublished = input.IsPublished;
            e.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(e);
        });
        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var e = await db.Events.FindAsync(id);
            if (e is null) return Results.NotFound();
            db.Events.Remove(e); await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    // ---------------- Seiten (Impressum etc.) ----------------
    private static void MapPages(WebApplication app)
    {
        app.MapGet("/api/pages/{slug}", async (string slug, AppDbContext db) =>
            await db.Pages.FirstOrDefaultAsync(p => p.Slug == slug) is { } p ? Results.Ok(p) : Results.NotFound())
            .WithTags("Seiten");

        var admin = app.MapGroup("/api/admin/pages").WithTags("Seiten (Admin)").RequireAuthorization();
        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.Pages.OrderBy(p => p.Slug).ToListAsync()));
        admin.MapPost("/", async (Page input, AppDbContext db) =>
        {
            input.Id = 0;
            input.Slug = NewsEndpoints.Slugify(string.IsNullOrWhiteSpace(input.Slug) ? input.Title : input.Slug);
            if (await db.Pages.AnyAsync(p => p.Slug == input.Slug))
                return Results.Conflict(new { message = "Slug existiert bereits." });
            input.UpdatedAt = DateTime.UtcNow;
            db.Pages.Add(input); await db.SaveChangesAsync();
            return Results.Created($"/api/pages/{input.Slug}", input);
        });
        admin.MapPut("/{id:int}", async (int id, Page input, AppDbContext db) =>
        {
            var p = await db.Pages.FindAsync(id);
            if (p is null) return Results.NotFound();
            p.Title = input.Title; p.ContentHtml = input.ContentHtml; p.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(p);
        });
        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var p = await db.Pages.FindAsync(id);
            if (p is null) return Results.NotFound();
            db.Pages.Remove(p); await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    // ---------------- Einstellungen ----------------
    private static void MapSettings(WebApplication app)
    {
        // Öffentlich: NIEMALS die Teamup-Secrets (ApiKey/CalendarKey) ausliefern.
        app.MapGet("/api/settings", async (AppDbContext db) =>
        {
            var s = await db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == 1) ?? new SiteSettings();
            return Results.Ok(PublicSettings(s));
        }).WithTags("Einstellungen");

        // Admin: vollständig – aber der ApiKey wird nur als "gesetzt"-Flag zurückgegeben.
        app.MapGet("/api/admin/settings", async (AppDbContext db) =>
        {
            var s = await db.SiteSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == 1) ?? new SiteSettings();
            return Results.Ok(AdminSettings(s));
        }).WithTags("Einstellungen (Admin)").RequireAuthorization();

        app.MapPut("/api/admin/settings", async (SiteSettings input, AppDbContext db) =>
        {
            var s = await db.SiteSettings.FindAsync(1);
            if (s is null) { s = new SiteSettings { Id = 1 }; db.SiteSettings.Add(s); }

            s.ClubName = input.ClubName; s.Tagline = input.Tagline; s.WelcomeText = input.WelcomeText;
            s.ContactEmail = input.ContactEmail; s.ContactPhone = input.ContactPhone; s.Address = input.Address;
            s.FacebookUrl = input.FacebookUrl; s.InstagramUrl = input.InstagramUrl;
            s.LogoImageId = input.LogoImageId; s.HeaderImageId = input.HeaderImageId;
            s.HomeStandingsTableId = input.HomeStandingsTableId;

            // Teamup-Konfiguration
            s.TeamupCalendarKey = string.IsNullOrWhiteSpace(input.TeamupCalendarKey) ? null : input.TeamupCalendarKey.Trim();
            s.TeamupSubcalendarIds = string.IsNullOrWhiteSpace(input.TeamupSubcalendarIds) ? null : input.TeamupSubcalendarIds.Trim();
            s.TeamupSyncEnabled = input.TeamupSyncEnabled;
            // Write-only: ein leerer ApiKey lässt den vorhandenen Schlüssel unangetastet.
            if (!string.IsNullOrWhiteSpace(input.TeamupApiKey))
                s.TeamupApiKey = input.TeamupApiKey.Trim();

            await db.SaveChangesAsync();
            return Results.Ok(AdminSettings(s));
        }).WithTags("Einstellungen (Admin)").RequireAuthorization();
    }

    private static object PublicSettings(SiteSettings s) => new
    {
        s.Id, s.ClubName, s.Tagline, s.WelcomeText, s.ContactEmail, s.ContactPhone,
        s.Address, s.FacebookUrl, s.InstagramUrl, s.LogoImageId, s.HeaderImageId, s.HomeStandingsTableId
    };

    private static object AdminSettings(SiteSettings s) => new
    {
        s.Id, s.ClubName, s.Tagline, s.WelcomeText, s.ContactEmail, s.ContactPhone,
        s.Address, s.FacebookUrl, s.InstagramUrl, s.LogoImageId, s.HeaderImageId, s.HomeStandingsTableId,
        s.TeamupCalendarKey, s.TeamupSubcalendarIds, s.TeamupSyncEnabled,
        s.TeamupLastSyncAt, s.TeamupLastSyncStatus,
        TeamupApiKeySet = !string.IsNullOrWhiteSpace(s.TeamupApiKey)
    };
}
