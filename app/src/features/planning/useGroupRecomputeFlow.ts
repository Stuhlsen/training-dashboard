/* ============================================================
   FEATURES/PLANNING/USEGROUPRECOMPUTEFLOW.TS — Zustand und Aktionen von
   „Plan anpassen" für verknüpfte Pläne (Fahrplan 44 E6)

   Liest Historie, Formate, Karten und Ziele, hält die Eingaben (gewählte
   Sportarten, Tage, Stunden, feste Tage, Ziel-FTP, Ziele) und rechnet die
   Vorschau sofort neu (group-recompute-view-model.ts). Es wird erst
   geschrieben, wenn `apply()` läuft — alles davor ist reine Anzeige.
   ============================================================ */

import { useMemo, useState } from "react";
import { useAthleteFormats } from "../../api/hooks/useAthleteFormats";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { usePlanHistoryAggregate } from "../../api/hooks/usePlanHistoryAggregate";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { TrainingPlan } from "../../api/types";
import { athleteConfig } from "../../config";
import { localISODate } from "../../core/format.js";
import { buildGroupRecompute, type SportEdit } from "./group-recompute-view-model";
import { goalPlanChanges, planGoalProfile } from "./goal-plan-view-model";
import { currentTailWeekdays } from "./recompute-plan-view-model";
import { resolveMeasuredFtp, savedFixedDays } from "./new-plan-dialog-view-model";
import { useFtpHistoryEntries } from "./useFtpHistoryEntries";
import { useGoalPlanContext } from "./useGoalPlanContext";
import { useRecomputePlanGroup } from "./useRecomputePlanGroup";

const SPORT_ORDER: readonly ActiveSport[] = ["ride", "run", "swim"];
const DEFAULT_WEEKLY_HOURS = 6;

export function useGroupRecomputeFlow(
  athleteId: string,
  plans: readonly TrainingPlan[],
  callerSport: ActiveSport,
  withGoals: boolean,
) {
  const today = localISODate();
  const { entries: formatEntries } = useAthleteFormats();
  const { recomputeGroup, isPending } = useRecomputePlanGroup(athleteId);
  const ftpHistoryEntries = useFtpHistoryEntries(athleteId);
  const cards = usePlanCards(athleteId, { allSports: true }).data;
  const existingCards = useMemo(() => cards ?? [], [cards]);
  const rideAgg = usePlanHistoryAggregate(athleteId, "ride").aggregate;
  const runAgg = usePlanHistoryAggregate(athleteId, "run").aggregate;
  const swimAgg = usePlanHistoryAggregate(athleteId, "swim").aggregate;
  const history = useMemo<Record<ActiveSport, unknown>>(
    () => ({ ride: rideAgg, run: runAgg, swim: swimAgg }),
    [rideAgg, runAgg, swimAgg],
  );

  const bySport = useMemo(
    () => new Map(plans.map((p) => [(p.sport ?? "ride") as ActiveSport, p] as const)),
    [plans],
  );
  const sports = useMemo(() => SPORT_ORDER.filter((s) => bySport.has(s)), [bySport]);

  // Aufrufende Sportart zuerst (Anzeige), Rest in Vorrang-Reihenfolge.
  const displaySports = useMemo(
    () => [callerSport, ...sports.filter((s) => s !== callerSport)].filter((s) => bySport.has(s)),
    [callerSport, sports, bySport],
  );

  // Standard: alle gewählt.
  const [picked, setPicked] = useState<ActiveSport[] | null>(null);
  const selected = picked ?? sports;
  const [edits, setEdits] = useState<Partial<Record<ActiveSport, SportEdit>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Ziele (Fahrplan 43 E5): Standard aus; nur der Hinweis öffnet den Dialog mit „an".
  const { goals, interimFtp } = useGoalPlanContext(athleteId, "ride");
  const [goalsOn, setGoalsOn] = useState(withGoals);
  const goalProfiles = useMemo(
    () => (goalsOn ? Object.fromEntries(sports.map((s) => [s, planGoalProfile(goals, s)])) : {}),
    [goalsOn, goals, sports],
  );
  const goalSummaries = sports
    .map((s) => ({ sport: s, changes: goalPlanChanges(planGoalProfile(goals, s)) }))
    .filter((g) => g.changes.hasEffect || g.changes.notYet.length > 0);
  const showGoalsBox = goalSummaries.length > 0 || interimFtp != null;

  const edit = (s: ActiveSport): SportEdit => edits[s] ?? {};
  const shown = {
    weekdays: (s: ActiveSport) => edit(s).weekdays ?? currentTailWeekdays(bySport.get(s)!, today),
    hours: (s: ActiveSport) => edit(s).hours ?? bySport.get(s)!.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
    fixedDays: (s: ActiveSport) => edit(s).fixedDays ?? savedFixedDays(bySport.get(s)!),
    ftpTarget: (s: ActiveSport): number | null =>
      edit(s).ftpTarget ??
      (goalsOn && s === "ride" && interimFtp != null ? interimFtp : (bySport.get(s)!.ftpTarget ?? null)),
  };

  function setEdit(sport: ActiveSport, patch: SportEdit) {
    setEdits((e) => ({ ...e, [sport]: { ...e[sport], ...patch } }));
    setSaveError(null);
  }

  function toggleSport(sport: ActiveSport) {
    const next = selected.includes(sport)
      ? selected.length > 1
        ? selected.filter((s) => s !== sport)
        : selected
      : SPORT_ORDER.filter((s) => s === sport || selected.includes(s));
    setPicked([...next]);
    setSaveError(null);
  }

  function toggleDay(sport: ActiveSport, iso: number) {
    const cur = shown.weekdays(sport);
    setEdit(sport, {
      weekdays: cur.includes(iso) ? cur.filter((d) => d !== iso) : [...cur, iso].sort((a, b) => a - b),
    });
  }

  const build = useMemo(() => {
    const cfg = athleteConfig(athleteId);
    // Das Zwischenziel schlägt nur, wenn der Athlet das Ziel-FTP nicht selbst gesetzt hat.
    const withInterim: Partial<Record<ActiveSport, SportEdit>> =
      goalsOn && interimFtp != null && edits.ride?.ftpTarget == null
        ? { ...edits, ride: { ...edits.ride, ftpTarget: interimFtp } }
        : edits;
    return buildGroupRecompute({
      plans,
      callerSport,
      todayISO: today,
      selected,
      edits: withInterim,
      history,
      currentThresholdSpeed: {
        run: (runAgg as { currentThresholdSpeed?: number | null } | null)?.currentThresholdSpeed,
        swim: (swimAgg as { currentThresholdSpeed?: number | null } | null)?.currentThresholdSpeed,
      },
      athleteDefaults: cfg && { ...cfg, ...resolveMeasuredFtp(cfg, ftpHistoryEntries, today) },
      goalProfiles,
      formats: formatEntries.map((e) => e.format),
      existingCards,
    });
  }, [
    athleteId,
    plans,
    callerSport,
    today,
    selected,
    edits,
    history,
    runAgg,
    swimAgg,
    ftpHistoryEntries,
    goalsOn,
    goalProfiles,
    interimFtp,
    formatEntries,
    existingCards,
  ]);

  /** Geschrieben? `true` = ja. Vorher ändert sich nichts. */
  async function apply(): Promise<boolean> {
    if (!build.ok || isPending) return false;
    setSaveError(null);
    const result = await recomputeGroup(build);
    if (!result.ok) {
      setSaveError(result.error.message);
      return false;
    }
    return true;
  }

  return {
    today,
    displaySports,
    plansBySport: bySport,
    selected,
    toggleSport,
    shown,
    setEdit,
    toggleDay,
    goalsOn,
    setGoalsOn: (on: boolean) => {
      setGoalsOn(on);
      setSaveError(null);
    },
    goalSummaries,
    showGoalsBox,
    interimFtp,
    build,
    apply,
    isPending,
    saveError,
  };
}
