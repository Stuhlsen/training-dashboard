/* Texte und Entscheidung für den Leer-Hinweis (Fahrplan 26 E4). */

export const NO_TRAINING_DATA_TEXT = "Für dein Profil sind noch keine Trainingsdaten angebunden.";
export const AWAITING_SYNC_TEXT = "Daten erscheinen nach dem nächsten Sync.";
export const MISSING_CREDENTIALS_TEXT =
  "Trage in den Einstellungen deinen intervals.icu-Key und deine Athlete-ID ein — danach erscheinen deine Daten nach dem nächsten Sync.";

/** Warum die Tabellen leer sind:
 *  - `missing-credentials`: eigenes Profil, intervals.icu noch nicht verbunden
 *  - `awaiting-sync`: eigenes Profil, Zugangsdaten da, Sync noch nicht gelaufen
 *  - `unknown`: fremdes Profil oder Zugangsdaten noch nicht geladen */
export type NoDataReason = "missing-credentials" | "awaiting-sync" | "unknown";

export function pickNoDataReason(input: {
  isSelf: boolean;
  credentialsLoading: boolean;
  hasCredentials: boolean;
}): NoDataReason {
  if (!input.isSelf || input.credentialsLoading) return "unknown";
  return input.hasCredentials ? "awaiting-sync" : "missing-credentials";
}
