using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SvfBowling.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPasswordReset : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PasswordResetRequestedAt",
                table: "AdminUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PasswordResetTokenExpiresAt",
                table: "AdminUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PasswordResetTokenHash",
                table: "AdminUsers",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TokenVersion",
                table: "AdminUsers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_PasswordResetTokenHash",
                table: "AdminUsers",
                column: "PasswordResetTokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AdminUsers_PasswordResetTokenHash",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "PasswordResetRequestedAt",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "PasswordResetTokenExpiresAt",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "PasswordResetTokenHash",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "TokenVersion",
                table: "AdminUsers");
        }
    }
}
