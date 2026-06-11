# SV Fellbach – Abteilung Bowling · Vereinswebsite

Moderne, mobilfreundliche Vereinswebsite mit C#-Backend, PostgreSQL-Datenbank und
einem Admin-Bereich, in dem der Vereinswart **Berichte, Liga-Ergebnisse, Bilder,
Termine, Downloads** usw. über einfache Eingabemasken selbst pflegt.

```
svf-bowling/
├── backend/     → C# .NET 8 Web-API + EF Core + PostgreSQL   (Deploy: Railway)
└── frontend/    → statische Website + Admin (HTML/CSS/JS)     (Deploy: GitHub Pages)
```

- **Frontend** = öffentliche Seite + Admin-Eingabemasken. Reines HTML/CSS/JS, kein Build-Schritt.
- **Backend** = REST-API mit JWT-Login. Bilder werden direkt in der DB gespeichert.
- **Datenbank** = PostgreSQL (auf Railway als Plugin).

> Hinweis: GitHub Pages kann nur das statische **Frontend** hosten. Backend + Datenbank
> laufen auf **Railway**. Beide Teile zusammen ergeben die fertige Seite.

---

## 1. Lokal entwickeln / testen

### Backend
Voraussetzung: .NET 8 SDK und eine erreichbare PostgreSQL.

```powershell
cd backend
# Zugangsdaten in appsettings.Development.json anpassen (DATABASE_URL, ADMIN_PASSWORD …)
dotnet run
```

- Startet auf <http://localhost:5080>, Swagger-UI unter <http://localhost:5080/swagger>.
- Beim ersten Start werden **Tabellen automatisch angelegt** (EF-Migration) und Grunddaten
  geseedet (Admin-Konto, Kategorien, Impressum/Datenschutz, optional Demo-Daten).

Die Konfiguration kommt aus Umgebungsvariablen **oder** `appsettings.Development.json`:

| Variable          | Bedeutung                                                        |
|-------------------|------------------------------------------------------------------|
| `DATABASE_URL`    | PostgreSQL-Verbindung (Npgsql-String **oder** `postgres://…`-URL) |
| `JWT_SECRET`      | Geheimer Schlüssel für die Login-Tokens (lang & zufällig)        |
| `ADMIN_USERNAME`  | Initiales Admin-Konto (wird beim Start angelegt)                 |
| `ADMIN_PASSWORD`  | Passwort des initialen Admin-Kontos                              |
| `ADMIN_EMAIL`     | (optional) E-Mail des Admin-Kontos                              |
| `CORS_ORIGIN`     | Erlaubte Frontend-Domain, z. B. `https://name.github.io` (oder `*`) |
| `SEED_DEMO_DATA`  | `true` = Beispiel-Berichte/-Tabellen anlegen                    |

### Frontend
Kein Build nötig – einfach mit einem beliebigen statischen Server ausliefern, z. B.:

```powershell
cd frontend
# In config.js muss API_BASE_URL auf das laufende Backend zeigen (lokal: http://127.0.0.1:5080)
npx serve .        # oder ein anderer statischer Server / Live-Server in VS Code
```

Öffentliche Seite: `index.html` · Admin-Bereich: `admin/index.html`
**Standard-Login (lokal):** `admin` / `admin123` (über `ADMIN_PASSWORD` änderbar).

---

## 2. Backend auf Railway deployen

1. Neues Railway-Projekt → **PostgreSQL** als Plugin hinzufügen (liefert `DATABASE_URL`).
2. Neuen **Service** aus diesem Repo erstellen; **Root Directory = `backend`**
   (Railway erkennt das `Dockerfile` automatisch).
3. Unter *Variables* setzen:
   - `JWT_SECRET` = langer Zufallswert
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD` (Erst-Login)
   - `CORS_ORIGIN` = deine GitHub-Pages-URL (z. B. `https://deinname.github.io`)
   - `DATABASE_URL` ist durch das Postgres-Plugin meist schon vorhanden.
4. Deploy abwarten → Railway vergibt eine öffentliche URL
   (z. B. `https://svf-bowling-backend.up.railway.app`). Swagger: `…/swagger`.

Die Datenbank wird beim Start automatisch migriert und geseedet.

## 3. Frontend auf GitHub Pages deployen

1. In **`frontend/config.js`** die `API_BASE_URL` auf die Railway-URL setzen.
2. Den Ordner `frontend/` als GitHub-Pages-Quelle veröffentlichen – zwei gängige Wege:
   - Eigenes Repo `frontend/` → Pages aus dem Branch-Root, **oder**
   - im Haupt-Repo den Pages-Quellordner auf `/frontend` (bzw. Inhalt nach `/docs`) legen.
3. Im Backend `CORS_ORIGIN` auf die finale Pages-URL setzen (siehe oben).

Fertig – die öffentliche Seite lädt ihre Inhalte live aus dem Backend.

---

## 4. Inhalte pflegen (Admin-Bereich)

Im Admin-Bereich (`/admin/`) anmelden. Bereiche:

- **Berichte** – News mit Titelbild, Kategorie, Mannschaft, Inhalt (HTML), Entwurf/Veröffentlicht.
- **Ergebnis-Tabellen** – Liga, Monatspokal, Vereinsmeisterschaft **und beliebige eigene
  Tabellen**: Spalten frei definieren (oder Vorlage laden), Zeilen wie in einer Tabelle eintippen.
  → So lassen sich jederzeit **neue Tabellentypen ohne Programmierung** anlegen.
- **Termine, Galerie-Alben, Bilder, Downloads, Mannschaften, Spieler, Saisons, Kategorien.**
- **Seiten** – Impressum, Datenschutz & Co. direkt editieren.
- **Einstellungen** – Vereinsname, Slogan, Begrüßungstext, Kontakt, Social-Links, Logo/Header.
- **Benutzer** (nur Admin-Rolle) – weitere Konten für Vertretung anlegen (Rolle *Admin* oder *Editor*).

**Bilder** werden im Bereich *Bilder* hochgeladen und können dort einem Galerie-Album
zugeordnet werden; Titelbilder für Berichte/Mannschaften wählt man direkt im jeweiligen Formular.

---

## 5. Farben / Design anpassen

Das gesamte Farbschema steckt in CSS-Variablen ganz oben in
[`frontend/assets/css/styles.css`](frontend/assets/css/styles.css):

```css
:root {
  --color-primary: #d10a2a;   /* Vereins-Rot */
  --color-ink: #1c2024;       /* Text/Anthrazit */
  ...
}
```

Eine Farbe hier ändern → wirkt auf der ganzen Seite. (Aktuell: Rot & Weiß passend zu den Trikots.)

---

## 6. Datenbank-Tabellen (Überblick)

`AdminUsers`, `Seasons`, `Categories`, `Teams`, `Players`, `NewsArticles`,
`StandingsTables` + `StandingsRows` (generische Ergebnis-Engine), `Images` (bytea),
`GalleryAlbums`, `Events`, `Downloads` (bytea), `Pages`, `SiteSettings`.

API-Doku: Swagger unter `/swagger`.
