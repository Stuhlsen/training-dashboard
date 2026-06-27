/* ============================================================
   UTILS.JS — Gemeinsame Hilfsfunktionen
   ============================================================ */

/* ── Zahlenformatierung ─────────────────────────────────────── */

/** Zahl auf d Dezimalstellen, deutsches Komma, oder "–" wenn null */
const fmt = (v, d = 1) => {
  if (v == null || isNaN(v)) return "–";
  return Number(v).toFixed(d).replace(".", ",");
};

/** Ganzzahl oder "–" wenn null */
const fmtInt = (v) => {
  if (v == null || isNaN(v)) return "–";
  return Math.round(v).toString();
};

/** Zahl mit Tausender-Trennzeichen (deutsch) */
const fmtThousands = (v) => {
  if (v == null) return "–";
  return Math.round(v).toLocaleString("de-DE");
};

/** ISO-Datum (2026-03-24) → DD.MM */
const fmtDate = (iso) => {
  if (!iso) return "–";
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}.${parts[1]}`;
};

/** Minuten → "4:02h" Format */
const fmtDuration = (minutes) => {
  if (!minutes) return "–";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}h`;
};

/* ── DOM Helpers ─────────────────────────────────────────────── */

/** Sicheres getElementById */
const el = (id) => document.getElementById(id);

/** Alle Elemente mit Selektor */
const els = (sel, parent = document) => [...parent.querySelectorAll(sel)];

/* ── SVG Helper ──────────────────────────────────────────────── */
const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG-Element erstellen mit Attributen */
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/* ── Tooltip ─────────────────────────────────────────────────── */
const Tooltip = {
  _el: null,

  init() {
    this._el = el("tooltip");
  },

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

  _position(e) {
    const tip = this._el;
    const tw = tip.offsetWidth || 220;
    const th = tip.offsetHeight || 60;
    const x = e.clientX, y = e.clientY;
    tip.style.left = Math.min(x + 14, window.innerWidth  - tw - 8) + "px";
    tip.style.top  = Math.max(y - th - 10, 8) + "px";
  },
};

/* ── Tab Switcher ────────────────────────────────────────────── */
const Tabs = {
  switch(name) {
    els(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    els(".tab-content").forEach(t => t.classList.toggle("hidden", t.id !== `tab-${name}`));
  },

  init(onSwitch) {
    el("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      this.switch(btn.dataset.tab);
      if (onSwitch) onSwitch(btn.dataset.tab);
    });
  },
};

/* ── Stats Helpers ───────────────────────────────────────────── */

/** Durchschnitt eines Arrays (ignoriert null/undefined) */
const avg = (arr, key) => {
  const vals = arr.map(x => key ? x[key] : x).filter(v => v != null && !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
};

/** Maximum, ignoriert null */
const maxVal = (arr, key) => {
  const vals = arr.map(x => key ? x[key] : x).filter(v => v != null);
  return vals.length ? Math.max(...vals) : null;
};

/** Minimum, ignoriert null */
const minVal = (arr, key) => {
  const vals = arr.map(x => key ? x[key] : x).filter(v => v != null);
  return vals.length ? Math.min(...vals) : null;
};

/** Summe, ignoriert null */
const sum = (arr, key) =>
  arr.reduce((s, x) => s + ((key ? x[key] : x) || 0), 0);

/* ── Normalisierung Befinden ─────────────────────────────────── */
const FEEL_MAP = {
  "Sehr leicht":      { label: "Sehr leicht",      cls: "sleicht"  },
  "Sleicht":          { label: "Sehr leicht",      cls: "sleicht"  },
  "Leicht":           { label: "Leicht",            cls: "leicht"   },
  "Irgendwie einfach":{ label: "Irgendwie einfach", cls: "ieinfach" },
  "Ieinfach":         { label: "Irgendwie einfach", cls: "ieinfach" },
  "Moderat":          { label: "Moderat",           cls: "moderat"  },
  "Irgendwie schwer": { label: "Irgendwie schwer",  cls: "ischwer"  },
  "Ischwer":          { label: "Irgendwie schwer",  cls: "ischwer"  },
  "Schwer":           { label: "Schwer",            cls: "schwer"   },
  "Hart":             { label: "Hart",              cls: "hart"     },
};

const normalizeFeel = (f) => FEEL_MAP[f] || { label: f || "–", cls: "" };

/* ── Wetter-Icons (WMO Weather Code) ─────────────────────────── */
const WEATHER_ICONS = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌧️", 67: "🌧️",
  71: "❄️", 73: "❄️", 75: "❄️", 77: "❄️",
  80: "🌦️", 81: "🌧️", 82: "🌧️",
  85: "❄️", 86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const weatherIcon = (code) => {
  if (code == null) return "";
  if (WEATHER_ICONS[code]) return WEATHER_ICONS[code];
  // Nächsten bekannten Code finden
  const codes = Object.keys(WEATHER_ICONS).map(Number).sort((a, b) => a - b);
  const nearest = codes.reduce((prev, c) => Math.abs(c - code) < Math.abs(prev - code) ? c : prev, codes[0]);
  return WEATHER_ICONS[nearest] || "🌤️";
};

const windDir = (deg) => {
  if (deg == null) return "";
  const dirs = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
};

/* ── Tag-Klasse für Phase/Woche ──────────────────────────────── */
const phaseTagClass = (phase) => {
  if (!phase) return "";
  if (phase.includes("Vor") || phase === "Vorbereitung") return "tag-vor";
  if (phase === "Phase 1") return "tag-p1";
  if (phase === "Phase 2") return "tag-p2";
  if (phase === "Phase 3") return "tag-p3";
  // Plan 2
  if (phase === "Übergang") return "tag-vor";
  if (phase === "Sweet Spot") return "tag-p1";
  if (phase === "Schwelle") return "tag-p2";
  if (phase === "VO2max") return "tag-p3";
  if (phase === "Erholung") return "tag-vor";
  if (phase === "Taper") return "tag-vor";
  return "";
};
