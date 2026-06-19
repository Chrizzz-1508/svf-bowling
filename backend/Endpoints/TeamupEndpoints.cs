using SvfBowling.Api.Services;

namespace SvfBowling.Api.Endpoints;

public static class TeamupEndpoints
{
    public static void MapTeamupEndpoints(this WebApplication app)
    {
        var admin = app.MapGroup("/api/admin/teamup").WithTags("Teamup (Admin)").RequireAuthorization();

        // Manueller Sofort-Sync (z. B. direkt nach einer Konfigurationsänderung).
        admin.MapPost("/sync", async (TeamupSyncRunner runner, CancellationToken ct) =>
        {
            var r = await runner.RunAsync(ct);
            return Results.Ok(new { ran = r.Ran, count = r.Count, status = r.Status });
        });
    }
}
