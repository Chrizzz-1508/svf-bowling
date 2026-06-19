using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Data;

namespace SvfBowling.Api.Endpoints;

public static class UtilityEndpoints
{
    public static void MapUtilityEndpoints(this WebApplication app)
    {
        MapReorder(app);
        MapSearch(app);
    }

    // -------------------------------------------------------------------------
    //  Drag&Drop-Sortierung: setzt SortOrder = Index der übergebenen Id-Liste.
    // -------------------------------------------------------------------------
    private static void MapReorder(WebApplication app)
    {
        app.MapPost("/api/admin/reorder", async (ReorderRequest req, AppDbContext db) =>
        {
            if (req.OrderedIds is null || req.OrderedIds.Count == 0)
                return Results.BadRequest(new { message = "orderedIds fehlt." });

            var ids = req.OrderedIds;
            switch ((req.Entity ?? "").ToLowerInvariant())
            {
                case "teams":
                    await ApplyOrder(db.Teams, ids, (e, i) => e.SortOrder = i); break;
                case "players":
                    await ApplyOrder(db.Players, ids, (e, i) => e.SortOrder = i); break;
                case "seasons":
                    await ApplyOrder(db.Seasons, ids, (e, i) => e.SortOrder = i); break;
                case "categories":
                    await ApplyOrder(db.Categories, ids, (e, i) => e.SortOrder = i); break;
                case "gallery":
                    await ApplyOrder(db.GalleryAlbums, ids, (e, i) => e.SortOrder = i); break;
                case "downloads":
                    await ApplyOrder(db.Downloads, ids, (e, i) => e.SortOrder = i); break;
                case "standings":
                    await ApplyOrder(db.StandingsTables, ids, (e, i) => e.SortOrder = i); break;
                case "images":
                    await ApplyOrder(db.Images, ids, (e, i) => e.SortOrder = i); break;
                case "events":
                    await ApplyOrder(db.Events, ids, (e, i) => e.SortOrder = i); break;
                default:
                    return Results.BadRequest(new { message = $"Unbekannte Entity '{req.Entity}'." });
            }
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Verwaltung").RequireAuthorization();
    }

    private static async Task ApplyOrder<T>(DbSet<T> set, List<int> ids, Action<T, int> assign) where T : class
    {
        var items = await set.Where(BuildIdFilter<T>(ids)).ToListAsync();
        var lookup = items.ToDictionary(e => (int)typeof(T).GetProperty("Id")!.GetValue(e)!);
        for (var i = 0; i < ids.Count; i++)
            if (lookup.TryGetValue(ids[i], out var entity))
                assign(entity, i);
    }

    private static System.Linq.Expressions.Expression<Func<T, bool>> BuildIdFilter<T>(List<int> ids)
    {
        var p = System.Linq.Expressions.Expression.Parameter(typeof(T), "e");
        var idProp = System.Linq.Expressions.Expression.Property(p, "Id");
        var contains = System.Linq.Expressions.Expression.Call(
            System.Linq.Expressions.Expression.Constant(ids),
            typeof(List<int>).GetMethod("Contains")!,
            idProp);
        return System.Linq.Expressions.Expression.Lambda<Func<T, bool>>(contains, p);
    }

    public record ReorderRequest(string Entity, List<int> OrderedIds);

    // -------------------------------------------------------------------------
    //  Seitenweite Suche (öffentlich): News, Termine, Tabellen, Seiten, Teams.
    // -------------------------------------------------------------------------
    private static void MapSearch(WebApplication app)
    {
        app.MapGet("/api/search", async (string? q, AppDbContext db) =>
        {
            q = (q ?? "").Trim();
            if (q.Length < 2)
                return Results.Ok(new { news = Array.Empty<object>(), events = Array.Empty<object>(), standings = Array.Empty<object>(), pages = Array.Empty<object>(), teams = Array.Empty<object>() });

            var pattern = $"%{q}%";

            var news = await db.NewsArticles
                .Where(n => n.IsPublished &&
                    (EF.Functions.ILike(n.Title, pattern) ||
                     EF.Functions.ILike(n.Excerpt ?? "", pattern) ||
                     EF.Functions.ILike(n.ContentHtml, pattern)))
                .OrderByDescending(n => n.PublishedAt)
                .Take(25)
                .Select(n => new { n.Id, n.Title, n.Slug, n.Excerpt, n.PublishedAt, n.Author })
                .ToListAsync();

            // Manuell gepflegte Termine UND der gespiegelte Teamup-Kalender.
            var manualEvents = await db.Events
                .Where(e => e.IsPublished &&
                    (EF.Functions.ILike(e.Title, pattern) || EF.Functions.ILike(e.Description ?? "", pattern) || EF.Functions.ILike(e.Location ?? "", pattern)))
                .Select(e => new { e.Id, e.Title, e.StartDate, e.EndDate, e.Location })
                .ToListAsync();

            var teamupEvents = await db.TeamupEvents
                .Where(t => EF.Functions.ILike(t.Title, pattern) || EF.Functions.ILike(t.Location ?? "", pattern) || EF.Functions.ILike(t.Category ?? "", pattern))
                .Select(t => new { t.Id, t.Title, t.StartDate, t.EndDate, t.Location })
                .ToListAsync();

            var events = manualEvents.Concat(teamupEvents)
                .OrderBy(e => e.StartDate)
                .Take(15)
                .ToList();

            var standings = await db.StandingsTables
                .Where(t => t.IsPublished && EF.Functions.ILike(t.Title, pattern))
                .OrderByDescending(t => t.UpdatedAt)
                .Take(15)
                .Select(t => new { t.Id, t.Title, t.Type, t.SeasonId })
                .ToListAsync();

            var pages = await db.Pages
                .Where(p => EF.Functions.ILike(p.Title, pattern) || EF.Functions.ILike(p.ContentHtml, pattern))
                .Take(10)
                .Select(p => new { p.Slug, p.Title })
                .ToListAsync();

            var teams = await db.Teams
                .Where(t => t.IsActive && (EF.Functions.ILike(t.Name, pattern) || EF.Functions.ILike(t.League ?? "", pattern)))
                .Take(10)
                .Select(t => new { t.Id, t.Name, t.League })
                .ToListAsync();

            return Results.Ok(new { news, events, standings, pages, teams });
        }).WithTags("Suche");
    }
}
