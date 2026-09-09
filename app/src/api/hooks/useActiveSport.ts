import { useCallback, useSyncExternalStore } from "react";
import { athleteConfig } from "../../config";

/** Aktive Sportart im Sport-Umschalter (Fahrplan 10 E8a). Muster 1:1 wie
 *  `useActiveAthlete`: ein modul-weiter Zustand + `useSyncExternalStore`, damit
 *  ein Klick in EINER Komponente (SportToggle) alle Aufrufer (useRides,
 *  HeroPage, AnalysisPage, …) sofort nachzieht, ohne einen React-Context.
 *  `localStorage` bleibt die Quelle der Wahrheit.
 *
 *  GLOBAL, nicht pro Athlet (Grill 2026-09-08): nur ein Multi-Sport-Athlet
 *  existiert, eine Trennung je Athlet wäre Mehraufwand ohne spürbaren Nutzen.
 *  Wechselt man zu einem Athleten ohne die gespeicherte Sportart, wird sie
 *  NICHT überschrieben — `useEffectiveSport()` leitet dann `"ride"` ab, der
 *  gespeicherte Wert kommt zurück, sobald wieder ein passender Athlet aktiv
 *  ist. */

const STORAGE_KEY = "active_sport";

/** Umschaltbares Vokabular — `"other"` ist kein wählbarer Zustand. */
export type ActiveSport = "ride" | "run" | "swim";
const VALID: readonly ActiveSport[] = ["ride", "run", "swim"];

/** Alte/unbekannte Werte fallen auf `"ride"` zurück (jeder Athlet fährt Rad). */
function readStoredSport(): ActiveSport {
  const saved = localStorage.getItem(STORAGE_KEY);
  const valid = (VALID as readonly string[]).includes(saved ?? "");
  if (saved && !valid) localStorage.removeItem(STORAGE_KEY);
  return valid ? (saved as ActiveSport) : "ride";
}

let currentSport: ActiveSport = readStoredSport();
const listeners = new Set<() => void>();

function setStoredSport(sport: ActiveSport) {
  localStorage.setItem(STORAGE_KEY, sport);
  currentSport = sport;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentSport;
}

/** Der roh gespeicherte Umschalter-Zustand. Meist willst du
 *  `useEffectiveSport(athleteId)` — der klemmt auf die Sportarten des
 *  Athleten. */
export function useActiveSport() {
  const activeSport = useSyncExternalStore(subscribe, getSnapshot);
  const setActiveSport = useCallback((sport: ActiveSport) => {
    setStoredSport(sport);
  }, []);
  return { activeSport, setActiveSport };
}

/** Die tatsächlich anzuwendende Sportart für einen Athleten: der Umschalter-
 *  Wert, geklemmt auf `athleteConfig(athleteId).sports` (fehlt ⇒ `["ride"]`).
 *  Reine Ableitung, kein `setState` — trägt der Athlet die aktive Sportart
 *  nicht, ist `effectiveSport` schlicht `"ride"`. */
export function useEffectiveSport(athleteId: string) {
  const { activeSport, setActiveSport } = useActiveSport();
  const sports = athleteConfig(athleteId)?.sports ?? (["ride"] as const);
  const effectiveSport: ActiveSport = (sports as readonly string[]).includes(activeSport)
    ? activeSport
    : "ride";
  return { effectiveSport, setActiveSport, sports };
}
