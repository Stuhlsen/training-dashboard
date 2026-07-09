/* ============================================================
   CORE/RECORDS.JS — Bestwerte-Wand (kein DOM)
   Echte sportliche Meilensteine, automatisch aus den Daten:
   je Kategorie der aktuelle Bestwert plus die Ablöse-Historie
   ("abgelöst am …") — Entwicklung über Monate wird greifbar.
   ============================================================ */

import { isoWeekKey } from "./aggregate.js";

const DEFS = [
  {
    key: "km",
    label: "Längste Fahrt",
    unit: "km",
    icon: "📏",
    value: (r) => r.km,
    ok: (r) => r.km != null,
  },
  {
    key: "duration",
    label: "Längste Fahrzeit",
    unit: "min",
    icon: "⏱",
    value: (r) => r.min,
    ok: (r) => r.min != null,
  },
  {
    key: "np20",
    label: "Beste NP (≥20 min)",
    unit: "W",
    icon: "⚡",
    value: (r) => r.np,
    ok: (r) => r.np != null && (r.min || 0) >= 20,
  },
  {
    key: "speed40",
    label: "Schnellste 40 km+",
    unit: "km/h",
    icon: "💨",
    value: (r) => r.kmh,
    ok: (r) => r.kmh != null && (r.km || 0) >= 40,
  },
  {
    key: "hoehe",
    label: "Meiste Höhenmeter",
    unit: "m",
    icon: "⛰",
    value: (r) => r.hoehe,
    ok: (r) => r.hoehe != null && r.hoehe > 0,
  },
];

/**
 * Bestwerte mit Ablöse-Historie über alle Fahrten (chronologisch).
 * Zusätzlich: größte Trainingswoche (km, ISO-Kalenderwoche).
 * @param {import("../types.js").Ride[]} rides
 * @returns {Array<{key: string, label: string, unit: string, icon: string,
 *   value: number, date: string, name: string,
 *   history: Array<{value: number, date: string}>}>}
 */
export function recordProgression(rides) {
  const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const out = [];

  for (const def of DEFS) {
    let best = null;
    const history = [];
    for (const r of sorted) {
      if (!def.ok(r)) continue;
      const v = def.value(r);
      if (best == null || v > best.value) {
        if (best) history.push({ value: best.value, date: best.date });
        best = { value: v, date: r.dateISO, name: r.name || "" };
      }
    }
    if (best) {
      out.push({
        key: def.key,
        label: def.label,
        unit: def.unit,
        icon: def.icon,
        ...best,
        history,
      });
    }
  }

  // Größte Trainingswoche (km je ISO-Woche, chronologische Ablösung)
  const weekKm = {};
  for (const r of sorted) {
    if (!r.dateISO || r.km == null) continue;
    const wk = isoWeekKey(r.dateISO);
    if (!weekKm[wk]) weekKm[wk] = { km: 0, lastDate: r.dateISO };
    weekKm[wk].km += r.km;
    weekKm[wk].lastDate = r.dateISO;
  }
  let bestWeek = null;
  const weekHistory = [];
  for (const [wk, v] of Object.entries(weekKm).sort(([a], [b]) => a.localeCompare(b))) {
    const km = Math.round(v.km * 10) / 10;
    if (bestWeek == null || km > bestWeek.value) {
      if (bestWeek) weekHistory.push({ value: bestWeek.value, date: bestWeek.date });
      bestWeek = { value: km, date: v.lastDate, name: wk };
    }
  }
  if (bestWeek) {
    out.push({
      key: "weekKm",
      label: "Größte Woche",
      unit: "km",
      icon: "📆",
      ...bestWeek,
      history: weekHistory,
    });
  }

  return out;
}
