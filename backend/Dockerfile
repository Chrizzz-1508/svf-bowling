FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["SvfBowling.Api.csproj", "./"]
RUN dotnet restore "SvfBowling.Api.csproj"

COPY . .
RUN dotnet publish "SvfBowling.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Den Port gibt Railway zur Laufzeit über die PORT-Variable vor; Program.cs bindet
# darauf (siehe builder.WebHost.UseUrls). Kein fest verdrahteter ASPNETCORE_URLS-Wert.
EXPOSE 8080

ENTRYPOINT ["dotnet", "SvfBowling.Api.dll"]
