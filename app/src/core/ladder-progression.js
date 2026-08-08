/* ============================================================
   CORE/LADDER-PROGRESSION.JS — Fortschreibungsregel (C3), D4a-Trockenlauf
   + D4b-Preset-Logik (C4)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md)

   evaluateLocks()/nextStep(): reine Entscheidungsfunktion (Ampel + Sperren
   → "up"/"hold"/"down"), NICHT scharf geschaltet — wird vom lokalen
   Backtest (scripts/backtest-ladder.js) und von presetAction() (unten)
   aufgerufen, schreibt selbst nichts.

   presetAction() (D4b, Auftrag "Preset-Umstellung, scharf geschaltet nur
   für Athlet 1"): bildet C4 ("Bedeutung der Presets nach dem Umbau") auf
   evaluateLocks/nextStep ab. Bleibt wie die beiden anderen Funktionen eine
   reine Entscheidungsfunktion, die selbst nichts schreibt — der
   Freigabe-Check ("gilt das für diesen Athleten scharf oder nur
   beobachtend?", profiles.ladder_progression_enabled, Migration 0016)
   passiert eine Ebene höher in state/ladder.js::getPresetSuggestion(), weil
   core/ niemals auf eine Datenquelle zugreift (Schichtenregel). Ein
   automatischer Schreibpfad, der bei "up"/"down" selbst recordLadderStep()
   aufruft, ist bewusst NICHT Teil dieses Fensters (s. Bericht zum
   D4b-Auftrag) — presetAction() liefert nur den Vorschlag.
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

/** C3-Vorschlag aus der zuletzt gematchten Einheit dieses Formats, in
 *  `{step, action}` übersetzt — der gemeinsame Rechenweg für die Presets
 *  "Allgemein prüfen"/"Auf Event hin" (außerhalb des Tapers), s. C4. */
function fromRating(currentStep, { rating, rpe, locked }) {
  const action = nextStep({ rating, rpe, locked });
  const step = action === "up" ? currentStep + 1 : action === "down" ? Math.max(1, currentStep - 1) : currentStep;
  return { step, action };
}

/**
 * C4 — "Bedeutung der Presets nach dem Umbau": derselbe Stufenvorschlag wie
 * evaluateLocks/nextStep, jetzt danach unterschieden, welches Export-Preset
 * gewählt ist (`ui/export-panel.js::PRESETS`-Keys: general/event/check/
 * reduce/build). D5: ein Testtermin (`isTestEvent`) friert die Leiter
 * IMMER ein, unabhängig vom Preset — Familienwahl/Leiter sollen laut D5
 * nicht auf einen reinen Messtermin hin umgebaut werden.
 *
 * `lockWeeks` bei "reduce" ist in diesem Fenster (D4b) reine Metadaten für
 * den Aufrufer — eine tatsächlich über zwei Kalenderwochen wirksame Sperre
 * bräuchte entweder einen neuen `ladder_history.reason`-Wert oder ein
 * eigenes Tracking-Feld und ist bewusst nicht Teil dieses Auftrags (s.
 * Abschlussbericht).
 *
 * @param {"general"|"event"|"check"|"reduce"|"build"} preset
 * @param {{
 *   currentStep: number,
 *   rating?: "green"|"yellow"|"red"|null,
 *   rpe?: number|null,
 *   locked?: boolean,
 *   isTestEvent?: boolean,
 *   inTaper?: boolean,
 * }} ctx
 * @returns {{step: number, action: "up"|"hold"|"down", lockWeeks?: number}}
 */
export function presetAction(preset, { currentStep, rating = null, rpe = null, locked = false, isTestEvent = false, inTaper = false } = {}) {
  if (isTestEvent) return { step: currentStep, action: "hold" };
  switch (preset) {
    case "build":
      // Aufbau steigern: Stufe +1, sofern keine Sperre greift.
      return locked ? { step: currentStep, action: "hold" } : { step: currentStep + 1, action: "up" };
    case "reduce":
      // Entlasten: Stufe −1 UND Sperre für zwei Wochen (s. Kopfkommentar).
      return { step: Math.max(1, currentStep - 1), action: "down", lockWeeks: 2 };
    case "check":
      // Nur prüfen: keine Stufenänderung, nur Plausibilität (Guardrails,
      // nicht Teil dieser Funktion).
      return { step: currentStep, action: "hold" };
    case "event":
      // Auf Event hin: Leiter läuft normal bis Taper-Beginn, danach eingefroren.
      return inTaper ? { step: currentStep, action: "hold" } : fromRating(currentStep, { rating, rpe, locked });
    case "general":
    default:
      // Allgemein prüfen: Stufe aus C3 vorschlagen.
      return fromRating(currentStep, { rating, rpe, locked });
  }
}
