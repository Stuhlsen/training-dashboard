/* ============================================================
   CORE/PROGRESS-INDICATORS.JS — Fortschrittsindikatoren fürs Trainer-Briefing
   (F1, docs/konzept-progressionssteuerung.md Abschnitt 4 — kein DOM)

   Zwischen zwei Ramp-Tests liegen bei Athlet 1 rund fünf Monate — eFTP
   allein ist zu unruhig, um darauf zu steuern. Diese Datei liefert die
   BEIDEN Bausteine, die core/efficiency.js (EF-/Decoupling-Trend, bereits
   vorhanden, hier unverändert wiederverwendet) noch nicht abdeckt:
   - eFTP-Trend über ein Zeitfenster (Aufrufer schneidet auf 8 Wochen zu)
   - Bestwerte-Vergleich 5min/20min aus zwei Power-Curve-Blöcken
     (data/rides.json::powerCurveBlocks, server-seitig via
     scripts/lib/plan2.js::getRecentComparisonBlocks gefüllt)

   Reine Funktionen — nimmt fertig geladene Domänenobjekte entgegen,
   kein fetch/document (Schichtenregel core/).
   ============================================================ */

import { linearTrend } from "./stats.js";
import { extractPowerCurve, nearestWatts } from "./powercurve.js";

/** Sekunden + Anzeige-Label für die W1-Bestwerte-Auswahl (F1: "5 min und
 *  20 min") — bewusst nur diese zwei, nicht die volle STANDARD_SECS-Liste
 *  aus core/powercurve.js (die ist fürs Power-Curve-Chart gedacht). */
export const BEST_EFFORT_DURATIONS = [
  { secs: 300, label: "5min" },
  { secs: 1200, label: "20min" },
];

/** `key`-Werte der beiden rollierenden Power-Curve-Blöcke in
 *  `data/rides.json::powerCurveBlocks` (server-seitig erzeugt von
 *  scripts/lib/plan2.js::getRecentComparisonBlocks) — hier als einzige
 *  Quelle definiert, damit scripts/ (Node) und state/export.js (Browser)
 *  denselben String verwenden, ohne core/ ↔ scripts/ zu verschränken
 *  (scripts/lib/plan2.js importiert bereits aus assets/js/core/, s. dortiger
 *  Kommentar zu PLAN2_SCHEDULE — nie umgekehrt). */
export const RECENT_BLOCK_KEY = "letzte-6-wochen";
export const PREVIOUS_BLOCK_KEY = "6-wochen-davor";

/**
 * eFTP-Trend über das bereits vom Aufrufer zugeschnittene Zeitfenster
 * (F1: 8 Wochen) — Steigung per Woche via core/stats.js::linearTrend,
 * gleiches Muster wie core/efficiency.js::efficiencyTrend/
 * core/ftp-forecast.js::forecastFtp (Tage seit erstem Punkt als x).
 * @param {Array<{date: string, eftp: number}>} history bereits zeitlich
 *   zugeschnitten (core/ftp-forecast.js::mergeEftpHistories-Ergebnis)
 * @param {{date: string, ftpWatt: number}|null} [lastRampTest] letzter
 *   gemessene Ramp-Test-Eintrag (core/ftp-history.js::currentFtpEntry-
 *   Ergebnis) — reine Durchreichung für die Anzeige, keine neue Logik
 * @returns {{first: number, last: number, slopePerWeek: number|null,
 *   nPoints: number, lastRampTest: {date: string, ftpWatt: number}|null}|null}
 *   null bei leerer Historie
 */
export function eftpProgressSummary(history, lastRampTest = null) {
  if (!history?.length) return null;

  let slopePerWeek = null;
  if (history.length >= 3) {
    const t0 = new Date(history[0].date).getTime();
    const pts = history.map((h) => ({
      x: (new Date(h.date).getTime() - t0) / 86400000,
      y: h.eftp,
    }));
    const trend = linearTrend(pts);
    if (trend) slopePerWeek = Math.round(trend.slope * 7 * 10) / 10;
  }

  return {
    first: history[0].eftp,
    last: history[history.length - 1].eftp,
    slopePerWeek,
    nPoints: history.length,
    lastRampTest: lastRampTest ? { date: lastRampTest.date, ftpWatt: lastRampTest.ftpWatt } : null,
  };
}

/** Watt-Wert einer festen Dauer aus EINEM Power-Curve-Block, oder null
 *  (fehlender Block, keine Kurve, kein Wert für diese Dauer).
 *  @param {{curve?: Object|null}|null|undefined} block
 *  @param {number} secs @returns {number|null} */
function wattsAtDuration(block, secs) {
  if (!block?.curve) return null;
  const { secs: allSecs, watts } = extractPowerCurve(block.curve);
  if (!allSecs.length) return null;
  const map = {};
  for (let i = 0; i < allSecs.length; i++) {
    if (watts[i] != null && watts[i] > 0) map[allSecs[i]] = watts[i];
  }
  return nearestWatts(map, secs);
}

/**
 * Bestwerte-Vergleich 5min/20min zwischen zwei rollierenden 6-Wochen-
 * Power-Curve-Blöcken (F1: "letzte 6 Wochen gegen die 6 Wochen davor").
 * Fehlt einer der beiden Blöcke (z.B. vor dem ersten Sync-Lauf mit den
 * neuen Blöcken, s. scripts/lib/plan2.js::getRecentComparisonBlocks),
 * liefert die betroffene Dauer keinen Eintrag statt eines Fehlers.
 * @param {{curve?: Object|null}|null|undefined} recentBlock
 * @param {{curve?: Object|null}|null|undefined} previousBlock
 * @returns {Array<{label: string, secs: number, recentW: number,
 *   previousW: number, deltaW: number}>}
 */
export function bestEffortComparison(recentBlock, previousBlock) {
  const out = [];
  for (const { secs, label } of BEST_EFFORT_DURATIONS) {
    const recentW = wattsAtDuration(recentBlock, secs);
    const previousW = wattsAtDuration(previousBlock, secs);
    if (recentW == null || previousW == null) continue;
    out.push({ label, secs, recentW, previousW, deltaW: recentW - previousW });
  }
  return out;
}
