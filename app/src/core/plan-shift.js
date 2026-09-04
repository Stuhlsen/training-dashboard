/* ============================================================
   CORE/PLAN-SHIFT.JS — Ganzen Trainingsplan um N Wochen verschieben
   (kein DOM, kein I/O)

   Punkt 1 der 6-Punkte-Liste (03.09.2026): Athlet 4 stellt in einem Dialog
   einen Ziel-`plan_offset_weeks` ein; diese Funktion liefert die
   plan_cards-Patches, um alle KÜNFTIGEN, nicht ausgefallenen Karten um das
   Delta (Ziel − gespeicherter Offset) zu datieren.

   Delta-basiert, damit ein zweiter Lauf mit demselben Ziel ein No-op ist
   (self-healing bei Teilfehlern — der Hook schreibt den neuen Offset erst,
   nachdem alle Karten-Patches durch sind).

   KEIN `movedFromDate`/„verschoben von …"-Badge: ein Massen-Shift ist kein
   Einzel-Move. `week`/`phase` werden je Zielzeile aus dem (offset-fähigen)
   Plan-Wochen-Modell neu vergeben, damit die Karte unter der richtigen
   Wochenüberschrift landet.
   ============================================================ */

import { addDaysISO } from "./format.js";
import { planWeekFor } from "./plan-week-model.js";

/** Zulässiger Bereich für `profiles.plan_offset_weeks` — EINE Quelle für den
 *  Client-Clamp (useShiftPlan, useUpdatePlanOffsetWeeks, das Dialog-View-Model).
 *  MUSS mit dem `check (plan_offset_weeks between -8 and 12)` in Migration 0026
 *  übereinstimmen. */
export const PLAN_OFFSET_MIN = -8;
export const PLAN_OFFSET_MAX = 12;

/** @param {number} n @returns {number} auf [PLAN_OFFSET_MIN, PLAN_OFFSET_MAX] geklemmt */
export function clampPlanOffset(n) {
  return Math.max(PLAN_OFFSET_MIN, Math.min(PLAN_OFFSET_MAX, Math.round(n || 0)));
}

/**
 * @typedef {{id: string, date: string, name?: string|null, cancelled?: boolean, originalDate?: string}} ShiftableCard
 * @typedef {{id: string, plannedDate: string, movedFromDate?: string, week?: string|null, phase?: string|null}} ShiftPatch
 */

/**
 * @param {ShiftableCard[]} cards  aktueller Kartenstand (React-Query-Cache)
 * @param {number} deltaWeeks  Ziel-Offset − gespeicherter Offset (ganze Wochen;
 *   positiv = später, negativ = früher)
 * @param {string} todayISO  "YYYY-MM-DD" — Karten davor bleiben unangetastet
 * @param {string} athleteId  interne ID für die week/phase-Neuvergabe
 * @param {number} [targetOffsetWeeks]  neuer Offset-Stand (für planWeekFor)
 * @param {import("./plan-week-model.js").PlanWeekEntry[]|null} [weekModel]  Fahrplan 8 E7:
 *   Wochenstruktur eines aktiven `training_plans`-Eintrags — an planWeekFor()
 *   durchgereicht. `null` ⇒ Code-Vorlage wie bisher.
 * @returns {{ok: true, patches: ShiftPatch[]} | {ok: false, reason: string}}
 *   `ok:false` nur bei einer „früher"-Verschiebung, die eine Karte vor heute
 *   schöbe — die UI blockt damit den Bestätigen-Knopf.
 */
export function planShiftPatches(cards, deltaWeeks, todayISO, athleteId, targetOffsetWeeks = 0, weekModel = null) {
  const days = Math.round(deltaWeeks || 0) * 7;
  if (!days) return { ok: true, patches: [] };

  const candidates = (cards || []).filter(
    (c) => c && !c.cancelled && typeof c.date === "string" && c.date >= todayISO,
  );

  /** @type {ShiftPatch[]} */
  const patches = [];
  for (const c of candidates) {
    const newDate = addDaysISO(c.date, days);
    if (days < 0 && newDate < todayISO) {
      return {
        ok: false,
        reason: `„${c.name || c.date}" würde vor heute (${todayISO}) liegen — so weit lässt sich der Plan nicht nach vorne holen.`,
      };
    }
    const model = planWeekFor(athleteId, newDate, targetOffsetWeeks, weekModel);
    patches.push({
      id: c.id,
      plannedDate: newDate,
      // Einzeln verschobene Karten tragen ein originalDate ("verschoben von …").
      // Das muss beim Massen-Shift mitwandern, sonst schickt „Rückgängig"
      // (buildUndoPatch) die Karte später auf ein Datum eine Ganzverschiebung
      // vor den Rest des Plans.
      ...(c.originalDate ? { movedFromDate: addDaysISO(c.originalDate, days) } : {}),
      ...(model.week ? { week: model.week, phase: model.phase ?? null } : {}),
    });
  }
  return { ok: true, patches };
}
