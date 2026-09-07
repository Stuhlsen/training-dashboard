/* ============================================================
   SPORTS/INDEX.TS — Registry (Etappe 3, Konzept G5)

   Genau EIN Eintrag. Die Registry existiert, damit ein zweites Profil
   danebenstehen KÖNNTE, nicht weil eins geplant wäre — der Nachweis,
   dass der Vertrag das trägt, steht als Fixture in registry.test.ts
   statt als ausgelieferter toter Code.

   Kein Zustand, keine Auswahl zur Laufzeit: solange es ein Profil gibt,
   liest core/ seine Werte direkt aus `cycling/`. Erst wenn eine zweite
   Sportart echte Daten bekommt, wird die Frage relevant, woher die
   Zuordnung kommt (dann auch die `sport`-Spalte, s. docs/offene-punkte.md).
   ============================================================ */

import type { SportProfile } from "./types.js";
import { cyclingProfile, CYCLING_SPORT_ID } from "./cycling/index.js";

export type { SportProfile } from "./types.js";

export const DEFAULT_SPORT_ID = CYCLING_SPORT_ID;

export const SPORTS: Readonly<Record<string, SportProfile>> = Object.freeze({
  [CYCLING_SPORT_ID]: cyclingProfile,
});

/** Profil zu einer Sportart-ID. Unbekannte ID → `null` (kein Wurf) —
 *  eine fehlende Sportart ist ein Konfigurationsfehler des Aufrufers,
 *  kein Ausnahmefall, der die Rechenkette abreißen lassen sollte.
 *
 *  `Object.hasOwn` statt eines bloßen Indexzugriffs: `SPORTS["constructor"]`
 *  läge sonst auf der geerbten Object-Funktion und käme als vermeintliches
 *  Profil zurück (von registry.test.ts beim Schreiben genau so gefangen). */
export function getSport(id: string): SportProfile | null {
  return Object.hasOwn(SPORTS, id) ? SPORTS[id] : null;
}

/** Das Profil, mit dem gerechnet wird, solange nichts anderes gewählt ist. */
export function defaultSport(): SportProfile {
  return SPORTS[DEFAULT_SPORT_ID];
}

/** Der `sport`-Feldwert einer Aktivität ("ride"|"run"|"swim"|"other",
 *  Fahrplan 10 Vertrag V2) → Profil-ID der Registry. Bewusst getrennt vom
 *  Feldvokabular: "ride" löst auf die bestehende Profil-ID "cycling" auf,
 *  die NICHT umbenannt wird. */
const SPORT_TO_PROFILE_ID: Readonly<Record<string, string>> = Object.freeze({
  ride: CYCLING_SPORT_ID,
  // run/swim bekommen ihr Profil erst mit E5 (running/ + swimming/).
});

/** SportProfile zu einem `sport`-Feldwert. Kein registriertes Profil
 *  (heute: alles außer "ride") → `null`, kein Wurf — analog getSport(). */
export function sportProfileFor(sport: string): SportProfile | null {
  const id = Object.hasOwn(SPORT_TO_PROFILE_ID, sport) ? SPORT_TO_PROFILE_ID[sport] : null;
  return id ? getSport(id) : null;
}
