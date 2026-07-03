using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace SvfBowling.Api.Services;

public interface IPasswordResetEmailSender
{
    bool IsConfigured { get; }
    Task SendAsync(string recipient, string resetUrl, CancellationToken cancellationToken = default);
}

public sealed class PasswordResetEmailSender : IPasswordResetEmailSender
{
    private readonly IConfiguration _config;

    public PasswordResetEmailSender(IConfiguration config)
    {
        _config = config;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config["SMTP_HOST"]) &&
        !string.IsNullOrWhiteSpace(_config["SMTP_FROM_EMAIL"]);

    public async Task SendAsync(string recipient, string resetUrl, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("SMTP ist nicht konfiguriert.");

        var host = _config["SMTP_HOST"]!;
        var port = int.TryParse(_config["SMTP_PORT"], out var configuredPort) ? configuredPort : 587;
        var username = _config["SMTP_USERNAME"];
        var password = _config["SMTP_PASSWORD"];
        var fromEmail = _config["SMTP_FROM_EMAIL"]!;
        var fromName = _config["SMTP_FROM_NAME"] ?? "SV Fellbach Bowling";

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(fromName, fromEmail));
        message.To.Add(MailboxAddress.Parse(recipient));
        message.Subject = "Passwort für den SVF-Adminbereich zurücksetzen";
        message.Body = new BodyBuilder
        {
            TextBody = $"Hallo,\n\nüber den folgenden Link kannst du dein Passwort zurücksetzen:\n{resetUrl}\n\nDer Link ist 60 Minuten gültig und kann nur einmal verwendet werden. Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.\n\nSV Fellbach Bowling",
            HtmlBody = $"""
                <p>Hallo,</p>
                <p>über den folgenden Link kannst du dein Passwort für den Adminbereich zurücksetzen:</p>
                <p><a href="{System.Net.WebUtility.HtmlEncode(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#8f1d2c;color:#fff;text-decoration:none;border-radius:6px">Neues Passwort festlegen</a></p>
                <p>Der Link ist <strong>60 Minuten gültig</strong> und kann nur einmal verwendet werden.</p>
                <p>Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
                <p>SV Fellbach Bowling</p>
                """
        }.ToMessageBody();

        using var client = new SmtpClient();
        await client.ConnectAsync(host, port, SecureSocketOptions.Auto, cancellationToken);
        if (!string.IsNullOrWhiteSpace(username))
            await client.AuthenticateAsync(username, password ?? string.Empty, cancellationToken);
        await client.SendAsync(message, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }
}
