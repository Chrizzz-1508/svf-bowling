namespace SvfBowling.Api.Models;

/// <summary>Globale Seiteneinstellungen (eine einzige Zeile, Id = 1).</summary>
public class SiteSettings
{
    public int Id { get; set; } = 1;
    public string ClubName { get; set; } = "SV Fellbach – Abteilung Bowling";
    public string? Tagline { get; set; }
    public string? WelcomeText { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public string? Address { get; set; }
    public string? FacebookUrl { get; set; }
    public string? InstagramUrl { get; set; }
    public int? LogoImageId { get; set; }
    public int? HeaderImageId { get; set; }

    /// <summary>
    /// Welche Ergebnis-Tabelle auf der Startseite angezeigt wird.
    /// null = automatisch (zuletzt aktualisierte Liga-Tabelle).
    /// </summary>
    public int? HomeStandingsTableId { get; set; }
}
