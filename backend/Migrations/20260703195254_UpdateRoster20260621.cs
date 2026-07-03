using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SvfBowling.Api.Migrations
{
    /// <inheritdoc />
    public partial class UpdateRoster20260621 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RosterVersion",
                table: "SiteSettings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RosterVersion",
                table: "SiteSettings");
        }
    }
}
