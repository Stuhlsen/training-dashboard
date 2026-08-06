/* ============================================================
   CORE/PLAN2-SCHEDULE.JS — Trainingsblock-Phasen als Datumsraster
   (kein DOM). Reiner Datum→Woche/Phase-Lookup, unabhängig davon, ob
   an dem Tag gefahren wurde.

   Geteilt zwischen scripts/lib/plan2.js (Sync-Zeit: Ride-Tagging beim
   Import, re-exportiert PLAN2_SCHEDULE/getPlan2WeekPhase von hier statt
   sie selbst zu definieren) und ui/charts/wellness.js (Laufzeit:
   HRV/Ruhepuls-Reihe direkt aus Data.wellness, ohne den Umweg über
   Ride-Objekte — Bugfix-Nachtrag zu Phase 5 Schritt 7, s.
   docs/offene-punkte.md). Gilt NUR für den Eigenplan-Athleten
   (Athlet 1) — Athlet 2 hat keinen Bezug zu diesen Datumsbereichen,
   s. Aufrufer.

   `week` ist die ISO-Kalenderwoche des jeweiligen Blocks (Format wie
   core/aggregate.js::isoWeekKey, "YYYY-KWnn") — vor dem Umbau
   "Plan 1"/"Plan 2 → Kalenderwoche" (dashboard-2.0) trug dieses Feld
   noch plan-gebundene Labels ("P2-W0" … "P2-W12"). Die Blockgrenzen
   fallen exakt auf Montag–Sonntag, die Umrechnung ist daher 1:1 und
   verlustfrei. `phase` (Sweet Spot/Schwelle/VO2max/Taper/…) bleibt
   unverändert die tragende Block-/Periodisierungsstruktur.
   ============================================================ */

// === Trainingsblock Woche/Phase-Mapping (datumsbasiert) ===
export const PLAN2_SCHEDULE = [
  { week: "2026-KW26", phase: "Übergang", start: "2026-06-22", end: "2026-06-28" },
  { week: "2026-KW27", phase: "Sweet Spot", start: "2026-06-29", end: "2026-07-05" },
  { week: "2026-KW28", phase: "Sweet Spot", start: "2026-07-06", end: "2026-07-12" },
  { week: "2026-KW29", phase: "Sweet Spot", start: "2026-07-13", end: "2026-07-19" },
  { week: "2026-KW30", phase: "Erholung", start: "2026-07-20", end: "2026-07-26" },
  { week: "2026-KW31", phase: "Schwelle", start: "2026-07-27", end: "2026-08-02" },
  { week: "2026-KW32", phase: "Schwelle", start: "2026-08-03", end: "2026-08-09" },
  { week: "2026-KW33", phase: "Schwelle", start: "2026-08-10", end: "2026-08-16" },
  { week: "2026-KW34", phase: "Erholung", start: "2026-08-17", end: "2026-08-23" },
  { week: "2026-KW35", phase: "VO2max", start: "2026-08-24", end: "2026-08-30" },
  { week: "2026-KW36", phase: "VO2max", start: "2026-08-31", end: "2026-09-06" },
  { week: "2026-KW37", phase: "VO2max", start: "2026-09-07", end: "2026-09-13" },
  { week: "2026-KW38", phase: "Taper", start: "2026-09-14", end: "2026-09-20" },
];

/**
 * Woche/Phase für ein Datum, rein aus dem Datumsraster — kein Ride nötig.
 * @param {string} dateStr ISO-Datum ("YYYY-MM-DD")
 * @returns {{week: string|null, phase: string|null}}
 */
export function getPlan2WeekPhase(dateStr) {
  for (const s of PLAN2_SCHEDULE) {
    if (dateStr >= s.start && dateStr <= s.end) return { week: s.week, phase: s.phase };
  }
  return { week: null, phase: null };
}
