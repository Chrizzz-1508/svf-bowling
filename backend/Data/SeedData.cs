using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Data;

/// <summary>
/// Legt beim Start Grunddaten an: initialer Admin (aus Env), Seiteneinstellungen,
/// Standard-Kategorien, Impressum/Datenschutz-Seiten – und optional Demodaten,
/// damit direkt etwas auf der Seite sichtbar ist.
/// </summary>
public static class SeedData
{
    public static async Task EnsureSeedAsync(AppDbContext db, IConfiguration config)
    {
        await EnsureAdminAsync(db, config);
        await EnsureSettingsAsync(db);
        await EnsureTeamupConfigAsync(db, config);
        await EnsureCategoriesAsync(db);
        await EnsurePagesAsync(db);
        await EnsureEditablePageDefaultsAsync(db);

        var seedDemo = (config["SEED_DEMO_DATA"] ?? "false").Equals("true", StringComparison.OrdinalIgnoreCase);
        if (seedDemo)
            await EnsureDemoDataAsync(db);

        await db.SaveChangesAsync();
        await EnsureRoster20260621Async(db);
        await db.SaveChangesAsync();
    }

    private static async Task EnsureAdminAsync(AppDbContext db, IConfiguration config)
    {
        var username = config["ADMIN_USERNAME"];
        var password = config["ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return;

        if (db.AdminUsers.Any(u => u.Username == username))
            return;

        db.AdminUsers.Add(new AdminUser
        {
            Username = username,
            Email = config["ADMIN_EMAIL"],
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = "Admin",
            IsActive = true
        });
    }

    private static async Task EnsureSettingsAsync(AppDbContext db)
    {
        if (await db.SiteSettings.FindAsync(1) is not null)
            return;

        db.SiteSettings.Add(new SiteSettings
        {
            Id = 1,
            ClubName = "SV Fellbach – Abteilung Bowling",
            Tagline = "Bowling mit Herz und Leidenschaft",
            WelcomeText = "Herzlich willkommen auf der Website der Bowling-Abteilung des SV Fellbach! " +
                          "Hier findet ihr aktuelle Berichte, Liga-Ergebnisse, Termine und Bilder rund um unseren Verein.",
            ContactEmail = "info@svf-bowling.de"
        });
    }

    /// <summary>
    /// Übernimmt Teamup-Zugangsdaten aus den Umgebungsvariablen
    /// TEAMUP_API_KEY / TEAMUP_CALENDAR_KEY in die Einstellungen – aber nur,
    /// wenn dort noch nichts hinterlegt ist (Admin-Eingaben werden nie überschrieben).
    /// So bleibt der geheime Schlüssel aus dem Quellcode/Git heraus.
    /// </summary>
    private static async Task EnsureTeamupConfigAsync(AppDbContext db, IConfiguration config)
    {
        var settings = await db.SiteSettings.FindAsync(1);
        if (settings is null) return;

        var apiKey = config["TEAMUP_API_KEY"];
        var calKey = config["TEAMUP_CALENDAR_KEY"];
        var changed = false;

        if (!string.IsNullOrWhiteSpace(apiKey) && string.IsNullOrWhiteSpace(settings.TeamupApiKey))
        { settings.TeamupApiKey = apiKey.Trim(); changed = true; }

        if (!string.IsNullOrWhiteSpace(calKey) && string.IsNullOrWhiteSpace(settings.TeamupCalendarKey))
        { settings.TeamupCalendarKey = calKey.Trim(); changed = true; }

        // Sind beide Schlüssel erstmals vorhanden, den Sync direkt aktivieren.
        if (changed && !settings.TeamupSyncEnabled
            && !string.IsNullOrWhiteSpace(settings.TeamupApiKey)
            && !string.IsNullOrWhiteSpace(settings.TeamupCalendarKey))
        {
            settings.TeamupSyncEnabled = true;
        }
    }

    private static async Task EnsureCategoriesAsync(AppDbContext db)
    {
        if (await db.Categories.AnyAsync())
            return;

        db.Categories.AddRange(
            new Category { Name = "Allgemein", SortOrder = 0 },
            new Category { Name = "Damen", SortOrder = 1 },
            new Category { Name = "Herren", SortOrder = 2 },
            new Category { Name = "Jugend", SortOrder = 3 },
            new Category { Name = "Turnier", SortOrder = 4 });
    }

    private static async Task EnsurePagesAsync(AppDbContext db)
    {
        await EnsurePageAsync(db, "impressum", "Impressum",
            "<p>Angaben gemäß § 5 TMG</p><p>SV Fellbach – Abteilung Bowling<br>Musterstraße 1<br>70734 Fellbach</p>" +
            "<p>Vertreten durch: Abteilungsleitung Bowling</p><p>Kontakt: info@svf-bowling.de</p>" +
            "<p><em>Bitte im Admin-Bereich mit den echten Vereinsdaten ergänzen.</em></p>");

        await EnsurePageAsync(db, "datenschutz", "Datenschutzerklärung",
            "<p>Der Schutz eurer persönlichen Daten ist uns wichtig. Diese Website verarbeitet personenbezogene " +
            "Daten nur im technisch notwendigen Umfang.</p>" +
            "<p><em>Bitte im Admin-Bereich mit einer vollständigen Datenschutzerklärung ergänzen.</em></p>");

        await EnsurePageAsync(db, "verein", "Über uns",
            "<p>Die Bowling-Abteilung des SV Fellbach bietet Bowling für alle Altersklassen – " +
            "vom Hobby- bis zum Ligaspieler.</p>");
    }

    private static async Task EnsurePageAsync(AppDbContext db, string slug, string title, string html)
    {
        if (await db.Pages.AnyAsync(p => p.Slug == slug))
            return;
        db.Pages.Add(new Page { Slug = slug, Title = title, ContentHtml = html });
    }

    private static async Task EnsureEditablePageDefaultsAsync(AppDbContext db)
    {
        await EnsureOrUpgradePageAsync(db, "startseite", "Startseite", DefaultPageContent.StartseiteHtml,
            p => string.IsNullOrWhiteSpace(p.ContentHtml));

        await EnsureOrUpgradePageAsync(db, "verein", "Verein", DefaultPageContent.VereinHtml,
            p => p.ContentHtml.Contains("Die Bowling-Abteilung des SV Fellbach bietet Bowling", StringComparison.OrdinalIgnoreCase)
                 && !p.ContentHtml.Contains("training-cta", StringComparison.OrdinalIgnoreCase));
    }

    private static async Task EnsureOrUpgradePageAsync(
        AppDbContext db,
        string slug,
        string title,
        string html,
        Func<Page, bool> shouldUpgrade)
    {
        var page = await db.Pages.FirstOrDefaultAsync(p => p.Slug == slug);
        if (page is null)
        {
            db.Pages.Add(new Page { Slug = slug, Title = title, ContentHtml = html });
            return;
        }

        if (!shouldUpgrade(page)) return;
        page.Title = title;
        page.ContentHtml = html;
        page.UpdatedAt = DateTime.UtcNow;
    }

    private static async Task EnsureDemoDataAsync(AppDbContext db)
    {
        if (await db.Seasons.AnyAsync())
            return; // Demodaten nur einmal anlegen.

        var season = new Season { Name = "2025/26", IsCurrent = true, SortOrder = 0 };
        db.Seasons.Add(season);
        await db.SaveChangesAsync();

        // Mannschaften
        db.Teams.AddRange(
            new Team { Name = "1. Damenmannschaft", League = "Oberliga", SortOrder = 3 },
            new Team { Name = "1. Herrenmannschaft", League = "Oberliga", SortOrder = 0 },
            new Team { Name = "2. Herrenmannschaft (Mix)", League = "Kreisliga", SortOrder = 1 },
            new Team { Name = "3. Herrenmannschaft (Mix)", League = "Kreisliga", SortOrder = 2 },
            new Team { Name = "Jugendmannschaft", League = "Jugendliga", SortOrder = 4 });

        // News
        var allgemein = await db.Categories.FirstOrDefaultAsync(c => c.Name == "Allgemein");
        db.NewsArticles.Add(new NewsArticle
        {
            Title = "Neue Vereinswebsite ist online!",
            Slug = "neue-vereinswebsite-online",
            Excerpt = "Unsere Bowling-Abteilung hat einen frischen, modernen Internetauftritt – mobilfreundlich und einfach zu pflegen.",
            ContentHtml = "<p>Ab sofort präsentiert sich die Bowling-Abteilung des SV Fellbach mit einer komplett " +
                          "neuen Website. Berichte, Liga-Ergebnisse, Termine und Bilder findet ihr jetzt übersichtlich " +
                          "und auch bequem auf dem Handy.</p><p>Viel Spaß beim Stöbern – gut Holz!</p>",
            CategoryId = allgemein?.Id,
            Author = "Vereinswart",
            IsPublished = true,
            PublishedAt = DateTime.UtcNow
        });

        // Liga-Tabelle (Demo)
        db.StandingsTables.Add(new StandingsTable
        {
            SeasonId = season.Id,
            Type = "Liga",
            Title = "Oberliga – 1. Herrenmannschaft",
            ColumnsJson = StandingsPresets.Liga,
            SortOrder = 0,
            Rows = new List<StandingsRow>
            {
                DemoRow(1, "{\"platz\":\"1\",\"mannschaft\":\"SV Fellbach 1\",\"spiele\":\"6\",\"punkte\":\"12\",\"pins\":\"11340\"}"),
                DemoRow(2, "{\"platz\":\"2\",\"mannschaft\":\"BC Beispielstadt\",\"spiele\":\"6\",\"punkte\":\"9\",\"pins\":\"11120\"}"),
                DemoRow(3, "{\"platz\":\"3\",\"mannschaft\":\"Kegelfreunde Muster\",\"spiele\":\"6\",\"punkte\":\"7\",\"pins\":\"10980\"}")
            }
        });

        // Monatspokal (Demo)
        db.StandingsTables.Add(new StandingsTable
        {
            SeasonId = season.Id,
            Type = "Monatspokal",
            Title = "Monatspokal Oktober",
            ColumnsJson = StandingsPresets.Monatspokal,
            SortOrder = 1,
            Rows = new List<StandingsRow>
            {
                DemoRow(1, "{\"platz\":\"1\",\"spieler\":\"Max Mustermann\",\"punkte\":\"10\",\"pins\":\"612\",\"schnitt\":\"204\",\"hdc_neu\":\"12\"}"),
                DemoRow(2, "{\"platz\":\"2\",\"spieler\":\"Erika Beispiel\",\"punkte\":\"8\",\"pins\":\"588\",\"schnitt\":\"196\",\"hdc_neu\":\"18\"}")
            }
        });
    }

    private static StandingsRow DemoRow(int pos, string valuesJson) =>
        new() { Position = pos, SortOrder = pos, ValuesJson = valuesJson };

    /// <summary>
    /// Spielerliste mit Stand 21.06.2026. Die Versionsmarke sorgt dafür, dass der
    /// Import genau einmal läuft und spätere Änderungen im Adminbereich respektiert.
    /// </summary>
    private static async Task EnsureRoster20260621Async(AppDbContext db)
    {
        const string version = "2026-06-21.2";
        var settings = await db.SiteSettings.FindAsync(1);
        if (settings is null || settings.RosterVersion == version) return;

        var herren1 = await EnsureTeamAsync(db, 2, "1. Herrenmannschaft", "Oberliga", 0);
        var herren2 = await EnsureTeamAsync(db, 3, "2. Herrenmannschaft (Mix)", "Kreisliga", 1);
        var herren3 = await EnsureTeamAsync(db, 4, "3. Herrenmannschaft (Mix)", "Kreisliga", 2);
        var damen = await EnsureTeamAsync(db, 1, "1. Damenmannschaft", "Oberliga", 3);
        var jugend = await EnsureTeamAsync(db, 5, "Jugendmannschaft", "Jugendliga", 4,
            "Trainer: Torsten Reinhardt und Kay Kiesshauer");
        var ergaenzung = await db.Teams.FirstOrDefaultAsync(t => t.Name == "Ergänzungsspieler");
        if (ergaenzung is null)
        {
            ergaenzung = new Team { Name = "Ergänzungsspieler" };
            db.Teams.Add(ergaenzung);
        }
        ergaenzung.League = null;
        ergaenzung.Description = "Erwachsene und Jugend";
        ergaenzung.SortOrder = 5;
        ergaenzung.IsActive = true;

        await db.SaveChangesAsync();

        var players = await db.Players.ToListAsync();
        foreach (var player in players) player.IsActive = false;

        var roster = new[]
        {
            Entry("Kay", "Kiesshauer", herren1, "Mannschaftsführer/in · Trainer Jugend", 0),
            Entry("Kevin Anthony", "Frank", herren1, null, 1),
            Entry("Ben", "Koch", herren1, null, 2),
            Entry("Markus", "Stein", herren1, null, 3),
            Entry("Hans-Jürgen", "Oehlrich", herren1, null, 4),
            Entry("Hans-Jürgen", "Koch", herren1, null, 5),

            Entry("Udo", "Thoma", herren2, "Mannschaftsführer/in", 10),
            Entry("Patrick", "Bertsch", herren2, null, 11),
            Entry("Michael", "Schneider", herren2, null, 12),
            Entry("Sabrina", "Thoma", herren2, null, 13),
            Entry("Marc", "Vogelwaid", herren2, null, 14),
            Entry("Sarah", "Vogelwaid", herren2, null, 15),

            Entry("Christian", "Schreier", herren3, "Mannschaftsführer/in", 20),
            Entry("Bernd", "Kopriva", herren3, null, 21),
            Entry("Felix", "Schuler", herren3, null, 22),
            Entry("Fynn", "Schuler", herren3, null, 23),
            Entry("Samantha", "Fabach", herren3, null, 24),
            Entry("Norbert", "Herkner", herren3, null, 25),
            Entry("Cordelia", "Fabach", herren3, null, 26),

            Entry("Christiane", "Discher", damen, "Mannschaftsführer/in", 30),
            Entry("Kathleen", "Schmorde", damen, null, 31),
            Entry("Alexandra", "Barth", damen, null, 32),
            Entry("Iris", "Weinmann", damen, null, 33),
            Entry("Vanessa", "Morgenstern", damen, null, 34),
            Entry("Gabriela", "Bleul", damen, null, 35, "Gabi|Bleul"),

            Entry("Tim", "Herrmann Hofmann", jugend, null, 40),
            Entry("Maximilian", "Merz", jugend, null, 41),
            Entry("Louis", "Diehm", jugend, null, 42, "Loius|Diehm"),
            Entry("Hannah", "Hilbert", jugend, null, 43),
            Entry("Haojia", "Song", jugend, null, 44),

            Entry("Maja", "Mentzschel", ergaenzung, "Erwachsene", 50),
            Entry("Patrick", "Dürr", ergaenzung, "Erwachsene", 51),
            Entry("Oli", "Bleul", ergaenzung, "Erwachsene", 52, "Oliver|Bleul"),
            Entry("Nele", "Wiencken", ergaenzung, "Erwachsene", 53),
            Entry("Eray", "Eksi", ergaenzung, "Jugend", 54)
        };

        foreach (var item in roster)
        {
            var player = FindPlayer(players, item.FirstName, item.LastName, item.Alias);
            if (player is null)
            {
                player = new Player();
                db.Players.Add(player);
                players.Add(player);
            }

            player.FirstName = item.FirstName;
            player.LastName = item.LastName;
            player.TeamId = item.Team.Id;
            player.Role = item.Role;
            player.SortOrder = item.SortOrder;
            player.IsActive = true;
        }

        settings.RosterVersion = version;
    }

    private static async Task<Team> EnsureTeamAsync(
        AppDbContext db, int preferredId, string name, string league, int sortOrder, string? description = null)
    {
        var team = await db.Teams.FindAsync(preferredId)
            ?? await db.Teams.FirstOrDefaultAsync(t => t.Name == name);
        if (team is null)
        {
            team = new Team();
            db.Teams.Add(team);
        }

        team.Name = name;
        team.League = league;
        if (description is not null) team.Description = description;
        team.SortOrder = sortOrder;
        team.IsActive = true;
        return team;
    }

    private static RosterEntry Entry(
        string firstName, string lastName, Team team, string? role, int sortOrder, string? alias = null) =>
        new(firstName, lastName, team, role, sortOrder, alias);

    private static Player? FindPlayer(
        IEnumerable<Player> players, string firstName, string lastName, string? alias)
    {
        var match = players.FirstOrDefault(p =>
            p.FirstName.Equals(firstName, StringComparison.OrdinalIgnoreCase) &&
            p.LastName.Equals(lastName, StringComparison.OrdinalIgnoreCase));
        if (match is not null || string.IsNullOrWhiteSpace(alias)) return match;

        var parts = alias.Split('|', 2);
        return parts.Length == 2
            ? players.FirstOrDefault(p =>
                p.FirstName.Equals(parts[0], StringComparison.OrdinalIgnoreCase) &&
                p.LastName.Equals(parts[1], StringComparison.OrdinalIgnoreCase))
            : null;
    }

    private sealed record RosterEntry(
        string FirstName, string LastName, Team Team, string? Role, int SortOrder, string? Alias);
}

/// <summary>Spalten-Presets (JSON) für die bekannten Tabellentypen.</summary>
public static class StandingsPresets
{
    public static readonly string Liga = Build(
        ("platz", "Platz", "number"),
        ("mannschaft", "Mannschaft", "text"),
        ("spiele", "Spiele", "number"),
        ("punkte", "Punkte", "number"),
        ("pins", "Pins", "number"));

    public static readonly string Monatspokal = Build(
        ("platz", "Platz", "number"),
        ("spieler", "Spieler/in", "text"),
        ("punkte", "Punkte", "number"),
        ("pins", "Pins", "number"),
        ("schnitt", "Schnitt", "number"),
        ("hdc_neu", "HDC neu", "number"));

    public static readonly string Vereinsmeisterschaft = Build(
        ("platz", "Platz", "number"),
        ("spieler", "Spieler/in", "text"),
        ("spiele", "Spiele", "number"),
        ("pins_hdc", "Pins+HDC", "number"),
        ("schnitt", "Schnitt", "number"),
        ("pins", "Pins", "number"),
        ("hdc", "HDC", "number"),
        ("gesamt", "Gesamt", "number"));

    private static string Build(params (string key, string label, string type)[] cols) =>
        JsonSerializer.Serialize(cols.Select(c => new { key = c.key, label = c.label, type = c.type }));
}

public static class DefaultPageContent
{
    public const string StartseiteHtml = """
<section class="hero">
  <div class="container">
    <div>
      <span class="kicker">SV Fellbach &middot; Abteilung Bowling</span>
      <h1 id="hero-title">Bowling mit Herz und Leidenschaft</h1>
      <p id="hero-text">Berichte, Ergebnisse, Termine und Bilder unserer Abteilung - von der Jugend bis zur Oberliga.</p>
      <div class="actions">
        <a class="btn" href="ergebnisse.html">Aktuelle Ergebnisse</a>
        <a class="btn btn-light" href="news.html">Berichte lesen</a>
      </div>
    </div>
    <div class="hero-art" id="hero-art">
      <img src="assets/img/hero.png" alt="" width="560" height="560" loading="eager">
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div><div class="accent"></div><h2>Aktuelle Berichte</h2></div>
      <a class="btn btn-ghost btn-sm" href="news.html">Alle Berichte</a>
    </div>
    <div class="grid grid-3" id="home-news"></div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head">
      <div><div class="accent"></div><h2>Tabelle der aktuellen Saison</h2></div>
      <a class="btn btn-ghost btn-sm" href="ergebnisse.html">Alle Ergebnisse</a>
    </div>
    <div id="home-standings"></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head">
      <div><div class="accent"></div><h2>N&auml;chste Termine</h2></div>
      <a class="btn btn-ghost btn-sm" href="termine.html">Alle Termine</a>
    </div>
    <div id="home-events"></div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="training-cta">
      <img src="assets/img/training.png" alt="Trainer mit Nachwuchsspieler beim Bowling">
      <div>
        <span class="badge">Mitmachen</span>
        <h3>Lust auf Bowling? Komm zum Probetraining!</h3>
        <p class="muted" style="margin:0">Ob Anf&auml;nger:in oder Ligaspieler:in - bei uns ist jede:r willkommen. Schau einfach unverbindlich vorbei, Leihschuhe und B&auml;lle gibt es vor Ort.</p>
        <ul>
          <li><strong>Donnerstags 19-21 Uhr</strong> - Jugend &amp; Erwachsene</li>
          <li><strong>Samstags 10-12 Uhr</strong> - Jugend</li>
          <li>Dream Bowl Fellbach, Rems-Murr-Center</li>
        </ul>
      </div>
      <div class="cta-col">
        <a class="btn" id="trial-mail" href="mailto:abteilungsleiter@svf-bowling.de?subject=Probetraining%20Bowling">Probetraining anfragen</a>
        <a class="btn btn-ghost" href="verein.html">Mehr zum Verein</a>
      </div>
    </div>
  </div>
</section>
""";

    public const string VereinHtml = """
<section class="section">
  <div class="container">
    <div class="section-head"><div class="with-art"><img class="section-art" src="assets/img/mannschaften.png" alt=""><div>
      <div class="accent"></div><h2>&Uuml;ber uns</h2>
    </div></div></div>
    <p class="verein-lead" id="verein-lead">Die Bowling-Abteilung des SV Fellbach bietet Bowling f&uuml;r alle Altersklassen - vom Hobby- bis zum Ligaspieler. Bei uns spielen mehrere Herren-, eine Damen- und eine Jugendmannschaft im Ligabetrieb, dazu gibt es Monatspokale, Turniere und gemeinsame Vereinsabende.</p>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="training-cta">
      <img src="assets/img/training.png" alt="Trainer mit Nachwuchsspieler beim Bowling">
      <div>
        <span class="badge">Mitmachen</span>
        <h3>Training &amp; Probetraining</h3>
        <p class="muted" style="margin:0">Du willst Bowling ausprobieren? Komm einfach unverbindlich zu einem <strong>kostenlosen Probetraining</strong> vorbei - Leihschuhe und B&auml;lle gibt es vor Ort. Anf&auml;nger:innen und erfahrene Spieler:innen sind gleicherma&szlig;en willkommen.</p>
        <ul>
          <li><strong>Donnerstags 19:00-21:00 Uhr</strong> - Jugend &amp; Erwachsene</li>
          <li><strong>Samstags 10:00-12:00 Uhr</strong> - Jugend</li>
          <li>Dream Bowl Fellbach</li>
        </ul>
      </div>
      <div class="cta-col">
        <a class="btn" href="mailto:abteilungsleiter@svf-bowling.de?subject=Probetraining%20Bowling">Probetraining anfragen</a>
        <a class="btn btn-ghost" href="mannschaften.html">Unsere Mannschaften</a>
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="section-head"><div><div class="accent"></div><h2>Ansprechpartner</h2></div></div>
    <div class="info-cards">
      <div class="info-card">
        <span class="icon">Kontakt</span>
        <h3>Abteilungsleitung</h3>
        <p style="margin:.2rem 0 .4rem"><strong>Christiane Discher</strong></p>
        <p class="muted" style="margin:0 0 .5rem">Rieslingstr. 5<br>71364 Winnenden</p>
        <p style="margin:0">Tel.: 0176 - 20300392<br><a href="mailto:abteilungsleiter@svf-bowling.de">abteilungsleiter@svf-bowling.de</a></p>
      </div>
      <div class="info-card">
        <span class="icon">Jugend</span>
        <h3>Jugendleitung</h3>
        <p style="margin:.2rem 0 .4rem"><strong>Kay Kiesshauer</strong></p>
        <p class="muted" style="margin:0 0 .5rem">Gartenstr. 17/1<br>71384 Beutelsbach</p>
        <p style="margin:0">Tel.: 0176 - 44912914<br><a href="mailto:jugendleiter@svf-bowling.de">jugendleiter@svf-bowling.de</a></p>
      </div>
      <div class="info-card">
        <span class="icon">Bowling</span>
        <h3>Schon gewusst?</h3>
        <ul>
          <li>5 Mannschaften im Ligabetrieb</li>
          <li>Eigener Monatspokal &amp; Vereinsmeisterschaft</li>
          <li>Aktive Jugend- und Nachwuchsarbeit</li>
          <li>Teilnahme an w&uuml;rttembergischen Meisterschaften</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="container">
    <div class="section-head"><div><div class="accent"></div><h2>Anfahrt</h2></div></div>
    <p class="muted" style="max-width:60ch">Wir spielen und trainieren im <strong>Dream Bowl Fellbach</strong>. Parkpl&auml;tze sind direkt vor Ort vorhanden.</p>
    <div class="map-wrap">
      <iframe src="https://maps.google.com/maps?q=Dream%20Bowl%20Fellbach&output=embed" title="Karte: Dream Bowl Fellbach" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
  </div>
</section>
""";
}
