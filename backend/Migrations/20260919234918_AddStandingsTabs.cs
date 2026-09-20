using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SvfBowling.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStandingsTabs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TabsJson",
                table: "StandingsTables",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TabsJson",
                table: "StandingsTables");
        }
    }
}
