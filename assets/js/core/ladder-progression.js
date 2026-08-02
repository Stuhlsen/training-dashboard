/* ============================================================
   CORE/LADDER-PROGRESSION.JS — Fortschreibungsregel (C3), NUR Trockenlauf
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md D4a)

   NICHT scharf geschaltet: wird ausschließlich vom lokalen Backtest
   (scripts/backtest-ladder.js) aufgerufen, nicht aus generate-data.js,
   state/export.js oder sonst einem Live-Pfad. Reine Entscheidungsfunktion
   (Ampel + Sperren → "up"/"hold"/"down") — schreibt selbst nichts, der
   Aufrufer entscheidet, was mit dem Ergebnis passiert (C3.1: im Trockenlauf
   gar nichts, produktiv erst nach Freigabe direkt in ladder_history).
   ============================================================ */

import { LADDER_PROGRESSION } from "./plan-config.js";

/**
 * Sperren aus C3 — "Stufe bleibt, unabhängig von der Ampel": eine Sperre
 * überschreibt sowohl ein Hochstufen als auch ein Zurückstufen, nicht nur
 * das Hochstufen (wörtlich "unabhängig von der Ampel", nicht "nur bei
 * grün").
 * @param {{
 *   isRecoveryWeek?: boolean,
 *   governorLevel?: "green"|"yellow"|"red"|null,
 *   projectedRampCtl?: number|null,
 *   alreadyUpgradedThisWeek?: boolean,
 * }} [ctx]
 * @returns {{locked: boolean, reasons: string[]}}
 */
export function evaluateLocks({
  isRecoveryWeek = false,
  governorLevel = null,
  projectedRampCtl = null,
  alreadyUpgradedThisWeek = false,
} = {}) {
  const reasons = [];
  if (isRecoveryWeek) reasons.push("erholungswoche");
  if (governorLevel === "red") reasons.push("governor-rot");
  if (projectedRampCtl != null && projectedRampCtl > LADDER_PROGRESSION.ctlRampLockThreshold) {
    reasons.push("ctl-rampe");
  }
  if (alreadyUpgradedThisWeek) reasons.push("bereits-hochgestuft-diese-woche");
  return { locked: reasons.length > 0, reasons };
}

/**
 * C3: grün → +1, gelb → halten, rot → −1 — außer eine Sperre greift
 * (→ halten, s. evaluateLocks). C2.1: RPE ≥ rpeUpgradeBlockMin bei sonst
 * grüner Einheit verhindert zusätzlich das Hochstufen (→ halten), wertet
 * die Einheit aber nicht bis rot ab.
 * @param {{rating: "green"|"yellow"|"red", rpe?: number|null, locked?: boolean}} ctx
 * @returns {"up"|"hold"|"down"}
 */
export function nextStep({ rating, rpe = null, locked = false }) {
  if (locked) return "hold";
  if (rating === "red") return "down";
  if (rating === "yellow") return "hold";
  if (rpe != null && rpe >= LADDER_PROGRESSION.rpeUpgradeBlockMin) return "hold";
  return "up";
}
