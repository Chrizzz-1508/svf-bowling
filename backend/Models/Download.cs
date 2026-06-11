using System.Text.Json.Serialization;

namespace SvfBowling.Api.Models;

/// <summary>Download-Datei (Trainingsplan, Formular, Dokument …), in der DB gespeichert.</summary>
public class Download
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";

    [JsonIgnore]
    public byte[] Data { get; set; } = Array.Empty<byte>();

    public long FileSize { get; set; }
    public string? Category { get; set; }
    public int SortOrder { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}
