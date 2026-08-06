import { useCallback, useState } from "react";
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

/** Aktiver Athlet fürs Toggle im Hero-Header (und alle folgenden
 *  Bereichs-Etappen) — geteilter Hook statt lokalem `useState` je
 *  Feature, damit Etappe 5+ den Zustand nicht neu bauen muss.
 *
 *  Bewusst kein Context: jeder Aufrufer liest/schreibt denselben
 *  `localStorage`-Schlüssel, React-eigener State pro Komponente reicht
 *  (Konzept 5.2) — ein globaler Store wäre hier eine Bibliothek zu viel. */
export function useActiveAthlete() {
  const [activeAthleteId, setActiveAthleteIdState] = useState<string>(readStoredAthlete);

  const setActiveAthleteId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveAthleteIdState(id);
  }, []);

  return { activeAthleteId, setActiveAthleteId };
}
