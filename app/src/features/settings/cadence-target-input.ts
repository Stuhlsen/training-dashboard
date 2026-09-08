/* ============================================================
   FEATURES/SETTINGS/CADENCE-TARGET-INPUT.TS — reine Eingabeprüfung für das
   Kadenz-Ziel-Feld (TrainingTargetsSection, Fahrplan 11). Ausgelagert, damit
   die Grenzen 60–120, die Ganzzahl-Regel und der „leer ⇒ zurücksetzen"-Pfad
   ohne DOM testbar sind.
   ============================================================ */

import { CADENCE_TARGET_MIN, CADENCE_TARGET_MAX } from "../../api/hooks/useCadenceTarget";

export type CadenceTargetParse =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** `""` ⇒ `{ ok: true, value: null }` (zurück auf den Standard). Sonst eine
 *  Ganzzahl im erlaubten Bereich, andernfalls `{ ok: false, error }`. */
export function parseCadenceTargetInput(raw: string): CadenceTargetParse {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  const n = Number(trimmed);
  if (!Number.isInteger(n)) return { ok: false, error: "Bitte eine ganze Zahl eingeben (RPM)." };
  if (n < CADENCE_TARGET_MIN || n > CADENCE_TARGET_MAX) {
    return { ok: false, error: `Kadenz-Ziel zwischen ${CADENCE_TARGET_MIN} und ${CADENCE_TARGET_MAX} RPM.` };
  }
  return { ok: true, value: n };
}
