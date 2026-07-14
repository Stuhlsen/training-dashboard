/* ============================================================
   CORE/FORMAT.JS — Reine Formatierungs-Helfer (kein DOM)
   ============================================================ */

/** Zahl auf d Dezimalstellen, deutsches Komma, oder "–" wenn null
 *  @param {number|null|undefined} v @param {number} [d] @returns {string} */
export const fmt = (v, d = 1) => {
  if (v == null || isNaN(v)) return "–";
  return Number(v).toFixed(d).replace(".", ",");
};

/** Ganzzahl oder "–" wenn null
 *  @param {number|null|undefined} v @returns {string} */
export const fmtInt = (v) => {
  if (v == null || isNaN(v)) return "–";
  return Math.round(v).toString();
};

/** Zahl mit Tausender-Trennzeichen (deutsch)
 *  @param {number|null|undefined} v @returns {string} */
export const fmtThousands = (v) => {
  if (v == null) return "–";
  return Math.round(v).toLocaleString("de-DE");
};

/** Date-Objekt → lokales ISO-Datum (YYYY-MM-DD), OHNE UTC-Konvertierung.
 *  `date.toISOString()` würde bei UTC-Versatz (z.B. CEST) zwischen
 *  Mitternacht lokal und UTC auf den Vortag zurückrutschen — das hat in
 *  diesem Codebase schon mehrfach zu Bugs geführt (s. core/pmc.js::tsbTrend).
 *  @param {Date} [date] @returns {string} */
export const localISODate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Tage zwischen zwei ISO-Datumsangaben (lokal, kein UTC-Versatz), a − b.
 *  @param {string} aISO @param {string} bISO @returns {number} */
export const diffDays = (aISO, bISO) => {
  const a = new Date(`${aISO}T00:00:00`);
  const b = new Date(`${bISO}T00:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
};

/** ISO-Datum (2026-03-24) → DD.MM — kompaktes Format für Achsenbeschriftungen
 *  (Jahr weggelassen, da im Chart-Kontext meist eindeutig).
 *  @param {string|null|undefined} iso @returns {string} */
export const fmtDate = (iso) => {
  if (!iso) return "–";
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}.${parts[1]}`;
};

/** ISO-Datum (2026-03-24) → DD.MM.JJJJ — volles Format für Tooltips, wo das
 *  Jahr (anders als auf der Achse) zur Eindeutigkeit gebraucht wird.
 *  @param {string|null|undefined} iso @returns {string} */
export const fmtDateFull = (iso) => {
  if (!iso) return "–";
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
};

/** Minuten → "4:02h" Format
 *  @param {number|null|undefined} minutes @returns {string} */
export const fmtDuration = (minutes) => {
  if (!minutes) return "–";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, "0")}h`;
};

/** Bricht einen Text an Wortgrenzen auf mehrere Zeilen um (max. ~maxChars pro Zeile)
 *  @param {string} text @param {number} maxChars @returns {string[]} */
export const wrapText = (text, maxChars) => {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  words.forEach((w) => {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  });
  if (cur) lines.push(cur);
  return lines;
};

/* ── Wetter-Icons (WMO Weather Code) ─────────────────────────── */
const WEATHER_ICONS = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌦️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌧️",
  67: "🌧️",
  71: "❄️",
  73: "❄️",
  75: "❄️",
  77: "❄️",
  80: "🌦️",
  81: "🌧️",
  82: "🌧️",
  85: "❄️",
  86: "❄️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

/** WMO-Code → Emoji, nächster bekannter Code als Fallback
 *  @param {number|null|undefined} code @returns {string} */
export const weatherIcon = (code) => {
  if (code == null) return "";
  if (WEATHER_ICONS[code]) return WEATHER_ICONS[code];
  const codes = Object.keys(WEATHER_ICONS)
    .map(Number)
    .sort((a, b) => a - b);
  const nearest = codes.reduce(
    (prev, c) => (Math.abs(c - code) < Math.abs(prev - code) ? c : prev),
    codes[0]
  );
  return WEATHER_ICONS[nearest] || "🌤️";
};

/** Windrichtung in Grad → Himmelsrichtung (N, NO, …)
 *  @param {number|null|undefined} deg @returns {string} */
export const windDir = (deg) => {
  if (deg == null) return "";
  const dirs = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
};

/** Phase → CSS-Tag-Klasse
 *  @param {string|null|undefined} phase @returns {string} */
export const phaseTagClass = (phase) => {
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
