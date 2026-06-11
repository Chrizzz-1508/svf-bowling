namespace SvfBowling.Api.Models;

/// <summary>
/// Editierbare statische Seite (Impressum, Datenschutz, Verein, Training …),
/// adressiert über einen Slug.
/// </summary>
public class Page
{
    public int Id { get; set; }
    public string Slug { get; set; } = "";
    public string Title { get; set; } = "";
    public string ContentHtml { get; set; } = "";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
