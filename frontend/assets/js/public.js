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
function renderStandings(table, hideTitle) {
  let columns = [];
  try { columns = JSON.parse(table.columnsJson || "[]"); } catch { columns = []; }
  if (!columns.length) {
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
    ${hideTitle ? "" : `<h3>${escapeHtml(table.title)}</h3>
    ${table.subtitle ? `<div class="sub">${escapeHtml(table.subtitle)}</div>` : ""}`}
    <div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
  </div>`;
}

// ---- Cache für einzelne Tabellen ----
const standingsCache = {};
async function getStandingsFull(id) {
  if (!standingsCache[id]) standingsCache[id] = await SVF.get(`/api/standings/${id}`);
  return standingsCache[id];
}

const PAGES = {
  // -------------------- Startseite --------------------
  async home() {
    try {
      const s = await SVF.get("/api/settings").catch(() => null);
      if (s) {
        const h = document.getElementById("hero-title");
        const p = document.getElementById("hero-text");
        if (h && s.tagline) h.textContent = s.tagline;
        if (p && s.welcomeText) p.textContent = s.welcomeText;
      }

      loading("home-news");
      const news = await SVF.get("/api/news?take=3");
      document.getElementById("home-news").innerHTML =
        news.length ? news.map(newsCard).join("") : `<div class="empty">Noch keine Berichte.</div>`;

      // Aktuelle Liga-Tabelle
      const seasons = await SVF.get("/api/seasons");
      const current = seasons.find(x => x.isCurrent) || seasons[0];
      const tables = await SVF.get(`/api/standings?type=Liga${current ? "&seasonId=" + current.id : ""}`);
      const box = document.getElementById("home-standings");
      if (tables.length) {
        const full = await getStandingsFull(tables[0].id);
        box.innerHTML = renderStandings(full);
      } else {
        box.innerHTML = `<div class="empty">Noch keine Ligatabelle.</div>`;
      }

      // Nächste Termine
      const evBox = document.getElementById("home-events");
      if (evBox) {
        const events = await SVF.get("/api/events?upcoming=true").catch(() => []);
        evBox.innerHTML = events.length
          ? events.slice(0, 4).map(eventRow).join("")
          : `<div class="empty">Keine anstehenden Termine.</div>`;
      }
    } catch (e) { showError("home-news", e.message); }
  },

  // -------------------- Berichte (mit Mehr-laden) --------------------
  async news() {
    const filterBox = document.getElementById("news-filter");
    const listEl = document.getElementById("news-list");
    const moreWrap = document.getElementById("news-more");
    const PAGE = 12;
    let categories = [];
    try { categories = await SVF.get("/api/categories"); } catch { /* */ }

    let activeCat = qs("category") ? parseInt(qs("category")) : null;
    let offset = 0;

    function renderPills() {
      filterBox.innerHTML =
        `<button class="pill ${activeCat === null ? "active" : ""}" data-cat="">Alle</button>` +
        categories.map(c => `<button class="pill ${activeCat === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`).join("");
      filterBox.querySelectorAll(".pill").forEach(p => p.addEventListener("click", () => {
        activeCat = p.dataset.cat ? parseInt(p.dataset.cat) : null;
        offset = 0;
        renderPills(); load(true);
      }));
    }

    async function load(reset) {
      if (reset) { listEl.innerHTML = `<div class="loader" style="grid-column:1/-1"><div class="spinner"></div>Lädt…</div>`; moreWrap.innerHTML = ""; }
      try {
        // take = PAGE+1: das Extra-Element verrät, ob es weitere gibt
        const params = new URLSearchParams({ take: PAGE + 1, skip: offset });
        if (activeCat) params.set("categoryId", activeCat);
        const batch = await SVF.get("/api/news?" + params);
        const hasMore = batch.length > PAGE;
        const items = batch.slice(0, PAGE);

        if (reset) listEl.innerHTML = "";
        if (!items.length && offset === 0) {
          listEl.innerHTML = `<div class="empty" style="grid-column:1/-1">Keine Berichte in dieser Kategorie.</div>`;
        } else {
          listEl.insertAdjacentHTML("beforeend", items.map(newsCard).join(""));
        }
        offset += items.length;

        moreWrap.innerHTML = hasMore ? `<button class="btn btn-ghost" id="more-btn">Ältere Berichte anzeigen</button>` : "";
        const btn = document.getElementById("more-btn");
        if (btn) btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Lädt…"; load(false); });
      } catch (e) { showError("news-list", e.message); }
    }

    renderPills();
    load(true);
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

  // -------------------- Ergebnisse (Tabs + Pills + Dropdown) --------------------
  async ergebnisse() {
    const seasonSel = document.getElementById("season-select");
    const tabsEl = document.getElementById("result-tabs");
    const box = "results";

    let seasons = [];
    try { seasons = await SVF.get("/api/seasons"); } catch (e) { showError(box, e.message); return; }
    if (!seasons.length) { empty(box, "Noch keine Saison angelegt."); return; }

    // Nur Saisons mit aktueller zuerst sortieren (neueste oben)
    seasons.sort((a, b) => b.name.localeCompare(a.name));
    const current = seasons.find(s => s.isCurrent) || seasons[0];
    seasonSel.innerHTML = seasons.map(s => `<option value="${s.id}" ${s.id === current.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
    seasonSel.addEventListener("change", () => loadSeason(parseInt(seasonSel.value)));

    let activeTab = "Liga";

    async function loadSeason(seasonId) {
      loading(box);
      tabsEl.innerHTML = "";
      try {
        const tables = await SVF.get(`/api/standings?seasonId=${seasonId}`);
        if (!tables.length) { empty(box, "Für diese Saison sind noch keine Ergebnisse eingetragen."); return; }

        const groups = { Liga: [], Monatspokal: [], Vereinsmeisterschaft: [], Custom: [] };
        tables.forEach(t => (groups[t.type] || groups.Custom).push(t));
        Object.values(groups).forEach(g => g.sort((a, b) => a.sortOrder - b.sortOrder));

        const tabDefs = [
          ["Liga", "Liga"], ["Monatspokal", "Monatspokal"],
          ["Vereinsmeisterschaft", "Vereinsmeisterschaft"], ["Custom", "Weitere"]
        ].filter(([k]) => groups[k].length || k === "Vereinsmeisterschaft");

        if (!tabDefs.some(([k]) => k === activeTab)) activeTab = tabDefs[0][0];

        tabsEl.innerHTML = tabDefs.map(([k, label]) =>
          `<button class="tab ${k === activeTab ? "active" : ""}" data-tab="${k}">${label}</button>`).join("");
        tabsEl.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => {
          activeTab = b.dataset.tab;
          tabsEl.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
          renderTab(groups);
        }));

        renderTab(groups);
      } catch (e) { showError(box, e.message); }
    }

    async function renderTab(groups) {
      const el = document.getElementById(box);
      const list = groups[activeTab] || [];

      // --- Vereinsmeisterschaft: Tabellen + Verweis auf Berichte ---
      if (activeTab === "Vereinsmeisterschaft") {
        let html = "";
        for (const t of list) html += renderStandings(await getStandingsFull(t.id));
        let vmCatId = null;
        try {
          const cats = await SVF.get("/api/categories");
          vmCatId = (cats.find(c => c.name === "Vereinsmeisterschaft") || {}).id;
        } catch { /* */ }
        html += `<div class="empty">Die Ergebnisse der Vereinsmeisterschaften findest du in den
          <a href="news.html${vmCatId ? "?category=" + vmCatId : ""}">Berichten zur Vereinsmeisterschaft</a>.</div>`;
        el.innerHTML = html;
        return;
      }

      if (!list.length) { empty(box, "Hier gibt es für diese Saison keine Einträge."); return; }

      // --- Monatspokal: Dropdown (Gesamtwertung + Monate) ---
      if (activeTab === "Monatspokal") {
        const options = list.map(t => {
          const label = t.title.replace(/^Monatspokal\s*[–-]\s*/, "");
          return `<option value="${t.id}">${escapeHtml(label)}</option>`;
        }).join("");
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1.2rem;flex-wrap:wrap">
            <strong>Wertung:</strong>
            <span class="select-wrap"><select id="mp-select">${options}</select></span>
          </div>
          <div id="mp-table"><div class="loader"><div class="spinner"></div></div></div>`;
        const sel = document.getElementById("mp-select");
        const show = async () => {
          document.getElementById("mp-table").innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
          const full = await getStandingsFull(parseInt(sel.value));
          document.getElementById("mp-table").innerHTML = renderStandings(full, true);
        };
        sel.addEventListener("change", show);
        show();
        return;
      }

      // --- Liga / Weitere: Pills pro Tabelle (Mannschaft) ---
      if (list.length === 1) {
        el.innerHTML = renderStandings(await getStandingsFull(list[0].id));
        return;
      }
      el.innerHTML = `
        <div class="pills" id="liga-pills">${list.map((t, i) =>
          `<button class="pill ${i === 0 ? "active" : ""}" data-id="${t.id}">${escapeHtml(t.title)}</button>`).join("")}</div>
        <div id="liga-table"><div class="loader"><div class="spinner"></div></div></div>`;
      const showLiga = async id => {
        document.getElementById("liga-table").innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
        const full = await getStandingsFull(id);
        document.getElementById("liga-table").innerHTML = renderStandings(full, false);
      };
      el.querySelectorAll("#liga-pills .pill").forEach(p => p.addEventListener("click", () => {
        el.querySelectorAll("#liga-pills .pill").forEach(x => x.classList.toggle("active", x === p));
        showLiga(parseInt(p.dataset.id));
      }));
      showLiga(list[0].id);
    }

    loadSeason(current.id);
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
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const upcoming = events.filter(e => new Date(e.endDate || e.startDate) >= now);
      const past = events.filter(e => new Date(e.endDate || e.startDate) < now);
      let html = "";
      if (upcoming.length) html += upcoming.map(eventRow).join("");
      else html += `<div class="empty">Keine anstehenden Termine.</div>`;
      if (past.length) {
        html += `<details style="margin-top:1.6rem"><summary class="muted" style="cursor:pointer;font-weight:600">Vergangene Termine (${past.length})</summary>
          <div style="margin-top:1rem;opacity:.7">${past.reverse().map(eventRow).join("")}</div></details>`;
      }
      document.getElementById(box).innerHTML = html;
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Verein + Downloads --------------------
  async verein() {
    try {
      const page = await SVF.get("/api/pages/verein").catch(() => null);
      const content = document.getElementById("verein-content");
      if (content) content.innerHTML = page ? `<h1>${escapeHtml(page.title)}</h1><div class="article-content">${page.contentHtml}</div>` : "<h1>Über uns</h1>";
    } catch { /* */ }
    const box = "downloads";
    loading(box);
    try {
      const dls = await SVF.get("/api/downloads");
      document.getElementById(box).innerHTML = dls.length
        ? dls.map(d => `<div class="dl-item">
            <span class="file-ico">📄</span>
            <div class="grow"><strong>${escapeHtml(d.title)}</strong>${d.description ? `<div class="meta">${escapeHtml(d.description)}</div>` : ""}</div>
            <a class="btn btn-sm btn-ghost" href="${SVF.downloadUrl(d.id)}" target="_blank" rel="noopener">Download</a>
          </div>`).join("")
        : `<div class="empty">Keine Downloads vorhanden.</div>`;
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Statische Seite --------------------
  async page() {
    const slug = document.body.dataset.slug;
    const box = document.getElementById("page-content");
    loading("page-content");
    try {
      const p = await SVF.get("/api/pages/" + slug);
      document.title = p.title + " – SV Fellbach Bowling";
      box.innerHTML = `<div class="article"><h1>${escapeHtml(p.title)}</h1><div class="article-content">${p.contentHtml}</div></div>`;
    } catch (e) {
      box.innerHTML = e.status === 404 ? `<div class="empty">Diese Seite wurde noch nicht angelegt.</div>` : `<div class="error-box">${escapeHtml(e.message)}</div>`;
    }
  }
};

// ---- Termin-Zeile ----
function eventRow(e) {
  const d = new Date(e.startDate);
  const day = isNaN(d) ? "–" : d.getDate();
  const mon = isNaN(d) ? "" : d.toLocaleDateString("de-DE", { month: "short" });
  const range = e.endDate && e.endDate !== e.startDate
    ? `${formatDate(e.startDate)} – ${formatDate(e.endDate)}` : formatDate(e.startDate);
  return `<div class="event">
    <div class="date-chip"><div class="d">${day}</div><div class="m">${escapeHtml(mon)}</div></div>
    <div>
      <strong>${escapeHtml(e.title)}</strong>
      <div class="meta">${range}${e.location ? " · " + escapeHtml(e.location) : ""}</div>
      ${e.description ? `<p style="margin:.4rem 0 0">${escapeHtml(e.description)}</p>` : ""}
    </div></div>`;
}

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
