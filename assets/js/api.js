// ============================================================================
//  API-Helfer + kleine Utilities. Wird von allen Seiten genutzt.
// ============================================================================
const API_BASE = (window.SVF_CONFIG && window.SVF_CONFIG.API_BASE_URL || "").replace(/\/$/, "");

const SVF = {
  // ---- Auth-Token (Admin) ----
  token() { return localStorage.getItem("svf_token") || null; },
  setToken(t) { t ? localStorage.setItem("svf_token", t) : localStorage.removeItem("svf_token"); },
  user() { try { return JSON.parse(localStorage.getItem("svf_user") || "null"); } catch { return null; } },
  setUser(u) { u ? localStorage.setItem("svf_user", JSON.stringify(u)) : localStorage.removeItem("svf_user"); },

  // ---- HTTP ----
  async get(path) {
    const r = await fetch(API_BASE + path, { headers: this._authHeaders() });
    return this._handle(r);
  },
  async send(method, path, body, isForm = false) {
    const opts = { method, headers: this._authHeaders() };
    if (isForm) { opts.body = body; }
    else if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const r = await fetch(API_BASE + path, opts);
    return this._handle(r);
  },
  _authHeaders() {
    const h = {};
    const t = this.token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  },
  async _handle(r) {
    if (r.status === 401) { // Token ungültig/abgelaufen
      if (this.token()) { this.setToken(null); this.setUser(null); }
      throw new ApiError("Nicht angemeldet.", 401);
    }
    if (r.status === 204) return null;
    const text = await r.text();
    const data = text ? safeJson(text) : null;
    if (!r.ok) throw new ApiError((data && data.message) || ("Fehler " + r.status), r.status, data);
    return data;
  },

  // ---- Bild-URL aus Image-Id ----
  imageUrl(id) { return id ? `${API_BASE}/api/images/${id}` : null; },
  downloadUrl(id) { return `${API_BASE}/api/downloads/${id}/file`; },
  apiBase() { return API_BASE; }
};

class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }

// ---- Formatierung / Sicherheit ----
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(iso, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const opt = withTime
    ? { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
    : { day: "2-digit", month: "long", year: "numeric" };
  // hour12:false erzwingt 24h (kein AM/PM), unabhängig von der Browser-Sprache
  return withTime ? d.toLocaleString("de-DE", opt) : d.toLocaleDateString("de-DE", opt);
}

function qs(name) { return new URLSearchParams(location.search).get(name); }
