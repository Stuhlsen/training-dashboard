/* ============================================================
   CORE/RECIPE-DECISIONS.JS — "neu entschieden"-Banner (Fahrplan 25, S2b)

   Kein Benachrichtigungssystem (E12/E17): die App merkt sich je Nutzer im
   Browser, bei welchem Status eines eigenen Rezepts sie den Hinweis schon
   gezeigt hat. Weicht der aktuelle Status ab und ist er `approved` oder
   `rejected`, gilt die Entscheidung als ungesehen. Reine Funktionen — das
   Lesen/Schreiben des localStorage macht die Aufrufstelle.
   ============================================================ */

/** @typedef {Record<string, string>} SeenMap  Rezept-ID → zuletzt gezeigter Status */

const DECIDED = new Set(["approved", "rejected"]);

/**
 * localStorage-Schlüssel je Nutzer.
 * @param {string} userId
 */
export const seenKey = (userId) => `recipe-decisions-seen:${userId}`;

/**
 * Gespeicherten Text lesen; alles Unbrauchbare wird zur leeren Map.
 * @param {string | null | undefined} raw
 * @returns {SeenMap}
 */
export function parseSeen(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string"));
  } catch {
    return {};
  }
}

/**
 * Entschiedene Rezepte, bei denen der Nutzer den aktuellen Status noch nicht gesehen hat.
 * @template {{ id: string, status: string }} R
 * @param {R[]} recipes
 * @param {SeenMap} seen
 * @returns {R[]}
 */
export function unseenDecisions(recipes, seen) {
  return recipes.filter((r) => DECIDED.has(r.status) && seen[r.id] !== r.status);
}

/**
 * Neue Map mit den gegebenen Rezepten als gesehen (das Original bleibt unverändert).
 * @param {SeenMap} seen
 * @param {{ id: string, status: string }[]} recipes
 * @returns {SeenMap}
 */
export function markSeen(seen, recipes) {
  return { ...seen, ...Object.fromEntries(recipes.map((r) => [r.id, r.status])) };
}
