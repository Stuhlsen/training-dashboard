/* ============================================================
   CORE/PLAN-HISTORY.JS — Historie-Aggregat für den Plan-Generator
   (kein DOM, kein I/O, kein React)

   Fahrplan 8 E4 (docs/fahrplan-8-plan-generator.md). Baut das V3
   `HistoryAggregate` aus den vorhandenen Lesedaten (Rides / Wellness /
   Plan-Karten) — die reine, testbare Aggregation. Der Hook
   `api/hooks/usePlanHistoryAggregate.ts` lädt nur die Quellen und ruft
   diese Funktion; er trägt keine Logik.

   Kein Import von `config.ts` (Schichtenregel core/): `ageYears` und die
   eFTP-Ersatzquelle kommen als Parameter rein.

   `powerCurveWeakness` bleibt bis E10 hart `null` (V3).
   `emptyHistory()` wird aus `plan-generator.js` re-exportiert — eine
   Definition, gemeinsame Quelle für E2 und E4.
   ============================================================ */

import { addDaysISO } from "./format.js";
import { isoWeekKey } from "./aggregate.js";
import { mondayOf, planAdherence as planAdherenceCore } from "./adherence.js";
import { currentPmc } from "./pmc.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "./ftp-forecast.js";
import { emptyHistory } from "./plan-generator.js";

export { emptyHistory };

/** @typedef {import("./plan-generator.js").HistoryAggregate} HistoryAggregate */

/** Wie viele abgeschlossene Wochen die Ist-TSS-Reihe maximal zurückreicht (V3). */
const WEEKS_BACK = 8;
/** Fenster für die Plan-Erfüllungsquote (V3: "letzte ~6 Wochen"). */
const ADHERENCE_WEEKS = 6;

/**
 * Ist-TSS je abgeschlossene ISO-Kalenderwoche, alt → neu. Die laufende
 * Woche zählt nicht mit (noch nicht abgeschlossen). Wochen ohne Fahrt
 * ergeben eine echte `0` (kein Training = keine Last) — solange sie
 * innerhalb der Historie des Athleten liegen; Slots vor der allerersten
 * Fahrt werden weggelassen, damit "Ø der letzten 4 Wochen" nicht durch
 * künstliche Nullen aus der Zeit vor Trainingsbeginn verwässert wird.
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {number[]}
 */
function weeklyActualTss(rides, todayISO) {
  const currentMonday = mondayOf(todayISO);
  const dateOf = (r) => r.dateISO || r.date || null;

  const sums = new Map(); // isoWeekKey -> Summe TSS
  let firstDate = null;
  for (const r of rides) {
    const d = dateOf(r);
    if (!d) continue;
    if (!firstDate || d < firstDate) firstDate = d;
    if (d >= currentMonday) continue; // laufende Woche + Zukunft raus
    const key = isoWeekKey(d);
    sums.set(key, (sums.get(key) || 0) + (r.tss ?? r.trimp ?? 0));
  }

  const firstKey = firstDate ? isoWeekKey(mondayOf(firstDate)) : null;
  const out = [];
  let monday = addDaysISO(currentMonday, -7 * WEEKS_BACK);
  for (let i = 0; i < WEEKS_BACK; i++) {
    const key = isoWeekKey(monday);
    // "YYYY-KWnn" ist lexikografisch chronologisch sortierbar (isoWeekKey
    // padded die KW auf zwei Stellen, Jahr steht vorne).
    if (!firstKey || key >= firstKey) out.push(Math.round(sums.get(key) || 0));
    monday = addDaysISO(monday, 7);
  }
  return out;
}

/**
 * Plan-Erfüllungsquote der letzten ~6 Wochen als 0..1 — oder `null`, wenn
 * in dem Fenster keine Plan-Karten lagen. Nutzt dieselbe Matching-Logik
 * wie der Konsistenz-Tab (`adherence.js::planAdherence`), nur auf das
 * Fenster begrenzt. Karten tragen `cancelled`/`movedTo` selbst → `{}` als
 * Adjustments (wie `buildConsistencySummary`).
 * @param {import("../types.js").Ride[]} rides
 * @param {Array<{date:string, name?:string|null, title?:string|null, cancelled?:boolean, movedTo?:string}>|null} planCards
 * @param {string} todayISO
 * @returns {number|null}
 */
function recentAdherence(rides, planCards, todayISO) {
  if (!planCards || !planCards.length) return null;
  const since = addDaysISO(mondayOf(todayISO), -7 * ADHERENCE_WEEKS);
  const windowCards = planCards.filter((c) => c.date && c.date >= since && c.date <= todayISO);
  const res = planAdherenceCore(rides, windowCards, {}, todayISO);
  if (!res) return null;
  return Math.round(res.quote) / 100; // quote ist 0..100 → 0..1
}

/**
 * Baut das V3 `HistoryAggregate` für den Plan-Generator.
 *
 * `ageYears` wird auch im leeren Fall (keine Rides) durchgereicht — das
 * Alter ist unabhängig von der Trainingshistorie bekannt und steuert den
 * Erholungsrhythmus (≥ 40 → 2:1 auch bei `fortgeschritten`, Entscheidung 9).
 *
 * @param {Object} args
 * @param {import("../types.js").Ride[]} [args.rides]
 * @param {import("../types.js").WellnessDay[]} [args.wellness]
 * @param {Array<{date:string, name?:string|null, title?:string|null, cancelled?:boolean, movedTo?:string}>|null} [args.planCards]
 * @param {string} args.todayISO
 * @param {number|null} [args.ageYears]
 * @param {number|null} [args.eftpFallback]  eFTP aus config.ts, wenn die Ride-/Wellness-Reihe leer ist
 * @returns {HistoryAggregate}
 */
export function buildHistoryAggregate({
  rides,
  wellness = [],
  planCards = null,
  todayISO,
  ageYears = null,
  eftpFallback = null,
}) {
  const rs = rides || [];
  const age = ageYears ?? null;

  if (!rs.length) {
    return { ...emptyHistory(), ageYears: age, currentEftp: eftpFallback ?? null };
  }

  const pmc = currentPmc(rs, todayISO);
  const currentCtl = pmc && pmc.ctl != null ? Math.round(pmc.ctl * 10) / 10 : null;

  const eftpSeries = mergeEftpHistories(eftpHistory(rs), eftpHistoryFromWellness(wellness || []));
  const currentEftp = eftpSeries.length
    ? eftpSeries[eftpSeries.length - 1].eftp
    : (eftpFallback ?? null);

  return {
    weeklyActualTss: weeklyActualTss(rs, todayISO),
    currentCtl,
    currentEftp,
    planAdherence: recentAdherence(rs, planCards, todayISO),
    ageYears: age,
    powerCurveWeakness: null, // E10
  };
}
