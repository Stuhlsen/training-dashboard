/* ============================================================
   FEATURES/PLANNING/USEADDSPORTFLOW.TS — Zustand und Aktionen von „Sportart
   hinzufügen" in „Plan anpassen" (Fahrplan 44 E5).

   Liest die laufenden Pläne, das Profil, Ziele und Historie, hält die Eingaben
   (Sportart, Stunden, Tage, Schwellen-Geschwindigkeit, sanfter Einstieg) und
   rechnet die Vorschau sofort neu. Es wird erst geschrieben, wenn `confirm()`
   läuft — alles davor ist reine Anzeige. Rechnen tut add-sport-view-model.ts,
   Schreiben useAddSportToPlan.ts.
   ============================================================ */

import { useMemo, useState } from "react";
import { useActiveTrainingPlan } from "../../api/hooks/useActiveTrainingPlan";
import { useAthleteFormats } from "../../api/hooks/useAthleteFormats";
import { useAthleteSports } from "../../api/hooks/useAthleteSports";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { usePlanHistoryAggregate } from "../../api/hooks/usePlanHistoryAggregate";
import { useSessionProfile } from "../../api/hooks/useSession";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { TrainingPlan } from "../../api/types";
import { localISODate } from "../../core/format.js";
import {
  addSportOptions,
  buildAddSportPreview,
  gentleStart,
  hasTrainingHistory,
  nextMondayISO,
} from "./add-sport-view-model";
import { planGoalProfile } from "./goal-plan-view-model";
import { defaultSportDrafts, type SportDraft } from "./multi-sport-plan-view-model";
import { useAddSportToPlan } from "./useAddSportToPlan";
import { useGoalPlanContext } from "./useGoalPlanContext";

type DraftOverride = Partial<
  Pick<SportDraft, "hours" | "weekdays" | "currentThresholdSpeed" | "thresholdSpeedTarget">
>;

const aggregateOf = (a: unknown) => (a ?? {}) as { currentThresholdSpeed?: number | null };

export function useAddSportFlow(athleteId: string) {
  const today = localISODate();
  const profile = useSessionProfile();
  const profileSports = useAthleteSports(athleteId);
  const { entries: formatEntries } = useAthleteFormats();
  const { addSport, isPending } = useAddSportToPlan(athleteId);

  const ridePlan = useActiveTrainingPlan(athleteId, "ride");
  const runPlan = useActiveTrainingPlan(athleteId, "run");
  const swimPlan = useActiveTrainingPlan(athleteId, "swim");
  const loading = ridePlan.isLoading || runPlan.isLoading || swimPlan.isLoading;
  const activePlans = useMemo(
    () => [ridePlan.data, runPlan.data, swimPlan.data].filter((p): p is TrainingPlan => !!p),
    [ridePlan.data, runPlan.data, swimPlan.data],
  );

  const cards = usePlanCards(athleteId, { allSports: true }).data;
  const existingCards = useMemo(() => cards ?? [], [cards]);
  const rideHistory = usePlanHistoryAggregate(athleteId, "ride").aggregate;
  const runHistory = usePlanHistoryAggregate(athleteId, "run").aggregate;
  const swimHistory = usePlanHistoryAggregate(athleteId, "swim").aggregate;
  const history = useMemo<Record<ActiveSport, unknown>>(
    () => ({ ride: rideHistory, run: runHistory, swim: swimHistory }),
    [rideHistory, runHistory, swimHistory],
  );

  const options = addSportOptions(
    profileSports,
    activePlans.map((p) => (p.sport ?? "ride") as ActiveSport),
  );
  const [picked, setPicked] = useState<ActiveSport | null>(null);
  const sport: ActiveSport | null =
    picked && options.offered.includes(picked) ? picked : (options.offered[0] ?? null);

  // Ziele (Fahrplan 43) und sanfter Einstieg beim Laufen.
  const { goals } = useGoalPlanContext(athleteId, sport ?? "run");
  const goalProfile = useMemo(() => planGoalProfile(goals, sport ?? "run"), [goals, sport]);
  const hasHistory = hasTrainingHistory(sport ? history[sport] : null);
  // Ein früherer Plan lässt sich nur über seine Karten erkennen (beendete Pläne sind nicht lesbar).
  const hasEarlierPlan = !!sport && existingCards.some((c) => (c.sport ?? "ride") === sport);
  const gentle = sport
    ? gentleStart({ sport, goalProfile, hasEarlierPlan, hasHistory })
    : { gentle: false, reason: null, profile: goalProfile };
  const [gentleOverride, setGentleOverride] = useState<boolean | null>(null);
  const gentleOn = gentleOverride ?? gentle.gentle;

  // Eingaben der neuen Sportart; alles andere ist abgeleitet.
  const [overrides, setOverrides] = useState<Partial<Record<ActiveSport, DraftOverride>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const defaults = defaultSportDrafts({ weeklyHours: 6, trainingWeekdays: [2, 4, 6], level: "fortgeschritten" });
  const draft: SportDraft | null = sport
    ? {
        ...defaults[sport],
        currentThresholdSpeed: aggregateOf(history[sport]).currentThresholdSpeed ?? null,
        ...overrides[sport],
        level: gentleOn ? "einsteiger" : (activePlans[0]?.level ?? "fortgeschritten"),
      }
    : null;

  function setDraft(next: DraftOverride) {
    if (!sport) return;
    setOverrides((o) => ({ ...o, [sport]: { ...o[sport], ...next } }));
    setSaveError(null);
  }

  // Schalter aus: ein Ziel-Profil bleibt wirksam, nur Level, Rampe und Startumfang entfallen.
  const softProfile = sport
    ? gentleStart({ sport, goalProfile, hasEarlierPlan: false, hasHistory: false }).profile
    : goalProfile;
  const generatorProfile =
    sport !== "run"
      ? goalProfile
      : gentleOn
        ? softProfile
        : { ...goalProfile, level: null, ramp: null, lowStartVolume: null };

  const formats = useMemo(() => formatEntries.map((e) => e.format), [formatEntries]);
  const preview = useMemo(
    () =>
      sport && draft && activePlans.length > 0
        ? buildAddSportPreview({
            activePlans,
            sport,
            draft,
            todayISO: today,
            goalProfile: generatorProfile,
            history,
            formats,
            existingCards,
          })
        : null,
    // `draft` und `generatorProfile` entstehen aus den hier gelisteten Eingaben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePlans, sport, overrides, gentleOn, goalProfile, today, formats, existingCards, history],
  );

  /** Gespeichert? `true` = ja. Vorher ändert sich nichts. */
  async function confirm(): Promise<boolean> {
    if (!preview?.ok || isPending) return false;
    setSaveError(null);
    if (!profile) {
      setSaveError("Profil lädt noch — kurz warten und erneut versuchen.");
      return false;
    }
    const res = await addSport({
      runningPlans: activePlans,
      item: {
        generated: preview.item.plan,
        input: preview.item.input,
        form: preview.item.form,
        createdBy: profile.id,
      },
    });
    if (!res.ok) {
      setSaveError(res.error.message);
      return false;
    }
    return true;
  }

  return {
    loading,
    activePlans,
    options,
    sport,
    pick: (s: ActiveSport) => {
      setPicked(s);
      setGentleOverride(null);
      setSaveError(null);
    },
    draft,
    setDraft,
    gentle,
    gentleOn,
    setGentle: (on: boolean) => {
      setGentleOverride(on);
      setSaveError(null);
    },
    startDate: nextMondayISO(today),
    preview,
    saveError,
    isPending,
    confirm,
  };
}
