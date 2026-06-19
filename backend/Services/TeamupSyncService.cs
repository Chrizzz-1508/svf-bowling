namespace SvfBowling.Api.Services;

/// <summary>
/// Hintergrunddienst: stößt den Teamup-Sync kurz nach dem Start und danach
/// stündlich an. Die eigentliche Logik liegt im <see cref="TeamupSyncRunner"/>,
/// der pro Lauf in einem eigenen DI-Scope aufgelöst wird (scoped DbContext).
/// </summary>
public class TeamupSyncService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TeamupSyncService> _logger;

    public TeamupSyncService(IServiceScopeFactory scopeFactory, ILogger<TeamupSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Kurze Anlaufzeit, damit DB-Migration/Seed beim Start sicher durch sind.
        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(Interval);
        do
        {
            await RunOnceAsync(stoppingToken);
        }
        while (await WaitForNextTickSafelyAsync(timer, stoppingToken));
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var runner = scope.ServiceProvider.GetRequiredService<TeamupSyncRunner>();
            await runner.RunAsync(ct);
        }
        catch (OperationCanceledException) { /* Shutdown */ }
        catch (Exception ex) { _logger.LogError(ex, "Teamup-Hintergrund-Sync fehlgeschlagen."); }
    }

    private static async Task<bool> WaitForNextTickSafelyAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try { return await timer.WaitForNextTickAsync(ct); }
        catch (OperationCanceledException) { return false; }
    }
}
