using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
        _key = Encoding.UTF8.GetBytes(secret);
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
