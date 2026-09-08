/* ============================================================
   SPORTS/INDEX.TS — Registry (Etappe 3, erweitert Fahrplan 10 E5)

   Drei Profile: cycling (Etappe 3), running + swimming (Fahrplan 10 E5).
   Der Vertrag `types.ts` trug bis E5 nur EINE Implementierung; das
   Lauf-Fixture in registry.test.ts hat bewiesen, dass ein zweites Profil
   danebenstehen KANN. E5 macht aus dem Beweis Produkt: running/ und
   swimming/ sind echte Profile — noch von niemandem konsumiert (E6 nutzt
   die Default-Lasten, E7 die Zonen/Metriken), aber über getSport()
   erreichbar und im Feldgleichheits-Test.

   Kein Zustand, keine Auswahl zur Laufzeit: solange nichts anderes
   gewählt ist, rechnet core/ mit `cycling/` (DEFAULT_SPORT_ID). Die
   Zuordnung Aktivität → Profil läuft über sportProfileFor() (Vertrag V2).
   ============================================================ */

import type { SportProfile } from "./types.js";
import { cyclingProfile, CYCLING_SPORT_ID } from "./cycling/index.js";
import { runningProfile, RUNNING_SPORT_ID } from "./running/index.js";
import { swimmingProfile, SWIMMING_SPORT_ID } from "./swimming/index.js";

export type { SportProfile } from "./types.js";

export const DEFAULT_SPORT_ID = CYCLING_SPORT_ID;

export const SPORTS: Readonly<Record<string, SportProfile>> = Object.freeze({
  [CYCLING_SPORT_ID]: cyclingProfile,
  [RUNNING_SPORT_ID]: runningProfile,
  [SWIMMING_SPORT_ID]: swimmingProfile,
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
 *  die NICHT umbenannt wird; "run"/"swim" auf "running"/"swimming" (E5).
 *  "other" hat kein Profil. */
const SPORT_TO_PROFILE_ID: Readonly<Record<string, string>> = Object.freeze({
  ride: CYCLING_SPORT_ID,
  run: RUNNING_SPORT_ID,
  swim: SWIMMING_SPORT_ID,
});

/** SportProfile zu einem `sport`-Feldwert. Kein registriertes Profil
 *  (heute: "other" und alles Unbekannte) → `null`, kein Wurf — analog
 *  getSport(). */
export function sportProfileFor(sport: string): SportProfile | null {
  const id = Object.hasOwn(SPORT_TO_PROFILE_ID, sport) ? SPORT_TO_PROFILE_ID[sport] : null;
  return id ? getSport(id) : null;
}
