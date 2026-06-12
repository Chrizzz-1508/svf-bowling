using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SvfBowling.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddHomeStandingsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "HomeStandingsTableId",
                table: "SiteSettings",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HomeStandingsTableId",
                table: "SiteSettings");
        }
    }
}
