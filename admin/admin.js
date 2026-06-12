// ============================================================================
//  Admin-Bereich: Login + Eingabemasken für alle Inhalte.
//  Generische CRUD-Engine + Spezial-Editoren (Ergebnis-Tabellen, Bilder, Einstellungen).
// ============================================================================
const LOGO_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="24" cy="24" r="22" fill="#8f1d2c"/><circle cx="18" cy="18" r="3" fill="#fff"/>
  <circle cx="27" cy="16" r="2.2" fill="#fff"/><circle cx="16" cy="27" r="2.2" fill="#fff"/>
  <path d="M30 34c4-3 6-9 4-15-1-3-4-3-5 0-1 4-2 7-5 9-3 2-3 6 0 7 2 .8 4 .3 6-1z" fill="#fff"/></svg>`;

const SECTIONS = [
  { key: "dashboard", label: "Übersicht", group: "" },
  { key: "news", label: "Berichte", group: "Inhalte" },
  { key: "standings", label: "Ergebnis-Tabellen", group: "Inhalte" },
  { key: "events", label: "Termine", group: "Inhalte" },
  { key: "gallery", label: "Galerie-Alben", group: "Inhalte" },
  { key: "images", label: "Bilder", group: "Inhalte" },
  { key: "downloads", label: "Downloads", group: "Inhalte" },
  { key: "teams", label: "Mannschaften", group: "Verein" },
  { key: "players", label: "Spieler", group: "Verein" },
  { key: "seasons", label: "Saisons", group: "Verein" },
  { key: "categories", label: "Kategorien", group: "Verein" },
  { key: "pages", label: "Seiten (Impressum…)", group: "System" },
  { key: "settings", label: "Einstellungen", group: "System" },
  { key: "users", label: "Benutzer", group: "System", adminOnly: true }
];

const state = { section: "dashboard", cache: {} };

// ---------------------------------------------------------------------------
//  Caches für Auswahllisten
// ---------------------------------------------------------------------------
async function cached(key, loader) {
  if (!state.cache[key]) state.cache[key] = await loader();
  return state.cache[key];
}
function clearCache(key) { delete state.cache[key]; }
const loadCategories = () => cached("categories", () => SVF.get("/api/categories"));
const loadTeams = () => cached("teams", () => SVF.get("/api/admin/teams"));
const loadSeasons = () => cached("seasons", () => SVF.get("/api/seasons"));

// ---------------------------------------------------------------------------
//  Generische Ressourcen-Definitionen
// ---------------------------------------------------------------------------
const RESOURCES = {
  news: {
    title: "Berichte", singular: "Bericht", newLabel: "Neuer Bericht", base: "/api/admin/news",
    fetchFull: true, // Liste liefert kein contentHtml -> vor dem Bearbeiten Vollversion laden
    columns: [
      { label: "Titel", render: n => escapeHtml(n.title) },
      { label: "Autor", render: n => escapeHtml(n.author || "—") },
      { label: "Datum", render: n => formatDate(n.publishedAt) },
      { label: "Status", render: n => tag(n.isPublished, "Veröffentlicht", "Entwurf") }
    ],
    defaults: { isPublished: true, publishedAt: new Date().toISOString() },
    fields: [
      { name: "title", label: "Titel", type: "text", required: true },
      { name: "slug", label: "URL-Kürzel (Slug)", type: "text", hint: "Leer lassen = automatisch aus Titel." },
      { name: "categoryId", label: "Kategorie", type: "select", optionsFrom: async () => opt(await loadCategories(), "name") },
      { name: "teamId", label: "Mannschaft (optional)", type: "select", optionsFrom: async () => opt(await loadTeams(), "name") },
      { name: "author", label: "Autor", type: "text" },
      { name: "titleImageId", label: "Titelbild", type: "image" },
      { name: "excerpt", label: "Kurzbeschreibung", type: "textarea", hint: "Wird in der Übersicht angezeigt." },
      { name: "contentHtml", label: "Inhalt", type: "html", required: true, hint: "Text direkt mit der Werkzeugleiste formatieren. HTML-Kenntnisse sind nicht nötig." },
      { name: "publishedAt", label: "Veröffentlicht am", type: "datetime" },
      { name: "isPublished", label: "Veröffentlicht (sonst Entwurf)", type: "checkbox" }
    ]
  },
  events: {
    title: "Termine", singular: "Termin", newLabel: "Neuer Termin", base: "/api/admin/events",
    columns: [
      { label: "Titel", render: e => escapeHtml(e.title) },
      { label: "Beginn", render: e => formatDate(e.startDate, true) },
      { label: "Ort", render: e => escapeHtml(e.location || "—") },
      { label: "Status", render: e => tag(e.isPublished, "Sichtbar", "Versteckt") }
    ],
    defaults: { isPublished: true },
    fields: [
      { name: "title", label: "Titel", type: "text", required: true },
      { name: "startDate", label: "Beginn", type: "datetime", required: true },
      { name: "endDate", label: "Ende (optional)", type: "datetime" },
      { name: "location", label: "Ort", type: "text" },
      { name: "description", label: "Beschreibung", type: "textarea" },
      { name: "isPublished", label: "Sichtbar", type: "checkbox" }
    ]
  },
  gallery: {
    reorderEntity: "gallery",
    title: "Galerie-Alben", singular: "Album", newLabel: "Neues Album", base: "/api/admin/gallery",
    columns: [
      { label: "Titel", render: a => escapeHtml(a.title) },
      { label: "Datum", render: a => formatDate(a.eventDate) },
      { label: "Status", render: a => tag(a.isPublished, "Sichtbar", "Versteckt") }
    ],
    note: "Bilder fügst du im Bereich „Bilder“ hinzu und weist sie dort einem Album zu.",
    defaults: { isPublished: true },
    fields: [
      { name: "title", label: "Titel", type: "text", required: true },
      { name: "description", label: "Beschreibung", type: "textarea" },
      { name: "coverImageId", label: "Titelbild", type: "image" },
      { name: "eventDate", label: "Datum des Ereignisses", type: "date" },
      { name: "isPublished", label: "Sichtbar", type: "checkbox" }
    ]
  },
  downloads: { custom: true },
  teams: {
    title: "Mannschaften", singular: "Mannschaft", newLabel: "Neue Mannschaft", base: "/api/admin/teams",
    reorderEntity: "teams",
    columns: [
      { label: "Name", render: t => escapeHtml(t.name) },
      { label: "Liga", render: t => escapeHtml(t.league || "—") },
      { label: "Status", render: t => tag(t.isActive, "Aktiv", "Inaktiv") }
    ],
    defaults: { isActive: true },
    onSaved: () => clearCache("teams"),
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "league", label: "Liga", type: "text" },
      { name: "description", label: "Beschreibung", type: "textarea" },
      { name: "photoImageId", label: "Mannschaftsfoto", type: "image" },
      { name: "isActive", label: "Aktiv", type: "checkbox" }
    ]
  },
  players: {
    title: "Spieler", singular: "Spieler", newLabel: "Neuer Spieler", base: "/api/admin/players",
    reorderEntity: "players",
    columns: [
      { label: "Name", render: p => escapeHtml(p.firstName + " " + p.lastName) },
      { label: "Mannschaft", render: p => escapeHtml(teamName(p.teamId)) },
      { label: "Rolle", render: p => escapeHtml(p.role || "—") }
    ],
    defaults: { isActive: true },
    fields: [
      { name: "firstName", label: "Vorname", type: "text", required: true },
      { name: "lastName", label: "Nachname", type: "text", required: true },
      { name: "teamId", label: "Mannschaft", type: "select", optionsFrom: async () => opt(await loadTeams(), "name") },
      { name: "role", label: "Rolle (optional)", type: "text", hint: "z. B. Mannschaftsführer" },
      { name: "isActive", label: "Aktiv", type: "checkbox" }
    ]
  },
  seasons: {
    title: "Saisons", singular: "Saison", newLabel: "Neue Saison", base: "/api/admin/seasons",
    reorderEntity: "seasons",
    columns: [
      { label: "Name", render: s => escapeHtml(s.name) },
      { label: "Aktuell", render: s => tag(s.isCurrent, "Aktuell", "—") }
    ],
    onSaved: () => clearCache("seasons"),
    fields: [
      { name: "name", label: "Name", type: "text", required: true, hint: "z. B. 2025/26" },
      { name: "startDate", label: "Beginn", type: "date" },
      { name: "endDate", label: "Ende", type: "date" },
      { name: "isCurrent", label: "Als aktuelle Saison markieren", type: "checkbox" }
    ]
  },
  categories: {
    title: "Kategorien", singular: "Kategorie", newLabel: "Neue Kategorie", base: "/api/admin/categories",
    reorderEntity: "categories",
    columns: [{ label: "Name", render: c => escapeHtml(c.name) }],
    onSaved: () => clearCache("categories"),
    fields: [
      { name: "name", label: "Name", type: "text", required: true }
    ]
  },
  pages: {
    title: "Seiten", singular: "Seite", newLabel: "Neue Seite", base: "/api/admin/pages",
    columns: [
      { label: "Titel", render: p => escapeHtml(p.title) },
      { label: "Slug", render: p => escapeHtml(p.slug) },
      { label: "Aktualisiert", render: p => formatDate(p.updatedAt) }
    ],
    fields: [
      { name: "title", label: "Titel", type: "text", required: true },
      { name: "slug", label: "Slug", type: "text", hint: "z. B. impressum, datenschutz, verein" },
      { name: "contentHtml", label: "Inhalt", type: "html", required: true, hint: "Text direkt mit der Werkzeugleiste formatieren. HTML-Kenntnisse sind nicht nötig." }
    ]
  },
  users: {
    title: "Benutzer", singular: "Benutzer", newLabel: "Neuer Benutzer", base: "/api/admin/users",
    columns: [
      { label: "Benutzername", render: u => escapeHtml(u.username) },
      { label: "E-Mail", render: u => escapeHtml(u.email || "—") },
      { label: "Rolle", render: u => escapeHtml(u.role) },
      { label: "Status", render: u => tag(u.isActive, "Aktiv", "Inaktiv") }
    ],
    defaults: { role: "Editor", isActive: true },
    fields: [
      { name: "username", label: "Benutzername", type: "text", required: true, lockOnEdit: true },
      { name: "email", label: "E-Mail", type: "email" },
      { name: "role", label: "Rolle", type: "select", options: [{ value: "Editor", label: "Editor" }, { value: "Admin", label: "Admin" }] },
      { name: "password", label: "Passwort", type: "text", hint: "Beim Bearbeiten leer lassen = unverändert." },
      { name: "isActive", label: "Aktiv", type: "checkbox" }
    ],
    toPayload: (v, isEdit) => isEdit
      ? { email: v.email, role: v.role, isActive: v.isActive, password: v.password || undefined }
      : { username: v.username, email: v.email, role: v.role, password: v.password }
  }
};

// ---------------------------------------------------------------------------
//  Hilfen
// ---------------------------------------------------------------------------
function tag(on, yes, no) { return `<span class="tag ${on ? "on" : "off"}">${escapeHtml(on ? yes : no)}</span>`; }
function opt(list, labelKey) { return [{ value: "", label: "– keine –" }].concat(list.map(x => ({ value: x.id, label: x[labelKey] }))); }
function teamName(id) { const t = (state.cache.teams || []).find(x => x.id === id); return t ? t.name : "—"; }
function newEntityLabel(res) { return res.newLabel || `Neue ${res.singular}`; }
function toLocalInput(iso) { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function toDateInput(iso) { return iso ? toLocalInput(iso).slice(0, 10) : ""; }

function toast(msg, type = "ok") {
  const host = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---------------------------------------------------------------------------
//  Modal
// ---------------------------------------------------------------------------
function openModal(title, bodyHtml, footHtml, wide) {
  closeModal();
  const m = document.createElement("div");
  m.className = "modal open";
  m.id = "modal";
  m.innerHTML = `<div class="modal-card ${wide ? "wide" : ""}">
    <div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="close" aria-label="Schließen">×</button></div>
    <div class="modal-body">${bodyHtml}</div>
    ${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}
  </div>`;
  document.body.appendChild(m);
  m.querySelector(".close").addEventListener("click", closeModal);
  m.addEventListener("click", e => { if (e.target === m) closeModal(); });
  return m;
}
function closeModal() { const m = document.getElementById("modal"); if (m) m.remove(); }

// ---------------------------------------------------------------------------
//  Auth / Init
// ---------------------------------------------------------------------------
function init() {
  if (!SVF.token()) return renderLogin();
  renderShell();
  const start = (location.hash || "").replace("#", "");
  go(SECTIONS.some(s => s.key === start) ? start : "dashboard");
}

function renderLogin(msg) {
  document.getElementById("app").innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <div class="logo-row">${LOGO_SVG}</div>
        <h1>Admin-Login</h1>
        <p class="muted center" style="margin-top:-.4rem">SV Fellbach – Abteilung Bowling</p>
        ${msg ? `<div class="error-box" style="margin-bottom:1rem">${escapeHtml(msg)}</div>` : ""}
        <div class="field"><label>Benutzername</label><input type="text" name="username" autocomplete="username" required></div>
        <div class="field"><label>Passwort</label><input type="password" name="password" autocomplete="current-password" required></div>
        <button class="btn" style="width:100%;justify-content:center" type="submit">Anmelden</button>
        <p class="center" style="margin:1rem 0 0"><a href="../index.html">← Zur Website</a></p>
      </form>
    </div>`;
  document.getElementById("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const res = await SVF.send("POST", "/api/auth/login", { username: f.username.value, password: f.password.value });
      SVF.setToken(res.token); SVF.setUser(res.user);
      init();
    } catch (err) {
      renderLogin(err.status === 401 ? "Benutzername oder Passwort falsch." : err.message);
    }
  });
}

function logout() { SVF.setToken(null); SVF.setUser(null); state.cache = {}; renderLogin(); }

function renderShell() {
  const user = SVF.user() || {};
  const isAdmin = user.role === "Admin";
  const groups = {};
  SECTIONS.filter(s => !s.adminOnly || isAdmin).forEach(s => { (groups[s.group] = groups[s.group] || []).push(s); });
  const nav = Object.entries(groups).map(([g, items]) =>
    (g ? `<div class="group-label">${g}</div>` : "") +
    items.map(s => `<button data-go="${s.key}">${escapeHtml(s.label)}</button>`).join("")).join("");

  document.getElementById("app").innerHTML = `
    <div class="admin-shell" id="shell">
      <aside class="admin-side" id="side">
        <div class="side-brand"><img src="../assets/img/logo.png" alt="" width="30" height="30"><span>SVF Bowling</span></div>
        <nav class="admin-nav">${nav}</nav>
      </aside>
      <div class="admin-backdrop" id="backdrop"></div>
      <div class="admin-main">
        <div class="admin-top">
          <button class="admin-burger" id="burger" aria-label="Menü"><span></span><span></span><span></span></button>
          <img class="admin-logo" src="../assets/img/logo.png" alt="SVF Bowling">
          <h1 id="section-title">Übersicht</h1>
          <div class="spacer"></div>
          <span class="who">${escapeHtml(user.username || "")} (${escapeHtml(user.role || "")})</span>
          <a class="btn btn-sm btn-neutral admin-website" href="../index.html" target="_blank">Website</a>
          <button class="btn btn-sm btn-neutral" id="logout">Abmelden</button>
        </div>
        <div class="admin-content" id="content"></div>
      </div>
    </div>`;

  const side = document.getElementById("side");
  const shell = document.getElementById("shell");
  const setDrawer = open => { side.classList.toggle("open", open); shell.classList.toggle("nav-open", open); };

  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { go(b.dataset.go); setDrawer(false); }));
  document.getElementById("logout").addEventListener("click", logout);
  document.getElementById("burger").addEventListener("click", () => setDrawer(!side.classList.contains("open")));
  document.getElementById("backdrop").addEventListener("click", () => setDrawer(false));
}

function go(key) {
  state.section = key;
  if (location.hash.slice(1) !== key) history.replaceState(null, "", "#" + key);
  document.querySelectorAll("[data-go]").forEach(b => b.classList.toggle("active", b.dataset.go === key));
  const sec = SECTIONS.find(s => s.key === key);
  document.getElementById("section-title").textContent = sec ? sec.label : "";
  const content = document.getElementById("content");
  content.innerHTML = `<div class="loader"><div class="spinner"></div>Lädt…</div>`;

  if (key === "dashboard") return renderDashboard(content);
  if (key === "standings") return renderStandingsSection(content);
  if (key === "images") return renderImagesSection(content);
  if (key === "downloads") return renderDownloadsSection(content);
  if (key === "settings") return renderSettings(content);
  return renderResource(content, key);
}

// ---------------------------------------------------------------------------
//  Generische Liste + Formular
// ---------------------------------------------------------------------------
async function renderResource(content, key) {
  const res = RESOURCES[key];
  // Caches vorladen, die für Spaltenanzeige gebraucht werden
  if (key === "players") await loadTeams();
  try {
    const items = await SVF.get(res.base);
    state.currentItems = items;
    content.innerHTML = `
      <div class="toolbar">
        <button class="btn" id="new-btn">+ ${escapeHtml(newEntityLabel(res))}</button>
        <div class="spacer"></div>
        <span class="muted">${items.length} Einträge</span>
      </div>
      ${res.note ? `<p class="muted">${escapeHtml(res.note)}</p>` : ""}
      ${res.reorderEntity && items.length > 1 ? `<p class="muted" style="font-size:.85rem">↕ Einträge per Drag&nbsp;&amp;&nbsp;Drop am Griff sortieren.</p>` : ""}
      ${items.length ? renderTable(res, items) : `<div class="empty">Noch keine Einträge. Lege den ersten an.</div>`}`;
    document.getElementById("new-btn").addEventListener("click", () => openForm(key, null));
    bindRowActions(content, key, items);
    if (res.reorderEntity) initDragSort(content.querySelector(".atable tbody"), res.reorderEntity, res.onSaved);
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}

function renderTable(res, items) {
  const drag = !!res.reorderEntity;
  return `<div class="atable-wrap"><table class="atable"><thead><tr>
      ${drag ? "<th></th>" : ""}${res.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}<th></th>
    </tr></thead><tbody>
      ${items.map(it => `<tr data-id="${it.id}">
        ${drag ? `<td class="drag-cell"><span class="drag-handle" title="Ziehen zum Sortieren">⠿</span></td>` : ""}
        ${res.columns.map(c => `<td>${c.render(it)}</td>`).join("")}
        <td class="actions-cell"><div class="actions">
          <button class="btn btn-sm btn-neutral" data-edit="${it.id}">Bearbeiten</button>
          <button class="btn btn-sm btn-danger" data-del="${it.id}">Löschen</button>
        </div></td></tr>`).join("")}
    </tbody></table></div>`;
}

// ---- Drag & Drop Sortierung ----
function initDragSort(tbody, entity, onDone) {
  if (!tbody) return;
  let dragEl = null;
  tbody.querySelectorAll("tr[data-id]").forEach(tr => {
    const handle = tr.querySelector(".drag-handle");
    if (!handle) return;
    handle.addEventListener("mousedown", () => { tr.draggable = true; });
    handle.addEventListener("touchstart", () => { tr.draggable = true; }, { passive: true });
    tr.addEventListener("dragstart", e => {
      dragEl = tr; tr.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", tr.dataset.id); } catch { /* */ }
    });
    tr.addEventListener("dragover", e => {
      e.preventDefault();
      if (!dragEl || dragEl === tr) return;
      const rect = tr.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      tr.parentNode.insertBefore(dragEl, after ? tr.nextSibling : tr);
    });
    tr.addEventListener("dragend", async () => {
      tr.classList.remove("dragging"); tr.draggable = false;
      if (!dragEl) return;
      dragEl = null;
      const ids = [...tbody.querySelectorAll("tr[data-id]")].map(r => Number(r.dataset.id));
      try {
        await SVF.send("POST", "/api/admin/reorder", { entity, orderedIds: ids });
        toast("Reihenfolge gespeichert.");
        if (onDone) onDone();
      } catch (err) { toast(err.message, "err"); }
    });
  });
}

function bindRowActions(content, key, items) {
  content.querySelectorAll("[data-edit]").forEach(b =>
    b.addEventListener("click", () => openForm(key, items.find(i => i.id == b.dataset.edit))));
  content.querySelectorAll("[data-del]").forEach(b =>
    b.addEventListener("click", () => deleteItem(key, b.dataset.del)));
}

async function deleteItem(key, id) {
  const res = RESOURCES[key];
  if (!confirm(`Diesen Eintrag wirklich löschen?`)) return;
  try {
    await SVF.send("DELETE", `${res.base}/${id}`);
    if (res.onSaved) res.onSaved();
    toast("Gelöscht.");
    go(state.section);
  } catch (e) { toast(e.message, "err"); }
}

async function openForm(key, item) {
  const res = RESOURCES[key];
  const isEdit = !!item;

  // Manche Listen liefern nur eine Kurzfassung -> Vollversion nachladen (z. B. News-Inhalt)
  if (isEdit && res.fetchFull) {
    try { item = await SVF.get(`${res.base}/${item.id}`); }
    catch (e) { toast(e.message, "err"); return; }
  }
  const data = Object.assign({}, res.defaults || {}, item || {});

  // Optionen für Selects vorab laden
  for (const f of res.fields) {
    if (f.type === "select" && f.optionsFrom) f._opts = await f.optionsFrom();
    if (f.type === "select" && f.options) f._opts = f.options;
  }

  const hasHtmlField = res.fields.some(f => f.type === "html");
  const body = `<form id="entity-form">${res.fields.map(f => renderField(f, data[f.name], isEdit)).join("")}</form>`;
  const foot = `<button class="btn btn-neutral" id="cancel">Abbrechen</button><button class="btn" id="save">Speichern</button>`;
  const m = openModal(`${isEdit ? res.singular + " bearbeiten" : newEntityLabel(res)}`,
    body, foot, hasHtmlField);
  initImageFields(m);
  initRichEditors(m, res.fields, data);
  m.querySelector("#cancel").addEventListener("click", closeModal);
  m.querySelector("#save").addEventListener("click", async () => {
    const values = readForm(res.fields, m);
    if (!validate(res.fields, values)) { toast("Bitte Pflichtfelder ausfüllen.", "err"); return; }
    let payload = res.toPayload ? res.toPayload(values, isEdit) : values;
    // Neue Einträge landen automatisch ganz oben
    if (!isEdit && res.reorderEntity) {
      const sorts = (state.currentItems || []).map(i => i.sortOrder ?? 0);
      payload.sortOrder = (sorts.length ? Math.min(...sorts) : 0) - 1;
    }
    try {
      if (isEdit) await SVF.send("PUT", `${res.base}/${item.id}`, payload);
      else await SVF.send("POST", res.base, payload);
      if (res.onSaved) res.onSaved();
      closeModal(); toast("Gespeichert."); go(state.section);
    } catch (e) { toast(e.message, "err"); }
  });
}

// ---------------------------------------------------------------------------
//  Rich-Text-Editor (Quill) für "html"-Felder – kein HTML-Wissen nötig
// ---------------------------------------------------------------------------
const _quills = {};
function initRichEditors(m, fields, data) {
  fields.filter(f => f.type === "html").forEach(f => {
    const host = m.querySelector(`[data-rte="${f.name}"]`);
    if (!host) return;
    if (typeof Quill === "undefined") {
      // Fallback ohne Internet: einfaches Textfeld
      host.outerHTML = `<textarea name="${f.name}" style="min-height:200px;width:100%">${escapeHtml(data[f.name] || "")}</textarea>`;
      return;
    }
    const q = new Quill(host, {
      theme: "snow",
      placeholder: "Hier schreiben…",
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ align: [] }],
          ["link", "blockquote"],
          ["clean"]
        ]
      }
    });
    if (data[f.name]) q.clipboard.dangerouslyPasteHTML(data[f.name]);
    _quills[f.name] = q;
  });
}

// ---- Felder rendern ----
function renderField(f, value, isEdit) {
  const id = "f_" + f.name;
  const locked = f.lockOnEdit && isEdit ? "disabled" : "";
  let inner;
  switch (f.type) {
    case "textarea":
      inner = `<textarea id="${id}" name="${f.name}" style="min-height:90px">${escapeHtml(value || "")}</textarea>`; break;
    case "html":
      // Quill-Editor-Host – Inhalt wird in initRichEditors gesetzt und beim Speichern ausgelesen
      inner = `<div class="rte-host" data-rte="${f.name}"></div>`; break;
    case "number":
      inner = `<input type="number" id="${id}" name="${f.name}" value="${value ?? ""}">`; break;
    case "checkbox":
      return `<div class="field"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${value ? "checked" : ""}> ${escapeHtml(f.label)}</label></div>`;
    case "date":
      inner = `<input type="date" id="${id}" name="${f.name}" lang="de-DE" value="${toDateInput(value)}">`; break;
    case "datetime":
      // lang=de-DE -> 24h-Anzeige im nativen Picker (kein AM/PM)
      inner = `<input type="datetime-local" id="${id}" name="${f.name}" lang="de-DE" step="60" value="${toLocalInput(value)}">`; break;
    case "email":
      inner = `<input type="email" id="${id}" name="${f.name}" value="${escapeHtml(value || "")}" ${locked}>`; break;
    case "select":
      inner = `<select id="${id}" name="${f.name}">${(f._opts || []).map(o =>
        `<option value="${o.value}" ${String(o.value) === String(value ?? "") ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>`; break;
    case "image":
      inner = imageFieldHtml(f.name, value); break;
    default:
      inner = `<input type="text" id="${id}" name="${f.name}" value="${escapeHtml(value || "")}" ${locked}>`;
  }
  return `<div class="field"><label for="${id}">${escapeHtml(f.label)}${f.required ? " *" : ""}</label>${inner}${f.hint ? `<div class="hint">${escapeHtml(f.hint)}</div>` : ""}</div>`;
}

function readForm(fields, m) {
  const v = {};
  fields.forEach(f => {
    if (f.type === "html") {
      // Quill-Inhalt auslesen (oder Fallback-Textarea)
      const q = _quills[f.name];
      if (q) {
        const html = q.root.innerHTML;
        v[f.name] = (q.getText().trim() === "" && !html.includes("<img")) ? null : html;
      } else {
        const ta = m.querySelector(`textarea[name="${f.name}"]`);
        v[f.name] = ta && ta.value !== "" ? ta.value : null;
      }
      return;
    }
    const el = m.querySelector(`[name="${f.name}"]`);
    if (!el) return;
    switch (f.type) {
      case "checkbox": v[f.name] = el.checked; break;
      case "number": v[f.name] = el.value === "" ? null : Number(el.value); break;
      case "select": case "image": v[f.name] = el.value === "" ? null : (isNaN(el.value) ? el.value : Number(el.value)); break;
      default: v[f.name] = el.value === "" ? null : el.value;
    }
  });
  return v;
}

function validate(fields, values) {
  return fields.every(f => !f.required || (values[f.name] !== null && values[f.name] !== undefined && values[f.name] !== ""));
}

// ---------------------------------------------------------------------------
//  Bild-Felder + Bildbibliothek
// ---------------------------------------------------------------------------
function imageFieldHtml(name, value) {
  const url = SVF.imageUrl(value);
  return `<div class="img-picker" data-imgfield="${name}">
    <div class="preview" style="${url ? `background-image:url('${url}')` : ""}">${url ? "" : "kein Bild"}</div>
    <input type="hidden" name="${name}" value="${value ?? ""}">
    <div>
      <button type="button" class="btn btn-sm btn-neutral" data-pick>Bild wählen</button>
      ${value ? `<button type="button" class="btn btn-sm btn-neutral" data-clear>Entfernen</button>` : ""}
    </div>
  </div>`;
}
function initImageFields(scope) {
  scope.querySelectorAll("[data-imgfield]").forEach(box => {
    const hidden = box.querySelector("input[type=hidden]");
    const preview = box.querySelector(".preview");
    box.querySelector("[data-pick]")?.addEventListener("click", () => openImageLibrary(id => {
      hidden.value = id; preview.style.backgroundImage = `url('${SVF.imageUrl(id)}')`; preview.textContent = "";
    }));
    box.querySelector("[data-clear]")?.addEventListener("click", () => { hidden.value = ""; preview.style.backgroundImage = ""; preview.textContent = "kein Bild"; });
  });
}

async function openImageLibrary(onPick) {
  const body = `
    <div class="toolbar">
      <label class="btn btn-sm">Bild hochladen<input type="file" accept="image/*" id="lib-upload" hidden></label>
      <span class="muted" id="lib-status"></span>
    </div>
    <div class="img-lib" id="lib-grid"><div class="loader"><div class="spinner"></div></div></div>`;
  const m = openModal("Bildbibliothek", body, `<button class="btn btn-neutral" id="lib-close">Schließen</button>`, true);
  m.querySelector("#lib-close").addEventListener("click", closeModal);

  async function refresh() {
    const imgs = await SVF.get("/api/admin/images");
    const grid = m.querySelector("#lib-grid");
    grid.innerHTML = imgs.length ? imgs.map(i =>
      `<div class="pick" data-id="${i.id}" title="${escapeHtml(i.fileName)}" style="background-image:url('${SVF.imageUrl(i.id)}')"></div>`).join("")
      : `<div class="empty" style="grid-column:1/-1">Noch keine Bilder. Lade oben eines hoch.</div>`;
    grid.querySelectorAll(".pick").forEach(p => p.addEventListener("click", () => { onPick(Number(p.dataset.id)); closeModal(); }));
  }
  m.querySelector("#lib-upload").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    m.querySelector("#lib-status").textContent = "Lädt hoch…";
    try { await uploadImage(file); m.querySelector("#lib-status").textContent = ""; await refresh(); }
    catch (err) { m.querySelector("#lib-status").textContent = err.message; }
  });
  refresh();
}

function uploadImage(file, albumId) {
  const fd = new FormData();
  fd.append("file", file);
  if (albumId) fd.append("albumId", albumId);
  return SVF.send("POST", "/api/admin/images", fd, true);
}

// ---------------------------------------------------------------------------
//  Bilder-Bereich (Verwaltung + Album-Zuordnung)
// ---------------------------------------------------------------------------
async function renderImagesSection(content) {
  try {
    const [imgs, albums] = await Promise.all([SVF.get("/api/admin/images"), SVF.get("/api/admin/gallery")]);
    const albumOpts = `<option value="">– kein Album –</option>` + albums.map(a => `<option value="${a.id}">${escapeHtml(a.title)}</option>`).join("");
    content.innerHTML = `
      <div class="toolbar">
        <label class="btn">+ Bild hochladen<input type="file" accept="image/*" id="up" hidden></label>
        <label class="field" style="margin:0">Hochladen in Album:
          <select id="up-album" style="margin-left:.4rem">${albumOpts}</select></label>
        <div class="spacer"></div><span class="muted">${imgs.length} Bilder</span>
      </div>
      <div class="gallery-grid" id="imgs">${imgs.map(i => `
        <div class="card" style="overflow:visible">
          <div class="thumb" style="aspect-ratio:1;background-image:url('${SVF.imageUrl(i.id)}')"></div>
          <div class="card-body" style="padding:.6rem;gap:.4rem">
            <select data-album="${i.id}" style="font-size:.85rem;padding:.3rem">${albumOpts}</select>
            <button class="btn btn-sm btn-danger" data-delimg="${i.id}">Löschen</button>
          </div>
        </div>`).join("") || `<div class="empty" style="grid-column:1/-1">Noch keine Bilder.</div>`}</div>`;

    // Albumzuordnung vorauswählen
    imgs.forEach(i => { const sel = content.querySelector(`[data-album="${i.id}"]`); if (sel) sel.value = i.albumId ?? ""; });

    content.querySelector("#up").addEventListener("change", async e => {
      const file = e.target.files[0]; if (!file) return;
      const albumId = content.querySelector("#up-album").value || null;
      try { await uploadImage(file, albumId); toast("Hochgeladen."); go("images"); }
      catch (err) { toast(err.message, "err"); }
    });
    content.querySelectorAll("[data-album]").forEach(sel => sel.addEventListener("change", async () => {
      try { await SVF.send("PUT", `/api/admin/images/${sel.dataset.album}`, { albumId: sel.value ? Number(sel.value) : 0 }); toast("Album aktualisiert."); }
      catch (err) { toast(err.message, "err"); }
    }));
    content.querySelectorAll("[data-delimg]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Bild wirklich löschen?")) return;
      try { await SVF.send("DELETE", `/api/admin/images/${b.dataset.delimg}`); toast("Gelöscht."); go("images"); }
      catch (err) { toast(err.message, "err"); }
    }));
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}

// ---------------------------------------------------------------------------
//  Downloads-Bereich
// ---------------------------------------------------------------------------
async function renderDownloadsSection(content) {
  try {
    const dls = await SVF.get("/api/downloads");
    content.innerHTML = `
      <div class="toolbar"><button class="btn" id="dl-new">+ Datei hochladen</button>
        <div class="spacer"></div><span class="muted">${dls.length} Dateien</span></div>
      ${dls.length ? `<div class="atable-wrap"><table class="atable"><thead><tr><th>Titel</th><th>Datei</th><th>Kategorie</th><th></th></tr></thead><tbody>
        ${dls.map(d => `<tr><td>${escapeHtml(d.title)}</td><td class="muted">${escapeHtml(d.fileName)}</td><td>${escapeHtml(d.category || "—")}</td>
          <td class="actions"><a class="btn btn-sm btn-neutral" href="${SVF.downloadUrl(d.id)}" target="_blank">Öffnen</a>
          <button class="btn btn-sm btn-danger" data-deldl="${d.id}">Löschen</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Noch keine Downloads.</div>`}`;
    content.querySelector("#dl-new").addEventListener("click", openDownloadForm);
    content.querySelectorAll("[data-deldl]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Datei wirklich löschen?")) return;
      try { await SVF.send("DELETE", `/api/admin/downloads/${b.dataset.deldl}`); toast("Gelöscht."); go("downloads"); }
      catch (e) { toast(e.message, "err"); }
    }));
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}
function openDownloadForm() {
  const body = `<form id="dl-form">
    <div class="field"><label>Titel *</label><input type="text" name="title" required></div>
    <div class="field"><label>Beschreibung</label><input type="text" name="description"></div>
    <div class="field"><label>Kategorie</label><input type="text" name="category" placeholder="z. B. Trainingsplan"></div>
    <div class="field"><label>Datei *</label><input type="file" name="file" required></div>
  </form>`;
  const m = openModal("Datei hochladen", body, `<button class="btn btn-neutral" id="c">Abbrechen</button><button class="btn" id="s">Hochladen</button>`);
  m.querySelector("#c").addEventListener("click", closeModal);
  m.querySelector("#s").addEventListener("click", async () => {
    const f = m.querySelector("#dl-form");
    if (!f.file.files[0] || !f.title.value) { toast("Titel und Datei sind nötig.", "err"); return; }
    const fd = new FormData();
    fd.append("file", f.file.files[0]); fd.append("title", f.title.value);
    fd.append("description", f.description.value); fd.append("category", f.category.value);
    try { await SVF.send("POST", "/api/admin/downloads", fd, true); closeModal(); toast("Hochgeladen."); go("downloads"); }
    catch (e) { toast(e.message, "err"); }
  });
}

// ---------------------------------------------------------------------------
//  Einstellungen
// ---------------------------------------------------------------------------
async function renderSettings(content) {
  try {
    const [s, standings] = await Promise.all([SVF.get("/api/settings"), SVF.get("/api/admin/standings").catch(() => [])]);
    const seasons = await loadSeasons().catch(() => []);
    const seasonName = id => (seasons.find(x => x.id === id) || {}).name || "";
    const tableOpts = [{ value: "", label: "Automatisch (aktuellste Liga-Tabelle)" }]
      .concat(standings.map(t => ({ value: t.id, label: `${t.title}${t.seasonId ? " – " + seasonName(t.seasonId) : ""}` })));

    const fields = [
      { name: "clubName", label: "Vereinsname", type: "text" },
      { name: "tagline", label: "Slogan (Hero/Untertitel)", type: "text" },
      { name: "welcomeText", label: "Begrüßungstext (Startseite)", type: "textarea" },
      { name: "homeStandingsTableId", label: "Tabelle auf der Startseite", type: "select", options: tableOpts,
        hint: "Es wird genau diese eine Tabelle auf der Startseite angezeigt." },
      { name: "contactEmail", label: "Kontakt-E-Mail", type: "email" },
      { name: "contactPhone", label: "Telefon", type: "text" },
      { name: "address", label: "Adresse", type: "text" },
      { name: "facebookUrl", label: "Facebook-URL", type: "text" },
      { name: "instagramUrl", label: "Instagram-URL", type: "text" }
    ];
    fields.forEach(f => { if (f.type === "select") f._opts = f.options; });

    content.innerHTML = `<div class="modal-card" style="max-width:680px;margin:0">
      <div class="modal-body"><form id="settings-form">${fields.map(f => renderField(f, s[f.name])).join("")}</form></div>
      <div class="modal-foot"><button class="btn" id="save-settings">Speichern</button></div></div>`;
    content.querySelector("#save-settings").addEventListener("click", async () => {
      const v = readForm(fields, content);
      try { await SVF.send("PUT", "/api/admin/settings", Object.assign({ id: 1 }, s, v)); toast("Gespeichert."); }
      catch (e) { toast(e.message, "err"); }
    });
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}

// ---------------------------------------------------------------------------
//  Dashboard
// ---------------------------------------------------------------------------
async function renderDashboard(content) {
  const user = SVF.user() || {};
  try {
    const [news, standings, events] = await Promise.all([
      SVF.get("/api/news").catch(() => []),
      SVF.get("/api/standings").catch(() => []),
      SVF.get("/api/events").catch(() => [])
    ]);
    content.innerHTML = `
      <p>Hallo <strong>${escapeHtml(user.username || "")}</strong>! Hier pflegst du die Inhalte der Vereinswebsite.</p>
      <div class="admin-dashboard">
        <div class="admin-stats grid grid-4">
          ${statCard("Berichte", news.length, "news")}
          ${statCard("Ergebnis-Tabellen", standings.length, "standings")}
          ${statCard("Termine", events.length, "events")}
        </div>
        <div class="card admin-quickstart">
          <h3 class="mt-0">Schnellstart</h3>
          <p class="muted">Tipp: Lege zuerst eine <a href="#" data-go2="seasons">Saison</a> an, dann <a href="#" data-go2="standings">Ergebnis-Tabellen</a> und <a href="#" data-go2="news">Berichte</a>.</p>
        </div>
      </div>
      `;
    content.querySelectorAll("[data-jump],[data-go2]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.jump || a.dataset.go2); }));
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}
function statCard(label, value, jump) {
  return `<a class="card" href="#" data-jump="${jump}" style="text-decoration:none;color:inherit;padding:1.2rem">
    <div style="font-size:2.2rem;font-weight:900;color:var(--color-primary)">${value}</div>
    <div class="muted">${escapeHtml(label)}</div></a>`;
}

document.addEventListener("DOMContentLoaded", init);
