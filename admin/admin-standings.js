// ============================================================================
//  Spezial-Editor für die generischen Ergebnis-Tabellen (Liga, Monatspokal,
//  Vereinsmeisterschaft und beliebige eigene Tabellen).
// ============================================================================
const STANDINGS_TYPES = ["Liga", "Liga-Spieltag", "Monatspokal", "Vereinsmeisterschaft", "Custom"];

function slugKey(label) {
  return (label || "").toString().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || ("spalte_" + Math.random().toString(36).slice(2, 6));
}

// Gewählter Saison-Filter (bleibt während der Sitzung erhalten); null = noch nicht gesetzt.
let standingsSeasonFilter = null;

async function renderStandingsSection(content) {
  try {
    const [tables, seasons] = await Promise.all([SVF.get("/api/admin/standings"), loadSeasons()]);
    const seasonName = id => { const s = seasons.find(x => x.id === id); return s ? s.name : "—"; };
    // Neueste zuerst: nach Name absteigend (z. B. 2025/26 vor 2024/25).
    const sortedSeasons = [...seasons].sort((a, b) =>
      b.name.localeCompare(a.name, "de-DE", { numeric: true }));

    // Standard: aktuelle Saison vorausgewählt (sonst die neueste).
    if (standingsSeasonFilter === null) {
      const newest = seasons.find(s => s.isCurrent) || sortedSeasons[0];
      standingsSeasonFilter = newest ? String(newest.id) : "";
    }
    // Fällt der Filter auf eine nicht mehr existierende Saison, auf "Alle" zurück
    if (standingsSeasonFilter && standingsSeasonFilter !== "none" &&
        !seasons.some(s => String(s.id) === standingsSeasonFilter)) {
      standingsSeasonFilter = "";
    }

    const options = `<option value="">Alle Saisons</option>` +
      sortedSeasons.map(s => `<option value="${s.id}" ${String(s.id) === standingsSeasonFilter ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("") +
      `<option value="none" ${standingsSeasonFilter === "none" ? "selected" : ""}>Ohne Saison</option>`;

    content.innerHTML = `
      <div class="toolbar">
        <button class="btn" id="new-lg">+ Neuer Liga-Spieltag</button>
        <button class="btn" id="new-mp">+ Neuer Monatspokal</button>
        <button class="btn btn-neutral" id="new-table">+ Neue Tabelle</button>
        <label class="select-wrap" title="Nach Saison filtern"><select id="st-season">${options}</select></label>
        <div class="spacer"></div><span class="muted" id="st-count"></span>
      </div>
      <div id="st-list"></div>`;

    const renderList = () => {
      const filtered = standingsSeasonFilter === ""
        ? tables
        : standingsSeasonFilter === "none"
          ? tables.filter(t => !t.seasonId)
          : tables.filter(t => String(t.seasonId) === standingsSeasonFilter);

      content.querySelector("#st-count").textContent = `${filtered.length} Tabelle${filtered.length === 1 ? "" : "n"}`;
      const list = content.querySelector("#st-list");
      list.innerHTML = filtered.length
        ? `${filtered.length > 1 ? `<p class="muted" style="font-size:.85rem">↕ Tabellen per Drag&nbsp;&amp;&nbsp;Drop am Griff sortieren.</p>` : ""}
          <div class="atable-wrap"><table class="atable"><thead><tr><th></th><th>Titel</th><th>Typ</th><th>Saison</th><th>Status</th><th></th></tr></thead><tbody>
          ${filtered.map(t => `<tr data-id="${t.id}">
            <td class="drag-cell"><span class="drag-handle" title="Ziehen zum Sortieren">⠿</span></td>
            <td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.type)}</td><td>${escapeHtml(seasonName(t.seasonId))}</td>
            <td>${tag(t.isPublished, "Sichtbar", "Versteckt")}</td>
            <td class="actions-cell"><div class="actions">
              <button class="btn btn-sm btn-neutral" data-edit="${t.id}">Bearbeiten</button>
              <button class="btn btn-sm btn-neutral" data-copy="${t.id}" title="Kopie mit allen Spalten und Zeilen anlegen">Duplizieren</button>
              ${t.type === "Monatspokal" && t.seasonId ? `<button class="btn btn-sm btn-neutral" data-gesamt="${t.seasonId}" title="Gesamtwertung dieser Saison neu berechnen">Σ Gesamt</button>` : ""}
              <button class="btn btn-sm btn-danger" data-del="${t.id}">Löschen</button>
            </div></td></tr>`).join("")}
        </tbody></table></div>`
        : `<div class="empty">Keine Tabellen für diese Auswahl.</div>`;

      initDragSort(list.querySelector(".atable tbody"), "standings");
      list.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", async () => {
        const full = await SVF.get(`/api/admin/standings/${b.dataset.edit}`);
        // Monats- und Liga-Spieltag-Tabellen bekommen den geführten Editor;
        // Gesamtwertung & andere Typen den generischen.
        if (full.type === "Monatspokal" && mpMonthIndex(full.title) >= 0) openMonatspokalEditor(full, seasons);
        else if (full.type === LG_TYPE) openLigaSpieltagEditor(full, seasons);
        else openStandingsEditor(full, seasons);
      }));
      // Duplizieren: Vorlage komplett laden und als NEUE (noch ungespeicherte) Tabelle
      // im generischen Editor öffnen – auch für Monatspokal, damit Titel/Saison frei
      // anpassbar bleiben.
      list.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
        try {
          const full = await SVF.get(`/api/admin/standings/${b.dataset.copy}`);
          openStandingsEditor(full, seasons, { duplicate: true });
        } catch (e) { toast(e.message, "err"); }
      }));
      list.querySelectorAll("[data-gesamt]").forEach(b => b.addEventListener("click", async () => {
        if (!(await confirmDialog("Gesamtwertung", "Gesamtwertung dieser Saison aus den Monatstabellen neu berechnen?", "Neu berechnen", "Abbrechen"))) return;
        try { await mpRebuildGesamt(Number(b.dataset.gesamt)); go("standings"); }
        catch (e) { toast(e.message, "err"); }
      }));
      list.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
        if (!(await confirmDialog("Tabelle löschen", "Tabelle wirklich löschen?", "Löschen", "Abbrechen", true))) return;
        try { await SVF.send("DELETE", `/api/admin/standings/${b.dataset.del}`); toast("Gelöscht."); go("standings"); }
        catch (e) { toast(e.message, "err"); }
      }));
    };

    content.querySelector("#new-lg").addEventListener("click", () => openLigaSpieltagEditor(null, seasons));
    content.querySelector("#new-mp").addEventListener("click", () => openMonatspokalEditor(null, seasons));
    content.querySelector("#new-table").addEventListener("click", () => openStandingsEditor(null, seasons));
    content.querySelector("#st-season").addEventListener("change", e => { standingsSeasonFilter = e.target.value; renderList(); });
    renderList();
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}

// opts.duplicate = true → `table` dient nur als Vorlage; gespeichert wird eine neue Tabelle.
async function openStandingsEditor(table, seasons, opts = {}) {
  const src = table;                          // Vorlage: bearbeiten ODER duplizieren
  const isCopy = !!src && !!opts.duplicate;
  const isEdit = !!src && !isCopy;
  let cols = [];
  let rows = [];
  if (src) {
    try { cols = JSON.parse(src.columnsJson || "[]"); } catch { cols = []; }
    rows = (src.rows || []).map(r => ({ values: safeJson(r.valuesJson) || {} }));
  } else {
    cols = JSON.parse(PRESET_FALLBACK.Liga);
  }

  // Neue Tabellen: neueste Saison vorauswählen (seasons kommt bereits neueste-zuerst vom Server).
  const defaultSeasonId = src ? src.seasonId : (seasons[0] ? seasons[0].id : null);
  const seasonOpts = `<option value="">– keine Saison –</option>` +
    seasons.map(s => `<option value="${s.id}" ${s.id === defaultSeasonId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
  const typeOpts = STANDINGS_TYPES.map(t => `<option value="${t}" ${src && src.type === t ? "selected" : ""}>${t}</option>`).join("");
  const initialTitle = isCopy ? `${src.title} (Kopie)` : (src ? src.title : "");

  const body = `
    ${isCopy ? `<div class="hint" style="margin-bottom:.8rem">Kopie von „${escapeHtml(src.title)}“ – die Vorlage bleibt unverändert. Titel und Saison anpassen, dann speichern.</div>` : ""}
    <div class="row">
      <div class="field"><label>Titel *</label><input type="text" id="st-title" value="${escapeHtml(initialTitle)}" placeholder="z. B. Oberliga – 1. Herren"></div>
      <div class="field"><label>Untertitel</label><input type="text" id="st-sub" value="${src ? escapeHtml(src.subtitle || "") : ""}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Typ</label><select id="st-type">${typeOpts}</select></div>
      <div class="field"><label>Saison</label><select id="st-season">${seasonOpts}</select></div>
    </div>
    <div class="field"><label class="check"><input type="checkbox" id="st-pub" ${(!src || src.isPublished) ? "checked" : ""}> Sichtbar auf der Website</label></div>

    <hr style="border:none;border-top:1px solid var(--color-border);margin:1rem 0">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem">
      <strong>Spalten</strong>
      <span class="hint">Spaltennamen frei wählbar, per ⠿ verschiebbar – Vorlage wird beim Typ-Wechsel automatisch geladen.</span>
    </div>
    <div class="col-editor" id="cols"></div>
    <button type="button" class="btn btn-sm btn-neutral" id="add-col">+ Spalte</button>

    <div style="margin:1.2rem 0 .4rem"><strong>Zeilen</strong></div>
    <div style="overflow-x:auto"><table class="rows-table" id="rows"></table></div>
    <button type="button" class="btn btn-sm btn-neutral" id="add-row" style="margin-top:.6rem">+ Zeile</button>`;

  const m = openModal(isCopy ? "Tabelle duplizieren" : isEdit ? "Tabelle bearbeiten" : "Neue Ergebnis-Tabelle", body,
    `<button class="btn btn-neutral" id="cancel">Abbrechen</button><button class="btn" id="save">Speichern</button>`, true);

  const colsBox = m.querySelector("#cols");
  const rowsTable = m.querySelector("#rows");

  function syncRowsFromDom() {
    const trs = rowsTable.querySelectorAll("tbody tr");
    rows = Array.from(trs).map(tr => {
      const values = {};
      tr.querySelectorAll("input[data-key]").forEach(inp => values[inp.dataset.key] = inp.value);
      return { values };
    });
  }
  function initRowDrag() {
    let dragEl = null;
    rowsTable.querySelectorAll("tbody tr").forEach(tr => {
      const handle = tr.querySelector(".row-drag-handle");
      if (!handle) return;
      handle.addEventListener("mousedown", () => { tr.draggable = true; });
      handle.addEventListener("touchstart", () => { tr.draggable = true; }, { passive: true });
      tr.addEventListener("dragstart", e => {
        dragEl = tr;
        tr.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", "row"); } catch { /* */ }
      });
      tr.addEventListener("dragover", e => {
        e.preventDefault();
        if (!dragEl || dragEl === tr) return;
        const rect = tr.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        tr.parentNode.insertBefore(dragEl, after ? tr.nextSibling : tr);
      });
      tr.addEventListener("dragend", () => {
        tr.classList.remove("dragging");
        tr.draggable = false;
        if (!dragEl) return;
        dragEl = null;
        syncRowsFromDom();
        renderRows();
      });
    });
  }
  // Aktuelle Spaltenreihenfolge (inkl. bearbeiteter Namen) aus dem DOM lesen.
  function readColsFromDom() {
    return [...colsBox.querySelectorAll(".col-chip")].map(chip => {
      const key = chip.dataset.key;
      const orig = cols.find(c => c.key === key) || { key, label: key, type: "text" };
      const label = chip.querySelector("input");
      return { ...orig, label: label ? label.value : orig.label };
    });
  }
  function initColDrag() {
    let dragEl = null;
    colsBox.querySelectorAll(".col-chip").forEach(chip => {
      const handle = chip.querySelector(".col-drag-handle");
      if (!handle) return;
      handle.addEventListener("mousedown", () => { chip.draggable = true; });
      handle.addEventListener("touchstart", () => { chip.draggable = true; }, { passive: true });
      chip.addEventListener("dragstart", e => {
        dragEl = chip; chip.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", "col"); } catch { /* */ }
      });
      chip.addEventListener("dragover", e => {
        e.preventDefault();
        if (!dragEl || dragEl === chip) return;
        const rect = chip.getBoundingClientRect();
        const after = (e.clientX - rect.left) > rect.width / 2;
        chip.parentNode.insertBefore(dragEl, after ? chip.nextSibling : chip);
      });
      chip.addEventListener("dragend", () => {
        chip.classList.remove("dragging"); chip.draggable = false;
        if (!dragEl) return;
        dragEl = null;
        syncRowsFromDom();
        cols = readColsFromDom();
        renderCols(); renderRows();
      });
    });
  }
  function renderCols() {
    colsBox.innerHTML = cols.map(c =>
      `<span class="col-chip" data-key="${escapeHtml(c.key)}"><span class="col-drag-handle" title="Ziehen zum Verschieben">⠿</span><input value="${escapeHtml(c.label)}" data-key="${escapeHtml(c.key)}"><button type="button" class="x" data-rmcol="${escapeHtml(c.key)}">×</button></span>`).join("");
    colsBox.querySelectorAll(".col-chip input").forEach(inp => inp.addEventListener("change", () => {
      const c = cols.find(x => x.key === inp.dataset.key);
      if (c) { c.label = inp.value; renderRows(); }
    }));
    colsBox.querySelectorAll("[data-rmcol]").forEach(b => b.addEventListener("click", () => {
      syncRowsFromDom();
      const key = b.dataset.rmcol;
      const idx = cols.findIndex(x => x.key === key);
      if (idx < 0) return;
      cols.splice(idx, 1);
      rows.forEach(r => delete r.values[key]);
      renderCols(); renderRows();
    }));
    initColDrag();
  }
  function renderRows() {
    const head = `<thead><tr><th class="drag-cell"></th><th class="rownum">#</th>${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join("")}<th></th></tr></thead>`;
    const bdy = `<tbody>${rows.map((r, i) => `<tr><td class="drag-cell"><span class="drag-handle row-drag-handle" title="Ziehen zum Sortieren">⠿</span></td><td class="rownum">${i + 1}</td>${cols.map(c =>
      `<td><input data-key="${c.key}" value="${escapeHtml(r.values[c.key] ?? "")}"></td>`).join("")}
      <td class="rownum"><button type="button" class="x" data-rmrow="${i}" style="background:none;border:0;cursor:pointer;color:var(--color-danger)">×</button></td></tr>`).join("")}</tbody>`;
    rowsTable.innerHTML = head + bdy;
    rowsTable.querySelectorAll("[data-rmrow]").forEach(b => b.addEventListener("click", () => { syncRowsFromDom(); rows.splice(b.dataset.rmrow, 1); renderRows(); }));
    initRowDrag();
  }

  m.querySelector("#add-col").addEventListener("click", async () => {
    syncRowsFromDom();
    const label = await promptDialog("Neue Spalte", "Name der neuen Spalte:", "", "Hinzufügen");
    if (!label) return;
    cols.push({ key: slugKey(label), label, type: "text" });
    renderCols(); renderRows();
  });
  m.querySelector("#add-row").addEventListener("click", () => { syncRowsFromDom(); rows.unshift({ values: {} }); renderRows(); });

  // Passende Spalten-Vorlage automatisch laden, sobald der Typ gewechselt wird.
  // Für „Custom“ gibt es keine Vorlage → Spalten bleiben unverändert.
  // Lookup ist case-insensitiv, da der Server die Keys in camelCase liefert
  // (liga/monatspokal/…), der lokale Fallback aber in PascalCase (Liga/…).
  async function applyPreset(type) {
    const presets = await loadPresets();
    const key = Object.keys(presets).find(k => k.toLowerCase() === String(type).toLowerCase());
    if (!key) return;
    syncRowsFromDom();
    // Nur nachfragen, wenn bereits Daten erfasst sind, die verloren gehen könnten.
    const hasData = rows.some(r => Object.values(r.values || {}).some(v => String(v).trim() !== ""));
    if (hasData && !(await confirmDialog("Vorlage laden", "Spalten durch die Vorlage ersetzen? Vorhandene Zeilenwerte bleiben, soweit die Spalten passen.", "Ersetzen", "Abbrechen"))) return;
    cols = JSON.parse(presets[key]);
    renderCols(); renderRows();
  }
  m.querySelector("#st-type").addEventListener("change", e => applyPreset(e.target.value));

  m.querySelector("#cancel").addEventListener("click", closeModal);
  m.querySelector("#save").addEventListener("click", async () => {
    syncRowsFromDom();
    const title = m.querySelector("#st-title").value.trim();
    if (!title) { toast("Bitte einen Titel angeben.", "err"); return; }
    if (!cols.length) { toast("Mindestens eine Spalte anlegen.", "err"); return; }
    // Bestehende Tabellen behalten ihre Reihenfolge; neue landen ganz oben
    let sortOrder;
    if (isEdit) {
      sortOrder = src.sortOrder || 0;
    } else {
      const all = await SVF.get("/api/admin/standings").catch(() => []);
      const sorts = all.map(t => t.sortOrder ?? 0);
      sortOrder = (sorts.length ? Math.min(...sorts) : 0) - 1;
    }
    const payload = {
      title,
      subtitle: m.querySelector("#st-sub").value || null,
      type: m.querySelector("#st-type").value,
      seasonId: m.querySelector("#st-season").value ? Number(m.querySelector("#st-season").value) : null,
      sortOrder,
      isPublished: m.querySelector("#st-pub").checked,
      columnsJson: JSON.stringify(cols.map(c => ({ key: c.key, label: c.label, type: c.type || "text" }))),
      rows: rows.map((r, i) => ({ sortOrder: i, valuesJson: JSON.stringify(r.values || {}) }))
    };
    try {
      if (isEdit) await SVF.send("PUT", `/api/admin/standings/${src.id}`, payload);
      else await SVF.send("POST", "/api/admin/standings", payload);
      closeModal(); toast(isCopy ? "Kopie angelegt." : "Gespeichert."); go("standings");
    } catch (e) { toast(e.message, "err"); }
  });

  renderCols(); renderRows();
}

// Presets vom Server (mit lokalem Fallback, falls Endpoint nicht erreichbar)
const PRESET_FALLBACK = {
  Liga: JSON.stringify([
    { key: "platz", label: "Platz", type: "number" }, { key: "mannschaft", label: "Mannschaft", type: "text" },
    { key: "spiele", label: "Spiele", type: "number" }, { key: "punkte", label: "Punkte", type: "number" },
    { key: "pins", label: "Pins", type: "number" }]),
  Monatspokal: JSON.stringify([
    { key: "platz", label: "Platz", type: "number" }, { key: "spieler", label: "Spieler/in", type: "text" },
    { key: "punkte", label: "Punkte", type: "number" }, { key: "pins", label: "Pins", type: "number" },
    { key: "schnitt", label: "Schnitt", type: "number" }, { key: "hdc_neu", label: "HDC neu", type: "number" }]),
  Vereinsmeisterschaft: JSON.stringify([
    { key: "platz", label: "Platz", type: "number" }, { key: "spieler", label: "Spieler/in", type: "text" },
    { key: "spiele", label: "Spiele", type: "number" }, { key: "pins_hdc", label: "Pins+HDC", type: "number" },
    { key: "schnitt", label: "Schnitt", type: "number" }, { key: "pins", label: "Pins", type: "number" },
    { key: "hdc", label: "HDC", type: "number" }, { key: "gesamt", label: "Gesamt", type: "number" }])
};
async function loadPresets() {
  try { return await cached("presets", () => SVF.get("/api/admin/standings/presets")); }
  catch { return PRESET_FALLBACK; }
}

// ============================================================================
//  Monatspokal – geführter Monats-Editor + automatische Gesamtwertung
//  (Regeln aus den Bestandsdaten verifiziert: HDCP = min(150, round((200−Ø)·0,8)·3))
// ============================================================================
const MP_MONTHS = ["Dezember", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November"];
const MP_MONTH_ABBR = { Dezember: "Dez", Januar: "Jan", Februar: "Feb", "März": "Mär", April: "Apr", Mai: "Mai", Juni: "Jun", Juli: "Jul", August: "Aug", September: "Sep", Oktober: "Okt", November: "Nov" };
const MP_GAME_KEYS = ["1_spiel", "2_spiel", "3_spiel"];
const MP_GESAMT_TITLE = "Monatspokal – Gesamtwertung";

// Spalten einer Monats-Tabelle – Keys exakt wie in den Bestandsdaten.
const MP_MONTH_COLS = [
  { key: "platz", label: "Platz", type: "text" },
  { key: "spieler_in", label: "Spieler/in", type: "text" },
  { key: "1_spiel", label: "1.Spiel", type: "text" },
  { key: "2_spiel", label: "2.Spiel", type: "text" },
  { key: "3_spiel", label: "3.Spiel", type: "text" },
  { key: "gesamt", label: "Gesamt", type: "text" },
  { key: "schnitt", label: "Schnitt", type: "text" },
  { key: "hdcp", label: "HDCP", type: "text" },
  { key: "pins_inkl_hdcp", label: "Pins inkl. HDCP", type: "text" },
  { key: "punkte", label: "Punkte", type: "text" }
];
const MP_GESAMT_BASE = [
  { key: "platz", label: "Platz", type: "text" },
  { key: "spieler_in", label: "Spieler/in", type: "text" },
  { key: "punkte", label: "Punkte", type: "text" },
  { key: "spiele", label: "Anz. Spiele", type: "text" },
  { key: "starttage", label: "Starttage", type: "text" }
];
const MP_GESAMT_TAIL = [
  { key: "gesamt", label: "Gesamt", type: "text" },
  { key: "schnitt", label: "Schnitt", type: "text" },
  { key: "hdc_neu", label: "Handicap aktuell", type: "text" },
  { key: "ppt", label: "Punkte/Tag", type: "text" },
  { key: "siege", label: "Siege", type: "text" }
];

// ---- Zahl-/Formatierungs-Hilfen (deutsches Komma-Format) ----
function mpNum(s) {
  if (s === null || s === undefined || s === "") return NaN;
  const n = parseFloat(String(s).replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? NaN : n;
}
function mpFmt2(n) { return (Math.round(n * 100) / 100).toFixed(2).replace(".", ","); }
// Handicap aus dem Schnitt: (200 − Ø) × 0,8 × 3 = × 2,4, am Ende gerundet (NICHT das
// Pro-Spiel-Handicap zwischenrunden!). An den Spielzetteln + Online-Monatsdaten
// verifiziert (Sabrina/Udo, u. a. Juni 133, Jan 176, März 146). Ungedeckelt.
function mpHdcpRaw(avg) { return Math.max(0, Math.round((200 - avg) * 2.4)); }
// Handicap aktuell (Gesamtwertung) – dieselbe Formel, bei 150 gedeckelt.
function mpHdcp(avg) { return Math.min(150, mpHdcpRaw(avg)); }
function mpMonthName(title) {
  const raw = String(title || "").split("–").pop().trim();
  return MP_MONTHS.includes(raw) ? raw : null;
}
function mpMonthIndex(title) { const m = mpMonthName(title); return m ? MP_MONTHS.indexOf(m) : -1; }
function mpMonthKey(name) { return "m_" + slugKey(name); }

// Kalenderjahr/-monat eines Saison-Monats. "2025/26": Dez=2025, Jan–Nov=2026.
function mpMonthYear(seasonName, monthIdx) {
  const m = String(seasonName || "").match(/(\d{4})/);
  const startYear = m ? Number(m[1]) : new Date().getFullYear();
  return monthIdx === 0 ? startYear : startYear + 1;
}
function mpCalMonth(monthIdx) { return monthIdx === 0 ? 11 : monthIdx - 1; }
function mpSecondThursday(year, calMonth0) {
  const first = new Date(year, calMonth0, 1);
  const firstThu = 1 + ((4 - first.getDay() + 7) % 7); // Donnerstag = 4
  return new Date(year, calMonth0, firstThu + 7);
}
// Standard-Monat: erster fälliger (2. Do ≤ heute), noch nicht erfasster Monat.
function mpDefaultMonthIdx(seasonName, existingMonthNames) {
  const today = new Date();
  const due = i => mpSecondThursday(mpMonthYear(seasonName, i), mpCalMonth(i)) <= today;
  const has = i => existingMonthNames.includes(MP_MONTHS[i]);
  for (let i = 0; i < 12; i++) if (due(i) && !has(i)) return i;
  for (let i = 0; i < 12; i++) if (!has(i)) return i;
  for (let i = 11; i >= 0; i--) if (due(i)) return i;
  return 0;
}

async function mpAllStandings() { return SVF.get("/api/admin/standings"); }
async function mpMonthMetas(seasonId, all) {
  all = all || await mpAllStandings();
  return all.filter(t => t.type === "Monatspokal" && t.seasonId === seasonId && mpMonthIndex(t.title) >= 0);
}
// Neueste Saison mit Monatspokal-Daten (sonst neueste überhaupt). seasons kommt neueste-zuerst.
async function mpDefaultSeasonId(seasons) {
  const all = await mpAllStandings().catch(() => []);
  const withMp = new Set(all.filter(t => t.type === "Monatspokal").map(t => t.seasonId));
  const found = seasons.find(s => withMp.has(s.id));
  return (found || seasons[0] || {}).id ?? null;
}
// Kumulierter Schnitt je Spieler über alle Monate der Saison VOR monthIdx.
async function mpPriorAverages(seasonId, monthIdx, excludeId) {
  const metas = (await mpMonthMetas(seasonId)).filter(t => mpMonthIndex(t.title) < monthIdx && t.id !== excludeId);
  const cum = {};
  for (const meta of metas) {
    const full = await SVF.get(`/api/admin/standings/${meta.id}`);
    for (const r of full.rows || []) {
      const v = safeJson(r.valuesJson) || {};
      const ges = mpNum(v.gesamt);
      if (!v.spieler_in || isNaN(ges)) continue;
      const c = cum[v.spieler_in] = cum[v.spieler_in] || { pins: 0, games: 0 };
      c.pins += ges; c.games += 3;
    }
  }
  const avg = {};
  for (const name in cum) if (cum[name].games) avg[name] = cum[name].pins / cum[name].games;
  return avg;
}

// ---- Berechnung: abgeleitete Werte + Platzierung ----
function mpDerive(v) {
  const anyGame = MP_GAME_KEYS.some(k => (v[k] || "") !== "");
  const gesamt = anyGame ? MP_GAME_KEYS.reduce((s, k) => s + (mpNum(v[k]) || 0), 0) : NaN;
  const hd = mpNum(v.hdcp);
  return {
    gesamt: isNaN(gesamt) ? NaN : gesamt,
    schnitt: isNaN(gesamt) ? NaN : gesamt / 3,
    pih: isNaN(gesamt) ? NaN : gesamt + (isNaN(hd) ? 0 : hd),
    hdcp: hd,
    punkte: mpNum(v.punkte)
  };
}
// Platzierung nach Punkte (die Kopf-an-Kopf-Bahnpunkte); bei Punktegleichstand
// entscheiden die höheren Pins inkl. HDCP, danach das niedrigere Handicap.
// (An den Bestandsdaten verifiziert: 95/95 Monatszeilen exakt.)
function mpPlaces(items) {
  const hd = x => isNaN(x) ? 0 : x;
  const pk = x => isNaN(x) ? -Infinity : x;
  const order = items.map((d, i) => ({ i, punkte: pk(d.punkte), pih: d.pih, hdcp: hd(d.hdcp) }))
    .filter(o => !isNaN(o.pih))
    .sort((a, b) => b.punkte - a.punkte || b.pih - a.pih || a.hdcp - b.hdcp);
  const place = {};
  order.forEach((o, k) => place[o.i] = k + 1);
  return place;
}

// ---- Sortier-Dialog beim Speichern ----
// (confirmDialog/promptDialog/wireDialog liegen zentral in admin.js)
function mpAskSort(defaultKey) {
  return new Promise(resolve => {
    const opts = [
      ["punkte", "Punkte (Platzierung, höchste zuerst)"],
      ["pins_inkl_hdcp", "Pins inkl. HDCP (höchste zuerst)"],
      ["gesamt", "Gesamt (höchste zuerst)"],
      ["schnitt", "Schnitt (höchste zuerst)"],
      ["hdcp", "HDCP (höchste zuerst)"],
      ["spieler_in", "Spieler/in (A–Z)"]
    ];
    const body = `<div class="field"><label>Nach welcher Spalte sortieren?</label>
      <span class="select-wrap" style="display:block"><select id="mp-sortsel">${opts.map(o =>
        `<option value="${o[0]}" ${o[0] === (defaultKey || "punkte") ? "selected" : ""}>${o[1]}</option>`).join("")}</select></span>
      <div class="hint" style="margin-top:.4rem">Der Platz wird immer nach den Punkten vergeben (bei Gleichstand: mehr Pins inkl. HDCP). Die Sortierung bestimmt nur die Anzeige-Reihenfolge – „Punkte“ zeigt die Tabelle in Platzierungs-Reihenfolge.</div></div>`;
    const m = openModal("Tabelle sortieren", body,
      `<button class="btn btn-neutral" id="mp-sc">Abbrechen</button><button class="btn" id="mp-so">Übernehmen</button>`);
    wireDialog(m, resolve, null);
    m.querySelector("#mp-sc").addEventListener("click", () => { closeModal(m); resolve(null); });
    m.querySelector("#mp-so").addEventListener("click", () => { const v = m.querySelector("#mp-sortsel").value; closeModal(m); resolve(v); });
  });
}

// ---- Finalisieren: abgeleitete Werte setzen, sortieren, Platz vergeben ----
function mpFinalizeRows(rowValues, sortKey) {
  const out = rowValues.map(src => {
    const v = { ...src };
    const d = mpDerive(v);
    v.gesamt = isNaN(d.gesamt) ? "" : String(d.gesamt);
    v.schnitt = isNaN(d.schnitt) ? "" : mpFmt2(d.schnitt);
    v.pins_inkl_hdcp = isNaN(d.pih) ? "" : String(d.pih);
    v.hdcp = (v.hdcp || "") === "" ? "" : String(v.hdcp).trim();
    v.punkte = (v.punkte || "") === "" ? "" : String(v.punkte).trim();
    return v;
  });
  // Platz = Punkte, bei Gleichstand mehr Pins inkl. HDCP (dann niedrigeres Handicap).
  const rank = mpPlaces(out.map(v => ({ punkte: mpNum(v.punkte), pih: mpNum(v.pins_inkl_hdcp), hdcp: mpNum(v.hdcp) })));
  out.forEach((v, i) => { v.platz = rank[i] ? rank[i] + "." : ""; });
  // Anzeige-Sortierung. Standard "punkte" = Platzierungs-Reihenfolge
  // (erst Punkte, bei Gleichstand die Pins inkl. HDCP) – identisch zur Platz-Spalte.
  if (sortKey === "punkte") {
    out.sort((a, b) => (parseInt(a.platz, 10) || 9999) - (parseInt(b.platz, 10) || 9999));
  } else if (sortKey === "spieler_in") {
    out.sort((a, b) => String(a.spieler_in || "").localeCompare(String(b.spieler_in || ""), "de"));
  } else {
    out.sort((a, b) => (mpNum(b[sortKey]) || -Infinity) - (mpNum(a[sortKey]) || -Infinity));
  }
  return out;
}

// ============================================================================
//  Der Editor
// ============================================================================
async function openMonatspokalEditor(existing, seasons) {
  const isEdit = !!existing;
  // seasons neueste-zuerst (kommt bereits so vom Server, aber sicher ist sicher)
  const seasonsSorted = [...seasons].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || b.name.localeCompare(a.name, "de-DE", { numeric: true }));

  const state = {
    isEdit,
    tableId: isEdit ? existing.id : null,
    seasonId: isEdit ? existing.seasonId : (await mpDefaultSeasonId(seasonsSorted)),
    monthIdx: isEdit ? mpMonthIndex(existing.title) : 0,
    subtitle: isEdit ? (existing.subtitle || "") : "",
    sortOrder: isEdit ? (existing.sortOrder || 0) : 0,
    rows: isEdit ? (existing.rows || []).map(r => ({ values: safeJson(r.valuesJson) || {} })) : [],
    players: []
  };

  const body = `
    <div id="mp-head" class="row" style="align-items:flex-end"></div>
    <div id="mp-hint" class="hint" style="margin:.2rem 0 .6rem"></div>
    <div class="mp-tools" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.5rem">
      <span class="select-wrap"><select id="mp-add"><option value="">+ Spieler hinzufügen …</option></select></span>
      <button type="button" class="btn btn-sm btn-neutral" id="mp-hdcp">HDCP aus Vormonaten berechnen</button>
    </div>
    <div style="overflow-x:auto"><table class="rows-table mp-table" id="mp-rows"></table></div>`;

  const m = openModal(isEdit ? "Monatspokal bearbeiten" : "Neuer Monatspokal", body,
    `<button class="btn btn-neutral" id="mp-cancel">Abbrechen</button><button class="btn" id="mp-save">Speichern</button>`, true);

  const headBox = m.querySelector("#mp-head");
  const hintBox = m.querySelector("#mp-hint");
  const rowsTable = m.querySelector("#mp-rows");
  const addSel = m.querySelector("#mp-add");

  // ---- DOM <-> Zustand ----
  function syncFromDom() {
    const trs = rowsTable.querySelectorAll("tbody tr");
    state.rows = Array.from(trs).map(tr => {
      const values = {};
      tr.querySelectorAll("[data-key]").forEach(inp => values[inp.dataset.key] = inp.value.trim());
      // nicht editierbare, aber bereits vorhandene Werte (z. B. beim Bearbeiten) erhalten
      return { values };
    });
  }
  function recompute() {
    const trs = Array.from(rowsTable.querySelectorAll("tbody tr"));
    const derived = trs.map(tr => {
      const v = {};
      tr.querySelectorAll("[data-key]").forEach(inp => v[inp.dataset.key] = inp.value.trim());
      return mpDerive(v);
    });
    const rank = mpPlaces(derived);
    trs.forEach((tr, i) => {
      const d = derived[i];
      tr.querySelector('[data-calc="gesamt"]').textContent = isNaN(d.gesamt) ? "" : String(d.gesamt);
      tr.querySelector('[data-calc="schnitt"]').textContent = isNaN(d.schnitt) ? "" : mpFmt2(d.schnitt);
      tr.querySelector('[data-calc="pins_inkl_hdcp"]').textContent = isNaN(d.pih) ? "" : String(d.pih);
      tr.querySelector('[data-calc="platz"]').textContent = rank[i] ? rank[i] + "." : "";
    });
  }
  function rowHtml(v) {
    const inp = (k, cls) => `<input data-key="${k}" value="${escapeHtml(v[k] || "")}" class="${cls}" ${cls === "mp-num" ? 'inputmode="numeric"' : ""}>`;
    return `<tr>
      <td class="rownum" data-calc="platz"></td>
      <td>${inp("spieler_in", "mp-name")}</td>
      <td>${inp("1_spiel", "mp-num")}</td>
      <td>${inp("2_spiel", "mp-num")}</td>
      <td>${inp("3_spiel", "mp-num")}</td>
      <td class="mp-calc" data-calc="gesamt"></td>
      <td class="mp-calc" data-calc="schnitt"></td>
      <td>${inp("hdcp", "mp-num")}</td>
      <td class="mp-calc" data-calc="pins_inkl_hdcp"></td>
      <td>${inp("punkte", "mp-num")}</td>
      <td class="rownum"><button type="button" class="x mp-del" title="Zeile entfernen" style="background:none;border:0;cursor:pointer;color:var(--color-danger)">×</button></td>
    </tr>`;
  }
  function renderRows() {
    const head = `<thead><tr>
      <th class="rownum">Platz</th><th>Spieler/in</th>
      <th>1.Spiel</th><th>2.Spiel</th><th>3.Spiel</th>
      <th>Gesamt</th><th>Schnitt</th><th>HDCP</th><th>Pins inkl. HDCP</th><th>Punkte</th><th></th>
    </tr></thead>`;
    rowsTable.innerHTML = head + `<tbody>${state.rows.map(r => rowHtml(r.values)).join("")}</tbody>`;
    rowsTable.querySelectorAll('input.mp-num, input.mp-name').forEach(inp =>
      inp.addEventListener("input", recompute));
    rowsTable.querySelectorAll(".mp-del").forEach((b, i) => b.addEventListener("click", () => {
      syncFromDom(); state.rows.splice(i, 1); renderRows(); refreshAddSelect();
    }));
    recompute();
  }
  function refreshAddSelect() {
    const present = new Set(state.rows.map(r => (r.values.spieler_in || "").trim()).filter(Boolean));
    const avail = state.players.filter(p => p.isActive)
      .map(p => `${p.firstName} ${p.lastName}`)
      .filter(n => !present.has(n))
      .sort((a, b) => a.localeCompare(b, "de"));
    addSel.innerHTML = `<option value="">+ Spieler hinzufügen …</option>` +
      avail.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("") +
      `<option value="__blank__">— leere Zeile —</option>`;
  }
  addSel.addEventListener("change", () => {
    const val = addSel.value;
    if (!val) return;
    syncFromDom();
    state.rows.push({ values: { spieler_in: val === "__blank__" ? "" : val } });
    renderRows(); refreshAddSelect();
    addSel.value = "";
  });

  // ---- HDCP aus Vormonaten ----
  async function fillHdcp(silent) {
    syncFromDom();
    let avg;
    try { avg = await mpPriorAverages(state.seasonId, state.monthIdx, state.tableId); }
    catch (e) { if (!silent) toast(e.message, "err"); return; }
    if (!Object.keys(avg).length) { if (!silent) toast("Keine Vormonate in dieser Saison – HDCP bitte manuell eintragen.", "err"); return; }
    let n = 0;
    state.rows.forEach(r => { const a = avg[r.values.spieler_in]; if (a !== undefined) { r.values.hdcp = String(mpHdcpRaw(a)); n++; } });
    renderRows();
    if (!silent) toast(`HDCP für ${n} Spieler aus den Vormonaten berechnet.`);
  }
  m.querySelector("#mp-hdcp").addEventListener("click", () => fillHdcp(false));

  // ---- Kopf (Saison/Monat) ----
  async function buildFlaggedRows() {
    const flagged = state.players
      .filter(p => p.isActive && p.monatspokal)
      .sort((a, b) => a.firstName.localeCompare(b.firstName, "de") || a.lastName.localeCompare(b.lastName, "de"));
    return flagged.map(p => ({ values: { spieler_in: `${p.firstName} ${p.lastName}` } }));
  }
  async function reloadNewForSeason() {
    // vorhandene Monate der Saison bestimmen -> Monats-Dropdown + Default
    const metas = await mpMonthMetas(state.seasonId);
    const existingNames = metas.map(t => mpMonthName(t.title));
    const seasonName = (seasonsSorted.find(s => s.id === state.seasonId) || {}).name || "";
    const openIdx = MP_MONTHS.map((_, i) => i).filter(i => !existingNames.includes(MP_MONTHS[i]));
    if (!openIdx.length) {
      headBox.innerHTML = `<div class="field" style="flex:1"><label>Saison</label>${seasonSelectHtml()}</div>`;
      bindSeasonSelect();
      hintBox.textContent = "Für diese Saison sind bereits alle 12 Monate angelegt – zum Ändern die Monatstabelle in der Liste „Bearbeiten“.";
      rowsTable.innerHTML = ""; addSel.innerHTML = "";
      return;
    }
    let def = mpDefaultMonthIdx(seasonName, existingNames);
    if (!openIdx.includes(def)) def = openIdx[0];
    state.monthIdx = def;
    headBox.innerHTML = `
      <div class="field"><label>Saison</label>${seasonSelectHtml()}</div>
      <div class="field"><label>Monat</label><span class="select-wrap"><select id="mp-month">${openIdx.map(i =>
        `<option value="${i}" ${i === state.monthIdx ? "selected" : ""}>${MP_MONTHS[i]}</option>`).join("")}</select></span></div>`;
    hintBox.textContent = `Titel: „Monatspokal – ${MP_MONTHS[state.monthIdx]}“ · ${seasonName}. Namen automatisch aus der Spielerliste (Flag „Monatspokal“).`;
    bindSeasonSelect();
    m.querySelector("#mp-month").addEventListener("change", async e => {
      state.monthIdx = Number(e.target.value);
      hintBox.textContent = `Titel: „Monatspokal – ${MP_MONTHS[state.monthIdx]}“ · ${seasonName}.`;
      await fillHdcp(true);
    });
    state.rows = await buildFlaggedRows();
    renderRows(); refreshAddSelect();
    await fillHdcp(true);
  }
  function seasonSelectHtml() {
    return `<span class="select-wrap"><select id="mp-season">${seasonsSorted.map(s =>
      `<option value="${s.id}" ${s.id === state.seasonId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select></span>`;
  }
  function bindSeasonSelect() {
    const sel = m.querySelector("#mp-season");
    if (!sel) return;
    sel.addEventListener("change", async e => { state.seasonId = Number(e.target.value); await reloadNewForSeason(); });
    if (state.isEdit) sel.disabled = true; // Saison einer bestehenden Tabelle nicht wechseln
  }

  // ---- Speichern ----
  m.querySelector("#mp-cancel").addEventListener("click", () => closeModal(m));
  m.querySelector("#mp-save").addEventListener("click", async () => {
    syncFromDom();
    if (state.monthIdx == null || state.monthIdx < 0) { toast("Bitte einen Monat wählen.", "err"); return; }
    const hasVals = r => MP_GAME_KEYS.some(k => (r.values[k] || "") !== "");
    const kept = state.rows.filter(hasVals);
    const dropped = state.rows.length - kept.length;
    if (!kept.length) { toast("Kein Spieler hat Spiele eingetragen.", "err"); return; }
    const go1 = await confirmDialog("Speichern",
      `${kept.length} Spieler haben Werte${dropped ? ` – ${dropped} ohne Spiele werden entfernt` : ""}. Mit diesen Spielern fortfahren?`,
      "Speichern", "Abbrechen");
    if (!go1) return;

    const sortKey = await mpAskSort("punkte");
    if (sortKey === null) return;
    const finalRows = mpFinalizeRows(kept.map(r => r.values), sortKey);

    const payload = {
      title: `Monatspokal – ${MP_MONTHS[state.monthIdx]}`,
      subtitle: state.subtitle || null,
      type: "Monatspokal",
      seasonId: state.seasonId,
      sortOrder: state.isEdit ? state.sortOrder : state.monthIdx,
      isPublished: true,
      columnsJson: JSON.stringify(MP_MONTH_COLS),
      rows: finalRows.map((v, i) => ({ sortOrder: i, valuesJson: JSON.stringify(v) }))
    };
    try {
      if (state.isEdit) await SVF.send("PUT", `/api/admin/standings/${state.tableId}`, payload);
      else await SVF.send("POST", "/api/admin/standings", payload);
      closeModal(m);
      toast("Monatspokal gespeichert.");
      if (await confirmDialog("Gesamtwertung", "Gesamtwertung für diese Saison jetzt aktualisieren?", "Aktualisieren", "Später")) {
        await mpRebuildGesamt(state.seasonId);
      }
      go("standings");
    } catch (e) { toast(e.message, "err"); }
  });

  // ---- Initialisierung ----
  state.players = await SVF.get("/api/admin/players").catch(() => []);
  if (isEdit) {
    const seasonName = (seasonsSorted.find(s => s.id === state.seasonId) || {}).name || "";
    headBox.innerHTML = `
      <div class="field"><label>Saison</label>${seasonSelectHtml()}</div>
      <div class="field"><label>Monat</label><input type="text" value="${escapeHtml(MP_MONTHS[state.monthIdx] || "")}" disabled></div>`;
    hintBox.textContent = `„Monatspokal – ${MP_MONTHS[state.monthIdx]}“ · ${seasonName}`;
    bindSeasonSelect();
    renderRows(); refreshAddSelect();
  } else {
    await reloadNewForSeason();
  }
}

// ============================================================================
//  Gesamtwertung automatisch aus den Monatstabellen erzeugen/aktualisieren
// ============================================================================
async function mpRebuildGesamt(seasonId) {
  const all = await mpAllStandings();
  const metas = (await mpMonthMetas(seasonId, all)).sort((a, b) => mpMonthIndex(a.title) - mpMonthIndex(b.title));
  if (!metas.length) { toast("Keine Monatstabellen für diese Saison.", "err"); return; }

  const agg = {};                 // name -> { pins, games, tage, punkte, wins, byMonth }
  const monthsWithData = [];      // Monatsnamen in Saison-Reihenfolge
  for (const meta of metas) {
    const name = mpMonthName(meta.title);
    const full = await SVF.get(`/api/admin/standings/${meta.id}`);
    const rows = (full.rows || []).map(r => safeJson(r.valuesJson) || {})
      .filter(v => v.spieler_in && !isNaN(mpNum(v.gesamt)));
    if (!rows.length) continue;
    monthsWithData.push(name);
    // Sieger des Monats = Platz 1 (Gleichstände sind dort bereits über das Handicap
    // aufgelöst). Fehlt der Platz, ersatzweise die höchsten Pins inkl. HDCP – bei
    // Gleichstand das niedrigere Handicap.
    let winner = (rows.find(v => parseInt(v.platz, 10) === 1) || {}).spieler_in;
    if (!winner) {
      const best = rows.slice()
        .filter(v => !isNaN(mpNum(v.pins_inkl_hdcp)))
        .sort((a, b) =>
          ((isNaN(mpNum(b.punkte)) ? -Infinity : mpNum(b.punkte)) - (isNaN(mpNum(a.punkte)) ? -Infinity : mpNum(a.punkte))) ||
          (mpNum(b.pins_inkl_hdcp) - mpNum(a.pins_inkl_hdcp)) ||
          ((isNaN(mpNum(a.hdcp)) ? 0 : mpNum(a.hdcp)) - (isNaN(mpNum(b.hdcp)) ? 0 : mpNum(b.hdcp))))[0];
      winner = best ? best.spieler_in : null;
    }
    rows.forEach(v => {
      const a = agg[v.spieler_in] = agg[v.spieler_in] || { pins: 0, games: 0, tage: 0, punkte: 0, wins: 0, byMonth: {} };
      a.pins += mpNum(v.gesamt); a.games += 3; a.tage += 1;
      a.punkte += (mpNum(v.punkte) || 0);
      a.byMonth[name] = (v.pins_inkl_hdcp || "").toString();
      if (v.spieler_in === winner) a.wins += 1;
    });
  }
  if (!monthsWithData.length) { toast("Die Monatstabellen enthalten noch keine Werte.", "err"); return; }

  const monthCols = monthsWithData.map(mn => ({ key: mpMonthKey(mn), label: MP_MONTH_ABBR[mn] || mn, type: "text" }));
  const columns = [...MP_GESAMT_BASE, ...monthCols, ...MP_GESAMT_TAIL];

  let rows = Object.keys(agg).map(name => {
    const a = agg[name];
    const avg = a.pins / a.games;
    const v = {
      spieler_in: name,
      spiele: String(a.games),
      starttage: String(a.tage),
      gesamt: String(a.pins),
      schnitt: mpFmt2(avg),
      hdc_neu: String(mpHdcp(avg)),
      punkte: String(a.punkte),
      ppt: mpFmt2(a.punkte / a.tage),
      siege: a.wins > 0 ? String(a.wins) : "--"
    };
    monthsWithData.forEach(mn => { v[mpMonthKey(mn)] = a.byMonth[mn] ?? ""; });
    return v;
  });
  // Sortierung: Punkte, bei Gleichstand mehr Siege, dann Gesamtpinzahl.
  const siegeNum = v => v.siege === "--" ? 0 : (mpNum(v.siege) || 0);
  rows.sort((a, b) =>
    (mpNum(b.punkte) - mpNum(a.punkte)) ||
    (siegeNum(b) - siegeNum(a)) ||
    (mpNum(b.gesamt) - mpNum(a.gesamt)));
  let lastKey = null, lastRank = 0;
  rows.forEach((v, i) => {
    const key = `${v.punkte}|${siegeNum(v)}|${v.gesamt}`;
    const r = (lastKey !== null && key === lastKey) ? lastRank : i + 1;
    v.platz = r + "."; lastKey = key; lastRank = r;
  });

  const existing = all.find(t => t.type === "Monatspokal" && t.seasonId === seasonId && /Gesamtwertung/i.test(t.title));
  const payload = {
    title: MP_GESAMT_TITLE,
    subtitle: existing ? (existing.subtitle ?? null) : null,
    type: "Monatspokal",
    seasonId,
    sortOrder: existing ? (existing.sortOrder ?? -1) : -1,
    isPublished: true,
    columnsJson: JSON.stringify(columns),
    rows: rows.map((v, i) => ({ sortOrder: i, valuesJson: JSON.stringify(v) }))
  };
  if (existing) { await SVF.send("PUT", `/api/admin/standings/${existing.id}`, payload); toast("Gesamtwertung aktualisiert."); }
  else { await SVF.send("POST", "/api/admin/standings", payload); toast("Gesamtwertung angelegt."); }
}

// ============================================================================
//  Liga-Spieltag – geführter Editor als Abbild des Spielzettels
//  Eingetippt werden nur Gegner, Gegner-Ergebnis und die Einzelergebnisse;
//  eigenes Ergebnis, Punkte, Summen, Spiele und Schnitt entstehen daraus.
// ============================================================================
const LG_TYPE = "Liga-Spieltag";
const LG_DEFAULT_GAMES = 5;
const LG_MAX_GAMES = 10;
const LG_MAX_PLAYERS = 8;
const LG_SUMMARY_LABELS = { summe: "Summe", spiele: "Spiele", schnitt: "Schnitt" };

function lgPlayerKey(name) { return "p_" + slugKey(name); }
function lgFmt1(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); }

// Punkte eines Spiels: gewonnen 2 · unentschieden 1 · verloren 0 · Blind (kein
// Gegner-Ergebnis eingetragen) 2.
function lgPoints(own, opp) {
  if (isNaN(own)) return NaN;
  if (isNaN(opp)) return 2;
  return own > opp ? 2 : own === opp ? 1 : 0;
}

function lgColumns(players) {
  return [
    { key: "spiel", label: "Spiel", type: "text" },
    { key: "gegner", label: "Gegner", type: "text" },
    { key: "gegner_erg", label: "Gegner Ergebnis", type: "text" },
    ...players.map(p => ({ key: lgPlayerKey(p), label: p, type: "text" })),
    { key: "eigenes_erg", label: "Eigenes Ergebnis", type: "text" },
    { key: "punkte", label: "Punkte", type: "text" }
  ];
}

// Kennzahlen eines Spieltags aus den erfassten Spielen.
function lgCompute(players, games) {
  const perGame = games.map(g => {
    const scores = players.map((_, i) => mpNum(g.scores[i]));
    const played = scores.filter(v => !isNaN(v));
    const own = played.length ? played.reduce((a, v) => a + v, 0) : NaN;
    const opp = mpNum(g.gegnerErg);
    return { scores, own, punkte: lgPoints(own, opp) };
  });
  const withData = perGame.filter(g => !isNaN(g.own));
  const perPlayer = players.map((_, i) => {
    const vals = perGame.map(g => g.scores[i]).filter(v => !isNaN(v));
    const pins = vals.reduce((a, v) => a + v, 0);
    return { spiele: vals.length, pins, schnitt: vals.length ? pins / vals.length : NaN };
  });
  const gamesTotal = perPlayer.reduce((a, p) => a + p.spiele, 0);
  const pinsTotal = perPlayer.reduce((a, p) => a + p.pins, 0);
  return {
    perGame, perPlayer,
    gegnerSumme: games.reduce((a, g) => a + (mpNum(g.gegnerErg) || 0), 0),
    pinsTotal,
    punkteTotal: withData.reduce((a, g) => a + (isNaN(g.punkte) ? 0 : g.punkte), 0),
    spieleTotal: withData.length,
    einzelspiele: gamesTotal,
    schnittTotal: gamesTotal ? pinsTotal / gamesTotal : NaN
  };
}

// Spiel- und Summenzeilen für die gespeicherte Tabelle.
function lgBuildRows(players, games) {
  const c = lgCompute(players, games);
  const keys = players.map(lgPlayerKey);
  const rows = [];

  games.forEach((g, gi) => {
    const d = c.perGame[gi];
    if (isNaN(d.own) && !String(g.gegner || "").trim()) return;   // komplett leere Zeile
    const v = {
      spiel: String(gi + 1),
      gegner: String(g.gegner || "").trim(),
      gegner_erg: String(g.gegnerErg || "").trim(),
      eigenes_erg: isNaN(d.own) ? "" : String(d.own),
      punkte: isNaN(d.punkte) ? "" : String(d.punkte)
    };
    keys.forEach((k, i) => v[k] = isNaN(d.scores[i]) ? "" : String(d.scores[i]));
    rows.push(v);
  });

  const summary = (label, perPlayerFn, gesamt, gegner) => {
    const v = { _summary: "1", spiel: "", gegner: label, gegner_erg: gegner ?? "", eigenes_erg: gesamt, punkte: "" };
    keys.forEach((k, i) => v[k] = perPlayerFn(i));
    return v;
  };
  rows.push(summary(LG_SUMMARY_LABELS.summe,
    i => String(c.perPlayer[i].pins),
    String(c.pinsTotal),
    c.gegnerSumme ? String(c.gegnerSumme) : ""));
  rows[rows.length - 1].punkte = String(c.punkteTotal);
  rows.push(summary(LG_SUMMARY_LABELS.spiele, i => String(c.perPlayer[i].spiele), String(c.spieleTotal)));
  rows.push(summary(LG_SUMMARY_LABELS.schnitt,
    i => isNaN(c.perPlayer[i].schnitt) ? "" : lgFmt1(c.perPlayer[i].schnitt),
    isNaN(c.schnittTotal) ? "" : lgFmt1(c.schnittTotal)));
  return rows;
}

// Bestehende Tabelle zurück in den Editor-Zustand lesen.
function lgParse(table) {
  const cols = safeJson(table.columnsJson) || [];
  const pCols = cols.filter(c => String(c.key || "").startsWith("p_"));
  const players = pCols.map(c => c.label || c.key);
  const games = (table.rows || [])
    .map(r => safeJson(r.valuesJson) || {})
    .filter(v => v._summary !== "1")
    .map(v => ({
      gegner: v.gegner || "",
      gegnerErg: v.gegner_erg || "",
      scores: pCols.map(c => v[c.key] || "")
    }));
  const startNr = (String(table.title || "").match(/(\d+)\s*\.\s*Start/) || [])[1] || "";
  const parts = String(table.subtitle || "").split("·").map(s => s.trim());
  return { players, games, startNr, datum: parts[0] || "", anlage: parts[1] || "" };
}

async function openLigaSpieltagEditor(existing, seasons) {
  const isEdit = !!existing;
  const seasonsSorted = [...seasons].sort((a, b) =>
    (a.sortOrder || 0) - (b.sortOrder || 0) || b.name.localeCompare(a.name, "de-DE", { numeric: true }));
  const parsed = isEdit ? lgParse(existing) : null;

  const state = {
    isEdit,
    tableId: isEdit ? existing.id : null,
    seasonId: isEdit ? existing.seasonId : ((seasonsSorted.find(s => s.isCurrent) || seasonsSorted[0] || {}).id ?? null),
    sortOrder: isEdit ? (existing.sortOrder || 0) : 0,
    teamId: null,
    teamName: isEdit ? String(existing.title || "").split("–")[0].trim() : "",
    startNr: isEdit ? parsed.startNr : "",
    datum: isEdit ? parsed.datum : "",
    anlage: isEdit ? parsed.anlage : "",
    players: isEdit ? parsed.players : [],
    games: isEdit ? parsed.games : [],
    teams: [],
    roster: []
  };

  const body = `
    <div class="lg-editor">
    <div class="row" style="align-items:flex-end">
      <div class="field"><label>Saison</label><span class="select-wrap"><select id="lg-season">${
        seasonsSorted.map(s => `<option value="${s.id}" ${s.id === state.seasonId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")
      }</select></span></div>
      <div class="field"><label>Mannschaft</label><span class="select-wrap"><select id="lg-team"></select></span></div>
      <div class="field" style="max-width:9rem"><label>Start-Nr.</label><input type="text" id="lg-start" inputmode="numeric" value="${escapeHtml(state.startNr)}" placeholder="5"></div>
    </div>
    <div class="row">
      <div class="field"><label>Datum</label><input type="text" id="lg-datum" value="${escapeHtml(state.datum)}" placeholder="29.03.2026"></div>
      <div class="field"><label>Anlage</label><input type="text" id="lg-anlage" value="${escapeHtml(state.anlage)}" placeholder="Reutlingen"></div>
    </div>
    <div id="lg-hint" class="hint" style="margin:.2rem 0 .7rem"></div>
    <div class="mp-tools" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:.5rem">
      <span class="select-wrap"><select id="lg-add"><option value="">+ Spieler hinzufügen …</option></select></span>
      <button type="button" class="btn btn-sm btn-neutral" id="lg-addgame">+ Spiel</button>
      <span class="hint" style="margin-left:auto">Leeres Gegner-Ergebnis = Blind (2 Punkte). Leere Spielerzelle = nicht mitgespielt.</span>
    </div>
    <div style="overflow-x:auto"><table class="rows-table mp-table lg-table" id="lg-rows"></table></div>
    </div>`;

  const m = openModal(isEdit ? "Liga-Spieltag bearbeiten" : "Neuer Liga-Spieltag", body,
    `<button class="btn btn-neutral" id="lg-cancel">Abbrechen</button><button class="btn" id="lg-save">Speichern</button>`, true);

  const hintBox = m.querySelector("#lg-hint");
  const rowsTable = m.querySelector("#lg-rows");
  const addSel = m.querySelector("#lg-add");
  const teamSel = m.querySelector("#lg-team");

  // ---- Zustand aus dem DOM lesen ----
  function syncFromDom() {
    state.games = Array.from(rowsTable.querySelectorAll("tbody tr")).map(tr => ({
      gegner: (tr.querySelector('[data-key="gegner"]') || {}).value || "",
      gegnerErg: (tr.querySelector('[data-key="gegner_erg"]') || {}).value || "",
      scores: Array.from(tr.querySelectorAll("[data-p]")).map(inp => inp.value)
    }));
    state.startNr = m.querySelector("#lg-start").value.trim();
    state.datum = m.querySelector("#lg-datum").value.trim();
    state.anlage = m.querySelector("#lg-anlage").value.trim();
  }

  function titleOf() {
    const team = state.teamName || "Mannschaft";
    return state.startNr ? `${team} – ${state.startNr}. Start` : `${team} – Spieltag${state.datum ? " " + state.datum : ""}`;
  }
  function subtitleOf() {
    return [state.datum, state.anlage].filter(Boolean).join(" · ") || null;
  }
  function updateHint() {
    hintBox.textContent = `Titel: „${titleOf()}“${subtitleOf() ? ` · ${subtitleOf()}` : ""} · ${state.players.length} Spieler`;
  }

  // ---- Tabelle zeichnen + live rechnen ----
  function recompute() {
    syncFromDom();
    const c = lgCompute(state.players, state.games);
    rowsTable.querySelectorAll("tbody tr").forEach((tr, gi) => {
      const d = c.perGame[gi];
      tr.querySelector('[data-calc="eigenes_erg"]').textContent = isNaN(d.own) ? "" : String(d.own);
      const p = tr.querySelector('[data-calc="punkte"]');
      p.textContent = isNaN(d.punkte) ? "" : String(d.punkte);
      p.classList.toggle("lg-win", d.punkte > 0);
    });
    const set = (sel, txt) => { const el = rowsTable.querySelector(sel); if (el) el.textContent = txt; };
    set('[data-sum="gegner"]', c.gegnerSumme ? String(c.gegnerSumme) : "");
    set('[data-sum="eigenes_erg"]', String(c.pinsTotal));
    set('[data-sum="punkte"]', String(c.punkteTotal));
    set('[data-games="eigenes_erg"]', String(c.spieleTotal));
    set('[data-avg="eigenes_erg"]', isNaN(c.schnittTotal) ? "" : lgFmt1(c.schnittTotal));
    state.players.forEach((_, i) => {
      // Spieler ohne Einsatz bleiben leer statt „0“ – sie fallen beim Speichern ohnehin raus.
      const p = c.perPlayer[i];
      set(`[data-sum="p${i}"]`, p.spiele ? String(p.pins) : "");
      set(`[data-games="p${i}"]`, p.spiele ? String(p.spiele) : "");
      set(`[data-avg="p${i}"]`, isNaN(p.schnitt) ? "" : lgFmt1(p.schnitt));
    });
    updateHint();
  }

  function renderRows() {
    const pHead = state.players.map((p, i) =>
      `<th>${escapeHtml(p)}<button type="button" class="x lg-delp" data-p="${i}" title="Spieler entfernen">×</button></th>`).join("");
    const head = `<thead><tr>
      <th class="rownum">Spiel</th><th>Gegner</th><th>Gegner<br>Ergebnis</th>${pHead}
      <th>Eigenes<br>Ergebnis</th><th>Punkte</th><th></th></tr></thead>`;

    const bodyRows = state.games.map((g, gi) => `<tr>
      <td class="rownum">${gi + 1}</td>
      <td><input data-key="gegner" value="${escapeHtml(g.gegner || "")}" class="mp-name"></td>
      <td><input data-key="gegner_erg" value="${escapeHtml(g.gegnerErg || "")}" class="mp-num" inputmode="numeric"></td>
      ${state.players.map((_, i) =>
        `<td><input data-p="${i}" value="${escapeHtml(g.scores[i] || "")}" class="mp-num" inputmode="numeric"></td>`).join("")}
      <td class="mp-calc" data-calc="eigenes_erg"></td>
      <td class="mp-calc" data-calc="punkte"></td>
      <td class="rownum"><button type="button" class="x lg-delg" data-g="${gi}" title="Spiel entfernen" style="background:none;border:0;cursor:pointer;color:var(--color-danger)">×</button></td>
    </tr>`).join("");

    const footCell = (attr, key) => `<td class="mp-calc" data-${attr}="${key}"></td>`;
    const foot = `<tfoot>
      <tr class="lg-sum"><td colspan="2">Summe</td>${footCell("sum", "gegner")}
        ${state.players.map((_, i) => footCell("sum", "p" + i)).join("")}${footCell("sum", "eigenes_erg")}${footCell("sum", "punkte")}<td></td></tr>
      <tr><td colspan="3">Spiele</td>
        ${state.players.map((_, i) => footCell("games", "p" + i)).join("")}${footCell("games", "eigenes_erg")}<td></td><td></td></tr>
      <tr><td colspan="3">Schnitt</td>
        ${state.players.map((_, i) => footCell("avg", "p" + i)).join("")}${footCell("avg", "eigenes_erg")}<td></td><td></td></tr>
    </tfoot>`;

    rowsTable.innerHTML = head + `<tbody>${bodyRows}</tbody>` + foot;
    rowsTable.querySelectorAll("input").forEach(inp => inp.addEventListener("input", recompute));
    rowsTable.querySelectorAll(".lg-delg").forEach(b => b.addEventListener("click", () => {
      syncFromDom(); state.games.splice(Number(b.dataset.g), 1); renderRows();
    }));
    rowsTable.querySelectorAll(".lg-delp").forEach(b => b.addEventListener("click", () => {
      syncFromDom();
      const i = Number(b.dataset.p);
      state.players.splice(i, 1);
      state.games.forEach(g => g.scores.splice(i, 1));
      renderRows(); refreshAddSelect();
    }));
    recompute();
  }

  function refreshAddSelect() {
    const present = new Set(state.players);
    const avail = state.roster
      .filter(p => p.isActive !== false)
      .map(p => `${p.firstName} ${p.lastName}`)
      .filter(n => !present.has(n))
      .sort((a, b) => a.localeCompare(b, "de"));
    addSel.innerHTML = `<option value="">+ Spieler hinzufügen …</option>` +
      avail.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("") +
      `<option value="__guest__">— Gastspieler (Name eintippen) —</option>`;
    addSel.disabled = state.players.length >= LG_MAX_PLAYERS;
  }

  function addPlayer(name) {
    if (!name || state.players.includes(name)) return;
    if (state.players.length >= LG_MAX_PLAYERS) { toast(`Mehr als ${LG_MAX_PLAYERS} Spieler sind nicht vorgesehen.`, "err"); return; }
    syncFromDom();
    state.players.push(name);
    state.games.forEach(g => g.scores.push(""));
    renderRows(); refreshAddSelect();
  }

  addSel.addEventListener("change", async () => {
    const val = addSel.value;
    addSel.value = "";
    if (!val) return;
    if (val === "__guest__") {
      const name = await promptDialog("Gastspieler", "Name des Spielers:", "", "Hinzufügen");
      if (name) addPlayer(name.trim());
      return;
    }
    addPlayer(val);
  });

  m.querySelector("#lg-addgame").addEventListener("click", () => {
    syncFromDom();
    if (state.games.length >= LG_MAX_GAMES) { toast(`Mehr als ${LG_MAX_GAMES} Spiele sind nicht vorgesehen.`, "err"); return; }
    state.games.push({ gegner: "", gegnerErg: "", scores: state.players.map(() => "") });
    renderRows();
  });

  ["#lg-start", "#lg-datum", "#lg-anlage"].forEach(sel =>
    m.querySelector(sel).addEventListener("input", () => { syncFromDom(); updateHint(); }));
  m.querySelector("#lg-season").addEventListener("change", e => { state.seasonId = Number(e.target.value); });

  // ---- Mannschaft wählen -> Kader übernehmen ----
  async function loadTeam(teamId, keepScores) {
    state.teamId = teamId;
    const team = state.teams.find(t => t.id === teamId);
    state.teamName = team ? team.name : state.teamName;
    state.roster = teamId ? await SVF.get(`/api/admin/players?teamId=${teamId}`).catch(() => []) : [];
    if (!keepScores) {
      syncFromDom();
      state.players = state.roster
        .filter(p => p.isActive !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .slice(0, LG_MAX_PLAYERS)
        .map(p => `${p.firstName} ${p.lastName}`);
      state.games = Array.from({ length: state.games.length || LG_DEFAULT_GAMES }, (_, i) => ({
        gegner: (state.games[i] || {}).gegner || "",
        gegnerErg: (state.games[i] || {}).gegnerErg || "",
        scores: state.players.map(() => "")
      }));
    }
    renderRows(); refreshAddSelect();
  }
  teamSel.addEventListener("change", async e => {
    const id = Number(e.target.value) || null;
    if (state.players.length && state.games.some(g => g.scores.some(s => s !== ""))) {
      if (!(await confirmDialog("Mannschaft wechseln",
        "Die eingetragenen Einzelergebnisse gehen dabei verloren. Wirklich wechseln?", "Wechseln", "Abbrechen", true))) {
        teamSel.value = String(state.teamId || "");
        return;
      }
    }
    await loadTeam(id, false);
  });

  // ---- Speichern ----
  m.querySelector("#lg-cancel").addEventListener("click", () => closeModal(m));
  m.querySelector("#lg-save").addEventListener("click", async () => {
    syncFromDom();
    if (!state.players.length) { toast("Bitte zuerst eine Mannschaft wählen.", "err"); return; }
    const c = lgCompute(state.players, state.games);
    const withData = c.perGame.filter(g => !isNaN(g.own)).length;
    if (!withData) { toast("Noch keine Einzelergebnisse eingetragen.", "err"); return; }
    const ohneGegner = state.games.filter((g, i) => !isNaN(c.perGame[i].own) && !String(g.gegner || "").trim()).length;
    if (ohneGegner && !(await confirmDialog("Gegner fehlt",
      `${ohneGegner} Spiel(e) haben Ergebnisse, aber keinen Gegnernamen. Trotzdem speichern?`, "Speichern", "Zurück"))) return;

    // Spieler ohne ein einziges Ergebnis kommen nicht in die Tabelle – so kann die
    // Mannschaft bequem komplett vorbelegt werden, ohne leere Spalten zu erzeugen.
    const usedIdx = state.players.map((_, i) => i).filter(i => c.perPlayer[i].spiele > 0);
    const dropped = state.players.length - usedIdx.length;
    if (dropped && !(await confirmDialog("Speichern",
      `${usedIdx.length} Spieler haben Ergebnisse – ${dropped} ohne Einsatz werden nicht in die Tabelle übernommen. Fortfahren?`,
      "Speichern", "Abbrechen"))) return;
    const players = usedIdx.map(i => state.players[i]);
    const games = state.games.map(g => ({ ...g, scores: usedIdx.map(i => g.scores[i]) }));

    const payload = {
      title: titleOf(),
      subtitle: subtitleOf(),
      type: LG_TYPE,
      seasonId: state.seasonId,
      sortOrder: state.isEdit ? state.sortOrder : -(Number(state.startNr) || 1),
      isPublished: true,
      columnsJson: JSON.stringify(lgColumns(players)),
      rows: lgBuildRows(players, games).map((v, i) => ({ sortOrder: i, valuesJson: JSON.stringify(v) }))
    };
    try {
      if (state.isEdit) await SVF.send("PUT", `/api/admin/standings/${state.tableId}`, payload);
      else await SVF.send("POST", "/api/admin/standings", payload);
      closeModal(m);
      toast(`Spieltag gespeichert – ${c.punkteTotal} Punkte, ${c.pinsTotal} Pins.`);
      go("standings");
    } catch (e) { toast(e.message, "err"); }
  });

  // ---- Initialisierung ----
  state.teams = await SVF.get("/api/admin/teams").catch(() => []);
  const guess = state.teams.find(t => t.name === state.teamName);
  teamSel.innerHTML = `<option value="">– bitte wählen –</option>` + state.teams.map(t =>
    `<option value="${t.id}" ${guess && guess.id === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
  if (isEdit) {
    // Kader nur nachladen (für „+ Spieler“), Spalten/Werte bleiben wie gespeichert.
    if (guess) await loadTeam(guess.id, true); else { renderRows(); refreshAddSelect(); }
  } else if (state.teams.length) {
    renderRows(); refreshAddSelect();
  }
  updateHint();
}
