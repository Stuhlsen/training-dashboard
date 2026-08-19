/* ============================================================
   API/HOOKS/USEEXPLORERCOMPARE.TS — Vergleichsmodus-Zustand (Etappe 8e)
   Port von assets/js/state/chart-view.js — Teil "compareSlots" (Phase 5,
   Schritt 4, docs/phase-5-konzept-explorer.md §5).

   Persistiert wie useExplorerScenario.ts über explorer-storage.ts. Gleiche
   `enabled`-Konvention wie Szenario: Slots bleiben gemerkt, auch wenn der
   Vergleichsmodus ausgeschaltet wird ("Modus aus" heißt nicht "Slots
   vergessen"). Anders als beim Vanilla-Original (das ws/we-Tagesindizes
   über das zuletzt gezeichnete PMC-Skelett in {from, to} umrechnet, s.
   assets/js/ui/charts/pmc.js Zeile 1259-1264) braucht "Als A/B merken"
   hier keine Skelett-Konvertierung: `useExplorerRange` hält das aktuelle
   Brush-Fenster bereits als ISO-Daten (`{fromISO, toISO}`), der Aufrufer
   (ExplorerSection) reicht sie direkt als `{from, to}` durch.

   `buildCompare()` (core/compare.js) wird hier NICHT aufgerufen — wie im
   Vanilla-Original ist das ein flüchtiges Ableitungsergebnis, das die
   UI-Schicht (ExplorerSection) bei jedem Render mit den aktuellen Rides neu
   berechnet, kein Hook-State. */

import { useCallback, useMemo, useState } from "react";
import { readExplorerStorage, writeExplorerStorage } from "./explorer-storage";

export interface CompareSlot {
  from: string;
  to: string;
}

export interface CompareSlots {
  enabled: boolean;
  a: CompareSlot | null;
  b: CompareSlot | null;
}

const COMPARE_DEFAULT: CompareSlots = { enabled: false, a: null, b: null };

/** Nur ein sauberes `{from: string, to: string}` wird übernommen — defektes/
 *  fremdes localStorage-JSON darf hier nie werfen (Muster wie chart-view.js
 *  ::sanitizeSlot), sondern fällt auf `null` zurück (Slot "nicht gemerkt"). */
function sanitizeSlot(v: unknown): CompareSlot | null {
  const s = v as Partial<CompareSlot> | null | undefined;
  if (s && typeof s === "object" && typeof s.from === "string" && typeof s.to === "string") {
    return { from: s.from, to: s.to };
  }
  return null;
}

function sanitize(v: unknown): CompareSlots {
  const s = (v && typeof v === "object" ? v : {}) as Partial<CompareSlots>;
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : COMPARE_DEFAULT.enabled,
    a: sanitizeSlot(s.a),
    b: sanitizeSlot(s.b),
  };
}

/** Vergleichsmodus-Zustand für den Explorer — lädt/persistiert je Athlet,
 *  Default ist "aus" mit beiden Slots ungemerkt. */
export function useExplorerCompare(athleteId: string) {
  const [trackedAthleteId, setTrackedAthleteId] = useState<string | null>(null);
  const [override, setOverride] = useState<CompareSlots | null>(null);
  if (athleteId !== trackedAthleteId) {
    setTrackedAthleteId(athleteId);
    setOverride(null);
  }

  const stored = useMemo(() => sanitize(readExplorerStorage(athleteId).compareSlots), [athleteId]);
  const compareSlots = override ?? stored;

  const applyPatch = useCallback(
    (patch: Partial<CompareSlots>) => {
      const next = { ...(override ?? stored), ...patch };
      setOverride(next);
      writeExplorerStorage(athleteId, { compareSlots: next });
    },
    [athleteId, override, stored],
  );

  /** Übernimmt einen Datumsbereich in Vergleichsslot A oder B — der jeweils
   *  andere Slot bleibt unverändert. */
  const setCompareSlot = useCallback(
    (slot: "a" | "b", range: CompareSlot) => applyPatch({ [slot]: range } as Partial<CompareSlots>),
    [applyPatch],
  );

  /** Ein-/Ausschalten des Vergleichsmodus — unabhängig von den gemerkten
   *  Slots (Muster wie setScenarioEnabled in useExplorerScenario.ts). */
  const setCompareEnabled = useCallback((enabled: boolean) => applyPatch({ enabled }), [applyPatch]);

  return { compareSlots, setCompareSlot, setCompareEnabled };
}
