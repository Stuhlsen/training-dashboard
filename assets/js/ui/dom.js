/* ============================================================
   UI/DOM.JS — DOM- und SVG-Helfer, Tooltip
   ============================================================ */

/** Sicheres getElementById @param {string} id @returns {HTMLElement|null} */
export const el = (id) => document.getElementById(id);

/** Alle Elemente mit Selektor
 *  @param {string} sel @param {Document|Element} [parent] @returns {Element[]} */
export const els = (sel, parent = document) => [...parent.querySelectorAll(sel)];

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** HTML-escaped einen String für die sichere Interpolation in innerHTML —
 *  Pflicht für jeden Text, den ein Athlet/Trainer selbst eingegeben hat
 *  (z.B. Event-Titel), bevor er per Template-String ins DOM landet.
 *  @param {unknown} str @returns {string} */
export const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

/* ── SVG Helper ──────────────────────────────────────────────── */
const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG-Element erstellen mit Attributen
 *  @param {string} tag @param {Record<string, string|number>} [attrs] */
export const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/* ── Tooltip ─────────────────────────────────────────────────── */
export const Tooltip = {
  _el: null,

  init() {
    this._el = el("tooltip");
  },

  /** @param {MouseEvent} event @param {string} html */
  show(event, html) {
    if (!this._el) return;
    this._el.innerHTML = html;
    this._el.classList.remove("hidden");
    this._position(event);
  },

  hide() {
    if (!this._el) return;
    this._el.classList.add("hidden");
  },

  /** @param {MouseEvent} e */
  _position(e) {
    const tip = this._el;
    const tw = tip.offsetWidth || 220;
    const th = tip.offsetHeight || 60;
    const x = e.clientX,
      y = e.clientY;
    tip.style.left = Math.min(x + 14, window.innerWidth - tw - 8) + "px";
    tip.style.top = Math.max(y - th - 10, 8) + "px";
  },
};
