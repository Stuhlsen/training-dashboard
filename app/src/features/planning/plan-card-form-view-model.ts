/* ============================================================
   FEATURES/PLANNING/PLAN-CARD-FORM-VIEW-MODEL.TS — reine Helfer für das
   Kartenformular (PlanCardForm) UND den Planungstab (Fahrplan 12 E3, G27:
   beide teilen sich dieses View-Model). Kein DOM, kein Fetch — Muster wie
   planning-view-model.ts / new-plan-dialog-view-model.ts.

   Fahrplan 12 W2: eine Laufkarte trägt `paceSec` (Ganzzahl Sekunden pro km)
   im `workout`-JSON; Ein-/Ausgabe im Formular als `mm:ss` ("4:30").
   `workout_structure` bleibt bei Lauf IMMER null (kein .zwo, kein Push).
   ============================================================ */

import { KNOWN_PLAN_TYPES } from "../../core/plan-config.js";
import { RUNNING_KNOWN_TYPES } from "../../sports/running/session-types";
import { athleteConfig } from "../../config";
import type { WorkoutBlock, WorkoutBlocks } from "./planning-view-model";
import type { PlanCard } from "../../api/types";

/** Vom Sport-Picker im Formular wählbare Sportarten — bewusst nur zwei
 *  (Fahrplan 12 G19: Schwimmen hat in Phase 2 keinen Formularpfad). */
export type PlanFormSport = "ride" | "run";

/** `mm:ss` → Ganzzahl Sekunden pro km. Leere/ungültige Eingabe ⇒ `null`.
 *  Sekunden 00–59 (zweistellig, mm:ss-Konvention), Minuten > 0. */
export function parsePaceInput(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  if (minutes <= 0) return null;
  return minutes * 60 + seconds;
}

/** Ganzzahl Sekunden pro km → `mm:ss` (Round-Trip mit `parsePaceInput`). */
export function formatPaceSec(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Typenliste je Sportart: Rad ⇒ `KNOWN_PLAN_TYPES`, Lauf ⇒
 *  `RUNNING_KNOWN_TYPES` (`sports/running/session-types.ts`). */
export function planTypesForSport(sport: PlanFormSport): readonly string[] {
  return sport === "run" ? RUNNING_KNOWN_TYPES : KNOWN_PLAN_TYPES;
}

/** Zeigt das Formular den Sport-Picker? Nur bei Athleten mit > 1 Sportart
 *  (Fahrplan 12 G20) — Athlet 1/2/4 (`sports` fehlt oder `["ride"]`) sehen
 *  ihn nie. */
export function showSportPicker(athleteId: string): boolean {
  const sports = athleteConfig(athleteId)?.sports;
  return sports != null && sports.length > 1;
}

/** Lauf-Workout-JSON: Freitext-Blöcke (unverändert, G21) plus optionale
 *  `paceSec` (nur wenn gesetzt). */
export interface RunWorkoutJson {
  blocks?: WorkoutBlock[];
  paceSec?: number;
}

/** Baut das `workout`-JSON fürs Speichern:
 *  - Rad: unverändert — `{ blocks }` bei vorhandenen Blöcken, sonst `null`.
 *  - Lauf: `{ blocks?, paceSec? }` — `paceSec` nur wenn gesetzt, `blocks` nur
 *    wenn vorhanden; ganz ohne beides ⇒ `null`.
 *  `workout_structure` wird hier nie erzeugt (bleibt bei Lauf IMMER null). */
export function workoutForSave(
  sport: PlanFormSport,
  blocks: WorkoutBlock[],
  paceSec: number | null,
): WorkoutBlocks | RunWorkoutJson | null {
  const hasBlocks = blocks.length > 0;
  if (sport === "run") {
    if (!hasBlocks && paceSec == null) return null;
    const workout: RunWorkoutJson = {};
    if (hasBlocks) workout.blocks = blocks;
    if (paceSec != null) workout.paceSec = paceSec;
    return workout;
  }
  return hasBlocks ? { blocks } : null;
}

/** Zielpace einer Karte (Sekunden pro km) aus dem `workout`-JSON — schmaler
 *  Cast statt `WorkoutJson`-Umbau (Fahrplan 12: W2, „paceSec über schmalen
 *  Cast lesen"). `null`, wenn keine Pace hinterlegt ist. */
export function paceSecOf(card: PlanCard | null | undefined): number | null {
  const workout = card?.workout as { paceSec?: number } | null | undefined;
  return typeof workout?.paceSec === "number" ? workout.paceSec : null;
}
