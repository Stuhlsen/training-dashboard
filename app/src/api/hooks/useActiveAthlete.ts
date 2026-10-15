import { useCallback, useSyncExternalStore } from "react";
import { ATHLETES, PRIMARY_ATHLETE_ID, SELF_ATHLETE_ID } from "../../config";
import { findSlotId, resolveActiveAthleteId } from "../../core/athlete-selection.js";
import { useAuthUserId, useCurrentProfile } from "./useSession";

const STORAGE_KEY = "active_athlete";
const VALID_IDS = ATHLETES.map((a) => a.id);

/** Gespeicherte Wahl oder `null`. Alte/unbekannte IDs (aus früheren
 *  Versionen) werden verworfen — danach entscheidet `resolveActiveAthleteId`
 *  (Primär-Athlet bzw. der eigene Eintrag eines Accounts ohne Platz). */
function readStoredAthlete(): string | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  const valid = saved === SELF_ATHLETE_ID || VALID_IDS.includes(saved ?? "");
  if (saved && !valid) localStorage.removeItem(STORAGE_KEY);
  return valid ? saved : null;
}

/** Modul-weiter Zustand statt separatem `useState` je Aufrufer: vor dem
 *  Umzug des Toggles in die globale Menüleiste (Layout.tsx) hielt jede Seite
 *  ihre eigene Kopie, per `localStorage` nur beim Mount gelesen — ein Klick
 *  in EINER Komponente aktualisierte die anderen erst nach vollem Reload.
 *  `useSyncExternalStore` synchronisiert alle Aufrufer sofort, ohne gleich
 *  einen React-Context einzuführen (Alex' Vorgabe: kein globaler Store, wo
 *  der geteilte `localStorage`-Schlüssel reicht — dieser bleibt weiter die
 *  Quelle der Wahrheit, nur das Nachziehen über mehrere Komponenten fehlte). */
let storedAthleteId = readStoredAthlete();
const listeners = new Set<() => void>();

function setStoredAthlete(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  storedAthleteId = id;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return storedAthleteId;
}

/** Aktiver Athlet. Die gespeicherte Wahl wird mit dem Account verrechnet
 *  (`core/athlete-selection.js`): Ein Account ohne Platz in `ATHLETES`
 *  startet auf seinem eigenen Eintrag (`SELF_ATHLETE_ID`), alle anderen wie
 *  bisher. Reine Ableitung beim Rendern — kein Effekt, kein Zustand. */
export function useActiveAthlete() {
  const stored = useSyncExternalStore(subscribe, getSnapshot);
  const userKnown = useAuthUserId() !== null;
  const selfProfile = useCurrentProfile().data ?? null;
  const slotId = findSlotId(ATHLETES, selfProfile?.displayName);

  const activeAthleteId = resolveActiveAthleteId({
    stored,
    validIds: VALID_IDS,
    primaryId: PRIMARY_ATHLETE_ID,
    userKnown,
    selfProfile,
    slotId,
  });
  const setActiveAthleteId = useCallback((id: string) => {
    setStoredAthlete(id);
  }, []);

  return { activeAthleteId, setActiveAthleteId };
}
