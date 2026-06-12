using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using SvfBowling.Api.Auth;
using SvfBowling.Api.Data;
using SvfBowling.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// Railway (und andere PaaS) geben den Port zur Laufzeit über die PORT-Variable vor.
// Explizit hier binden, damit der Router den Dienst sicher erreicht.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// ---------------- Konfiguration (Env-Variablen überschreiben appsettings) ----------------
var databaseUrl = config["DATABASE_URL"];
var jwtSecret = config["JWT_SECRET"];
if (string.IsNullOrWhiteSpace(jwtSecret))
{
    // Fallback nur für lokale Entwicklung – in Produktion JWT_SECRET als Env setzen!
    jwtSecret = "dev-only-super-secret-change-me-please-0123456789abcdef";
}
// Railway/Heroku liefern DATABASE_URL als postgres://-URL – in Npgsql-Form umwandeln.
if (!string.IsNullOrEmpty(databaseUrl) &&
    (databaseUrl.StartsWith("postgres://") || databaseUrl.StartsWith("postgresql://")))
{
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':');
    databaseUrl = new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Username = userInfo[0],
        Password = userInfo.Length > 1 ? userInfo[1] : "",
        Database = uri.AbsolutePath.TrimStart('/'),
        SslMode = Npgsql.SslMode.Require
    }.ToString();
}

// ---------------- Dienste ----------------
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(databaseUrl));

var tokenService = new JwtTokenService(jwtSecret);
builder.Services.AddSingleton(tokenService);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = JwtTokenService.Issuer,
            ValidateAudience = true,
            ValidAudience = JwtTokenService.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = tokenService.SecurityKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization(options =>
    options.AddPolicy("Admin", p => p.RequireRole("Admin")));

// Öffentliche Read-API mit Bearer-Token-Auth (keine Cookies) → alle Origins erlaubt.
builder.Services.AddCors(options => options.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "SV Fellbach Bowling API", Version = "v1" });
    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "JWT-Token aus /api/auth/login (ohne 'Bearer '-Präfix eingeben).",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
    };
    c.AddSecurityDefinition("Bearer", scheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { [scheme] = Array.Empty<string>() });
});

var app = builder.Build();

// ---------------- Pipeline ----------------
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "SVF Bowling API v1"));

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Ok(new { service = "SV Fellbach Bowling API", status = "ok" })).ExcludeFromDescription();

app.MapAuthEndpoints();
app.MapNewsEndpoints();
app.MapStandingsEndpoints();
app.MapContentEndpoints();
app.MapMediaEndpoints();
app.MapUtilityEndpoints();

// ---------------- DB migrieren + seeden ----------------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    await SeedData.EnsureSeedAsync(db, config);
}

app.Run();
