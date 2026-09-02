import { useCallback, useSyncExternalStore } from "react";

/** Schalter „Morgen-Check-in" (Settings → Training). Rein lokal pro Browser,
 *  kein Backend — bewusst wie `useActiveAthlete` (modul-weiter Zustand +
 *  `useSyncExternalStore`), damit Settings-Toggle und Hero-Kachel sofort
 *  synchron sind, ohne React-Context. Default `true`: bestehendes Verhalten
 *  (Auto-Prompt + Befinden-Kachel) bleibt, solange niemand abschaltet.
 *
 *  Aus = kein tägliches Auto-Popup (WellbeingCard.tsx) und keine
 *  „Befinden heute"-Kachel im Hero. Der manuelle Weg „Befinden anpassen"
 *  in ProfileSection bleibt unberührt. */
const STORAGE_KEY = "checkin_enabled";

function readStored(): boolean {
  try {
    // Nur ein explizites "0" schaltet ab — alles andere (auch fehlender
    // Schlüssel, geleerter Storage, privater Modus) bleibt beim Default an.
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

let current = readStored();
const listeners = new Set<() => void>();

function setStored(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Storage nicht verfügbar (privater Modus o.ä.) — der Zustand gilt dann
    // nur für diese Sitzung, kein harter Fehler.
  }
  current = enabled;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

export function useCheckinEnabled() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot);
  const setEnabled = useCallback((next: boolean) => setStored(next), []);
  return { enabled, setEnabled };
}
