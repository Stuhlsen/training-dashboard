/* ============================================================
   CORE/PLAN-REST-DAYS.JS — fehlende Tage in einem definierten
   Plan-Zeitraum als Ruhetag-Karten ergänzen (kein DOM).

   Hintergrund (docs/konzept-progressionssteuerung.md D6, Nachtrag
   05.08.2026): eine Trainingswoche hat immer 7 Tage — sobald ein Plan für
   einen Zeitraum existiert, ist damit auch klar, welche Tage darin frei
   sind. Statt das bei jeder neuen Plan-Woche einzeln zu tippen (genau das
   fehlte bei Athlet 1s Plan-2-Schedule und musste nachträglich für 21 Tage
   nachgetragen werden), füllt fillRestDays() jeden Tag ohne aktive Session
   automatisch als Ruhetag-Karte auf.

   Bewusst reine Funktion mit injiziertem `resolveWeekPhase` statt eines
   festen Imports aus core/plan2-schedule.js — athletenagnostisch,
   wiederverwendbar für künftige Pläne (auch scripts/lib/plan-athlete2.js,
   auch wenn dessen Wochen aktuell noch manuell vollständig getippt sind).
   ============================================================ */

import { addDaysISO } from "./format.js";

/**
 * Ergänzt fehlende Tage in [fromISO, toISO] (inklusive) als Ruhetag-Karten.
 * Tage, die in `sessions` bereits existieren, bleiben unangetastet — die
 * Funktion liefert NUR die neuen Ruhetag-Einträge, der Aufrufer merged sie
 * (kein Mutieren von `sessions`).
 * @param {Record<string, Object>} sessions bereits definierte Tage
 * @param {string} fromISO erster Tag des zu vervollständigenden Bereichs
 * @param {string} toISO letzter Tag (inklusive)
 * @param {(date: string) => {week: string|null, phase: string|null}} resolveWeekPhase
 *   Datum → Woche/Phase für die generierte Karte (z.B. core/plan2-schedule.js::getPlan2WeekPhase)
 * @returns {Record<string, Object>} nur die neuen Ruhetag-Einträge
 */
export function fillRestDays(sessions, fromISO, toISO, resolveWeekPhase) {
  const result = {};
  for (let date = fromISO; date <= toISO; date = addDaysISO(date, 1)) {
    if (sessions[date]) continue;
    const { week, phase } = resolveWeekPhase(date);
    result[date] = {
      name: "Ruhetag",
      typ: "Ruhetag",
      week,
      phase,
      km: 0,
      details: "Bewusst frei · kein Training geplant",
    };
  }
  return result;
}
