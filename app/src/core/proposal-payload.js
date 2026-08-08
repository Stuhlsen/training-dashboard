/* ============================================================
   CORE/PROPOSAL-PAYLOAD.JS — payload (Schema-Konzept §3) → Karten-Shape
   (kein DOM)

   Eine Stelle für die Feldabbildung zwischen dem Vorschlags-`payload`
   (title/type/plan_date/target_tss/km/workout/workout_structure/note —
   Schema-Konzept §3, workout_structure aus D1) und der Session-Shape, die
   state/plan-cards.js für create/update erwartet (date/name/typ/
   tssPlanned/km/details/workout/workoutStructure — s. ui/plan-card-dialog.js).
   Wird sowohl bei der echten Annahme (state/proposals.js) als auch bei der
   Vorschau-Simulation (core/proposal-preview.js) genutzt — eine Abbildung,
   kein Doppelcode.
   ============================================================ */

/** @param {Object} payload Vorschlags-Payload (add/replace)
 *  @returns {{date: string|undefined, name: string|undefined, typ: string|undefined,
 *             tssPlanned: number|null, km: number|null, details: string|null,
 *             workout: Object|null, workoutStructure: Object|null}} */
export function payloadToCardData(payload) {
  return {
    date: payload?.plan_date,
    name: payload?.title,
    typ: payload?.type,
    tssPlanned: payload?.target_tss ?? null,
    km: payload?.km ?? null,
    details: payload?.note ?? null,
    workout: payload?.workout ?? null,
    workoutStructure: payload?.workout_structure ?? null,
  };
}

/** Baut die Argumente für state/proposals.js::createTrainerProposal() aus
 *  einer Karte + neuem Datum/Grund — Trainer-Vorschlag "move" (Verschieben-
 *  Formular in ui/planned.js, Trainer-Sicht-Konzept §3/T2: Verschieben ist
 *  toggle-gesteuert, kein Direktschreiben mehr im Vorschlag-Modus). Reine
 *  Funktion, damit dieser Teil der Logik ohne DOM testbar ist — ui/planned.js
 *  ruft nur noch createTrainerProposal(athleteId, moveProposalArgs(...)) auf.
 *  @param {{id: string, updatedAt?: string}|null|undefined} card
 *  @param {string} newDate
 *  @param {string} [reason]
 *  @returns {{op: "move", targetCardId: string|null, targetUpdatedAt: string|null,
 *             payload: {plan_date: string}, reason: string|null}} */
export function moveProposalArgs(card, newDate, reason) {
  return {
    op: "move",
    targetCardId: card?.id ?? null,
    targetUpdatedAt: card?.updatedAt ?? null,
    payload: { plan_date: newDate },
    reason: reason || null,
  };
}

/** Dasselbe für "cancel" (Ausfallen-Formular in ui/planned.js).
 *  @param {{id: string, updatedAt?: string}|null|undefined} card
 *  @param {string} [reason]
 *  @returns {{op: "cancel", targetCardId: string|null, targetUpdatedAt: string|null,
 *             payload: {reason: string|null}, reason: string|null}} */
export function cancelProposalArgs(card, reason) {
  return {
    op: "cancel",
    targetCardId: card?.id ?? null,
    targetUpdatedAt: card?.updatedAt ?? null,
    payload: { reason: reason || null },
    reason: reason || null,
  };
}

/** Spiegelbild von payloadToCardData() — Session-Shape (wie ui/plan-card-dialog.js
 *  sie fürs Anlegen/Bearbeiten baut) → Vorschlags-payload. Genutzt für Etappe-7a
 *  T2 (Trainer-Sicht-Konzept §3): Neuanlage ist für den Trainer IMMER Vorschlag,
 *  unabhängig vom Direkt/Vorschlag-Umschalter.
 *  @param {{date?: string, name?: string|null, typ?: string|null, tssPlanned?: number|null,
 *           km?: number|null, details?: string|null, workout?: unknown}} cardData
 *  @param {string} [reason]
 *  @returns {{op: "add", targetCardId: null, targetUpdatedAt: null, payload: {
 *             plan_date: string|undefined, title: string|null|undefined, type: string|null|undefined,
 *             target_tss: number|null, km: number|null, note: string|null, workout: unknown},
 *             reason: string|null}} */
export function addProposalArgs(cardData, reason) {
  return {
    op: "add",
    targetCardId: null,
    targetUpdatedAt: null,
    payload: {
      plan_date: cardData?.date,
      title: cardData?.name,
      type: cardData?.typ,
      target_tss: cardData?.tssPlanned ?? null,
      km: cardData?.km ?? null,
      note: cardData?.details ?? null,
      workout: cardData?.workout ?? null,
    },
    reason: reason || null,
  };
}

/** Dasselbe für "replace" (Bearbeiten einer bestehenden Karte).
 *  @param {{id: string, updatedAt?: string}|null|undefined} card
 *  @param {{date?: string, name?: string|null, typ?: string|null, tssPlanned?: number|null,
 *           km?: number|null, details?: string|null, workout?: unknown}} cardData
 *  @param {string} [reason]
 *  @returns {{op: "replace", targetCardId: string|null, targetUpdatedAt: string|null, payload: {
 *             plan_date: string|undefined, title: string|null|undefined, type: string|null|undefined,
 *             target_tss: number|null, km: number|null, note: string|null, workout: unknown},
 *             reason: string|null}} */
export function replaceProposalArgs(card, cardData, reason) {
  return {
    op: "replace",
    targetCardId: card?.id ?? null,
    targetUpdatedAt: card?.updatedAt ?? null,
    payload: {
      plan_date: cardData?.date,
      title: cardData?.name,
      type: cardData?.typ,
      target_tss: cardData?.tssPlanned ?? null,
      km: cardData?.km ?? null,
      note: cardData?.details ?? null,
      workout: cardData?.workout ?? null,
    },
    reason: reason || null,
  };
}
