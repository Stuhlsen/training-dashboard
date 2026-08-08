/* ============================================================
   FEATURES/PLANNING/BLOCK-DIALOG-VIEW-MODEL.TS — reine Ableitungen für den
   Blockstart-Dialog (kein DOM, kein Fetch — Muster wie
   trainer-bar-view-model.ts/planning-view-model.ts).

   Port der Label-Tabellen und der Vorauswahl-Heuristik aus
   assets/js/ui/block-dialog.js (Etappe 7d). */

import type { SessionFormat } from "../../api/supabase/session-formats";

export const TARGET_SYSTEM_LABEL: Record<string, string> = {
  "aerob-ermuedungsresistenz": "Aerobe Ermüdungsresistenz",
  schwelle: "Schwelle",
  "laktat-clearance": "Laktat-Clearance",
  vo2max: "VO2max",
  neuromuskulaer: "Neuromuskulär",
};

export const EVIDENCE_GRADE_LABEL: Record<string, string> = {
  studienlage: "Studienlage",
  "coaching-konsens": "Coaching-Konsens",
};

/** Vorauswahl (E2: "eine vom System begründet vorausgewählte Option") —
 *  bevorzugt die besser belegte Familie (`studienlage` vor
 *  `coaching-konsens`), sonst die erste Kandidatin. */
export function defaultCandidate(candidates: SessionFormat[]): SessionFormat | null {
  return candidates.find((c) => c.evidenceGrade === "studienlage") ?? candidates[0] ?? null;
}
