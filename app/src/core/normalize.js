/* ============================================================
   CORE/NORMALIZE.JS — Normalisierung von Rohdaten (kein DOM)
   ============================================================ */

import { fmtDate } from "./format.js";

/* ── Normalisierung Befinden ─────────────────────────────────── */
const FEEL_MAP = {
  "Sehr leicht": { label: "Sehr leicht", cls: "sleicht" },
  Sleicht: { label: "Sehr leicht", cls: "sleicht" },
  Leicht: { label: "Leicht", cls: "leicht" },
  "Irgendwie einfach": { label: "Irgendwie einfach", cls: "ieinfach" },
  Ieinfach: { label: "Irgendwie einfach", cls: "ieinfach" },
  Moderat: { label: "Moderat", cls: "moderat" },
  "Irgendwie schwer": { label: "Irgendwie schwer", cls: "ischwer" },
  Ischwer: { label: "Irgendwie schwer", cls: "ischwer" },
  Schwer: { label: "Schwer", cls: "schwer" },
  Hart: { label: "Hart", cls: "hart" },
};

/** Befinden-Rohwert → { label, cls }
 *  @param {string|null|undefined} f
 *  @returns {{label: string, cls: string}} */
export const normalizeFeel = (f) => FEEL_MAP[f] || { label: f || "–", cls: "" };

/**
 * Roh-Ride aus JSON → normalisiertes Ride-Objekt fürs Frontend.
 * Ergänzt dateISO/dateShort, Befinden-Label/-Klasse und Effizienz (W/bpm).
 * @param {Object} r Roh-Objekt aus rides.json oder STATIC_RIDES
 * @returns {import("../types.js").Ride}
 */
export function normalizeRide(r) {
  const dateISO = r.dateISO || r.date || "";
  const feel = normalizeFeel(r.feel);
  return {
    ...r,
    dateISO,
    dateShort: fmtDate(dateISO),
    feel: feel.label,
    feelCls: feel.cls,
    // Effizienz: Watt pro Herzschlag
    efficiency: r.watt && r.hf ? Math.round((r.watt / r.hf) * 100) / 100 : null,
  };
}

/**
 * Wellness-Rohdaten → Frontend-Objekt mit Anzeige-Datum.
 * @param {Object} w
 * @returns {import("../types.js").WellnessDay}
 */
export function normalizeWellness(w) {
  return { ...w, dateShort: fmtDate(w.date), dateISO: w.date };
}
