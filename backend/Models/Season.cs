namespace SvfBowling.Api.Models;

/// <summary>Spielzeit/Saison, z. B. "2025/26". Ergebnis-Tabellen hängen an einer Saison.</summary>
public class Season
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public bool IsCurrent { get; set; }
    public int SortOrder { get; set; }
}
