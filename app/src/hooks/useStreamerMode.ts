import { useCallback, useSyncExternalStore } from "react";

/** Schalter „Streamer-Modus" (Settings, ganz oben). Rein lokal pro Browser,
 *  kein Backend — Muster wie `useCheckinEnabled` (modul-weiter Zustand +
 *  `useSyncExternalStore`), damit der Schalter und alle Abschnitte sofort
 *  synchron sind, ohne React-Context. Default `false`.
 *
 *  An = persönliche Felder in den Einstellungen zeigen nur Punkte und sind
 *  gesperrt (Basisdaten, Zielgewicht, Intoleranzen, E-Mail-Adressen der
 *  Nutzerverwaltung, Stadt/Athlete-ID). Pro Gerät gedacht: der Stream-Rechner
 *  schaltet ihn an, das Handy bleibt unberührt. */
const STORAGE_KEY = "streamer_mode";

function readStored(): boolean {
  try {
    // Nur ein explizites "1" schaltet an — alles andere (auch fehlender
    // Schlüssel, geleerter Storage, privater Modus) bleibt beim Default aus.
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
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

export function useStreamerMode() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot);
  const setEnabled = useCallback((next: boolean) => setStored(next), []);
  return { enabled, setEnabled };
}
