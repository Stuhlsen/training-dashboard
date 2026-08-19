/* ============================================================
   API/HOOKS/USEEXPLORERSCENARIO.TS — What-if-Parameter-Zustand (Etappe 8d)
   Port von assets/js/state/chart-view.js — Teil "scenario" (Phase 5,
   Schritt 3, docs/phase-5-konzept-explorer.md §6).

   Persistiert wie useExplorerRange.ts über explorer-storage.ts (§10.3:
   Szenario-Parameter sind bewusst Teil der Persistenz — §6.4 meint nur,
   dass ein Szenario nie nach plan_cards geschrieben wird, nicht dass die
   Regler-Stellung flüchtig wäre). Anders als bei `range` gibt es hier
   keine Bounds-Abhängigkeit — der Reset bei Athletenwechsel hängt nur an
   `athleteId`, über dasselbe "Zustand während des Renderns anpassen"-
   Muster wie useExplorerRange.ts (kein Effekt, kein `react-hooks/set-
   state-in-effect`).

   Die Berechnung der zweiten (synthetischen) Prognosekurve
   (buildScenario()+projectLoad(), vanilla state/chart-view.js::
   recomputeScenario) läuft NICHT in diesem Hook, sondern als reine
   Ableitung direkt in ExplorerSection.tsx — die dortigen Cards/Rides/
   Events/FTP sind bereits im React-Query-Cache, ein injizierter
   `scenarioSources`-Provider wie in vanilla (dort nötig, weil
   state/chart-view.js ein Modul-Singleton außerhalb des Komponentenbaums
   ist) wäre hier eine unnötige Indirektion. */

import { useCallback, useMemo, useState } from "react";
import { readExplorerStorage, writeExplorerStorage } from "./explorer-storage";

export interface ScenarioParams {
  enabled: boolean;
  weekTssPct: number;
  restDays: number;
  rampRatePct: number;
}

const SCENARIO_DEFAULT: ScenarioParams = { enabled: false, weekTssPct: 0, restDays: 0, rampRatePct: 0 };

/** Defektes/fremdes localStorage-JSON darf hier nie werfen — typeof-Wache
 *  je Feld, fällt einzeln auf den Default zurück (Muster wie
 *  assets/js/state/chart-view.js::loadForAthlete). */
function sanitize(v: unknown): ScenarioParams {
  const s = (v && typeof v === "object" ? v : {}) as Partial<ScenarioParams>;
  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : SCENARIO_DEFAULT.enabled,
    weekTssPct: typeof s.weekTssPct === "number" ? s.weekTssPct : SCENARIO_DEFAULT.weekTssPct,
    restDays: typeof s.restDays === "number" ? s.restDays : SCENARIO_DEFAULT.restDays,
    rampRatePct: typeof s.rampRatePct === "number" ? s.rampRatePct : SCENARIO_DEFAULT.rampRatePct,
  };
}

/** What-if-Szenario-Parameter für den Explorer — lädt/persistiert je
 *  Athlet, Default ist "aus" mit allen Reglern auf 0. */
export function useExplorerScenario(athleteId: string) {
  const [trackedAthleteId, setTrackedAthleteId] = useState<string | null>(null);
  const [override, setOverride] = useState<ScenarioParams | null>(null);
  if (athleteId !== trackedAthleteId) {
    setTrackedAthleteId(athleteId);
    setOverride(null);
  }

  const stored = useMemo(() => sanitize(readExplorerStorage(athleteId).scenario), [athleteId]);
  const scenario = override ?? stored;

  const applyPatch = useCallback(
    (patch: Partial<ScenarioParams>) => {
      const next = { ...(override ?? stored), ...patch };
      setOverride(next);
      writeExplorerStorage(athleteId, { scenario: next });
    },
    [athleteId, override, stored],
  );

  /** Regler-Werte ändern — lässt `enabled` bewusst unangetastet ("Regler
   *  auf 0" bedeutet weiterhin AN, X8/§6, wie im Vanilla-Original). */
  const setScenarioParams = useCallback(
    (patch: Partial<Pick<ScenarioParams, "weekTssPct" | "restDays" | "rampRatePct">>) => applyPatch(patch),
    [applyPatch],
  );

  /** Ein-/Ausschalten, getrennt von den Reglern (gleiche Begründung wie
   *  setScenarioParams — s. dortiger Kommentar). */
  const setScenarioEnabled = useCallback((enabled: boolean) => applyPatch({ enabled }), [applyPatch]);

  return { scenario, setScenarioParams, setScenarioEnabled };
}
