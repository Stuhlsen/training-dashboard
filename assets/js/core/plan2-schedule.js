/* ============================================================
   CORE/PLAN2-SCHEDULE.JS — Plan-2-Wochen/Phasen als Datumsraster
   (kein DOM). Reiner Datum→Woche/Phase-Lookup, unabhängig davon, ob
   an dem Tag gefahren wurde.

   Geteilt zwischen scripts/lib/plan2.js (Sync-Zeit: Ride-Tagging beim
   Import, re-exportiert PLAN2_SCHEDULE/getPlan2WeekPhase von hier statt
   sie selbst zu definieren) und ui/charts/wellness.js (Laufzeit:
   Plan-1/W0/Plan-2-Segmentierung für HRV/Ruhepuls direkt aus
   Data.wellness, ohne den Umweg über Ride-Objekte — Bugfix-Nachtrag zu
   Phase 5 Schritt 7, s. docs/offene-punkte.md). Gilt NUR für den
   Eigenplan-Athleten (Athlet 1) — Athlet 2 hat keinen Bezug zu diesen
   Datumsbereichen, s. Aufrufer.
   ============================================================ */

// === Plan 2 Woche/Phase-Mapping (datumsbasiert) ===
export const PLAN2_SCHEDULE = [
  { week: "P2-W0", phase: "Übergang", start: "2026-06-22", end: "2026-06-28" },
  { week: "P2-W1", phase: "Sweet Spot", start: "2026-06-29", end: "2026-07-05" },
  { week: "P2-W2", phase: "Sweet Spot", start: "2026-07-06", end: "2026-07-12" },
  { week: "P2-W3", phase: "Sweet Spot", start: "2026-07-13", end: "2026-07-19" },
  { week: "P2-W4", phase: "Erholung", start: "2026-07-20", end: "2026-07-26" },
  { week: "P2-W5", phase: "Schwelle", start: "2026-07-27", end: "2026-08-02" },
  { week: "P2-W6", phase: "Schwelle", start: "2026-08-03", end: "2026-08-09" },
  { week: "P2-W7", phase: "Schwelle", start: "2026-08-10", end: "2026-08-16" },
  { week: "P2-W8", phase: "Erholung", start: "2026-08-17", end: "2026-08-23" },
  { week: "P2-W9", phase: "VO2max", start: "2026-08-24", end: "2026-08-30" },
  { week: "P2-W10", phase: "VO2max", start: "2026-08-31", end: "2026-09-06" },
  { week: "P2-W11", phase: "VO2max", start: "2026-09-07", end: "2026-09-13" },
  { week: "P2-W12", phase: "Taper", start: "2026-09-14", end: "2026-09-20" },
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
