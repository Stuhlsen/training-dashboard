import { useCallback, useSyncExternalStore } from "react";
import { ATHLETES, PRIMARY_ATHLETE_ID } from "../../config";

const STORAGE_KEY = "active_athlete";

/** Alte/unbekannte IDs (aus früheren Versionen) fallen auf den
 *  Primär-Athleten zurück — Pattern wie Vanilla app.js beim Boot. */
function readStoredAthlete(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  const valid = ATHLETES.some((a) => a.id === saved);
  if (saved && !valid) localStorage.removeItem(STORAGE_KEY);
  return valid ? saved! : PRIMARY_ATHLETE_ID;
}

/** Modul-weiter Zustand statt separatem `useState` je Aufrufer: vor dem
 *  Umzug des Toggles in die globale Menüleiste (Layout.tsx) hielt jede Seite
 *  ihre eigene Kopie, per `localStorage` nur beim Mount gelesen — ein Klick
 *  in EINER Komponente aktualisierte die anderen erst nach vollem Reload.
 *  `useSyncExternalStore` synchronisiert alle Aufrufer sofort, ohne gleich
 *  einen React-Context einzuführen (Alex' Vorgabe: kein globaler Store, wo
 *  der geteilte `localStorage`-Schlüssel reicht — dieser bleibt weiter die
 *  Quelle der Wahrheit, nur das Nachziehen über mehrere Komponenten fehlte). */
let currentAthleteId = readStoredAthlete();
const listeners = new Set<() => void>();

function setStoredAthlete(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  currentAthleteId = id;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentAthleteId;
}

export function useActiveAthlete() {
  const activeAthleteId = useSyncExternalStore(subscribe, getSnapshot);
  const setActiveAthleteId = useCallback((id: string) => {
    setStoredAthlete(id);
  }, []);

  return { activeAthleteId, setActiveAthleteId };
}
