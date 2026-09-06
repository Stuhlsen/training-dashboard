/* ============================================================
   CORE/COACH-EXCHANGE-OUTCOME.JS — Ausgang einer KI-Coach-Runde ableiten
   (kein DOM, kein I/O)
   (Fahrplan 9 Etappe B — docs/fahrplan-9-coach-loop.md, "Geteilte Verträge")

   Der Ausgang einer `coach_exchanges`-Zeile wird NICHT gespeichert, sondern
   beim Laden aus den verknüpften `proposals` (gleiche `group_id`) abgeleitet
   — sonst würde er driften, sobald ein Vorschlag der Runde später einzeln
   entschieden wird. Diese Funktion ist die eine Stelle mit dieser Regel;
   der Hook (useCoachExchanges) ruft sie beim Join.
   ============================================================ */

const DECIDED_ACCEPTED = new Set(["accepted"]);
const DECIDED_REJECTED = new Set(["rejected", "withdrawn", "stale"]);

/** @typedef {"pending"|"accepted"|"rejected"|"mixed"|"empty"} CoachExchangeOutcome */

/** Leitet den Ausgang aus den Vorschlägen derselben Import-Runde ab.
 *  @param {string|null} proposalGroupId  `coach_exchanges.proposal_group_id`
 *    — `null`, wenn Claude in dieser Runde nichts vorschlug.
 *  @param {Array<{groupId: string|null, status: string}>} proposals  ALLE
 *    Vorschläge des Athleten (der Aufrufer filtert nicht vor).
 *  @returns {CoachExchangeOutcome}
 *    - `empty`    — kein verknüpfter Vorschlag (groupId ist null)
 *    - `pending`  — Vorschläge da, aber (noch) keiner entschieden
 *    - `accepted` — alle entschiedenen Vorschläge angenommen
 *    - `rejected` — alle entschiedenen Vorschläge abgelehnt/zurückgezogen/veraltet
 *    - `mixed`    — teils angenommen, teils abgelehnt (oder offen + entschieden gemischt) */
export function deriveCoachExchangeOutcome(proposalGroupId, proposals) {
  if (proposalGroupId == null) return "empty";

  const group = (proposals || []).filter((p) => p.groupId === proposalGroupId);
  // groupId gesetzt, aber im geladenen Stand nichts gefunden (proposals noch
  // nicht geladen / anderer Cache) — die Zeilen existieren, also konservativ
  // als "läuft noch" behandeln statt fälschlich "kein Vorschlag".
  if (!group.length) return "pending";

  const decided = group.filter((p) => p.status !== "open");
  if (!decided.length) return "pending";

  const allAccepted = decided.every((p) => DECIDED_ACCEPTED.has(p.status));
  const allRejected = decided.every((p) => DECIDED_REJECTED.has(p.status));

  // Ein offen gebliebener Vorschlag neben schon entschiedenen ⇒ noch nicht
  // fertig entschieden ⇒ "mixed" (nicht "pending": es ist bereits etwas passiert).
  const hasOpen = group.length > decided.length;

  if (allAccepted && !hasOpen) return "accepted";
  if (allRejected && !hasOpen) return "rejected";
  return "mixed";
}
