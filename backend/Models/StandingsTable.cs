using System.Text.Json.Serialization;

namespace SvfBowling.Api.Models;

/// <summary>
/// Generische Ergebnis-/Ranglisten-Tabelle. Über <see cref="ColumnsJson"/> definiert der
/// Vereinswart frei die Spalten – damit lassen sich Liga, Monatspokal, Vereinsmeisterschaft
/// und beliebige neue Tabellentypen abbilden, ganz ohne Code-Änderung.
/// </summary>
public class StandingsTable
{
    public int Id { get; set; }
    public int? SeasonId { get; set; }

    /// <summary>"Liga" | "Monatspokal" | "Vereinsmeisterschaft" | "Custom".</summary>
    public string Type { get; set; } = "Custom";

    public string Title { get; set; } = "";
    public string? Subtitle { get; set; }

    /// <summary>JSON-Array von Spalten: [{ "key": "platz", "label": "Platz", "type": "number" }, …].</summary>
    public string ColumnsJson { get; set; } = "[]";

    /// <summary>
    /// Optionale Reiter (Tabs), um eine Tabelle in mehrere Teiltabellen zu zerlegen – z. B. eine
    /// Liga-Übersicht mit einem Reiter je Mannschaft. JSON-Array:
    /// [{ "id": "t1", "label": "Herren 1", "subtitle": "Oberliga 2" }, …].
    /// null oder leeres Array = keine Reiter, die Tabelle wird wie bisher am Stück angezeigt.
    /// Die Zuordnung einer Zeile steht in deren <see cref="StandingsRow.ValuesJson"/> unter dem
    /// Meta-Schlüssel "_tab" (Wert = Tab-Id); Zeilen ohne Treffer landen im ersten Reiter.
    /// </summary>
    public string? TabsJson { get; set; }

    public int SortOrder { get; set; }
    public bool IsPublished { get; set; } = true;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<StandingsRow> Rows { get; set; } = new();
}

/// <summary>Eine Zeile einer <see cref="StandingsTable"/>. Werte als JSON-Objekt key→value.</summary>
public class StandingsRow
{
    public int Id { get; set; }
    public int StandingsTableId { get; set; }
    public int Position { get; set; }

    /// <summary>JSON-Objekt: { "platz": "1", "mannschaft": "SV Fellbach", "punkte": "24" }.</summary>
    public string ValuesJson { get; set; } = "{}";

    public int SortOrder { get; set; }

    [JsonIgnore]
    public StandingsTable? Table { get; set; }
}
