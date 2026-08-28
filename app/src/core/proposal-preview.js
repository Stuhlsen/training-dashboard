/* ============================================================
   CORE/PROPOSAL-PREVIEW.JS — Prognose-Auswirkung EINES Vorschlags
   (kein DOM) — Vorschlags-Schema-Konzept §5: "Prognose-Auswirkung aus dem
   Phase-3-Konfliktmodul" in der Vergleichsansicht.

   Wendet einen einzelnen Vorschlag HYPOTHETISCH auf eine Kopie der
   Kartenliste an (keine Mutation der Eingabe, kein Schreibzugriff) und lässt
   core/projection.js + core/conflicts.js zweimal laufen — vorher/nachher.
   Die UI (ui/proposal-compare.js) zeigt daraus TSB-Delta + neue/gelöste
   Konflikte, exakt wie das Nach-Drop-Feedback in core/plan-feedback.js für
   echte Änderungen.
   ============================================================ */

import { projectLoad } from "./projection.js";
import { detectConflicts } from "./conflicts.js";
import { payloadToCardData } from "./proposal-payload.js";

/** Kopie der Kartenliste MIT dem Vorschlag angewendet — reine Funktion,
 *  `cards` bleibt unverändert. Karten ohne bekannten `op` (sollte durch den
 *  Validator nie vorkommen) liefern die Liste unverändert zurück. */
export function applyProposalToCards(cards, proposal) {
  const list = cards || [];
  const { op, targetCardId, payload } = proposal;

  if (op === "add") {
    const c = payloadToCardData(payload);
    return [
      ...list,
      {
        id: `preview-${proposal.id}`,
        date: c.date,
        typ: c.typ,
        tssPlanned: c.tssPlanned,
        workout: c.workout,
        cancelled: false,
      },
    ];
  }

  if (op === "replace") {
    const c = payloadToCardData(payload);
    return list.map((card) =>
      card.id === targetCardId
        ? { ...card, date: c.date ?? card.date, typ: c.typ ?? card.typ, tssPlanned: c.tssPlanned, workout: c.workout }
        : card
    );
  }

  if (op === "move") {
    // movePlanCard() reaktiviert eine ausgefallene Karte implizit als
    // geplant (state/plan-cards.js-Kommentar) — die Vorschau muss dasselbe
    // tun, sonst zeigt sie eine ausgefallene Karte weiterhin als
    // lastfrei, obwohl sie nach Annahme wieder TSS beisteuert.
    return list.map((card) =>
      card.id === targetCardId ? { ...card, date: payload?.plan_date ?? card.date, cancelled: false } : card
    );
  }

  if (op === "cancel") {
    return list.map((card) => (card.id === targetCardId ? { ...card, cancelled: true } : card));
  }

  return list;
}

/**
 * Prognose vor/nach Annahme eines einzelnen Vorschlags.
 * @param {Object} proposal
 * @param {{cards: Array, actuals: Array, events?: Array, ftp?: number, today?: string, athleteId?: string}} ctx
 *   `today` optional (Default localISODate() in core/projection.js) — für Tests fixierbar,
 *   sonst wandert der Horizont mit dem Kalenderdatum, an dem der Test läuft.
 *   `athleteId` (Fahrplan 6, RUH3): an detectConflicts durchgereicht, damit
 *   abgeleitete Ruhe-Slots ohne Karte auch in der Vorschau als „bewusst frei"
 *   statt als Planungslücke gewertet werden.
 * @returns {{before: ReturnType<typeof projectLoad>, after: ReturnType<typeof projectLoad>,
 *            beforeConflicts: Array, afterConflicts: Array}}
 */
export function previewProposal(proposal, { cards, actuals, events = [], ftp, today, athleteId } = {}) {
  const before = projectLoad(cards, actuals, { events, ftp, today });
  const beforeConflicts = detectConflicts(before, cards, events, actuals, { athleteId });
  const afterCards = applyProposalToCards(cards, proposal);
  const after = projectLoad(afterCards, actuals, { events, ftp, today });
  const afterConflicts = detectConflicts(after, afterCards, events, actuals, { athleteId });
  return { before, after, beforeConflicts, afterConflicts };
}
