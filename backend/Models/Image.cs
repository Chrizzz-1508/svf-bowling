using System.Text.Json.Serialization;

namespace SvfBowling.Api.Models;

/// <summary>
/// Bild, gespeichert direkt in der Datenbank (bytea). Wird über GET /api/images/{id}
/// ausgeliefert. Genutzt für News-Titelbilder, Galerie-Bilder und Team-Fotos.
/// </summary>
public class Image
{
    public int Id { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "image/jpeg";

    /// <summary>Roh-Bytes des Bildes. In Listen-Antworten nie mitserialisiert.</summary>
    [JsonIgnore]
    public byte[] Data { get; set; } = Array.Empty<byte>();

    public int? Width { get; set; }
    public int? Height { get; set; }
    public string? AltText { get; set; }
    public int? AlbumId { get; set; }
    public int SortOrder { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    public string? UploadedBy { get; set; }
}
