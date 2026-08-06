/* ============================================================
   CORE/PROPOSAL-SUMMARY.JS — kompakte Prognose-Kurzfassung (kein DOM)
   (Vorschlags-Schema-Konzept §5, Mockup 2: "TSB +6 → +11" / "löst K-OVERLAP")

   Nimmt das Ergebnis von core/proposal-preview.js::previewProposal() und
   verdichtet es auf einen kurzen Text für die Vorschlagsliste — dieselbe
   Vorher/Nachher-Logik wie die volle Vergleichsansicht, nur eine Zeile statt
   Delta-Banner + Badges.
   ============================================================ */

import { horizonRaceEvent, tsbOnDate } from "./plan-feedback.js";

/** Identität eines Konfliktbefunds für Vorher/Nachher-Vergleiche (Regel +
 *  betroffene Daten) — exportiert, damit ui/proposal-compare.js dieselbe
 *  Formel nutzt statt sie ein zweites Mal zu tippen. */
export function conflictKey(c) {
  return `${c.rule}|${c.dates.join(",")}`;
}

/**
 * @param {{before: Object, after: Object, beforeConflicts: Array, afterConflicts: Array}} preview
 * @param {Array} events
 * @param {string} todayIso
 * @returns {string|null} z. B. "TSB GFNY: -4 → +5" oder "löst K-OVERLAP" — null
 *   wenn weder ein Eventtag-TSB-Unterschied noch ein Konfliktwechsel sichtbar ist.
 */
export function summarizeProposalImpact({ before, after, beforeConflicts, afterConflicts }, events, todayIso) {
  const event = horizonRaceEvent(events, after, todayIso);
  if (event) {
    const b = tsbOnDate(before, event.eventDate);
    const a = tsbOnDate(after, event.eventDate);
    if (b != null && a != null && Math.round(b) !== Math.round(a)) {
      return `TSB ${event.title || "Event"}: ${Math.round(b)} → ${Math.round(a)}`;
    }
  }

  const afterKeys = new Set(afterConflicts.map(conflictKey));
  const resolved = beforeConflicts.find((c) => !afterKeys.has(conflictKey(c)));
  if (resolved) return `löst ${resolved.rule}`;

  const beforeKeys = new Set(beforeConflicts.map(conflictKey));
  const introduced = afterConflicts.find((c) => !beforeKeys.has(conflictKey(c)));
  if (introduced) return `verursacht ${introduced.rule}`;

  return null;
}
