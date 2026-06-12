// ============================================================================
//  Gemeinsames Layout (Header + Footer) für alle öffentlichen Seiten.
//  Aktive Seite über <body data-page="..."> steuern.
// ============================================================================
const LOGO_SVG = `
<svg class="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="24" cy="24" r="22" fill="#8f1d2c"/>
  <circle cx="18" cy="18" r="3" fill="#fff"/>
  <circle cx="27" cy="16" r="2.2" fill="#fff"/>
  <circle cx="16" cy="27" r="2.2" fill="#fff"/>
  <path d="M30 34c4-3 6-9 4-15-1-3-4-3-5 0-1 4-2 7-5 9-3 2-3 6 0 7 2 .8 4 .3 6-1z" fill="#fff"/>
</svg>`;

const NAV_ITEMS = [
  { key: "home", label: "Start", href: "index.html" },
  { key: "news", label: "Berichte", href: "news.html" },
  { key: "ergebnisse", label: "Ergebnisse", href: "ergebnisse.html" },
  { key: "mannschaften", label: "Mannschaften", href: "mannschaften.html" },
  { key: "galerie", label: "Galerie", href: "galerie.html" },
  { key: "termine", label: "Termine", href: "termine.html" },
  { key: "verein", label: "Verein", href: "verein.html" },
  { key: "downloads", label: "Downloads", href: "downloads.html" }
];

function renderChrome() {
  const active = document.body.dataset.page || "";
  const club = "SV Fellbach";

  // ---- Header ----
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="container nav">
      <a class="brand" href="index.html">
        <img class="logo" src="assets/img/logo.png" alt="" width="46" height="46" loading="eager" decoding="async">
        <span>${club}<small>Abteilung Bowling</small></span>
      </a>
      <button class="hamburger" aria-label="Menü" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav-links">
        ${NAV_ITEMS.map(i => `<a href="${i.href}" class="${i.key === active ? "active" : ""}">${i.label}</a>`).join("")}
        <a href="suche.html" class="nav-search ${active === "suche" ? "active" : ""}" aria-label="Suche" title="Suche">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
          <span class="search-label">Suche</span>
        </a>
      </nav>
    </div>`;
  document.body.prepend(header);

  const burger = header.querySelector(".hamburger");
  const links = header.querySelector(".nav-links");
  burger.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
  });
  links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));

  // ---- Footer ----
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <h4 data-footer="club">SV Fellbach – Abteilung Bowling</h4>
          <p class="muted" data-footer="welcome" style="color:#9aa0a8;max-width:42ch"></p>
          <div data-footer="social" style="display:flex;gap:.8rem;margin-top:.6rem"></div>
        </div>
        <div>
          <h4>Schnellzugriff</h4>
          <ul class="footer-links">
            <li><a href="news.html">Berichte</a></li>
            <li><a href="ergebnisse.html">Ergebnisse</a></li>
            <li><a href="mannschaften.html">Mannschaften</a></li>
            <li><a href="galerie.html">Galerie</a></li>
          </ul>
        </div>
        <div>
          <h4>Kontakt</h4>
          <ul class="footer-links" data-footer="contact"></ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${new Date().getFullYear()} SV Fellbach – Abteilung Bowling</span>
        <span><a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a> · <a href="admin/" class="footer-login">Interner Bereich</a></span>
      </div>
    </div>`;
  document.body.append(footer);

  loadSettingsIntoChrome(header, footer);
}

async function loadSettingsIntoChrome(header, footer) {
  try {
    const s = await SVF.get("/api/settings");
    if (!s) return;
    // Logo & Grafiken werden bewusst als statische Assets geladen (kein Nachladen aus der
    // DB), damit beim Seitenaufbau nichts kurz "aufblitzt".
    if (s.clubName) {
      const span = header.querySelector(".brand span");
      span.childNodes[0].nodeValue = s.clubName.split("–")[0].trim() || "SV Fellbach";
      footer.querySelector('[data-footer="club"]').textContent = s.clubName;
    }
    if (s.welcomeText) footer.querySelector('[data-footer="welcome"]').textContent = s.tagline || s.welcomeText.slice(0, 140);

    const contact = footer.querySelector('[data-footer="contact"]');
    const rows = [];
    if (s.contactEmail) rows.push(`<li><a href="mailto:${escapeHtml(s.contactEmail)}">${escapeHtml(s.contactEmail)}</a></li>`);
    if (s.contactPhone) rows.push(`<li>${escapeHtml(s.contactPhone)}</li>`);
    if (s.address) rows.push(`<li>${escapeHtml(s.address)}</li>`);
    contact.innerHTML = rows.join("") || '<li class="muted" style="color:#9aa0a8">—</li>';

    const social = footer.querySelector('[data-footer="social"]');
    if (s.facebookUrl) social.innerHTML += `<a href="${escapeHtml(s.facebookUrl)}" target="_blank" rel="noopener">Facebook</a>`;
    if (s.instagramUrl) social.innerHTML += `<a href="${escapeHtml(s.instagramUrl)}" target="_blank" rel="noopener">Instagram</a>`;
  } catch { /* Backend evtl. offline – Chrome bleibt mit Standardtexten */ }
}

document.addEventListener("DOMContentLoaded", renderChrome);
