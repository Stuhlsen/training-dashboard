/* ============================================================
   FEATURES/PLANNING/USEMULTISPORTPLAN.TS — Zustand und Aktionen des „Neuer
   Plan"-Dialogs für mehrere Sportarten (Fahrplan 44 E4).

   Die ERSTE gewählte Sportart wird wie bisher im Dialog-Formular erfasst.
   Dieser Hook führt nur, was dazukommt: Entwürfe der weiteren Sportarten
   (Stunden, Tage, Level, Schwellenpace), die Verteilung samt Hinweisen
   (`allocateWeek` über das View-Model), die gemeinsame Vorschau und das
   Speichern aller Pläne in einem Lauf (`createPlans`, zwei Phasen).

   Die Vorschau gilt nur für den Stand, aus dem sie entstand: ändert sich
   Formular, Entwurf oder Auswahl, verfällt sie von selbst (Signatur) — kein
   Hand-Reset an jeder Eingabe nötig.

   Rechnen tut das View-Model (multi-sport-plan-view-model.ts); hier nur
   React-Zustand und Lesezugriffe.
   ============================================================ */

import { useState } from "react";
import { useActiveTrainingPlan } from "../../api/hooks/useActiveTrainingPlan";
import { usePlanHistoryAggregate } from "../../api/hooks/usePlanHistoryAggregate";
import { useAthleteFormats } from "../../api/hooks/useAthleteFormats";
import { useSessionProfile } from "../../api/hooks/useSession";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { Result } from "../../api/types";
import { localISODate } from "../../core/format.js";
import { generatePlan } from "../../core/plan-generator.js";
import { newPlanPresets } from "./goal-plan-view-model";
import {
  buildMultiSportInputs,
  defaultSportDrafts,
  loadSummary,
  primaryDraft,
  replaceNotes,
  type AllocationHint,
  type LoadSummary,
  type MultiSportItem,
  type ReplaceNote,
  type SportDraft,
  type SportDrafts,
} from "./multi-sport-plan-view-model";
import { useGoalPlanContext } from "./useGoalPlanContext";
import type { CreateTrainingPlanArgs } from "./useCreateTrainingPlan";
import type { GeneratedPlan, NewPlanFormState, PlanModel } from "./new-plan-dialog-view-model";

const ALL_SPORTS: readonly ActiveSport[] = ["ride", "run", "swim"];

export interface MultiSportPreviewItem extends MultiSportItem {
  plan: GeneratedPlan;
}

export interface MultiSportBundle {
  items: MultiSportPreviewItem[];
  hints: AllocationHint[];
  load: LoadSummary;
}

interface Args {
  athleteId: string;
  /** Gewählte Sportarten in Vorrang-Reihenfolge; aktiv ab zwei. */
  sports: readonly ActiveSport[];
  /** Dialog-Formular mit wirksamer Rolle (`hasIndoorTrainer`) — die erste Sportart. */
  form: NewPlanFormState;
  /** Wirksames Modell des Radplans (Wahl oder Vorschlag). */
  rideModel: PlanModel;
  resolveEventDate: (eventId: string) => string | null;
  createPlans: (items: CreateTrainingPlanArgs[]) => Promise<Result<{ planIds: string[] }>>;
  saving: boolean;
}

const speedFrom = (aggregate: unknown): number | null =>
  (aggregate as { currentThresholdSpeed?: number | null } | null)?.currentThresholdSpeed ?? null;

export function useMultiSportPlan({
  athleteId,
  sports,
  form,
  rideModel,
  resolveEventDate,
  createPlans,
  saving,
}: Args) {
  const active = sports.length > 1;
  const primary = sports[0];
  const today = localISODate();

  const profile = useSessionProfile();
  const { entries: formatEntries } = useAthleteFormats();
  const { goals } = useGoalPlanContext(athleteId, primary);

  // Historie je Sportart (Schwellenpace-Vorbelegung + Parameter der Plan-Zeile).
  const rideAgg = usePlanHistoryAggregate(athleteId, "ride").aggregate;
  const runAgg = usePlanHistoryAggregate(athleteId, "run").aggregate;
  const swimAgg = usePlanHistoryAggregate(athleteId, "swim").aggregate;
  const history: Record<ActiveSport, unknown> = { ride: rideAgg, run: runAgg, swim: swimAgg };

  // Welcher Plan je Sportart gerade läuft — nur für Gewählte lesen.
  const ridePlan = useActiveTrainingPlan(athleteId, "ride", { enabled: sports.includes("ride") }).data;
  const runPlan = useActiveTrainingPlan(athleteId, "run", { enabled: sports.includes("run") }).data;
  const swimPlan = useActiveTrainingPlan(athleteId, "swim", { enabled: sports.includes("swim") }).data;

  // Eingaben des Athleten für die weiteren Sportarten; alles andere ist abgeleitet.
  const [overrides, setOverrides] = useState<Partial<Record<ActiveSport, Partial<SportDraft>>>>({});
  const [bundleState, setBundleState] = useState<(MultiSportBundle & { signature: string }) | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorHints, setErrorHints] = useState<AllocationHint[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Entwurf je Sportart: erste = Formular; weitere = Standard + Ziel-Level +
  // Historien-Pace, darüber die eigenen Eingaben.
  const defaults = defaultSportDrafts(form);
  const drafts = Object.fromEntries(
    ALL_SPORTS.map((s) => {
      if (s === primary) return [s, primaryDraft(form)];
      const goalLevel = newPlanPresets(goals, s, today).level;
      return [
        s,
        {
          ...defaults[s],
          level: goalLevel ?? form.level,
          currentThresholdSpeed: speedFrom(history[s]),
          ...overrides[s],
        },
      ];
    }),
  ) as SportDrafts;

  const build = active
    ? buildMultiSportInputs({ shared: form, drafts, sports, rideModel, resolveEventDate, history })
    : null;
  const signature = JSON.stringify([form, drafts, sports, rideModel]);
  const bundle = bundleState && bundleState.signature === signature ? bundleState : null;

  const notes: ReplaceNote[] = replaceNotes(sports, {
    ride: ridePlan ? { endDate: ridePlan.endDate } : null,
    run: runPlan ? { endDate: runPlan.endDate } : null,
    swim: swimPlan ? { endDate: swimPlan.endDate } : null,
  });

  function setDraft(sport: ActiveSport, next: Partial<SportDraft>) {
    setOverrides((o) => ({ ...o, [sport]: { ...o[sport], ...next } }));
    setSaveError(null);
  }

  function preview() {
    if (!build) return;
    if (!build.ok) {
      setErrors(build.errors);
      setErrorHints(build.hints ?? []);
      setBundleState(null);
      return;
    }
    setErrors({});
    setErrorHints([]);
    setSaveError(null);
    const run = generatePlan as (input: unknown) => GeneratedPlan;
    const formats = formatEntries.map((e) => e.format);
    const items = build.items.map((it) => ({ ...it, plan: run({ ...it.input, formats }) }));
    setBundleState({
      signature,
      items,
      hints: build.hints,
      load: loadSummary(items.map((i) => ({ sport: i.sport, plan: i.plan }))),
    });
  }

  /** Alle Pläne in einem Lauf speichern. `true` = gespeichert. */
  async function adopt(): Promise<boolean> {
    if (!bundle || saving) return false;
    setSaveError(null);
    if (!profile) {
      setSaveError("Profil lädt noch — kurz warten und erneut versuchen.");
      return false;
    }
    const res = await createPlans(
      bundle.items.map((i) => ({
        generated: i.plan,
        input: i.input,
        form: i.form,
        createdBy: profile.id,
      })),
    );
    if (!res.ok) {
      setSaveError(res.error.message);
      return false;
    }
    return true;
  }

  return {
    active,
    /** Weitere Sportarten (ohne die erste, die im Formular steht). */
    extras: sports.slice(1),
    drafts,
    setDraft,
    /** Hinweise der Verteilung (live, auch bei Eingabefehlern). */
    hints: build ? (build.ok ? build.hints : (build.hints ?? [])) : [],
    errors,
    errorHints,
    saveError,
    bundle,
    notes,
    preview,
    adopt,
  };
}
