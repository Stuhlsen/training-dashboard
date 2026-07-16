/* ============================================================
   SCRIPTS/LIB/PLAN-TO-CARDS.JS — Basisplan + Adjustments → plan_cards-
   Zeilen (Supabase-Row-Shape). Reine Funktion, kein I/O — genutzt von
   scripts/migrate-plan-to-supabase.js. Wiederverwendet applyAdjustment()
   aus core/planning.js statt die Merge-Logik zu duplizieren.
   ============================================================ */

import { applyAdjustment } from "../../assets/js/core/planning.js";
import { workoutDurationMinutes } from "../../assets/js/core/ftp-progress.js";

/** Gesamtdauer eines strukturierten Workouts in Minuten — wiederverwendet
 *  core/ftp-progress.js::workoutDurationMinutes() statt die WU+Intervalle×
 *  Dauer+Pausen+CD-Formel ein drittes Mal zu implementieren (existiert
 *  bereits dort UND inline in ui/planned.js's Timeline-Rendering). null
 *  wenn gar kein workout-Objekt vorhanden (freie Z2-Fahrten, Ruhetage) —
 *  workoutDurationMinutes(undefined) selbst liefert 0, was hier mit "kein
 *  Wert bekannt" verwechselbar wäre.
 *  @param {Object|undefined} workout
 *  @returns {number|null} */
function workoutDurationMin(workout) {
  return workout ? workoutDurationMinutes(workout) : null;
}

/**
 * Wandelt Basisplan-Sessions (Datum → Session-Objekt, wie PLANNED_SESSIONS/
 * PLANNED_SESSIONS_ATHLETE2) unter Anwendung der Adjustments in
 * plan_cards-Zeilen (DB-Spaltennamen, ohne id/athlete_id/created_at —
 * die setzt der Aufrufer beim Insert). sort_order wird pro effektivem
 * planned_date vergeben, sortiert nach dem URSPRÜNGLICHEN (Vor-Adjustment-)
 * Datum, damit Tages-Kollisionen durch Verschiebungen (z.B. ein Tausch
 * zweier Sessions auf denselben Tag) eine stabile, nachvollziehbare
 * Lesereihenfolge behalten statt von der Objekt-Iterationsreihenfolge
 * abzuhängen.
 * @param {Record<string, Object>} sessionsByDate
 * @param {Record<string, Object>} [adjustments]
 * @returns {Array<Object>} plan_cards-Zeilen (ohne id/athlete_id/created_at)
 */
export function buildPlanCardRows(sessionsByDate, adjustments) {
  const resolved = Object.entries(sessionsByDate || {}).map(([date, session]) => {
    const s = applyAdjustment({ date, ...session }, adjustments);
    return { origDate: date, s };
  });

  // Pro effektivem Datum gruppieren, innerhalb der Gruppe nach dem
  // ursprünglichen Datum sortiert -> stabiler sort_order bei Kollisionen.
  const byEffectiveDate = new Map();
  for (const entry of resolved) {
    const key = entry.s.date;
    if (!byEffectiveDate.has(key)) byEffectiveDate.set(key, []);
    byEffectiveDate.get(key).push(entry);
  }

  const rows = [];
  for (const group of byEffectiveDate.values()) {
    group.sort((a, b) => a.origDate.localeCompare(b.origDate));
    group.forEach(({ s }, i) => {
      rows.push({
        planned_date: s.date,
        sort_order: i,
        title: s.name,
        workout_type: s.typ,
        km: s.km ?? null,
        duration_min: workoutDurationMin(s.workout),
        tss_planned: null, // kein TSS-Feld in den Plan-Definitionen (s. Median-TSS-Nebenprodukt)
        status: s.cancelled ? "ausgefallen" : "geplant",
        cancel_reason: s.cancelReason ?? null,
        moved_from_date: s.originalDate ?? null,
        move_reason: s.movedReason ?? null,
        week: s.week ?? null,
        phase: s.phase ?? null,
        note: s.details ?? null,
        workout: s.workout ?? null,
        pushed_external_id: null,
      });
    });
  }

  rows.sort((a, b) => a.planned_date.localeCompare(b.planned_date));
  return rows;
}
