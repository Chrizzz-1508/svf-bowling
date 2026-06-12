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
        await EnsureCategoriesAsync(db);
        await EnsurePagesAsync(db);
        await EnsureEditablePageDefaultsAsync(db);

        var seedDemo = (config["SEED_DEMO_DATA"] ?? "false").Equals("true", StringComparison.OrdinalIgnoreCase);
        if (seedDemo)
            await EnsureDemoDataAsync(db);

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
            new Team { Name = "1. Damenmannschaft", League = "Oberliga", SortOrder = 0 },
            new Team { Name = "1. Herrenmannschaft", League = "Oberliga", SortOrder = 1 },
            new Team { Name = "2. Herrenmannschaft MIX", League = "Kreisliga 3", SortOrder = 2 },
            new Team { Name = "3. Herrenmannschaft MIX", League = "Kreisliga 4", SortOrder = 3 },
            new Team { Name = "Jugend", League = "Jugend", SortOrder = 4 });

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
