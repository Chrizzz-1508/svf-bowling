using System.Net;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace SvfBowling.Api.Endpoints;

public static class ExternalNewsEndpoints
{
    private const int ItemsPerSource = 6;

    private static readonly SourceConfig[] Sources =
    [
        new("wkbv", "WKBV-News", "https://www.wkbv-bowling.de/", "https://www.wkbv-bowling.de/?format=feed&type=rss"),
        new("dbu", "DBU-News", "https://www.dbu-bowling.de/news/index.php?rubrik=2538", "https://www.dbu-bowling.de/news/rss.xml?rubrik=2538")
    ];

    public static void MapExternalNewsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/external-news", async (IHttpClientFactory httpClientFactory, CancellationToken ct) =>
        {
            var client = httpClientFactory.CreateClient("external-news");
            var tasks = Sources.Select(source => LoadSourceAsync(client, source, ct));
            var sources = await Task.WhenAll(tasks);

            return Results.Ok(new ExternalNewsResponse(DateTimeOffset.UtcNow, sources));
        }).WithTags("Verbandsnews");
    }

    private static async Task<ExternalNewsSource> LoadSourceAsync(HttpClient client, SourceConfig source, CancellationToken ct)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, source.FeedUrl);
            req.Headers.UserAgent.ParseAdd("SVF-Bowling/1.0 (+https://chrizzz-1508.github.io/svf-bowling/)");
            req.Headers.Accept.ParseAdd("application/rss+xml");
            req.Headers.Accept.ParseAdd("application/xml");
            req.Headers.Accept.ParseAdd("text/xml");

            using var res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            res.EnsureSuccessStatusCode();

            var xml = await res.Content.ReadAsStringAsync(ct);
            var items = ParseFeed(xml, source)
                .OrderByDescending(i => i.PublishedAt ?? DateTimeOffset.MinValue)
                .Take(ItemsPerSource)
                .ToList();

            return new ExternalNewsSource(source.Key, source.Name, source.SiteUrl, items, null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException or System.Xml.XmlException)
        {
            return new ExternalNewsSource(source.Key, source.Name, source.SiteUrl, [], "Feed aktuell nicht erreichbar.");
        }
    }

    private static IEnumerable<ExternalNewsItem> ParseFeed(string xml, SourceConfig source)
    {
        var doc = XDocument.Parse(xml);
        var root = doc.Root?.Name.LocalName.ToLowerInvariant();

        if (root is "rss" or "rdf")
        {
            return doc.Descendants()
                .Where(e => e.Name.LocalName == "item")
                .Select(item =>
                {
                    // content:encoded (falls vorhanden) ist meist bildreicher als description.
                    var desc = GetChildValue(item, "encoded") ?? GetChildValue(item, "description");
                    return new ExternalNewsItem(
                        source.Key,
                        source.Name,
                        CleanText(GetChildValue(item, "title")),
                        AbsoluteUrl(GetChildValue(item, "link"), source.SiteUrl),
                        ParseDate(GetChildValue(item, "pubDate") ?? GetChildValue(item, "date")),
                        TrimSummary(CleanText(GetChildValue(item, "description") ?? desc)),
                        ExtractFirstImage(desc, source.SiteUrl));
                })
                .Where(i => !string.IsNullOrWhiteSpace(i.Title) && !string.IsNullOrWhiteSpace(i.Url));
        }

        if (root == "feed")
        {
            return doc.Descendants()
                .Where(e => e.Name.LocalName == "entry")
                .Select(entry =>
                {
                    var content = GetChildValue(entry, "content") ?? GetChildValue(entry, "summary");
                    return new ExternalNewsItem(
                        source.Key,
                        source.Name,
                        CleanText(GetChildValue(entry, "title")),
                        AbsoluteUrl(GetAtomLink(entry), source.SiteUrl),
                        ParseDate(GetChildValue(entry, "updated") ?? GetChildValue(entry, "published")),
                        TrimSummary(CleanText(GetChildValue(entry, "summary") ?? GetChildValue(entry, "content"))),
                        ExtractFirstImage(content, source.SiteUrl));
                })
                .Where(i => !string.IsNullOrWhiteSpace(i.Title) && !string.IsNullOrWhiteSpace(i.Url));
        }

        return [];
    }

    private static string? GetChildValue(XElement parent, string localName) =>
        parent.Elements().FirstOrDefault(e => e.Name.LocalName.Equals(localName, StringComparison.OrdinalIgnoreCase))?.Value;

    private static string? GetAtomLink(XElement entry)
    {
        var link = entry.Elements().FirstOrDefault(e => e.Name.LocalName == "link" &&
            ((string?)e.Attribute("rel") is null or "alternate"));
        return (string?)link?.Attribute("href") ?? link?.Value;
    }

    private static DateTimeOffset? ParseDate(string? raw) =>
        DateTimeOffset.TryParse(raw, out var date) ? date.ToUniversalTime() : null;

    private static string? AbsoluteUrl(string? raw, string baseUrl)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        raw = raw.Trim();
        if (Uri.TryCreate(raw, UriKind.Absolute, out var absolute)) return absolute.ToString();
        if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri) && Uri.TryCreate(baseUri, raw, out var combined))
            return combined.ToString();
        return null;
    }

    /// <summary>Erstes echtes &lt;img&gt; aus dem (HTML-)Beschreibungstext als absolute URL.</summary>
    private static string? ExtractFirstImage(string? html, string baseUrl)
    {
        if (string.IsNullOrWhiteSpace(html)) return null;
        foreach (Match m in Regex.Matches(html, "<img[^>]+?src\\s*=\\s*[\"']([^\"']+)[\"']", RegexOptions.IgnoreCase))
        {
            var src = WebUtility.HtmlDecode(m.Groups[1].Value).Trim();
            if (string.IsNullOrWhiteSpace(src) || src.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) continue;
            // Offensichtliche Platzhalter/Icons überspringen.
            if (Regex.IsMatch(src, "(spacer|pixel|blank|1x1|emoji|smiley)", RegexOptions.IgnoreCase)) continue;
            var abs = AbsoluteUrl(src, baseUrl);
            if (abs is not null) return abs;
        }
        return null;
    }

    private static string CleanText(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return "";
        var withoutTags = Regex.Replace(html, "<.*?>", " ");
        var decoded = WebUtility.HtmlDecode(withoutTags);
        return Regex.Replace(decoded, @"\s+", " ").Trim();
    }

    private static string? TrimSummary(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        const int maxLength = 220;
        return text.Length <= maxLength ? text : text[..maxLength].TrimEnd() + "...";
    }

    private sealed record SourceConfig(string Key, string Name, string SiteUrl, string FeedUrl);
    public sealed record ExternalNewsResponse(DateTimeOffset GeneratedAt, IReadOnlyList<ExternalNewsSource> Sources);
    public sealed record ExternalNewsSource(string Key, string Name, string Url, IReadOnlyList<ExternalNewsItem> Items, string? Error);
    public sealed record ExternalNewsItem(string SourceKey, string SourceName, string Title, string? Url, DateTimeOffset? PublishedAt, string? Summary, string? ImageUrl);
}
