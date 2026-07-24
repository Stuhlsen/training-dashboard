/* ============================================================
   CORE/PROPOSAL-PAYLOAD.JS — payload (Schema-Konzept §3) → Karten-Shape
   (kein DOM)

   Eine Stelle für die Feldabbildung zwischen dem Vorschlags-`payload`
   (title/type/plan_date/target_tss/km/workout/note — Schema-Konzept §3) und
   der Session-Shape, die state/plan-cards.js für create/update erwartet
   (date/name/typ/tssPlanned/km/details/workout — s. ui/plan-card-dialog.js).
   Wird sowohl bei der echten Annahme (state/proposals.js) als auch bei der
   Vorschau-Simulation (core/proposal-preview.js) genutzt — eine Abbildung,
   kein Doppelcode.
   ============================================================ */

/** @param {Object} payload Vorschlags-Payload (add/replace)
 *  @returns {{date: string|undefined, name: string|undefined, typ: string|undefined,
 *             tssPlanned: number|null, km: number|null, details: string|null,
 *             workout: Object|null}} */
export function payloadToCardData(payload) {
  return {
    date: payload?.plan_date,
    name: payload?.title,
    typ: payload?.type,
    tssPlanned: payload?.target_tss ?? null,
    km: payload?.km ?? null,
    details: payload?.note ?? null,
    workout: payload?.workout ?? null,
  };
}
