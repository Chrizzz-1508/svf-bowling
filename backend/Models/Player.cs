namespace SvfBowling.Api.Models;

/// <summary>Spieler:in, optional einer Mannschaft zugeordnet (Roster).</summary>
public class Player
{
    public int Id { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public int? TeamId { get; set; }
    public string? Role { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>Nimmt regelmäßig am Monatspokal teil – steuert die Vorbefüllung der Monatspokal-Tabellen.</summary>
    public bool Monatspokal { get; set; }
}
