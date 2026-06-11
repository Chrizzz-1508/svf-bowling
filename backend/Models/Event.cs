namespace SvfBowling.Api.Models;

/// <summary>Termin (Spieltag, Turnier, Vereinsfeier …).</summary>
public class Event
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? Location { get; set; }
    public bool IsPublished { get; set; } = true;
    public int SortOrder { get; set; }
}
