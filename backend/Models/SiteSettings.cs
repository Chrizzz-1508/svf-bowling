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

    /// <summary>Zuletzt automatisch eingespielte, einmalige Kader-Version.</summary>
    public string? RosterVersion { get; set; }

    /// <summary>
    /// Welche Ergebnis-Tabelle auf der Startseite angezeigt wird.
    /// null = automatisch (zuletzt aktualisierte Liga-Tabelle).
    /// </summary>
    public int? HomeStandingsTableId { get; set; }

    // ---------------- Teamup-Kalender-Integration ----------------
    // ACHTUNG: ApiKey und CalendarKey sind vertraulich und werden NIE über die
    // öffentliche /api/settings ausgeliefert (siehe ContentEndpoints.MapSettings).
    // Der CalendarKey ist sensibel, weil er direkten Zugriff auf alle Anmeldungen
    // (inkl. Klarnamen) im Teamup-Kalender gibt.

    /// <summary>Teamup API-Token (Header "Teamup-Token"). Geheim.</summary>
    public string? TeamupApiKey { get; set; }

    /// <summary>Teamup Calendar-Key (Teil der Kalender-URL). Vertraulich.</summary>
    public string? TeamupCalendarKey { get; set; }

    /// <summary>Optionale CSV der anzuzeigenden Sub-Kalender-Ids; leer = alle.</summary>
    public string? TeamupSubcalendarIds { get; set; }

    /// <summary>Ob der stündliche Sync aktiv ist.</summary>
    public bool TeamupSyncEnabled { get; set; }

    /// <summary>Zeitpunkt des letzten erfolgreichen Sync-Laufs (UTC).</summary>
    public DateTime? TeamupLastSyncAt { get; set; }

    /// <summary>Status/Meldung des letzten Sync-Laufs (für die Admin-Anzeige).</summary>
    public string? TeamupLastSyncStatus { get; set; }
}
