using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Data;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Services;

/// <summary>
/// Holt die Termine aus dem Teamup-Kalender und spiegelt sie – datensparsam –
/// in die lokale <see cref="TeamupEvent"/>-Tabelle.
///
/// DATENSCHUTZ: Aus der Teamup-Antwort werden bewusst NUR unkritische Felder
/// ausgelesen (Titel, Ort, Sub-Kalender, Start/Ende, all_day, signup_enabled,
/// signup_count). Felder mit Klarnamen (<c>who</c>, <c>notes</c>, <c>signups</c>,
/// <c>comments</c>) werden gar nicht erst deserialisiert/gespeichert. Von
/// Teilnehmern wird höchstens die Anzahl übernommen.
/// </summary>
public class TeamupSyncRunner
{
    private readonly AppDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<TeamupSyncRunner> _logger;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    public TeamupSyncRunner(AppDbContext db, IHttpClientFactory httpFactory, ILogger<TeamupSyncRunner> logger)
    {
        _db = db;
        _httpFactory = httpFactory;
        _logger = logger;
    }

    public record SyncResult(bool Ran, int Count, string Status);

    public async Task<SyncResult> RunAsync(CancellationToken ct = default)
    {
        var settings = await _db.SiteSettings.FindAsync(new object?[] { 1 }, ct);
        if (settings is null || !settings.TeamupSyncEnabled
            || string.IsNullOrWhiteSpace(settings.TeamupApiKey)
            || string.IsNullOrWhiteSpace(settings.TeamupCalendarKey))
        {
            return new SyncResult(false, 0, "Teamup-Sync ist nicht aktiviert oder unvollständig konfiguriert.");
        }

        try
        {
            var http = _httpFactory.CreateClient("teamup");
            http.DefaultRequestHeaders.Add("Teamup-Token", settings.TeamupApiKey.Trim());
            var cal = settings.TeamupCalendarKey.Trim();

            // Sub-Kalender (Id -> Name) für die Kategorie-Anzeige.
            var subMap = new Dictionary<long, string>();
            try
            {
                var subs = await http.GetFromJsonAsync<SubcalendarsResponse>($"{cal}/subcalendars", Json, ct);
                if (subs?.Subcalendars != null)
                    foreach (var s in subs.Subcalendars) subMap[s.Id] = s.Name;
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Teamup: Sub-Kalender konnten nicht geladen werden."); }

            // Optionaler Filter auf bestimmte Sub-Kalender (CSV in den Einstellungen).
            var allowed = (settings.TeamupSubcalendarIds ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(x => long.TryParse(x, out var n) ? n : (long?)null)
                .Where(n => n.HasValue).Select(n => n!.Value).ToHashSet();

            // Zeitfenster: ~2 Monate rückwirkend bis 12 Monate voraus.
            // Die Teamup-API liefert Serientermine bereits als Einzeltermine im Bereich.
            var from = DateTime.UtcNow.AddMonths(-2).ToString("yyyy-MM-dd");
            var to = DateTime.UtcNow.AddMonths(12).ToString("yyyy-MM-dd");
            var resp = await http.GetFromJsonAsync<EventsResponse>(
                $"{cal}/events?startDate={from}&endDate={to}", Json, ct);

            var mapped = new List<TeamupEvent>();
            foreach (var ev in resp?.Events ?? new())
            {
                if (string.IsNullOrEmpty(ev.Id)) continue;
                if (allowed.Count > 0 && ev.SubcalendarId.HasValue && !allowed.Contains(ev.SubcalendarId.Value)) continue;
                if (!TryParseUtc(ev.StartDt, out var start)) continue;

                mapped.Add(new TeamupEvent
                {
                    ExternalId = ev.Id,
                    Title = (ev.Title ?? "").Trim(),
                    Location = string.IsNullOrWhiteSpace(ev.Location) ? null : ev.Location.Trim(),
                    Category = ev.SubcalendarId.HasValue && subMap.TryGetValue(ev.SubcalendarId.Value, out var name) ? name : null,
                    AllDay = ev.AllDay,
                    StartDate = start,
                    EndDate = TryParseUtc(ev.EndDt, out var end) ? end : (DateTime?)null,
                    SignupEnabled = ev.SignupEnabled,
                    // Nur die ANZAHL – Namen werden bewusst nicht ausgewertet.
                    ParticipantCount = ev.SignupEnabled ? ev.SignupCount : null
                });
            }

            // Wipe + Replace: robust gegenüber gelöschten Terminen und Serien-Instanzen.
            _db.TeamupEvents.RemoveRange(_db.TeamupEvents);
            await _db.TeamupEvents.AddRangeAsync(mapped, ct);

            settings.TeamupLastSyncAt = DateTime.UtcNow;
            settings.TeamupLastSyncStatus = $"OK – {mapped.Count} Termine übernommen.";
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation("Teamup-Sync: {Count} Termine übernommen.", mapped.Count);
            return new SyncResult(true, mapped.Count, settings.TeamupLastSyncStatus);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Teamup-Sync fehlgeschlagen.");
            settings.TeamupLastSyncStatus = "Fehler: " + ex.Message;
            try { await _db.SaveChangesAsync(ct); } catch { /* Status-Update ist Best-Effort */ }
            return new SyncResult(false, 0, settings.TeamupLastSyncStatus);
        }
    }

    /// <summary>Parst ISO-8601 (mit Offset) oder Datum-only robust nach UTC.</summary>
    private static bool TryParseUtc(string? s, out DateTime utc)
    {
        utc = default;
        if (string.IsNullOrWhiteSpace(s)) return false;
        if (DateTimeOffset.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto))
        {
            utc = dto.UtcDateTime;
            return true;
        }
        if (DateTime.TryParse(s, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
        {
            utc = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
            return true;
        }
        return false;
    }

    // ---- API-DTOs: bewusst nur die datensparsamen Felder (snake_case via Policy) ----
    private sealed class EventsResponse { public List<ApiEvent> Events { get; set; } = new(); }

    private sealed class ApiEvent
    {
        public string Id { get; set; } = "";
        public long? SubcalendarId { get; set; }
        public bool AllDay { get; set; }
        public string? Title { get; set; }
        public string? Location { get; set; }
        public string? StartDt { get; set; }
        public string? EndDt { get; set; }
        public bool SignupEnabled { get; set; }
        public int? SignupCount { get; set; }
    }

    private sealed class SubcalendarsResponse { public List<Subcalendar> Subcalendars { get; set; } = new(); }
    private sealed class Subcalendar { public long Id { get; set; } public string Name { get; set; } = ""; }
}
