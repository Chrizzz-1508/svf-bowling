using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SvfBowling.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTeamupIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TeamupApiKey",
                table: "SiteSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TeamupCalendarKey",
                table: "SiteSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TeamupLastSyncAt",
                table: "SiteSettings",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TeamupLastSyncStatus",
                table: "SiteSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TeamupSubcalendarIds",
                table: "SiteSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "TeamupSyncEnabled",
                table: "SiteSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "TeamupEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Location = table.Column<string>(type: "text", nullable: true),
                    Category = table.Column<string>(type: "text", nullable: true),
                    AllDay = table.Column<bool>(type: "boolean", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SignupEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    ParticipantCount = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamupEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TeamupEvents_ExternalId",
                table: "TeamupEvents",
                column: "ExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamupEvents_StartDate",
                table: "TeamupEvents",
                column: "StartDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TeamupEvents");

            migrationBuilder.DropColumn(
                name: "TeamupApiKey",
                table: "SiteSettings");

            migrationBuilder.DropColumn(
                name: "TeamupCalendarKey",
                table: "SiteSettings");

            migrationBuilder.DropColumn(
                name: "TeamupLastSyncAt",
                table: "SiteSettings");

            migrationBuilder.DropColumn(
                name: "TeamupLastSyncStatus",
                table: "SiteSettings");

            migrationBuilder.DropColumn(
                name: "TeamupSubcalendarIds",
                table: "SiteSettings");

            migrationBuilder.DropColumn(
                name: "TeamupSyncEnabled",
                table: "SiteSettings");
        }
    }
}
