/* ============================================================
   CORE/GUARDRAILS.JS — Leitplanken-Zusammenfassung fürs Trainer-Briefing
   (P1, docs/konzept-progressionssteuerung.md Abschnitt 5 — kein DOM)

   "Der Trainer sieht die Grenzen, bevor er plant" — reine Anzeige, KEINE
   Konfliktregel (die feuert im Import-Pfad aus core/conflicts.js, P2,
   getrennt gehalten laut Konzept). Nimmt bereits geladene Domänenobjekte
   entgegen (Ist-Fahrten, Plankarten, Projektion), rechnet nichts neu, was
   core/loadguard.js, core/projection.js, core/periodization.js oder
   core/plan-config.js schon liefern.
   ============================================================ */

import { isoWeekKey } from "./aggregate.js";
import { diffDays, addDaysISO } from "./format.js";
import { buildLoadGuard, RAMP_HIGH } from "./loadguard.js";
import { weeklyCtlRamp } from "./projection.js";
import { intensityClass } from "./plan-config.js";
import { currentBlockTarget, PHASE_SIGNATURES } from "./periodization.js";

const weekKeyFn = (r) => (r.dateISO ? isoWeekKey(r.dateISO) : null);
const weekSortFn = (a, b) => a.localeCompare(b);

/** Mittelwert einer Zahlenliste, ignoriert null/undefined. @returns {number|null} */
function meanOrNull(values) {
  const usable = values.filter((v) => v != null);
  if (!usable.length) return null;
  return Math.round((usable.reduce((s, v) => s + v, 0) / usable.length) * 10) / 10;
}

/** Ist-Fahrten-Wochen aus buildLoadGuard (chronologisch), einmal berechnet
 *  und von rampActual4w/rampHistoricalHitRate gemeinsam genutzt — dieselbe
 *  Wochenzuordnung wie app.js/ui/analysis.js. */
function actualWeeklyGuard(actuals) {
  return buildLoadGuard(actuals || [], weekKeyFn, weekSortFn);
}

/** Mittel der letzten `n` Wochen-Ramps (chronologisch, neueste zuletzt). */
function recentActualRamps(guard, weeksBack) {
  return guard.slice(-weeksBack).map((w) => w.ramp);
}

/** Anteil der Ist-Wochen (volle Historie), deren Ramp über RAMP_HIGH lag —
 *  die "wie oft wurde die Schwelle real erreicht"-Zahl aus P1, damit die
 *  Schwelle nicht isoliert ohne Kontext steht. */
function historicalRampHitRate(guard) {
  const withRamp = guard.filter((w) => w.ramp != null);
  if (!withRamp.length) return null;
  return withRamp.filter((w) => w.ramp > RAMP_HIGH).length / withRamp.length;
}

/** Harte Tage (INTENSITY_CLASS "hart") je ISO-Woche im Planungshorizont.
 *  @param {Array<{date:string, typ?:string|null, cancelled?:boolean}>} cards
 *  @param {string} today */
function hardDaysPerWeek(cards, today) {
  const byWeek = new Map();
  for (const c of cards || []) {
    if (c.cancelled || !c.date || c.date < today) continue;
    if (intensityClass(c.typ) !== "hart") continue;
    const key = isoWeekKey(c.date);
    byWeek.set(key, (byWeek.get(key) || 0) + 1);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count }));
}

/** Kürzester Abstand (Tage) zwischen zwei harten Tagen im Planungshorizont,
 *  oder null bei weniger als zwei harten Tagen. */
function shortestHardGap(cards, today) {
  const hardDates = (cards || [])
    .filter((c) => !c.cancelled && c.date >= today && intensityClass(c.typ) === "hart")
    .map((c) => c.date)
    .sort();
  if (hardDates.length < 2) return null;
  let min = Infinity;
  for (let i = 1; i < hardDates.length; i++) {
    min = Math.min(min, diffDays(hardDates[i], hardDates[i - 1]));
  }
  return min;
}

/** Intensitätsverteilung der letzten 4 Ist-Wochen gegen den Zielkorridor
 *  der aktuellen Blockphase — nutzt `r.if` (bereits in rides.json
 *  vorhanden, s. scripts/lib/map-activity.js) statt einer neuen Berechnung.
 *  `null`, wenn die aktuelle Phase keinen Korridor kennt (core/
 *  periodization.js::PHASE_SIGNATURES deckt nur Sweet Spot/Schwelle/VO2max
 *  ab) oder keine passenden Fahrten vorliegen — degradiert sauber.
 *  @param {import("../types.js").Ride[]} actuals
 *  @param {Array<{date:string, phase?:string|null, cancelled?:boolean}>} cards
 *  @param {string} today */
function tidVsCorridor(actuals, cards, today) {
  const phase = currentBlockTarget(cards, today);
  const corridor = phase ? PHASE_SIGNATURES[phase] : null;
  if (!corridor) return null;

  const fromIso = addDaysISO(today, -28);
  const window = (actuals || []).filter((r) => r.dateISO >= fromIso && r.dateISO < today && r.if != null);
  if (!window.length) return null;

  const above = window.filter((r) => r.if > corridor.ifMax).length;
  return { phase, shareAboveCorridor: Math.round((above / window.length) * 1000) / 1000 };
}

/** Geplante Wochen-TSS gegen die Obergrenze CTL(Wochenstart) × Faktor —
 *  dieselbe Grundidee wie K-WOCHENTSS (core/conflicts.js), hier nur als
 *  erzählende Übersicht statt als Schwellenprüfung.
 *  @param {Array<{date:string, ctl:number, tss:number}>} days projection.days
 *  @param {number} startCtl @param {number} ceilingFactor */
function weeklyTssVsCeiling(days, startCtl, ceilingFactor) {
  if (!days?.length) return [];
  const weeks = [];
  let cur = null;
  for (let i = 0; i < days.length; i++) {
    const key = isoWeekKey(days[i].date);
    if (!cur || cur.key !== key) {
      if (cur) weeks.push(cur);
      cur = { key, firstIdx: i, count: 0, tss: 0 };
    }
    cur.tss += days[i].tss;
    cur.count += 1;
  }
  if (cur) weeks.push(cur);

  return weeks
    .filter((w) => w.count === 7)
    .map((w) => {
      const ctlAtStart = w.firstIdx > 0 ? days[w.firstIdx - 1].ctl : startCtl;
      const ceiling = Math.round(ctlAtStart * ceilingFactor);
      return { week: w.key, tss: Math.round(w.tss), ceiling, overCeiling: w.tss > ceiling };
    });
}

/**
 * Leitplanken-Zusammenfassung (P1) — s. die einzelnen Feld-Kommentare oben
 * für die jeweilige Herleitung.
 * @param {{
 *   actuals: import("../types.js").Ride[],
 *   cards: Array<{date:string, typ?:string|null, phase?:string|null, cancelled?:boolean}>,
 *   projection: ReturnType<typeof import("./projection.js").projectLoad>|null,
 *   today: string,
 *   ceilingFactor?: number,
 * }} args
 * @returns {{
 *   rampActual4w: number|null,
 *   rampProjectedHorizon: number|null,
 *   rampHistoricalHitRate: number|null,
 *   hardDaysPerWeek: Array<{week:string, count:number}>,
 *   shortestHardGap: number|null,
 *   tidVsCorridor: {phase:string, shareAboveCorridor:number}|null,
 *   weeklyTssVsCeiling: Array<{week:string, tss:number, ceiling:number, overCeiling:boolean}>,
 * }}
 */
export function buildGuardrailSummary({ actuals = [], cards = [], projection = null, today, ceilingFactor = 8 }) {
  const guard = actualWeeklyGuard(actuals);
  const rampActual4w = meanOrNull(recentActualRamps(guard, 4));
  const projectedRamps = projection ? weeklyCtlRamp(projection.days, projection.startCtl) : [];
  const rampProjectedHorizon = meanOrNull(projectedRamps.map((w) => w.ramp));

  return {
    rampActual4w,
    rampProjectedHorizon,
    rampHistoricalHitRate: historicalRampHitRate(guard),
    hardDaysPerWeek: hardDaysPerWeek(cards, today),
    shortestHardGap: shortestHardGap(cards, today),
    tidVsCorridor: tidVsCorridor(actuals, cards, today),
    weeklyTssVsCeiling: projection ? weeklyTssVsCeiling(projection.days, projection.startCtl, ceilingFactor) : [],
  };
}
