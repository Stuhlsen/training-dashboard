/* ============================================================
   API/HOOKS/USEACTIVETRAININGPLAN.TS — die aktive `training_plans`-Zeile
   des angezeigten Athleten (Fahrplan 8 E6; von E7 für das dynamische
   plan-week-model weitergenutzt).

   `null`, wenn kein aktiver Plan existiert, der Athlet keinen Account hat
   oder die Zeile für den aktuellen Betrachter nicht lesbar ist
   (`training_plans` hat keinen anon-GRANT). Der „Neuer Plan"-Dialog braucht
   sie nur, um vor dem Ersetzen eines bestehenden Plans zu warnen.
   ============================================================ */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listActiveTrainingPlan } from "../supabase/training-plans";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import type { TrainingPlan, WeekModelEntry } from "../types";

/** `sport` default "ride" — bestehende Aufrufer (Rad-only, vor Fahrplan 14)
 *  bleiben unverändert; Lauf-/Schwimm-UI (E6/E7) übergibt ihren Sport
 *  explizit. Seit Migration 0038 kann pro Sportart ein eigener aktiver Plan
 *  existieren, deshalb ist `sport` Teil des Query-Keys (s. `qk.
 *  activeTrainingPlan`). */
export function useActiveTrainingPlan(athleteId: string, sport: "ride" | "run" | "swim" = "ride") {
  const queryClient = useQueryClient();
  // `training_plans` hat keinen anon-GRANT — ohne Login kann der Read nur
  // 401en (nie ein nützliches Ergebnis). Der Planungstab ist aber öffentlich
  // (nicht hinter ProtectedRoute), also würde ein ausgeloggter Betrachter
  // sonst bei jedem Aufruf eine 401 in die Konsole schreiben. Gaten statt
  // schlucken.
  const userId = useAuthUserId();
  return useQuery({
    queryKey: qk.activeTrainingPlan(athleteId, sport),
    enabled: !!userId,
    queryFn: async (): Promise<TrainingPlan | null> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return null;
      const res = await listActiveTrainingPlan(profileId, sport);
      return res.ok ? res.plan : null;
    },
  });
}

/** Die materialisierte Wochenstruktur des aktiven Plans DIESER Sportart, oder
 *  `null`, wenn der Athlet dort keinen selbst gebauten Plan hat (dann greift
 *  die Code-Vorlage in `core/plan-week-model.js`). Fahrplan 8 E7:
 *  Aufrufstellen von `planWeekFor()` / `isDeliberateRestDay()` reichen diesen
 *  Wert durch — `sport` default "ride" wie `useActiveTrainingPlan`. */
export function useActiveWeekModel(
  athleteId: string,
  sport: "ride" | "run" | "swim" = "ride",
): WeekModelEntry[] | null {
  const model = useActiveTrainingPlan(athleteId, sport).data?.weekModel;
  return model && model.length ? model : null;
}
