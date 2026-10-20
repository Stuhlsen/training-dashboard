/* ============================================================
   FEATURES/NUTRITION/DECISION-SEEN-STORAGE.TS — "Entscheidung gesehen" im Browser
   (Fahrplan 25 S2b, ausgelagert in Fahrplan 29 V3)

   Der localStorage-Teil des Entscheidungs-Banners (die Logik selbst steht rein in
   core/recipe-decisions.js). Ausgelagert, damit auch das Einreichformular einen
   Status als gesehen markieren kann: die Sofort-Freigabe eines verifizierten Autors
   soll das Banner nicht melden, er hat sie ja gerade selbst ausgelöst.
   Ohne localStorage (privates Fenster o. Ä.) passiert nichts — nur eine Bequemlichkeit.
   ============================================================ */

import { markSeen, parseSeen, seenKey, type SeenMap } from "../../core/recipe-decisions.js";

export function readSeen(userId: string): SeenMap {
  try {
    return parseSeen(localStorage.getItem(seenKey(userId)));
  } catch {
    return {}; // localStorage nicht verfügbar
  }
}

export function writeSeen(userId: string, seen: SeenMap): void {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    /* ignorieren — nur eine Bequemlichkeit */
  }
}

/** Merkt sich einen Status eines eigenen Rezepts als gesehen (ergänzt den gespeicherten Stand). */
export function markDecisionSeen(userId: string, recipe: { id: string; status: string }): void {
  writeSeen(userId, markSeen(readSeen(userId), [recipe]));
}
