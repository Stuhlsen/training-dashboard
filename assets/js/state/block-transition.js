/* ============================================================
   STATE/BLOCK-TRANSITION.JS — Blockstart-Dialog-Erkennung (D3/E2)
   (docs/konzept-progressionssteuerung.md L1.1, L9)

   Architekturentscheidung Fenster D: nutzt ladder_history selbst als
   Marker "schon entschieden", statt einen neuen Persistenzmechanismus
   ("letzter gesehener Block") einzuführen — ein Block gilt als bereits
   entschieden, wenn seit seinem (per core/periodization.js::blockStartDate
   angenäherten) Beginn schon ein reason='block-start'-Eintrag für eine der
   zulässigen Familien existiert.
   ============================================================ */

import { currentBlockTarget, blockStartDate } from "../core/periodization.js";
import { localISODate, addDaysISO } from "../core/format.js";
import { getState as getPlanCardsState } from "./plan-cards.js";
import { getSessionFormats, getAthleteFormats } from "./formats.js";
import { getLadderHistory } from "./ladder.js";

/**
 * Prüft, ob der Blockstart-Dialog (E2) jetzt erscheinen soll: das Blockziel
 * hat sich ggü. vor 7 Tagen geändert (grobe "steht ein neuer Block an"-
 * Heuristik), UND kein `block-start`-Eintrag seit Blockbeginn vorhanden,
 * UND mehr als eine für Blockziel+Athlet zulässige+aktive Familie (L1.1).
 * @returns {Promise<{shouldPrompt: boolean, blockTarget?: string|null,
 *   candidates?: Array<{id:string, label:string, evidenceGrade:string, blockTargets:string[], axes:Object}>}>}
 */
export async function detectBlockTransition() {
  const today = localISODate();
  const cards = getPlanCardsState().cards || [];

  const blockTarget = currentBlockTarget(cards, today);
  if (!blockTarget) return { shouldPrompt: false };

  const targetSevenDaysAgo = currentBlockTarget(cards, addDaysISO(today, -7));
  if (targetSevenDaysAgo === blockTarget) return { shouldPrompt: false };

  const [catalogResult, athleteFormatsResult, historyResult] = await Promise.all([
    getSessionFormats(),
    getAthleteFormats(),
    getLadderHistory(),
  ]);
  if (!catalogResult.ok || !athleteFormatsResult.ok || !historyResult.ok) return { shouldPrompt: false };

  const activeFormatIds = new Set(athleteFormatsResult.athleteFormats.filter((af) => af.active).map((af) => af.formatId));
  const candidates = catalogResult.formats.filter(
    (f) => activeFormatIds.has(f.id) && f.blockTargets.includes(blockTarget),
  );
  if (candidates.length <= 1) return { shouldPrompt: false };

  const start = blockStartDate(cards, today) ?? today;
  const alreadyDecided = historyResult.history.some(
    (h) => h.reason === "block-start" && h.validFrom >= start && candidates.some((c) => c.id === h.formatId),
  );
  if (alreadyDecided) return { shouldPrompt: false };

  return { shouldPrompt: true, blockTarget, candidates };
}
