FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["SvfBowling.Api.csproj", "./"]
RUN dotnet restore "SvfBowling.Api.csproj"

COPY . .
RUN dotnet publish "SvfBowling.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Railway provides the port via the PORT env var.
ENV ASPNETCORE_URLS=http://0.0.0.0:${PORT}
EXPOSE 8080

ENTRYPOINT ["dotnet", "SvfBowling.Api.dll"]
