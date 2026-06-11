// ============================================================================
//  Seitenlogik (öffentlich). Dispatch über <body data-page="...">.
// ============================================================================
function loading(elId) {
  const e = document.getElementById(elId);
  if (e) e.innerHTML = `<div class="loader"><div class="spinner"></div>Lädt…</div>`;
}
function empty(elId, msg) {
  const e = document.getElementById(elId);
  if (e) e.innerHTML = `<div class="empty">${escapeHtml(msg)}</div>`;
}
function showError(elId, msg) {
  const e = document.getElementById(elId);
  if (e) e.innerHTML = `<div class="error-box">${escapeHtml(msg)}<br><small>Läuft das Backend? API: ${escapeHtml(SVF.apiBase())}</small></div>`;
}

// ---- News-Karte ----
function newsCard(n) {
  const img = SVF.imageUrl(n.titleImageId);
  const thumb = img
    ? `<a href="artikel.html?slug=${encodeURIComponent(n.slug)}" class="thumb" style="background-image:url('${img}')"></a>`
    : `<a href="artikel.html?slug=${encodeURIComponent(n.slug)}" class="thumb placeholder">${LOGO_SVG}</a>`;
  return `<article class="card">
    ${thumb}
    <div class="card-body">
      <div class="meta">${n.author ? escapeHtml(n.author) + " · " : ""}${formatDate(n.publishedAt)}</div>
      <h3><a href="artikel.html?slug=${encodeURIComponent(n.slug)}" style="color:inherit">${escapeHtml(n.title)}</a></h3>
      <p>${escapeHtml(n.excerpt || "")}</p>
      <div class="card-foot"><a class="btn btn-sm btn-ghost" href="artikel.html?slug=${encodeURIComponent(n.slug)}">Weiterlesen</a></div>
    </div>
  </article>`;
}

// ---- Generische Ergebnis-Tabelle rendern ----
function renderStandings(table) {
  let columns = [];
  try { columns = JSON.parse(table.columnsJson || "[]"); } catch { columns = []; }
  if (!columns.length) {
    // Fallback: Spalten aus erster Zeile ableiten
    const keys = table.rows && table.rows[0] ? Object.keys(safeJson(table.rows[0].valuesJson) || {}) : [];
    columns = keys.map(k => ({ key: k, label: k }));
  }
  const head = columns.map(c => `<th>${escapeHtml(c.label || c.key)}</th>`).join("");
  const body = (table.rows || []).map(r => {
    const v = safeJson(r.valuesJson) || {};
    return "<tr>" + columns.map((c, i) =>
      `<td${i === 0 ? ' class="rank"' : ""}>${escapeHtml(v[c.key] ?? "")}</td>`).join("") + "</tr>";
  }).join("");
  return `<div class="standings-block">
    <h3>${escapeHtml(table.title)}</h3>
    ${table.subtitle ? `<div class="sub">${escapeHtml(table.subtitle)}</div>` : ""}
    <div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
  </div>`;
}

const PAGES = {
  // -------------------- Startseite --------------------
  async home() {
    try {
      const s = await SVF.get("/api/settings").catch(() => null);
      const hero = document.getElementById("hero-text");
      if (hero && s) hero.innerHTML =
        `<h1>${escapeHtml(s.tagline || "Willkommen beim Bowling im SV Fellbach")}</h1>
         <p>${escapeHtml(s.welcomeText || "")}</p>
         <a class="btn btn-light" href="news.html">Aktuelle Berichte</a>`;

      loading("home-news");
      const news = await SVF.get("/api/news?take=3");
      document.getElementById("home-news").innerHTML =
        news.length ? news.map(newsCard).join("") : `<div class="empty">Noch keine Berichte.</div>`;

      // Aktuelle Liga-Tabelle (erste veröffentlichte Liga-Tabelle der aktuellen Saison)
      const seasons = await SVF.get("/api/seasons");
      const current = seasons.find(x => x.isCurrent) || seasons[0];
      const tables = await SVF.get(`/api/standings?type=Liga${current ? "&seasonId=" + current.id : ""}`);
      const box = document.getElementById("home-standings");
      if (tables.length) {
        const full = await SVF.get(`/api/standings/${tables[0].id}`);
        box.innerHTML = renderStandings(full);
      } else {
        box.innerHTML = `<div class="empty">Noch keine Ligatabelle.</div>`;
      }
    } catch (e) { showError("home-news", e.message); }
  },

  // -------------------- Berichte --------------------
  async news() {
    const filterBox = document.getElementById("news-filter");
    const listBox = "news-list";
    let categories = [];
    try { categories = await SVF.get("/api/categories"); } catch { /* */ }

    let activeCat = qs("category") ? parseInt(qs("category")) : null;
    function renderPills() {
      filterBox.innerHTML =
        `<button class="pill ${activeCat === null ? "active" : ""}" data-cat="">Alle</button>` +
        categories.map(c => `<button class="pill ${activeCat === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`).join("");
      filterBox.querySelectorAll(".pill").forEach(p => p.addEventListener("click", () => {
        activeCat = p.dataset.cat ? parseInt(p.dataset.cat) : null;
        renderPills(); load();
      }));
    }
    async function load() {
      loading(listBox);
      try {
        const news = await SVF.get("/api/news" + (activeCat ? `?categoryId=${activeCat}` : ""));
        document.getElementById(listBox).innerHTML =
          news.length ? news.map(newsCard).join("") : `<div class="empty">Keine Berichte in dieser Kategorie.</div>`;
      } catch (e) { showError(listBox, e.message); }
    }
    renderPills();
    load();
  },

  // -------------------- Einzel-Artikel --------------------
  async artikel() {
    const slug = qs("slug");
    const box = document.getElementById("article");
    if (!slug) { box.innerHTML = `<div class="empty">Kein Beitrag gewählt.</div>`; return; }
    try {
      const n = await SVF.get("/api/news/" + encodeURIComponent(slug));
      document.title = n.title + " – SV Fellbach Bowling";
      const img = SVF.imageUrl(n.titleImageId);
      box.innerHTML = `
        <a href="news.html" class="muted">← Zurück zu den Berichten</a>
        <h1 style="margin-top:.6rem">${escapeHtml(n.title)}</h1>
        <div class="meta">${n.author ? escapeHtml(n.author) + " · " : ""}${formatDate(n.publishedAt)}</div>
        ${img ? `<img class="hero-img" src="${img}" alt="${escapeHtml(n.title)}">` : ""}
        <div class="article-content">${n.contentHtml || ""}</div>`;
    } catch (e) {
      box.innerHTML = e.status === 404 ? `<div class="empty">Beitrag nicht gefunden.</div>` : `<div class="error-box">${escapeHtml(e.message)}</div>`;
    }
  },

  // -------------------- Ergebnisse --------------------
  async ergebnisse() {
    const selBox = document.getElementById("season-select");
    const box = "results";
    let seasons = [];
    try { seasons = await SVF.get("/api/seasons"); } catch (e) { showError(box, e.message); return; }
    if (!seasons.length) { empty(box, "Noch keine Saison angelegt."); return; }

    const current = seasons.find(s => s.isCurrent) || seasons[0];
    selBox.innerHTML = seasons.map(s => `<option value="${s.id}" ${s.id === current.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
    selBox.addEventListener("change", () => load(parseInt(selBox.value)));

    async function load(seasonId) {
      loading(box);
      try {
        const tables = await SVF.get(`/api/standings?seasonId=${seasonId}`);
        if (!tables.length) { empty(box, "Für diese Saison sind noch keine Ergebnisse eingetragen."); return; }
        const order = { Liga: 0, Monatspokal: 1, Vereinsmeisterschaft: 2, Custom: 3 };
        tables.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.sortOrder - b.sortOrder);
        const full = await Promise.all(tables.map(t => SVF.get(`/api/standings/${t.id}`)));
        document.getElementById(box).innerHTML = full.map(renderStandings).join("");
      } catch (e) { showError(box, e.message); }
    }
    load(current.id);
  },

  // -------------------- Mannschaften --------------------
  async mannschaften() {
    const box = "teams";
    loading(box);
    try {
      const teams = await SVF.get("/api/teams");
      if (!teams.length) { empty(box, "Noch keine Mannschaften angelegt."); return; }
      document.getElementById(box).innerHTML = teams.map(t => {
        const img = SVF.imageUrl(t.photoImageId);
        return `<article class="card">
          ${img ? `<div class="thumb" style="background-image:url('${img}')"></div>` : `<div class="thumb placeholder">${LOGO_SVG}</div>`}
          <div class="card-body">
            ${t.league ? `<span class="badge">${escapeHtml(t.league)}</span>` : ""}
            <h3>${escapeHtml(t.name)}</h3>
            <p>${escapeHtml(t.description || "")}</p>
            <div class="card-foot"><button class="btn btn-sm btn-ghost" data-team="${t.id}">Kader anzeigen</button></div>
            <div class="roster" id="roster-${t.id}"></div>
          </div>
        </article>`;
      }).join("");
      document.querySelectorAll("[data-team]").forEach(b => b.addEventListener("click", async () => {
        const id = b.dataset.team;
        const target = document.getElementById("roster-" + id);
        if (target.dataset.loaded) { target.innerHTML = ""; target.dataset.loaded = ""; b.textContent = "Kader anzeigen"; return; }
        const { players } = await SVF.get("/api/teams/" + id);
        target.innerHTML = players.length
          ? `<ul style="margin:.6rem 0 0;padding-left:1.1rem">${players.map(p => `<li>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}${p.role ? ` <span class="muted">(${escapeHtml(p.role)})</span>` : ""}</li>`).join("")}</ul>`
          : `<p class="muted" style="margin:.6rem 0 0">Kein Kader hinterlegt.</p>`;
        target.dataset.loaded = "1"; b.textContent = "Kader ausblenden";
      }));
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Galerie --------------------
  async galerie() {
    const box = "gallery";
    const albumId = qs("album");
    if (albumId) return PAGES._album(parseInt(albumId));
    loading(box);
    try {
      const albums = await SVF.get("/api/gallery");
      if (!albums.length) { empty(box, "Noch keine Alben vorhanden."); return; }
      document.getElementById(box).innerHTML = `<div class="grid grid-3">` + albums.map(a => {
        const img = SVF.imageUrl(a.coverImageId);
        return `<a class="card" href="galerie.html?album=${a.id}" style="text-decoration:none;color:inherit">
          ${img ? `<div class="thumb" style="background-image:url('${img}')"></div>` : `<div class="thumb placeholder">${LOGO_SVG}</div>`}
          <div class="card-body">
            <h3>${escapeHtml(a.title)}</h3>
            <div class="meta">${a.eventDate ? formatDate(a.eventDate) + " · " : ""}${a.imageCount} Bild(er)</div>
          </div></a>`;
      }).join("") + `</div>`;
    } catch (e) { showError(box, e.message); }
  },
  async _album(id) {
    const box = "gallery";
    loading(box);
    try {
      const { album, images } = await SVF.get("/api/gallery/" + id);
      document.title = album.title + " – Galerie";
      document.getElementById(box).innerHTML = `
        <a href="galerie.html" class="muted">← Alle Alben</a>
        <h1 style="margin-top:.5rem">${escapeHtml(album.title)}</h1>
        ${album.description ? `<p class="muted">${escapeHtml(album.description)}</p>` : ""}
        ${images.length ? `<div class="gallery-grid">${images.map(i =>
          `<img src="${SVF.imageUrl(i.id)}" alt="${escapeHtml(i.altText || album.title)}" data-full="${SVF.imageUrl(i.id)}">`).join("")}</div>`
          : `<div class="empty">Noch keine Bilder in diesem Album.</div>`}`;
      initLightbox();
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Termine --------------------
  async termine() {
    const box = "events";
    loading(box);
    try {
      const events = await SVF.get("/api/events");
      if (!events.length) { empty(box, "Aktuell sind keine Termine eingetragen."); return; }
      document.getElementById(box).innerHTML = events.map(e => {
        const d = new Date(e.startDate);
        const day = isNaN(d) ? "–" : d.getDate();
        const mon = isNaN(d) ? "" : d.toLocaleDateString("de-DE", { month: "short" });
        return `<div class="event">
          <div class="date-chip"><div class="d">${day}</div><div class="m">${escapeHtml(mon)}</div></div>
          <div>
            <strong>${escapeHtml(e.title)}</strong>
            <div class="meta">${formatDate(e.startDate, true)}${e.location ? " · " + escapeHtml(e.location) : ""}</div>
            ${e.description ? `<p style="margin:.4rem 0 0">${escapeHtml(e.description)}</p>` : ""}
          </div></div>`;
      }).join("");
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Verein + Downloads --------------------
  async verein() {
    try {
      const page = await SVF.get("/api/pages/verein").catch(() => null);
      const content = document.getElementById("verein-content");
      if (content) content.innerHTML = page ? `<h1>${escapeHtml(page.title)}</h1>${page.contentHtml}` : "<h1>Über uns</h1>";
    } catch { /* */ }
    const box = "downloads";
    loading(box);
    try {
      const dls = await SVF.get("/api/downloads");
      document.getElementById(box).innerHTML = dls.length
        ? dls.map(d => `<div class="dl-item">
            <span class="file-ico">📄</span>
            <div class="grow"><strong>${escapeHtml(d.title)}</strong>${d.description ? `<div class="meta">${escapeHtml(d.description)}</div>` : ""}</div>
            <a class="btn btn-sm" href="${SVF.downloadUrl(d.id)}" target="_blank" rel="noopener">Download</a>
          </div>`).join("")
        : `<div class="empty">Keine Downloads vorhanden.</div>`;
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Statische Seite (Impressum/Datenschutz) --------------------
  async page() {
    const slug = document.body.dataset.slug;
    const box = document.getElementById("page-content");
    loading("page-content");
    try {
      const p = await SVF.get("/api/pages/" + slug);
      document.title = p.title + " – SV Fellbach Bowling";
      box.innerHTML = `<div class="article"><h1>${escapeHtml(p.title)}</h1>${p.contentHtml}</div>`;
    } catch (e) {
      box.innerHTML = e.status === 404 ? `<div class="empty">Diese Seite wurde noch nicht angelegt.</div>` : `<div class="error-box">${escapeHtml(e.message)}</div>`;
    }
  }
};

function initLightbox() {
  let lb = document.querySelector(".lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = `<button class="close" aria-label="Schließen">×</button><img alt="">`;
    document.body.appendChild(lb);
    lb.addEventListener("click", e => { if (e.target === lb || e.target.classList.contains("close")) lb.classList.remove("open"); });
  }
  document.querySelectorAll("[data-full]").forEach(img =>
    img.addEventListener("click", () => { lb.querySelector("img").src = img.dataset.full; lb.classList.add("open"); }));
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page && PAGES[page]) PAGES[page]();
});
