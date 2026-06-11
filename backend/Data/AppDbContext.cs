using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<Season> Seasons => Set<Season>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<NewsArticle> NewsArticles => Set<NewsArticle>();
    public DbSet<StandingsTable> StandingsTables => Set<StandingsTable>();
    public DbSet<StandingsRow> StandingsRows => Set<StandingsRow>();
    public DbSet<Image> Images => Set<Image>();
    public DbSet<GalleryAlbum> GalleryAlbums => Set<GalleryAlbum>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<Download> Downloads => Set<Download>();
    public DbSet<Page> Pages => Set<Page>();
    public DbSet<SiteSettings> SiteSettings => Set<SiteSettings>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AdminUser>().HasIndex(u => u.Username).IsUnique();

        b.Entity<NewsArticle>().HasIndex(n => n.Slug).IsUnique();
        b.Entity<NewsArticle>().HasIndex(n => n.PublishedAt);

        b.Entity<Page>().HasIndex(p => p.Slug).IsUnique();

        b.Entity<StandingsTable>()
            .HasMany(t => t.Rows)
            .WithOne(r => r.Table!)
            .HasForeignKey(r => r.StandingsTableId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<Image>().HasIndex(i => i.AlbumId);

        // PostgreSQL "timestamp with time zone" verlangt DateTime mit Kind=Utc.
        // Eingaben aus Formularen (datetime-local) oder mit Offset kommen aber als
        // Unspecified/Local an – hier werden alle DateTimes nach UTC normalisiert,
        // damit Schreibzugriffe nie an Npgsql scheitern.
        var utcConverter = new ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Utc ? v
               : v.Kind == DateTimeKind.Local ? v.ToUniversalTime()
               : DateTime.SpecifyKind(v, DateTimeKind.Utc),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        var utcNullableConverter = new ValueConverter<DateTime?, DateTime?>(
            v => v == null ? v
               : v.Value.Kind == DateTimeKind.Utc ? v
               : v.Value.Kind == DateTimeKind.Local ? v.Value.ToUniversalTime()
               : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc),
            v => v == null ? v : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc));

        foreach (var entityType in b.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType == typeof(DateTime)) property.SetValueConverter(utcConverter);
                else if (property.ClrType == typeof(DateTime?)) property.SetValueConverter(utcNullableConverter);
            }
        }
    }
}
