namespace SvfBowling.Api.Models;

/// <summary>
/// Login-Konto für den Admin-/Pflegebereich (Vereinswart, Vertretung, …).
/// Rollen: "Admin" (darf alles inkl. Benutzerverwaltung) und "Editor" (Inhalte pflegen).
/// </summary>
public class AdminUser
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string? Email { get; set; }
    public string PasswordHash { get; set; } = "";
    public int TokenVersion { get; set; }
    public string? PasswordResetTokenHash { get; set; }
    public DateTime? PasswordResetTokenExpiresAt { get; set; }
    public DateTime? PasswordResetRequestedAt { get; set; }
    public string Role { get; set; } = "Editor";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}
