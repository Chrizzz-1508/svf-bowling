using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Endpoints;

public static class StandingsEndpoints
{
    public static void MapStandingsEndpoints(this WebApplication app)
    {
        // ---------- Öffentlich ----------
        var pub = app.MapGroup("/api/standings").WithTags("Ergebnisse");

        // Liste (ohne Zeilen) – optional nach Saison/Typ gefiltert.
        pub.MapGet("/", async (AppDbContext db, int? seasonId, string? type) =>
        {
            var q = db.StandingsTables.Where(t => t.IsPublished);
            if (seasonId is not null) q = q.Where(t => t.SeasonId == seasonId);
            if (!string.IsNullOrWhiteSpace(type)) q = q.Where(t => t.Type == type);

            var list = await q
                .OrderBy(t => t.SortOrder).ThenByDescending(t => t.UpdatedAt)
                .Select(t => new
                {
                    t.Id, t.SeasonId, t.Type, t.Title, t.Subtitle, t.ColumnsJson, t.SortOrder, t.UpdatedAt
                })
                .ToListAsync();
            return Results.Ok(list);
        });

        // Einzelne Tabelle inkl. Zeilen.
        pub.MapGet("/{id:int}", async (int id, AppDbContext db) =>
        {
            var t = await db.StandingsTables
                .Include(x => x.Rows.OrderBy(r => r.SortOrder))
                .FirstOrDefaultAsync(x => x.Id == id && x.IsPublished);
            return t is null ? Results.NotFound() : Results.Ok(t);
        });

        // ---------- Admin ----------
        var admin = app.MapGroup("/api/admin/standings").WithTags("Ergebnisse (Admin)").RequireAuthorization();

        admin.MapGet("/", async (AppDbContext db, int? seasonId) =>
        {
            var q = db.StandingsTables.AsQueryable();
            if (seasonId is not null) q = q.Where(t => t.SeasonId == seasonId);
            return Results.Ok(await q
                .OrderBy(t => t.SortOrder).ThenByDescending(t => t.UpdatedAt)
                .Select(t => new { t.Id, t.SeasonId, t.Type, t.Title, t.Subtitle, t.ColumnsJson, t.SortOrder, t.IsPublished, t.UpdatedAt })
                .ToListAsync());
        });

        admin.MapGet("/{id:int}", async (int id, AppDbContext db) =>
        {
            var t = await db.StandingsTables
                .Include(x => x.Rows.OrderBy(r => r.SortOrder))
                .FirstOrDefaultAsync(x => x.Id == id);
            return t is null ? Results.NotFound() : Results.Ok(t);
        });

        admin.MapPost("/", async (StandingsTable input, AppDbContext db) =>
        {
            input.Id = 0;
            input.UpdatedAt = DateTime.UtcNow;
            NormalizeRows(input);
            db.StandingsTables.Add(input);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/standings/{input.Id}", input);
        });

        admin.MapPut("/{id:int}", async (int id, StandingsTable input, AppDbContext db) =>
        {
            var t = await db.StandingsTables.Include(x => x.Rows).FirstOrDefaultAsync(x => x.Id == id);
            if (t is null) return Results.NotFound();

            t.SeasonId = input.SeasonId;
            t.Type = input.Type;
            t.Title = input.Title;
            t.Subtitle = input.Subtitle;
            t.ColumnsJson = input.ColumnsJson;
            t.SortOrder = input.SortOrder;
            t.IsPublished = input.IsPublished;
            t.UpdatedAt = DateTime.UtcNow;

            // Zeilen komplett ersetzen (einfaches, robustes Editiermodell).
            db.StandingsRows.RemoveRange(t.Rows);
            t.Rows = input.Rows ?? new List<StandingsRow>();
            NormalizeRows(t);

            await db.SaveChangesAsync();
            return Results.Ok(t);
        });

        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var t = await db.StandingsTables.FindAsync(id);
            if (t is null) return Results.NotFound();
            db.StandingsTables.Remove(t);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Spalten-Presets für die bekannten Tabellentypen (für den Tabellen-Editor).
        admin.MapGet("/presets", () => Results.Ok(new
        {
            Liga = StandingsPresets.Liga,
            Monatspokal = StandingsPresets.Monatspokal,
            MonatspokalGesamt = StandingsPresets.MonatspokalGesamt,
            Vereinsmeisterschaft = StandingsPresets.Vereinsmeisterschaft
        }));
    }

    private static void NormalizeRows(StandingsTable t)
    {
        var i = 0;
        foreach (var r in t.Rows)
        {
            r.Id = 0;
            r.StandingsTableId = 0;
            if (r.SortOrder == 0) r.SortOrder = i;
            i++;
        }
    }
}
