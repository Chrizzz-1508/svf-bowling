namespace SvfBowling.Api.Models;

/// <summary>
/// Aus dem Teamup-Kalender synchronisierter Termin.
/// Bewusst OHNE personenbezogene Daten: es werden nur die für die öffentliche
/// Anzeige nötigen Felder gespeichert. Insbesondere werden Teamups
/// <c>who</c>, <c>notes</c>, <c>signups</c> und <c>comments</c> (die Klarnamen
/// enthalten können) NIE gespeichert – von Teilnehmern höchstens die Anzahl.
/// </summary>
public class TeamupEvent
{
    public int Id { get; set; }

    /// <summary>Teamup-Event-Id (bei Serien inkl. Instanz-Suffix "…-rid-…").</summary>
    public string ExternalId { get; set; } = "";

    public string Title { get; set; } = "";
    public string? Location { get; set; }

    /// <summary>Name des Teamup-Sub-Kalenders (z. B. "Liga", "Trainingszeit").</summary>
    public string? Category { get; set; }

    public bool AllDay { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }

    /// <summary>Ob in Teamup eine Anmeldung für diesen Termin aktiv ist.</summary>
    public bool SignupEnabled { get; set; }

    /// <summary>Nur die ANZAHL der Anmeldungen – niemals die Namen.</summary>
    public int? ParticipantCount { get; set; }
}
