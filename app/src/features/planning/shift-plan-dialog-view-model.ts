/* ============================================================
   FEATURES/PLANNING/SHIFT-PLAN-DIALOG-VIEW-MODEL.TS — reine Vorschau- und
   Validierungslogik für „Plan verschieben…" (Migration 0026, Punkt 1).

   Kein React: rechnet aus „gespeicherter Offset + N Wochen" den Ziel-Offset,
   die betroffenen Karten (über core/plan-shift.js, dieselbe Quelle wie der
   Schreibpfad useShiftPlan) und ein neues Startdatum für die Vorschau.
   Die Komponente rendert nur.

   NUR nach hinten ("später starten", positives N): das war die Anfrage
   ("eine Woche nach vorne verschieben" = später anfangen). Eine
   Rückwärts-Verschiebung würde Vorlagen-Datumsschlüssel kollidieren lassen
   und ist bewusst nicht angeboten (s. docs/offene-punkte.md).
   ============================================================ */

import { planShiftPatches, PLAN_OFFSET_MAX } from "../../core/plan-shift.js";
import { addDaysISO } from "../../core/format.js";

interface ShiftCard {
  id: string;
  date: string;
  name?: string | null;
  cancelled?: boolean;
  originalDate?: string;
}

export interface ShiftPreview {
  /** Neuer `plan_offset_weeks`-Stand, den useShiftPlan gesetzt bekäme. */
  targetOffset: number;
  /** Verschiebung gegenüber JETZT (immer positiv = später). */
  deltaWeeks: number;
  /** Zahl der künftigen, nicht ausgefallenen Karten, die umdatiert würden. */
  affectedCount: number;
  /** Frühestes betroffenes Datum nach der Verschiebung (ISO) — Vorschau
   *  „neuer Start", `null` wenn nichts betroffen ist. */
  newStartDate: string | null;
  canApply: boolean;
  /** Grund, warum `canApply` false ist — sonst `null`. */
  error: string | null;
}

export function shiftPreview(opts: {
  storedOffset: number;
  weeks: number;
  cards: ShiftCard[];
  todayISO: string;
  athleteId: string;
}): ShiftPreview {
  const { storedOffset, weeks, cards, todayISO, athleteId } = opts;
  const delta = Math.max(0, Math.round(weeks || 0));
  const target = storedOffset + delta;

  const base = { targetOffset: target, deltaWeeks: delta, affectedCount: 0, newStartDate: null };

  if (delta === 0) return { ...base, canApply: false, error: null };
  if (target > PLAN_OFFSET_MAX) {
    return { ...base, canApply: false, error: `Insgesamt maximal ${PLAN_OFFSET_MAX} Wochen Verschiebung möglich.` };
  }

  const plan = planShiftPatches(cards, delta, todayISO, athleteId, target);
  if (!plan.ok) return { ...base, canApply: false, error: plan.reason };
  if (!plan.patches.length) {
    return { ...base, canApply: false, error: "Keine künftigen Einheiten zum Verschieben." };
  }

  const futureDates = cards
    .filter((c) => c && !c.cancelled && typeof c.date === "string" && c.date >= todayISO)
    .map((c) => c.date)
    .sort();
  const newStartDate = futureDates.length ? addDaysISO(futureDates[0], delta * 7) : null;

  return { targetOffset: target, deltaWeeks: delta, affectedCount: plan.patches.length, newStartDate, canApply: true, error: null };
}
