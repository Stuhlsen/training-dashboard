/* ============================================================
   CORE/ATHLETE-SELECTION.JS — welcher Athlet ist aktiv, welche
   Einträge zeigt die Leiste (kein I/O)

   Die Leiste kennt die festen Plätze athlete1–athlete4 aus config.ts.
   Ein Account, der auf keinem Platz sitzt, bekommt zusätzlich einen
   eigenen Eintrag mit der reservierten ID `SELF_ATHLETE_ID` — die
   Leiste wächst damit nie mit der Accountzahl.

   Platz-Erkennung: Anzeigename des Profils == Pseudonym des Platzes
   (wie bisher in useAthleteSports/useAthleteProfileId).
   ============================================================ */

/** Reservierte ID des eigenen Eintrags (steht in keiner `ATHLETES`-Zeile). */
export const SELF_ATHLETE_ID = "self";

/** Beschriftung, solange das Profil keinen Anzeigenamen trägt. */
export const SELF_FALLBACK_NAME = "Ich";

/**
 * ID des Platzes, den dieser Anzeigename belegt — sonst null.
 * @param {ReadonlyArray<{ id: string, name: string }>} athletes
 * @param {string | null | undefined} displayName
 * @returns {string | null}
 */
export function findSlotId(athletes, displayName) {
  if (!displayName) return null;
  return athletes.find((a) => a.name === displayName)?.id ?? null;
}

/**
 * Einträge der Leiste: alle Plätze, plus der eigene Eintrag, wenn das
 * Profil geladen ist und keinen Platz belegt.
 * @param {{
 *   athletes: ReadonlyArray<{ id: string, name: string }>,
 *   selfProfile: { displayName?: string | null } | null,
 *   slotId: string | null,
 * }} input
 * @returns {Array<{ id: string, name: string }>}
 */
export function athleteOptions({ athletes, selfProfile, slotId }) {
  const options = athletes.map((a) => ({ id: a.id, name: a.name }));
  if (!selfProfile || slotId) return options;
  return [...options, { id: SELF_ATHLETE_ID, name: selfProfile.displayName?.trim() || SELF_FALLBACK_NAME }];
}

/**
 * Aktiver Athlet aus gespeicherter Wahl und Account-Zustand.
 *
 * - gespeicherter Platz bleibt (wie bisher, auch für fremde Plätze)
 * - gespeichert "self": gilt nur für Accounts ohne Platz; mit Platz → der
 *   eigene Platz, ausgeloggt → Primär-Athlet. Solange das Profil noch lädt,
 *   bleibt "self" stehen (kein Flackern über fremde Daten).
 * - nichts (oder Unbekanntes) gespeichert: Account ohne Platz startet auf
 *   dem eigenen Eintrag; alle anderen wie bisher auf dem Primär-Athleten
 *   (auch solange das Profil lädt — keine Leer-Ansicht für Bestandsnutzer).
 *
 * @param {{
 *   stored: string | null,
 *   validIds: readonly string[],
 *   primaryId: string,
 *   userKnown: boolean,
 *   selfProfile: object | null,
 *   slotId: string | null,
 * }} input
 * @returns {string}
 */
export function resolveActiveAthleteId({ stored, validIds, primaryId, userKnown, selfProfile, slotId }) {
  const hasSelfEntry = !!selfProfile && !slotId;

  if (stored === SELF_ATHLETE_ID) {
    if (!selfProfile) return userKnown ? SELF_ATHLETE_ID : primaryId;
    return hasSelfEntry ? SELF_ATHLETE_ID : (slotId ?? primaryId);
  }
  if (stored && validIds.includes(stored)) return stored;
  return hasSelfEntry ? SELF_ATHLETE_ID : primaryId;
}
