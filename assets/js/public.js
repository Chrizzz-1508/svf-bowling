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

const PLACEHOLDER_IMAGES = {
  news: "assets/img/news.png",
  teams: "assets/img/mannschaften.png",
  gallery: "assets/img/galerie.png"
};

function placeholderImage(kind, alt = "") {
  const src = PLACEHOLDER_IMAGES[kind] || PLACEHOLDER_IMAGES.news;
  return `<img src="${src}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

// Echtes Bild in fester Thumbnail-Box, zentriert & vollständig sichtbar (kein Crop)
function thumbImage(url, alt = "") {
  return `<img src="${url}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

// ---- News-Karte ----
function newsCard(n) {
  const img = SVF.imageUrl(n.titleImageId);
  const thumb = img
    ? `<a href="artikel.html?slug=${encodeURIComponent(n.slug)}" class="thumb">${thumbImage(img, n.title)}</a>`
    : `<a href="artikel.html?slug=${encodeURIComponent(n.slug)}" class="thumb placeholder">${placeholderImage("news", "Bericht")}</a>`;
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

function externalNewsSourceCard(source) {
  const items = source.items || [];
  const feedItems = items.length
    ? items.map(externalNewsItem).join("")
    : `<li class="feed-empty">${escapeHtml(source.error || "Aktuell keine Meldungen verfügbar.")}</li>`;

  return `<article class="feed-card">
    <div class="feed-head">
      <div>
        <span class="badge">${escapeHtml(source.name)}</span>
        <h3>${escapeHtml(source.name.replace("-News", ""))}</h3>
      </div>
      <a class="btn btn-sm btn-ghost" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Quelle</a>
    </div>
    <ul class="feed-list">${feedItems}</ul>
  </article>`;
}

function externalNewsItem(item) {
  const date = item.publishedAt ? formatDate(item.publishedAt) : "";
  return `<li class="feed-item">
    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
    <div class="meta">${date ? escapeHtml(date) + " · " : ""}${escapeHtml(item.sourceName || "")}</div>
    ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
  </li>`;
}

function externalNewsCard(item) {
  const date = item.publishedAt ? formatDate(item.publishedAt) : "";
  const source = item.sourceKey === "dbu" ? "DBU" : "WKBV";
  const url = escapeHtml(item.url || "#");
  // Vorschaubild aus dem Verbands-Artikel; bei Ladefehler -> Platzhaltergrafik.
  const img = item.imageUrl ? escapeHtml(item.imageUrl) : null;
  const thumb = img
    ? `<a href="${url}" class="thumb" target="_blank" rel="noopener noreferrer"><img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='assets/img/news.png';this.style.maxWidth='60%';this.style.opacity='.9'"></a>`
    : `<a href="${url}" class="thumb placeholder" target="_blank" rel="noopener noreferrer">${placeholderImage("news", source + " News")}</a>`;
  return `<article class="card">
    ${thumb}
    <div class="card-body">
      <div class="meta">${source}${date ? " &middot; " + escapeHtml(date) : ""}</div>
      <h3><a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit">${escapeHtml(item.title)}</a></h3>
      <p>${escapeHtml(item.summary || "")}</p>
      <div class="card-foot"><a class="btn btn-sm btn-ghost" href="${url}" target="_blank" rel="noopener noreferrer">Zur Quelle</a></div>
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

// ---- Sortierbare Tabellen: Klick auf Spaltenkopf sortiert (Zahlen-bewusst) ----
document.addEventListener("click", e => {
  const th = e.target.closest("table.data thead th");
  if (!th) return;
  const table = th.closest("table");
  const tbody = table.querySelector("tbody");
  const idx = [...th.parentNode.children].indexOf(th);
  const dir = th.dataset.sort === "asc" ? -1 : 1;
  table.querySelectorAll("thead th").forEach(h => { h.dataset.sort = ""; h.classList.remove("sort-asc", "sort-desc"); });
  th.dataset.sort = dir === 1 ? "asc" : "desc";
  th.classList.add(dir === 1 ? "sort-asc" : "sort-desc");

  const num = s => parseFloat(String(s).replace(/\./g, "").replace(",", "."));
  const rows = [...tbody.querySelectorAll("tr")];
  rows.sort((a, b) => {
    const av = a.children[idx]?.textContent.trim() ?? "";
    const bv = b.children[idx]?.textContent.trim() ?? "";
    const an = num(av), bn = num(bv);
    if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
    return av.localeCompare(bv, "de-DE", { numeric: true }) * dir;
  });
  rows.forEach(r => tbody.appendChild(r));
});

const RESULT_TYPE_DEFS = [
  { key: "Liga", label: "Liga", entryLabel: "Tabelle" },
  { key: "Monatspokal", label: "Monatspokal", entryLabel: "Monat" },
  { key: "Vereinsmeisterschaft", label: "Vereinsmeisterschaft", entryLabel: "Wertung" },
  { key: "Custom", label: "Weitere", entryLabel: "Tabelle" }
];

function normalizeResultType(type) {
  return RESULT_TYPE_DEFS.some(d => d.key === type) ? type : "Custom";
}

function resultTypeDef(type) {
  return RESULT_TYPE_DEFS.find(d => d.key === normalizeResultType(type)) || RESULT_TYPE_DEFS[0];
}

function sortSeasonsDesc(a, b) {
  return (b.sortOrder || 0) - (a.sortOrder || 0) || b.name.localeCompare(a.name, "de-DE", { numeric: true });
}

function resultEntryLabel(table, type) {
  let label = table.title || "";
  if (type === "Monatspokal") label = label.replace(/^Monatspokal\s*[\u2013-]\s*/, "").trim();
  if (type === "Vereinsmeisterschaft") label = label.replace(/^Vereinsmeisterschaft\s*[\u2013-]\s*/, "").trim();
  return label || table.title || "Tabelle";
}

// Monatspokal-Monate in Saison-Reihenfolge (Dezember zuerst).
const MP_MONTH_ORDER = ["Dezember", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November"];

function sortResultEntries(list, type) {
  // Monatspokal: Gesamtwertung zuerst, danach die Monate in Saison-Reihenfolge –
  // unabhängig davon, wann die Tabellen angelegt wurden.
  if (type === "Monatspokal") {
    const rank = t => {
      const label = resultEntryLabel(t, type);
      if (/Gesamt/i.test(label)) return -1;
      const idx = MP_MONTH_ORDER.indexOf(label);
      return idx >= 0 ? idx : 99;
    };
    return [...list].sort((a, b) =>
      rank(a) - rank(b) || (a.sortOrder || 0) - (b.sortOrder || 0));
  }
  return [...list].sort((a, b) =>
    (a.sortOrder || 0) - (b.sortOrder || 0) ||
    resultEntryLabel(a, type).localeCompare(resultEntryLabel(b, type), "de-DE", { numeric: true })
  );
}

async function loadManagedPageContent(slug, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return null;
  try {
    const page = await SVF.get("/api/pages/" + encodeURIComponent(slug));
    if (page && page.contentHtml) {
      target.innerHTML = page.contentHtml;
      if (page.title) document.title = page.title + " – SV Fellbach Bowling";
      return page;
    }
  } catch { /* Fallback bleibt im HTML */ }
  return null;
}

const PAGES = {
  // -------------------- Startseite --------------------
  async home() {
    try {
      const managed = await loadManagedPageContent("startseite", "home-content");
      const s = await SVF.get("/api/settings").catch(() => null);
      if (s && !managed) {
        const h = document.getElementById("hero-title");
        const p = document.getElementById("hero-text");
        if (h && s.tagline) h.textContent = s.tagline;
        if (p && s.welcomeText) p.textContent = s.welcomeText;
        // Kein DB-Headerbild mehr im Hero -> verhindert das kurze "Aufblitzen".
        // Logo & Grafiken sind statische Assets.
      }

      const newsBox = document.getElementById("home-news");
      if (newsBox) {
        loading("home-news");
        const news = await SVF.get("/api/news?take=3");
        newsBox.innerHTML =
          news.length ? news.map(newsCard).join("") : `<div class="empty">Noch keine Berichte.</div>`;
      }

      // Startseiten-Tabelle: explizit gewählte (Einstellungen) oder Fallback = aktuellste Liga
      const box = document.getElementById("home-standings");
      if (box) {
      let table = null;
      if (s && s.homeStandingsTableId) {
        table = await getStandingsFull(s.homeStandingsTableId).catch(() => null);
      }
      if (!table) {
        const tables = await SVF.get("/api/standings?type=Liga");
        if (tables.length) {
          tables.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          table = await getStandingsFull(tables[0].id).catch(() => null);
        }
      }
      box.innerHTML = table ? renderStandings(table) : `<div class="empty">Noch keine Tabelle hinterlegt.</div>`;
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
    // Robust: Container für "Mehr laden" bei Bedarf selbst anlegen
    let moreWrap = document.getElementById("news-more");
    if (!moreWrap && listEl) {
      moreWrap = document.createElement("div");
      moreWrap.className = "load-more-wrap";
      moreWrap.id = "news-more";
      listEl.insertAdjacentElement("afterend", moreWrap);
    }
    const PAGE = 12;
    let categories = [];
    try { categories = await SVF.get("/api/categories"); } catch { /* */ }

    const feedParam = (qs("category") || "").toLowerCase();
    let activeFeed = feedParam === "dbu"
      ? "dbu"
      : (["wbv", "wkbv", "verband", "verbandsnews", "external"].includes(feedParam) ? "wkbv" : null);
    let externalMode = activeFeed !== null;
    let activeCat = externalMode ? null : (qs("category") ? parseInt(qs("category")) : null);
    let offset = 0;

    function renderPills() {
      filterBox.innerHTML =
        `<button class="pill ${!externalMode && activeCat === null ? "active" : ""}" data-cat="">Alle</button>` +
        categories.map(c => `<button class="pill ${!externalMode && activeCat === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`).join("") +
        `<button class="pill ${externalMode && activeFeed === "wkbv" ? "active" : ""}" data-feed="wkbv">WKBV</button>` +
        `<button class="pill ${externalMode && activeFeed === "dbu" ? "active" : ""}" data-feed="dbu">DBU</button>`;
      filterBox.querySelectorAll(".pill").forEach(p => p.addEventListener("click", () => {
        activeFeed = p.dataset.feed || null;
        externalMode = activeFeed !== null;
        activeCat = externalMode ? null : (p.dataset.cat ? parseInt(p.dataset.cat) : null);
        offset = 0;
        renderPills(); load(true);
      }));
    }

    async function load(reset) {
      if (externalMode) return loadExternal(reset);
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

    async function loadExternal(reset) {
      if (reset) {
        listEl.innerHTML = `<div class="loader" style="grid-column:1/-1"><div class="spinner"></div>Lädt…</div>`;
        moreWrap.innerHTML = "";
      }
      try {
        const data = await SVF.get("/api/external-news");
        const sources = data.sources || [];
        const source = sources.find(s => s.key === activeFeed);
        const items = source && source.items ? source.items : [];
        listEl.innerHTML = items.length
          ? items.map(externalNewsCard).join("") +
            `<div class="feed-legal-note">Externe Verbandsmeldungen werden hier nur als kurze Teaser mit Quellenlink angezeigt. Die vollständigen Inhalte liegen bei der jeweiligen Quelle.</div>`
          : `<div class="empty" style="grid-column:1/-1">Aktuell keine ${activeFeed === "dbu" ? "DBU" : "WKBV"}-News verfügbar.</div>`;
        return;
        listEl.innerHTML = sources.length
          ? sources.map(externalNewsSourceCard).join("") +
            `<div class="feed-legal-note">Externe Verbandsmeldungen werden hier nur als kurze Teaser mit Quellenlink angezeigt. Die vollständigen Inhalte liegen bei WKBV und DBU.</div>`
          : `<div class="empty" style="grid-column:1/-1">Aktuell keine Verbandsnews verfügbar.</div>`;
      } catch (e) {
        listEl.innerHTML = `<div class="error-box" style="grid-column:1/-1">${escapeHtml(e.message)}<br><small>Verbandsnews konnten gerade nicht geladen werden.</small></div>`;
      }
    }

    renderPills();
    await load(true);
  },

  // -------------------- Einzel-Artikel --------------------
  async artikel() {
    const slug = qs("slug");
    const box = document.getElementById("article");
    if (!slug) { box.innerHTML = `<div class="empty">Kein Beitrag gewählt.</div>`; return; }
    try {
      const n = await SVF.get("/api/news/" + encodeURIComponent(slug));
      document.title = n.title + " – SV Fellbach Bowling";
      // Titelbild nur zeigen, wenn es nicht ohnehin schon im Artikeltext vorkommt (sonst doppelt)
      let img = SVF.imageUrl(n.titleImageId);
      if (img && n.titleImageId && (n.contentHtml || "").includes(`/api/images/${n.titleImageId}`)) img = null;
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

  // -------------------- Ergebnisse (eine Tabelle, klare Filter) --------------------
  async ergebnisse() {
    const typeSel = document.getElementById("result-type-select");
    const seasonSel = document.getElementById("season-select");
    const entrySel = document.getElementById("result-entry-select");
    const entryLabel = document.getElementById("entry-filter-label");
    const summary = document.getElementById("result-summary");
    const box = "results";

    let seasons = [];
    let tables = [];
    try {
      [seasons, tables] = await Promise.all([SVF.get("/api/seasons"), SVF.get("/api/standings")]);
    } catch (e) { showError(box, e.message); return; }

    if (!seasons.length) { empty(box, "Noch keine Saison angelegt."); return; }
    if (!tables.length) { empty(box, "Noch keine Ergebnisse eingetragen."); return; }

    seasons.sort(sortSeasonsDesc);
    const seasonById = new Map(seasons.map(s => [s.id, s]));
    const current = seasons.find(s => s.isCurrent) || seasons[0];
    let activeType = normalizeResultType(qs("type") || "Liga");
    let activeSeasonId = Number(qs("season")) || current.id;
    let activeEntryId = Number(qs("table")) || null;

    const tablesFor = (type, seasonId) => sortResultEntries(
      tables.filter(t => normalizeResultType(t.type) === type && t.seasonId === seasonId),
      type
    );

    const seasonsForType = type => seasons.filter(s => tablesFor(type, s.id).length);

    const availableTypes = RESULT_TYPE_DEFS.filter(def =>
      tables.some(t => normalizeResultType(t.type) === def.key)
    );

    if (!availableTypes.some(def => def.key === activeType)) activeType = availableTypes[0]?.key || "Liga";

    function chooseSeasonForType(type, preferredSeasonId) {
      const options = seasonsForType(type);
      return options.find(s => s.id === preferredSeasonId)?.id ||
        options.find(s => s.id === current.id)?.id ||
        options[0]?.id ||
        null;
    }

    function setUrl(tableId) {
      const params = new URLSearchParams();
      params.set("type", activeType);
      if (activeSeasonId) params.set("season", activeSeasonId);
      if (tableId) params.set("table", tableId);
      history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
    }

    function renderTypeSelect() {
      typeSel.innerHTML = availableTypes.map(def =>
        `<option value="${def.key}" ${def.key === activeType ? "selected" : ""}>${escapeHtml(def.label)}</option>`
      ).join("");
    }

    function renderSeasonSelect() {
      const options = seasonsForType(activeType);
      activeSeasonId = chooseSeasonForType(activeType, activeSeasonId);
      seasonSel.innerHTML = options.map(s =>
        `<option value="${s.id}" ${s.id === activeSeasonId ? "selected" : ""}>${escapeHtml(s.name)}</option>`
      ).join("");
    }

    async function renderEntrySelect() {
      const def = resultTypeDef(activeType);
      const list = tablesFor(activeType, activeSeasonId);
      entryLabel.textContent = def.entryLabel;
      entrySel.innerHTML = list.map(t => {
        const label = resultEntryLabel(t, activeType);
        return `<option value="${t.id}" ${t.id === activeEntryId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("");

      if (!list.length) {
        summary.textContent = "";
        empty(box, "Für diese Auswahl sind noch keine Ergebnisse eingetragen.");
        return;
      }

      if (!list.some(t => t.id === activeEntryId)) activeEntryId = list[0].id;
      entrySel.value = String(activeEntryId);
      await showSelectedTable();
    }

    async function showSelectedTable() {
      const tableMeta = tables.find(t => t.id === activeEntryId);
      if (!tableMeta) { empty(box, "Diese Tabelle ist nicht mehr verfügbar."); return; }

      const season = seasonById.get(activeSeasonId);
      const def = resultTypeDef(activeType);
      const entry = resultEntryLabel(tableMeta, activeType);
      summary.innerHTML = `
        <span>${escapeHtml(def.label)}</span>
        <span>${escapeHtml(season?.name || "")}</span>
        <span>${escapeHtml(entry)}</span>`;

      loading(box);
      try {
        const full = await getStandingsFull(activeEntryId);
        document.getElementById(box).innerHTML = renderStandings(full);
        setUrl(activeEntryId);
      } catch (e) { showError(box, e.message); }
    }

    function refreshAll() {
      renderTypeSelect();
      renderSeasonSelect();
      return renderEntrySelect();
    }

    typeSel.addEventListener("change", () => {
      activeType = typeSel.value;
      activeSeasonId = chooseSeasonForType(activeType, current.id);
      activeEntryId = null;
      refreshAll();
    });

    seasonSel.addEventListener("change", () => {
      activeSeasonId = Number(seasonSel.value);
      activeEntryId = null;
      renderEntrySelect();
    });

    entrySel.addEventListener("change", () => {
      activeEntryId = Number(entrySel.value);
      showSelectedTable();
    });

    activeSeasonId = chooseSeasonForType(activeType, activeSeasonId);
    await refreshAll();
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
        return `<article class="card team-card">
          ${img ? `<div class="thumb">${thumbImage(img, t.name)}</div>` : `<div class="thumb placeholder">${placeholderImage("teams", "Mannschaft")}</div>`}
          <div class="card-body">
            <div class="team-card-head">
              ${t.league ? `<span class="badge">${escapeHtml(t.league)}</span>` : ""}
              <h3>${escapeHtml(t.name)}</h3>
              <p>${escapeHtml(t.description || "")}</p>
            </div>
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
          ${img ? `<div class="thumb">${thumbImage(img, a.title)}</div>` : `<div class="thumb placeholder">${placeholderImage("gallery", "Galerie")}</div>`}
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
        ${images.length ? `<div class="gallery-grid">${images.map(i => {
          const url = SVF.imageUrl(i.id);
          const isVideo = (i.contentType || "").startsWith("video/");
          return isVideo
            ? `<div class="gallery-video" data-video="${url}" title="Video abspielen"><video src="${url}#t=0.1" muted playsinline preload="metadata"></video><span class="play-badge" aria-hidden="true">▶</span></div>`
            : `<img src="${url}" alt="${escapeHtml(i.altText || album.title)}" data-full="${url}">`;
        }).join("")}</div>`
          : `<div class="empty">Noch keine Bilder oder Videos in diesem Album.</div>`}`;
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

  async verein() {
    try {
      const managed = await loadManagedPageContent("verein", "verein-content");
      if (managed) return;
      const s = await SVF.get("/api/settings").catch(() => null);
      if (!s) return;
      const lead = document.getElementById("verein-lead");
      if (lead && s.welcomeText) lead.textContent = s.welcomeText;
    } catch { /* */ }
  },

  // -------------------- Downloads (eigener Tab) --------------------
  async downloads() {
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
        : `<div class="empty">Aktuell stehen keine Downloads bereit.</div>`;
    } catch (e) { showError(box, e.message); }
  },

  // -------------------- Suche --------------------
  async suche() {
    const form = document.getElementById("search-form");
    const input = document.getElementById("search-input");
    const box = document.getElementById("search-results");
    let seasons = [];
    try { seasons = await SVF.get("/api/seasons"); } catch { /* */ }
    const seasonName = id => (seasons.find(s => s.id === id) || {}).name || "";

    async function run(q) {
      if (!q || q.trim().length < 2) { box.innerHTML = `<div class="empty">Bitte mindestens 2 Zeichen eingeben.</div>`; return; }
      history.replaceState(null, "", `?q=${encodeURIComponent(q)}`);
      box.innerHTML = `<div class="loader"><div class="spinner"></div>Suche…</div>`;
      try {
        const r = await SVF.get("/api/search?q=" + encodeURIComponent(q));
        const total = r.news.length + r.events.length + r.standings.length + r.pages.length + r.teams.length;
        if (!total) { box.innerHTML = `<div class="empty">Keine Treffer für „${escapeHtml(q)}“.</div>`; return; }

        let html = `<p class="muted">${total} Treffer für „${escapeHtml(q)}“</p>`;
        if (r.news.length) {
          html += `<h3 class="search-group">Berichte</h3>` + r.news.map(n => `
            <a class="search-hit" href="artikel.html?slug=${encodeURIComponent(n.slug)}">
              <strong>${escapeHtml(n.title)}</strong>
              <span class="meta">${n.author ? escapeHtml(n.author) + " · " : ""}${formatDate(n.publishedAt)}</span>
              ${n.excerpt ? `<span class="muted">${escapeHtml(n.excerpt.slice(0, 140))}…</span>` : ""}
            </a>`).join("");
        }
        if (r.events.length) {
          html += `<h3 class="search-group">Termine</h3>` + r.events.map(e => `
            <a class="search-hit" href="termine.html">
              <strong>${escapeHtml(e.title)}</strong>
              <span class="meta">${formatDate(e.startDate)}${e.location ? " · " + escapeHtml(e.location) : ""}</span>
            </a>`).join("");
        }
        if (r.standings.length) {
          html += `<h3 class="search-group">Ergebnis-Tabellen</h3>` + r.standings.map(t => `
            <a class="search-hit" href="ergebnisse.html?type=${encodeURIComponent(t.type)}&season=${t.seasonId ?? ""}&table=${t.id}">
              <strong>${escapeHtml(t.title)}</strong>
              <span class="meta">${escapeHtml(t.type)}${t.seasonId ? " · Saison " + escapeHtml(seasonName(t.seasonId)) : ""}</span>
            </a>`).join("");
        }
        if (r.teams.length) {
          html += `<h3 class="search-group">Mannschaften</h3>` + r.teams.map(t => `
            <a class="search-hit" href="mannschaften.html">
              <strong>${escapeHtml(t.name)}</strong><span class="meta">${escapeHtml(t.league || "")}</span>
            </a>`).join("");
        }
        if (r.pages.length) {
          html += `<h3 class="search-group">Seiten</h3>` + r.pages.map(p => {
            const pageLinks = { impressum: "impressum.html", datenschutz: "datenschutz.html", verein: "verein.html", startseite: "index.html" };
            return `<a class="search-hit" href="${pageLinks[p.slug] || "verein.html"}">
              <strong>${escapeHtml(p.title)}</strong></a>`;
          }).join("");
        }
        box.innerHTML = html;
      } catch (e) { box.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
    }

    form.addEventListener("submit", e => { e.preventDefault(); run(input.value); });
    const initial = qs("q");
    if (initial) { input.value = initial; run(initial); }
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
  const wd = isNaN(d) ? "" : d.toLocaleDateString("de-DE", { weekday: "short" });
  const range = e.endDate && e.endDate !== e.startDate
    ? `${formatDate(e.startDate)} – ${formatDate(e.endDate)}` : formatDate(e.startDate);
  const cat = e.category ? ` · ${escapeHtml(e.category)}` : "";
  // Bei Teamup-Terminen mit Anmeldung nur die ANZAHL zeigen – nie, wer angemeldet ist.
  const count = (e.participantCount != null)
    ? `<div class="meta">👥 ${e.participantCount} Anmeldung${e.participantCount === 1 ? "" : "en"}</div>` : "";
  return `<div class="event">
    <div class="date-chip"><div class="wd">${escapeHtml(wd)}</div><div class="d">${day}</div><div class="m">${escapeHtml(mon)}</div></div>
    <div>
      <strong>${escapeHtml(e.title)}</strong>
      <div class="meta">${range}${e.location ? " · " + escapeHtml(e.location) : ""}${cat}</div>
      ${count}
      ${e.description ? `<p style="margin:.4rem 0 0">${escapeHtml(e.description)}</p>` : ""}
    </div></div>`;
}

function initLightbox() {
  let lb = document.querySelector(".lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = `<button class="close" aria-label="Schließen">×</button><div class="lb-stage"></div>`;
    document.body.appendChild(lb);
    lb.addEventListener("click", e => { if (e.target === lb || e.target.classList.contains("close")) closeLightbox(lb); });
  }
  const stage = lb.querySelector(".lb-stage");
  document.querySelectorAll("[data-full]").forEach(el =>
    el.addEventListener("click", () => { stage.innerHTML = `<img src="${el.dataset.full}" alt="">`; lb.classList.add("open"); }));
  document.querySelectorAll("[data-video]").forEach(el =>
    el.addEventListener("click", () => { stage.innerHTML = `<video src="${el.dataset.video}" controls autoplay playsinline></video>`; lb.classList.add("open"); }));
}
function closeLightbox(lb) {
  lb.classList.remove("open");
  const v = lb.querySelector("video"); if (v) v.pause();
  const stage = lb.querySelector(".lb-stage"); if (stage) stage.innerHTML = "";
}

// Lade-Gate: Inhalte erst einblenden, wenn Chrome (Einstellungen) UND der
// Seiteninhalt fertig geladen sind -> kein Aufblitzen/Nachpoppen von DB-Inhalten.
(async () => {
  const page = document.body.dataset.page;
  const reveal = () => document.body.classList.add("ready");
  const safety = setTimeout(reveal, 4000); // Sicherheitsnetz, falls eine API hängt
  try {
    if (window.SVF_CHROME_READY) await window.SVF_CHROME_READY;
    if (page && PAGES[page]) await PAGES[page]();
  } catch { /* trotzdem anzeigen */ }
  finally { clearTimeout(safety); reveal(); }
})();
