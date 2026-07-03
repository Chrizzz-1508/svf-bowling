using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SvfBowling.Api.Models;

namespace SvfBowling.Api.Auth;

/// <summary>Erzeugt JWTs für angemeldete Admin-/Editor-Konten.</summary>
public class JwtTokenService
{
    public const string Issuer = "svf-bowling";
    public const string Audience = "svf-bowling-admin";

    private readonly byte[] _key;

    public JwtTokenService(string secret)
    {
        // HS256 erfordert einen Schlüssel mit mindestens 256 Bit. Aus dem konfigurierten
        // Secret leiten wir per SHA-256 immer einen 32-Byte-Schlüssel ab – so funktioniert die
        // Token-Erstellung unabhängig von der Länge des gesetzten JWT_SECRET.
        _key = SHA256.HashData(Encoding.UTF8.GetBytes(secret ?? string.Empty));
    }

    public SymmetricSecurityKey SecurityKey => new(_key);

    public (string token, DateTime expiresAt) CreateToken(AdminUser user, TimeSpan? lifetime = null)
    {
        var expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromDays(7));

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role),
            new("token_version", user.TokenVersion.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var creds = new SigningCredentials(SecurityKey, SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }
}
