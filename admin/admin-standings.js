// ============================================================================
//  Spezial-Editor für die generischen Ergebnis-Tabellen (Liga, Monatspokal,
//  Vereinsmeisterschaft und beliebige eigene Tabellen).
// ============================================================================
const STANDINGS_TYPES = ["Liga", "Monatspokal", "Vereinsmeisterschaft", "Custom"];

function slugKey(label) {
  return (label || "").toString().toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || ("spalte_" + Math.random().toString(36).slice(2, 6));
}

async function renderStandingsSection(content) {
  try {
    const [tables, seasons] = await Promise.all([SVF.get("/api/admin/standings"), loadSeasons()]);
    const seasonName = id => { const s = seasons.find(x => x.id === id); return s ? s.name : "—"; };
    content.innerHTML = `
      <div class="toolbar">
        <button class="btn" id="new-table">+ Neue Tabelle</button>
        <div class="spacer"></div><span class="muted">${tables.length} Tabellen</span>
      </div>
      ${tables.length > 1 ? `<p class="muted" style="font-size:.85rem">↕ Tabellen per Drag&nbsp;&amp;&nbsp;Drop am Griff sortieren.</p>` : ""}
      ${tables.length ? `<table class="atable"><thead><tr><th></th><th>Titel</th><th>Typ</th><th>Saison</th><th>Status</th><th></th></tr></thead><tbody>
        ${tables.map(t => `<tr data-id="${t.id}">
          <td class="drag-cell"><span class="drag-handle" title="Ziehen zum Sortieren">⠿</span></td>
          <td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.type)}</td><td>${escapeHtml(seasonName(t.seasonId))}</td>
          <td>${tag(t.isPublished, "Sichtbar", "Versteckt")}</td>
          <td class="actions-cell"><div class="actions">
            <button class="btn btn-sm btn-neutral" data-edit="${t.id}">Bearbeiten</button>
            <button class="btn btn-sm btn-danger" data-del="${t.id}">Löschen</button>
          </div></td></tr>`).join("")}
      </tbody></table>` : `<div class="empty">Noch keine Ergebnis-Tabellen. Lege die erste an.</div>`}`;
    initDragSort(content.querySelector(".atable tbody"), "standings");

    content.querySelector("#new-table").addEventListener("click", () => openStandingsEditor(null, seasons));
    content.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", async () => {
      const full = await SVF.get(`/api/admin/standings/${b.dataset.edit}`);
      openStandingsEditor(full, seasons);
    }));
    content.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Tabelle wirklich löschen?")) return;
      try { await SVF.send("DELETE", `/api/admin/standings/${b.dataset.del}`); toast("Gelöscht."); go("standings"); }
      catch (e) { toast(e.message, "err"); }
    }));
  } catch (e) { content.innerHTML = `<div class="error-box">${escapeHtml(e.message)}</div>`; }
}

async function openStandingsEditor(table, seasons) {
  const isEdit = !!table;
  let cols = [];
  let rows = [];
  if (isEdit) {
    try { cols = JSON.parse(table.columnsJson || "[]"); } catch { cols = []; }
    rows = (table.rows || []).map(r => ({ values: safeJson(r.valuesJson) || {} }));
  } else {
    cols = JSON.parse(PRESET_FALLBACK.Liga);
  }

  const seasonOpts = `<option value="">– keine Saison –</option>` +
    seasons.map(s => `<option value="${s.id}" ${isEdit && table.seasonId === s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("");
  const typeOpts = STANDINGS_TYPES.map(t => `<option value="${t}" ${isEdit && table.type === t ? "selected" : ""}>${t}</option>`).join("");

  const body = `
    <div class="row">
      <div class="field"><label>Titel *</label><input type="text" id="st-title" value="${isEdit ? escapeHtml(table.title) : ""}" placeholder="z. B. Oberliga – 1. Herren"></div>
      <div class="field"><label>Untertitel</label><input type="text" id="st-sub" value="${isEdit ? escapeHtml(table.subtitle || "") : ""}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Typ</label><select id="st-type">${typeOpts}</select></div>
      <div class="field"><label>Saison</label><select id="st-season">${seasonOpts}</select></div>
    </div>
    <div class="field"><label class="check"><input type="checkbox" id="st-pub" ${(!isEdit || table.isPublished) ? "checked" : ""}> Sichtbar auf der Website</label></div>

    <hr style="border:none;border-top:1px solid var(--color-border);margin:1rem 0">
    <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem">
      <strong>Spalten</strong>
      <button type="button" class="btn btn-sm btn-neutral" id="load-preset">Vorlage für Typ laden</button>
      <span class="hint">Spaltennamen frei wählbar – ideal für eigene Tabellen.</span>
    </div>
    <div class="col-editor" id="cols"></div>
    <button type="button" class="btn btn-sm btn-neutral" id="add-col">+ Spalte</button>

    <div style="margin:1.2rem 0 .4rem"><strong>Zeilen</strong></div>
    <div style="overflow-x:auto"><table class="rows-table" id="rows"></table></div>
    <button type="button" class="btn btn-sm btn-neutral" id="add-row" style="margin-top:.6rem">+ Zeile</button>`;

  const m = openModal(isEdit ? "Tabelle bearbeiten" : "Neue Ergebnis-Tabelle", body,
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
  function renderCols() {
    colsBox.innerHTML = cols.map((c, i) =>
      `<span class="col-chip"><input value="${escapeHtml(c.label)}" data-coli="${i}"><button type="button" class="x" data-rmcol="${i}">×</button></span>`).join("");
    colsBox.querySelectorAll("[data-coli]").forEach(inp => inp.addEventListener("change", () => {
      cols[inp.dataset.coli].label = inp.value; renderRows();
    }));
    colsBox.querySelectorAll("[data-rmcol]").forEach(b => b.addEventListener("click", () => {
      syncRowsFromDom();
      const c = cols[b.dataset.rmcol];
      cols.splice(b.dataset.rmcol, 1);
      rows.forEach(r => delete r.values[c.key]);
      renderCols(); renderRows();
    }));
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

  m.querySelector("#add-col").addEventListener("click", () => {
    syncRowsFromDom();
    const label = prompt("Name der neuen Spalte:");
    if (!label) return;
    cols.push({ key: slugKey(label), label, type: "text" });
    renderCols(); renderRows();
  });
  m.querySelector("#add-row").addEventListener("click", () => { syncRowsFromDom(); rows.unshift({ values: {} }); renderRows(); });
  m.querySelector("#load-preset").addEventListener("click", async () => {
    const type = m.querySelector("#st-type").value;
    const presets = await loadPresets();
    if (presets[type]) {
      if (rows.length && !confirm("Spalten durch die Vorlage ersetzen? Vorhandene Zeilenwerte bleiben, soweit die Spalten passen.")) return;
      syncRowsFromDom();
      cols = JSON.parse(presets[type]);
      renderCols(); renderRows();
    } else { toast("Für „Custom“ gibt es keine Vorlage – Spalten selbst anlegen.", "err"); }
  });

  m.querySelector("#cancel").addEventListener("click", closeModal);
  m.querySelector("#save").addEventListener("click", async () => {
    syncRowsFromDom();
    const title = m.querySelector("#st-title").value.trim();
    if (!title) { toast("Bitte einen Titel angeben.", "err"); return; }
    if (!cols.length) { toast("Mindestens eine Spalte anlegen.", "err"); return; }
    // Bestehende Tabellen behalten ihre Reihenfolge; neue landen ganz oben
    let sortOrder;
    if (isEdit) {
      sortOrder = table.sortOrder || 0;
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
      if (isEdit) await SVF.send("PUT", `/api/admin/standings/${table.id}`, payload);
      else await SVF.send("POST", "/api/admin/standings", payload);
      closeModal(); toast("Gespeichert."); go("standings");
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
