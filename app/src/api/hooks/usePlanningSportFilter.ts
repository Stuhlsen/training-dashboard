import { useCallback, useSyncExternalStore } from "react";
import { useAthleteSports } from "./useAthleteSports";
import type { ActiveSport } from "./useActiveSport";

/** Sportfilter der Planungsseite (Fahrplan 44 E1, M6: Standard "Alle").
 *
 *  BEWUSST getrennt von `useActiveSport`: der globale Umschalter gilt für die
 *  ganze App (Hero, Analyse, Hintergrund) und kennt kein "Alle". Dieser Filter
 *  lebt nur auf der Planungsseite, unter eigenem localStorage-Schlüssel, und
 *  schreibt nie in `active_sport`. Muster sonst wie `useActiveSport`
 *  (modul-weite Listener + `useSyncExternalStore`, damit der Header-Toggle und
 *  die Seite denselben Wert sehen).
 *
 *  Ein Athlet mit nur einer Sportart hat keinen Filter: `isMultiSport` ist
 *  false, `filter` bleibt "all" — die Seite verhält sich wie vorher. */

const STORAGE_KEY = "planning_sport_filter";

export type PlanningSportFilter = "all" | ActiveSport;
const VALID: readonly string[] = ["all", "ride", "run", "swim"];

function readStored(): PlanningSportFilter {
  const saved = localStorage.getItem(STORAGE_KEY);
  const valid = VALID.includes(saved ?? "");
  if (saved && !valid) localStorage.removeItem(STORAGE_KEY);
  return valid ? (saved as PlanningSportFilter) : "all";
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlanningSportFilter(athleteId: string) {
  const stored = useSyncExternalStore(subscribe, readStored);
  const sports = useAthleteSports(athleteId);
  const isMultiSport = sports.length > 1;
  // Gespeicherte Sportart, die der Athlet nicht hat (Athletenwechsel) ⇒ "all";
  // der gespeicherte Wert bleibt erhalten (wie bei useEffectiveSport).
  const filter: PlanningSportFilter =
    !isMultiSport || stored === "all" || !(sports as readonly string[]).includes(stored) ? "all" : stored;
  const setFilter = useCallback((next: PlanningSportFilter) => {
    localStorage.setItem(STORAGE_KEY, next);
    listeners.forEach((l) => l());
  }, []);
  return { filter, setFilter, sports, isMultiSport };
}
