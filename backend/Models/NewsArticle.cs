namespace SvfBowling.Api.Models;

/// <summary>Bericht / News-Artikel. Optional einer Kategorie und/oder Mannschaft zugeordnet.</summary>
public class NewsArticle
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Excerpt { get; set; }
    public string ContentHtml { get; set; } = "";
    public int? CategoryId { get; set; }
    public int? TeamId { get; set; }
    public string? Author { get; set; }
    public int? TitleImageId { get; set; }
    public bool IsPublished { get; set; } = true;
    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
