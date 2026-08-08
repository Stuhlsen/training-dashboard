/* ============================================================
   API/HOOKS/USEEXPLORERRANGE.TS — Brush-Zeitfenster-Zustand (Etappe 8b)
   docs/phase-5-konzept-explorer.md §10.3: localStorage("explorer_<athleteId>"),
   ein JSON-Objekt (`{ range }`, für 8c-8e um `compareSlots`/`scenario`/
   `linked` erweiterbar) — dasselbe Pattern wie useActiveAthlete.ts.

   Kein `useEffect` für die Ableitung: der Default/gespeicherte Bereich ist
   eine reine Funktion von `athleteId`+Bounds (`derived`, useMemo). Ein
   aktiver Nutzer-Eingriff (Drag/Preset) lebt als `override`-State daneben
   und wird zurückgesetzt, sobald sich Athlet oder Bounds ändern — über das
   von React empfohlene "Zustand während des Renderns anpassen"-Muster
   (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
   nicht über einen Effekt mit synchronem setState (löste `react-hooks/set-
   state-in-effect` aus).

   Lesen/Schreiben läuft seit Etappe 8d über explorer-storage.ts (gemergtes
   Objekt statt `{ range }` allein) — s. dortiger Kopfkommentar.
   ============================================================ */

import { useCallback, useMemo, useState } from "react";
import { clampWindow, presetWindow } from "../../core/brush.js";
import { readExplorerStorage, writeExplorerStorage } from "./explorer-storage";

export interface ExplorerRange {
  fromISO: string;
  toISO: string;
}

export interface ExplorerRangeBounds {
  todayISO: string | null;
  anchorISO: string | null;
  horizonEndISO: string | null;
}

function readStoredRange(athleteId: string): ExplorerRange | null {
  const range = readExplorerStorage(athleteId).range;
  if (typeof range?.fromISO === "string" && typeof range?.toISO === "string") return range;
  return null;
}

function writeStoredRange(athleteId: string, range: ExplorerRange) {
  writeExplorerStorage(athleteId, { range });
}

/** Brush-Zeitfenster für den Explorer — lädt/klemmt den zuletzt gewählten
 *  Bereich je Athlet, mit dem 90-Tage-Preset als Default (deckungsgleich mit
 *  dem bisherigen PmcChart-Fixdefault aus Etappe 8a, keine sichtbare
 *  Verhaltensänderung beim ersten Laden). */
export function useExplorerRange(athleteId: string, bounds: ExplorerRangeBounds) {
  const { todayISO, anchorISO, horizonEndISO } = bounds;
  const boundsKey = todayISO && anchorISO && horizonEndISO ? `${athleteId}|${anchorISO}|${horizonEndISO}` : null;

  const [trackedKey, setTrackedKey] = useState<string | null>(null);
  const [override, setOverride] = useState<ExplorerRange | null>(null);
  if (boundsKey !== trackedKey) {
    setTrackedKey(boundsKey);
    setOverride(null);
  }

  const derived = useMemo(() => {
    if (!todayISO || !anchorISO || !horizonEndISO) return null;
    const clampBounds = { anchorISO, horizonEndISO };
    const stored = readStoredRange(athleteId);
    return stored ? clampWindow(stored, clampBounds) : presetWindow("90", { todayISO, anchorISO, horizonEndISO });
  }, [athleteId, todayISO, anchorISO, horizonEndISO]);

  const range = override ?? derived;

  const setRange = useCallback(
    (next: ExplorerRange) => {
      setOverride(next);
      writeStoredRange(athleteId, next);
    },
    [athleteId],
  );

  return { range, setRange };
}
