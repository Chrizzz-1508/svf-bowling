namespace SvfBowling.Api.Models;

/// <summary>Mannschaft des Vereins (1. Damen, 1.–3. Herren, Jugend …).</summary>
public class Team
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? League { get; set; }
    public string? Description { get; set; }
    public int? PhotoImageId { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
