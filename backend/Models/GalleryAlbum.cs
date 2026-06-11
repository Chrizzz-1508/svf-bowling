namespace SvfBowling.Api.Models;

/// <summary>Foto-Album der Galerie. Bilder verweisen über Image.AlbumId hierher.</summary>
public class GalleryAlbum
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public int? CoverImageId { get; set; }
    public DateTime? EventDate { get; set; }
    public bool IsPublished { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
