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
