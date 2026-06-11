using System.Text;
using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Endpoints;

public static class NewsEndpoints
{
    public static void MapNewsEndpoints(this WebApplication app)
    {
        // ---------- Öffentlich ----------
        var pub = app.MapGroup("/api/news").WithTags("News");

        pub.MapGet("/", async (AppDbContext db, int? categoryId, int? teamId, int? take, int? skip) =>
        {
            var q = db.NewsArticles.Where(n => n.IsPublished);
            if (categoryId is not null) q = q.Where(n => n.CategoryId == categoryId);
            if (teamId is not null) q = q.Where(n => n.TeamId == teamId);

            var list = await q
                .OrderByDescending(n => n.PublishedAt)
                .Skip(skip is > 0 ? skip.Value : 0)
                .Take(take is > 0 and <= 100 ? take.Value : 50)
                .Select(n => new
                {
                    n.Id, n.Title, n.Slug, n.Excerpt, n.CategoryId, n.TeamId,
                    n.Author, n.TitleImageId, n.PublishedAt
                })
                .ToListAsync();
            return Results.Ok(list);
        });

        pub.MapGet("/{slug}", async (string slug, AppDbContext db) =>
        {
            var n = await db.NewsArticles.FirstOrDefaultAsync(a => a.Slug == slug && a.IsPublished);
            return n is null ? Results.NotFound() : Results.Ok(n);
        });

        // ---------- Admin ----------
        var admin = app.MapGroup("/api/admin/news").WithTags("News (Admin)").RequireAuthorization();

        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.NewsArticles
                .OrderByDescending(n => n.PublishedAt)
                .Select(n => new
                {
                    n.Id, n.Title, n.Slug, n.Excerpt, n.CategoryId, n.TeamId,
                    n.Author, n.TitleImageId, n.IsPublished, n.PublishedAt, n.UpdatedAt
                })
                .ToListAsync()));

        admin.MapGet("/{id:int}", async (int id, AppDbContext db) =>
            await db.NewsArticles.FindAsync(id) is { } n ? Results.Ok(n) : Results.NotFound());

        admin.MapPost("/", async (NewsArticle input, AppDbContext db) =>
        {
            input.Id = 0;
            input.Slug = await UniqueSlugAsync(db, input.Slug, input.Title, null);
            input.CreatedAt = input.UpdatedAt = DateTime.UtcNow;
            if (input.PublishedAt == default) input.PublishedAt = DateTime.UtcNow;
            db.NewsArticles.Add(input);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/news/{input.Id}", input);
        });

        admin.MapPut("/{id:int}", async (int id, NewsArticle input, AppDbContext db) =>
        {
            var n = await db.NewsArticles.FindAsync(id);
            if (n is null) return Results.NotFound();

            n.Title = input.Title;
            n.Slug = await UniqueSlugAsync(db, input.Slug, input.Title, id);
            n.Excerpt = input.Excerpt;
            n.ContentHtml = input.ContentHtml;
            n.CategoryId = input.CategoryId;
            n.TeamId = input.TeamId;
            n.Author = input.Author;
            n.TitleImageId = input.TitleImageId;
            n.IsPublished = input.IsPublished;
            if (input.PublishedAt != default) n.PublishedAt = input.PublishedAt;
            n.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
            return Results.Ok(n);
        });

        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var n = await db.NewsArticles.FindAsync(id);
            if (n is null) return Results.NotFound();
            db.NewsArticles.Remove(n);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static async Task<string> UniqueSlugAsync(AppDbContext db, string? slug, string title, int? selfId)
    {
        var baseSlug = Slugify(string.IsNullOrWhiteSpace(slug) ? title : slug);
        if (string.IsNullOrWhiteSpace(baseSlug)) baseSlug = "beitrag";

        var candidate = baseSlug;
        var i = 2;
        while (await db.NewsArticles.AnyAsync(n => n.Slug == candidate && n.Id != selfId))
            candidate = $"{baseSlug}-{i++}";
        return candidate;
    }

    public static string Slugify(string input)
    {
        input = input.Trim().ToLowerInvariant()
            .Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss");

        var sb = new StringBuilder();
        var lastDash = false;
        foreach (var c in input)
        {
            if (char.IsLetterOrDigit(c) && c < 128)
            {
                sb.Append(c);
                lastDash = false;
            }
            else if (!lastDash)
            {
                sb.Append('-');
                lastDash = true;
            }
        }
        return sb.ToString().Trim('-');
    }
}
