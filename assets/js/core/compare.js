/* ============================================================
   CORE/COMPARE.JS — Vergleichsmodus (Phase 5, Schritt 4)
   (docs/phase-5-konzept-explorer.md §5, X1)

   Reine Ausrichtung zweier Datumsbereiche (Slot A/B) desselben Athleten auf
   eine relative Achse (dayOffset, Tag 1 des jeweiligen Blocks = 0) plus
   Kennzahlen je Slot. Baut ausschließlich auf bereits vorhandenen, in
   tests/ abgedeckten Primitiven auf:

   - densifyDays()/joinSeries() (core/days.js) für das Tagesgerüst und die
     TSS-("zero")/CTL-ATL-TSB-("carry")-Auffüllung. "carry" trägt genau EINEN
     einzelnen fehlenden Tag fort und lässt 2+ aufeinanderfolgende als echte
     Lücke — dieselbe Semantik, mit der core/days.js CTL/ATL/TSB ohnehin
     dokumentiert. Kein Rückgriff auf projectPmc()/ui/charts/pmc.js::
     densifyPmc: deren Sonderlogik löst das "asOf→heute"-Brücken-Problem der
     LIVE-Prognose, das es in einem abgeschlossenen historischen Vergleichs-
     Slot nicht gibt.
   - intensityClass() (core/plan-config.js) für "harte Tage" — dieselbe
     Klassifikation, die core/conflicts.js für Plan-Karten nutzt, hier auf
     ride.typ angewandt.

   Keine Streckung ungleich langer Slots (X1): der kürzere Slot liefert
   schlicht ein kürzeres days-Array, kein Padding/Interpolation.
   ============================================================ */

import { densifyDays, joinSeries } from "./days.js";
import { intensityClass } from "./plan-config.js";

/**
 * @typedef {Object} CompareDay
 * @property {number} dayOffset 0-basiert, Tag 1 des Blocks = 0
 * @property {string} dateISO
 * @property {number|null} tss
 * @property {number|null} ctl
 * @property {number|null} atl
 * @property {number|null} tsb
 * @property {boolean} hard
 */

/**
 * @typedef {Object} CompareMetrics
 * @property {number} sumTss
 * @property {number|null} avgCtl
 * @property {number|null} ramp Letzter bekannter CTL-Wert minus erster bekannter im Slot
 * @property {number} hardDays
 */

/**
 * @typedef {Object} CompareSlotResult
 * @property {CompareDay[]} days
 * @property {CompareMetrics} metrics
 */

const EMPTY_METRICS = Object.freeze({ sumTss: 0, avgCtl: null, ramp: null, hardDays: 0 });

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Rides eines Datums zusammenfassen: TSS summiert, hard = irgendeine Ride
 *  klassifiziert "hart", CTL/ATL/TSB vom zeitlich letzten Ride des Tages
 *  (Tiebreaker wie AGENTS.md "Bekannte Eigenheiten": startTime, sonst
 *  Einfügereihenfolge). */
function groupByDate(rides) {
  const byDate = new Map();
  for (const r of rides || []) {
    if (!r?.dateISO) continue;
    if (!byDate.has(r.dateISO)) byDate.set(r.dateISO, []);
    byDate.get(r.dateISO).push(r);
  }
  const rows = [];
  for (const [dateISO, group] of byDate) {
    const sorted = [...group].sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    const last = sorted[sorted.length - 1];
    const sumTss = group.reduce((s, r) => s + (r.tss ?? 0), 0);
    const hard = group.some((r) => intensityClass(r.typ) === "hart");
    rows.push({
      dateISO,
      tss: sumTss,
      ctl: last.ctl ?? null,
      atl: last.atl ?? null,
      tsb: last.tsb ?? null,
      hard,
    });
  }
  return rows;
}

/**
 * @param {import("../types.js").Ride[]} rides
 * @param {{from: string, to: string}|null|undefined} slot
 * @returns {CompareSlotResult}
 */
function buildSlotSeries(rides, slot) {
  if (!slot?.from || !slot?.to || slot.from > slot.to) {
    return { days: [], metrics: { ...EMPTY_METRICS } };
  }

  const skeleton = densifyDays(slot.from, slot.to);
  const rows = groupByDate(rides);
  const hardDates = new Set(rows.filter((r) => r.hard).map((r) => r.dateISO));

  const tssVals = joinSeries(skeleton, rows, { key: "tss", absence: "zero" });
  const ctlVals = joinSeries(skeleton, rows, { key: "ctl", absence: "carry" });
  const atlVals = joinSeries(skeleton, rows, { key: "atl", absence: "carry" });
  const tsbVals = joinSeries(skeleton, rows, { key: "tsb", absence: "carry" });

  const days = skeleton.map((s, i) => ({
    dayOffset: i,
    dateISO: s.dateISO,
    tss: tssVals[i],
    ctl: ctlVals[i],
    atl: atlVals[i],
    tsb: tsbVals[i],
    hard: hardDates.has(s.dateISO),
  }));

  const sumTss = Math.round(tssVals.reduce((s, v) => s + (v ?? 0), 0));
  const knownCtl = ctlVals.filter((v) => v != null);
  const avgCtl = knownCtl.length
    ? round1(knownCtl.reduce((s, v) => s + v, 0) / knownCtl.length)
    : null;
  const ramp = knownCtl.length >= 2 ? round1(knownCtl[knownCtl.length - 1] - knownCtl[0]) : null;
  const hardDays = days.filter((d) => d.hard).length;

  return { days, metrics: { sumTss, avgCtl, ramp, hardDays } };
}

/**
 * @param {import("../types.js").Ride[]} rides Voller, ungefilterter Ride-Bestand
 *   des Athleten (nicht auf ctl/atl!=null gefiltert — Compare braucht TSS
 *   auch für Tage ohne CTL/ATL-Wert).
 * @param {{from: string, to: string}|null|undefined} slotA
 * @param {{from: string, to: string}|null|undefined} slotB
 * @returns {{a: CompareSlotResult, b: CompareSlotResult}}
 */
export function buildCompare(rides, slotA, slotB) {
  return {
    a: buildSlotSeries(rides, slotA),
    b: buildSlotSeries(rides, slotB),
  };
}
