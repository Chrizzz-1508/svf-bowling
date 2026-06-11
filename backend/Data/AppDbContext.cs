using Microsoft.EntityFrameworkCore;
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
    }
}
