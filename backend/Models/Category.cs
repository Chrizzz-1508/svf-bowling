namespace SvfBowling.Api.Models;

/// <summary>News-Kategorie (Damen, Herren, Jugend, Turnier, Allgemein …).</summary>
public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}
