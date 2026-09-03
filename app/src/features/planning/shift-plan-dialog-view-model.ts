/* ============================================================
   FEATURES/PLANNING/SHIFT-PLAN-DIALOG-VIEW-MODEL.TS — reine Vorschau- und
   Validierungslogik für „Plan verschieben…" (Migration 0026, Punkt 1).

   Kein React: rechnet aus „gespeicherter Offset + Richtung + N Wochen" den
   Ziel-Offset, die betroffenen Karten (über core/plan-shift.js, dieselbe
   Quelle wie der Schreibpfad useShiftPlan) und ein neues Startdatum für die
   Vorschau. Die Komponente rendert nur.
   ============================================================ */

import { planShiftPatches } from "../../core/plan-shift.js";
import { addDaysISO } from "../../core/format.js";

export type ShiftDirection = "later" | "earlier";

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
  /** Verschiebung gegenüber JETZT (positiv = später). */
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

const MIN_OFFSET = -8;
const MAX_OFFSET = 12;

export function shiftPreview(opts: {
  storedOffset: number;
  direction: ShiftDirection;
  weeks: number;
  cards: ShiftCard[];
  todayISO: string;
  athleteId: string;
}): ShiftPreview {
  const { storedOffset, direction, weeks, cards, todayISO, athleteId } = opts;
  const n = Math.max(0, Math.round(weeks || 0));
  const delta = direction === "later" ? n : -n;
  const target = storedOffset + delta;

  const base = { targetOffset: target, deltaWeeks: delta, affectedCount: 0, newStartDate: null };

  if (delta === 0) return { ...base, canApply: false, error: null };
  if (target < MIN_OFFSET || target > MAX_OFFSET) {
    return { ...base, canApply: false, error: `Verschiebung außerhalb des zulässigen Bereichs (${MIN_OFFSET}…${MAX_OFFSET} Wochen).` };
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
