namespace SvfBowling.Api.Models;

// --- Auth ---
public record LoginRequest(string Username, string Password);
public record LoginResponse(string Token, DateTime ExpiresAt, UserDto User);
public record UserDto(int Id, string Username, string? Email, string Role, bool IsActive, DateTime CreatedAt, DateTime? LastLoginAt);

public record CreateUserRequest(string Username, string? Email, string Password, string Role);
public record UpdateUserRequest(string? Email, string? Role, bool? IsActive, string? Password);
public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
