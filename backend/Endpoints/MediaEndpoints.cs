using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Endpoints;

public static class MediaEndpoints
{
    private const long MaxUploadBytes = 15 * 1024 * 1024; // 15 MB

    public static void MapMediaEndpoints(this WebApplication app)
    {
        MapImages(app);
        MapGallery(app);
        MapDownloads(app);
    }

    // ---------------- Bilder ----------------
    private static void MapImages(WebApplication app)
    {
        // Öffentliche Auslieferung (für <img>-Tags).
        app.MapGet("/api/images/{id:int}", async (int id, AppDbContext db) =>
        {
            var img = await db.Images.FindAsync(id);
            if (img is null) return Results.NotFound();
            return Results.File(img.Data, img.ContentType, enableRangeProcessing: true,
                lastModified: img.UploadedAt, entityTag: new Microsoft.Net.Http.Headers.EntityTagHeaderValue($"\"img{img.Id}\""));
        }).WithTags("Bilder");

        var admin = app.MapGroup("/api/admin/images").WithTags("Bilder (Admin)").RequireAuthorization();

        admin.MapGet("/", async (AppDbContext db, int? albumId) =>
        {
            var q = db.Images.AsQueryable();
            if (albumId is not null) q = q.Where(i => i.AlbumId == albumId);
            return Results.Ok(await q.OrderBy(i => i.SortOrder).ThenByDescending(i => i.UploadedAt)
                .Select(i => new { i.Id, i.FileName, i.ContentType, i.AltText, i.AlbumId, i.SortOrder, i.UploadedAt, i.UploadedBy })
                .ToListAsync());
        });

        admin.MapPost("/", async (HttpRequest request, AppDbContext db, ClaimsPrincipal principal) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest(new { message = "multipart/form-data erwartet." });
            var form = await request.ReadFormAsync();
            var file = form.Files["file"];
            if (file is null || file.Length == 0) return Results.BadRequest(new { message = "Keine Datei übermittelt." });
            if (file.Length > MaxUploadBytes) return Results.BadRequest(new { message = "Datei zu groß (max. 15 MB)." });
            if (!file.ContentType.StartsWith("image/")) return Results.BadRequest(new { message = "Nur Bilddateien erlaubt." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);

            var img = new Image
            {
                FileName = Path.GetFileName(file.FileName),
                ContentType = file.ContentType,
                Data = ms.ToArray(),
                AltText = form["altText"].FirstOrDefault(),
                AlbumId = int.TryParse(form["albumId"].FirstOrDefault(), out var a) ? a : null,
                UploadedBy = principal.Identity?.Name
            };
            db.Images.Add(img);
            await db.SaveChangesAsync();
            return Results.Ok(new { img.Id, img.FileName, img.ContentType, img.AltText, img.AlbumId, url = $"/api/images/{img.Id}" });
        }).DisableAntiforgery();

        admin.MapPut("/{id:int}", async (int id, ImageMetaUpdate input, AppDbContext db) =>
        {
            var img = await db.Images.FindAsync(id);
            if (img is null) return Results.NotFound();
            if (input.AltText is not null) img.AltText = input.AltText;
            if (input.AlbumId is not null) img.AlbumId = input.AlbumId == 0 ? null : input.AlbumId;
            if (input.SortOrder is not null) img.SortOrder = input.SortOrder.Value;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var img = await db.Images.FindAsync(id);
            if (img is null) return Results.NotFound();
            db.Images.Remove(img);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    // ---------------- Galerie-Alben ----------------
    private static void MapGallery(WebApplication app)
    {
        app.MapGet("/api/gallery", async (AppDbContext db) =>
        {
            var albums = await db.GalleryAlbums.Where(a => a.IsPublished)
                .OrderBy(a => a.SortOrder).ThenByDescending(a => a.EventDate)
                .Select(a => new
                {
                    a.Id, a.Title, a.Description, a.CoverImageId, a.EventDate,
                    ImageCount = db.Images.Count(i => i.AlbumId == a.Id)
                }).ToListAsync();
            return Results.Ok(albums);
        }).WithTags("Galerie");

        app.MapGet("/api/gallery/{id:int}", async (int id, AppDbContext db) =>
        {
            var album = await db.GalleryAlbums.FirstOrDefaultAsync(a => a.Id == id && a.IsPublished);
            if (album is null) return Results.NotFound();
            var images = await db.Images.Where(i => i.AlbumId == id)
                .OrderBy(i => i.SortOrder).ThenBy(i => i.Id)
                .Select(i => new { i.Id, i.AltText, i.FileName }).ToListAsync();
            return Results.Ok(new { album, images });
        }).WithTags("Galerie");

        var admin = app.MapGroup("/api/admin/gallery").WithTags("Galerie (Admin)").RequireAuthorization();
        admin.MapGet("/", async (AppDbContext db) =>
            Results.Ok(await db.GalleryAlbums.OrderBy(a => a.SortOrder).ThenByDescending(a => a.EventDate).ToListAsync()));
        admin.MapPost("/", async (GalleryAlbum input, AppDbContext db) =>
        {
            input.Id = 0; input.CreatedAt = DateTime.UtcNow;
            db.GalleryAlbums.Add(input); await db.SaveChangesAsync();
            return Results.Created($"/api/gallery/{input.Id}", input);
        });
        admin.MapPut("/{id:int}", async (int id, GalleryAlbum input, AppDbContext db) =>
        {
            var a = await db.GalleryAlbums.FindAsync(id);
            if (a is null) return Results.NotFound();
            a.Title = input.Title; a.Description = input.Description; a.CoverImageId = input.CoverImageId;
            a.EventDate = input.EventDate; a.IsPublished = input.IsPublished; a.SortOrder = input.SortOrder;
            await db.SaveChangesAsync();
            return Results.Ok(a);
        });
        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var a = await db.GalleryAlbums.FindAsync(id);
            if (a is null) return Results.NotFound();
            // Bilder des Albums lösen, nicht löschen (bleiben als ungebundene Bilder erhalten).
            foreach (var img in await db.Images.Where(i => i.AlbumId == id).ToListAsync())
                img.AlbumId = null;
            db.GalleryAlbums.Remove(a);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    // ---------------- Downloads ----------------
    private static void MapDownloads(WebApplication app)
    {
        app.MapGet("/api/downloads", async (AppDbContext db) =>
            Results.Ok(await db.Downloads.OrderBy(d => d.SortOrder).ThenBy(d => d.Title)
                .Select(d => new { d.Id, d.Title, d.Description, d.FileName, d.ContentType, d.FileSize, d.Category, d.SortOrder, d.UploadedAt })
                .ToListAsync())).WithTags("Downloads");

        app.MapGet("/api/downloads/{id:int}/file", async (int id, AppDbContext db) =>
        {
            var d = await db.Downloads.FindAsync(id);
            return d is null ? Results.NotFound() : Results.File(d.Data, d.ContentType, d.FileName);
        }).WithTags("Downloads");

        var admin = app.MapGroup("/api/admin/downloads").WithTags("Downloads (Admin)").RequireAuthorization();
        admin.MapPost("/", async (HttpRequest request, AppDbContext db) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest(new { message = "multipart/form-data erwartet." });
            var form = await request.ReadFormAsync();
            var file = form.Files["file"];
            if (file is null || file.Length == 0) return Results.BadRequest(new { message = "Keine Datei übermittelt." });
            if (file.Length > MaxUploadBytes) return Results.BadRequest(new { message = "Datei zu groß (max. 15 MB)." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);

            var d = new Download
            {
                Title = form["title"].FirstOrDefault() ?? Path.GetFileNameWithoutExtension(file.FileName),
                Description = form["description"].FirstOrDefault(),
                Category = form["category"].FirstOrDefault(),
                FileName = Path.GetFileName(file.FileName),
                ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                Data = ms.ToArray(),
                FileSize = file.Length,
                SortOrder = ((await db.Downloads.MinAsync(x => (int?)x.SortOrder)) ?? 0) - 1
            };
            db.Downloads.Add(d);
            await db.SaveChangesAsync();
            return Results.Ok(new { d.Id, d.Title, d.FileName, d.FileSize });
        }).DisableAntiforgery();

        admin.MapPut("/{id:int}", async (int id, DownloadMetaUpdate input, AppDbContext db) =>
        {
            var d = await db.Downloads.FindAsync(id);
            if (d is null) return Results.NotFound();
            if (!string.IsNullOrWhiteSpace(input.Title)) d.Title = input.Title;
            d.Description = input.Description;
            d.Category = input.Category;
            if (input.SortOrder is not null) d.SortOrder = input.SortOrder.Value;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        admin.MapDelete("/{id:int}", async (int id, AppDbContext db) =>
        {
            var d = await db.Downloads.FindAsync(id);
            if (d is null) return Results.NotFound();
            db.Downloads.Remove(d); await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    public record ImageMetaUpdate(string? AltText, int? AlbumId, int? SortOrder);
    public record DownloadMetaUpdate(string? Title, string? Description, string? Category, int? SortOrder);
}
