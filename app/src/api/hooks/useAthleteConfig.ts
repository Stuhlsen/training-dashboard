import { useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteConfig, SELF_ATHLETE_ID, type AthleteConfig } from "../../config";
import { buildDbAthleteConfig } from "../athlete-config-db";
import { getAthleteProfileExtras } from "../supabase/athlete-profile-extras";
import { getProfile } from "../supabase/profiles";
import { getTrainingMeta } from "../supabase/training-profile-data";
import { qk } from "../keys";
import { fetchAthleteProfileId } from "./useAthleteProfileId";

/** Stammdaten des betrachteten Eintrags (Fahrplan 26 E3): ein Platz aus
 *  `config.ts` liefert wie bisher `athleteConfig(id)`; der Eintrag `self`
 *  (Account ohne Platz) bekommt sie aus der DB — `athlete_profile_extras`,
 *  dann `training_profile_data.meta`, dann `profiles` (`athlete-config-db.ts`).
 *
 *  `null`, solange die DB-Stammdaten laden oder wenn es weder Platz noch
 *  `self` ist — Aufrufer behandeln `null` wie bisher (FTP-Widgets aus).
 *  Hero, Analyse und Footer lesen darüber; Stellen, die weiter direkt
 *  `athleteConfig()` rufen (Planung, Ernährung, Einstellungen), sehen für
 *  `self` unverändert `null`. */
export function useAthleteConfig(athleteId: string): AthleteConfig | null {
  const queryClient = useQueryClient();
  const slot = athleteConfig(athleteId);
  const { data } = useQuery({
    queryKey: qk.athleteConfig(athleteId),
    enabled: !slot && athleteId === SELF_ATHLETE_ID,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AthleteConfig | null> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return null;
      const [profile, extras, meta] = await Promise.all([
        getProfile(profileId),
        getAthleteProfileExtras(profileId),
        getTrainingMeta(profileId),
      ]);
      return buildDbAthleteConfig(athleteId, {
        // Jede Quelle fällt einzeln aus: ein Lesefehler in einer soll die
        // anderen Stammdaten nicht mitnehmen (Fallback "Ich"/Rad bzw. null).
        // Die Trainingsdaten selbst laufen über useRides/TrainingDataGate und
        // zeigen ihre Fehler dort.
        profile: profile.ok ? profile.profile : null,
        extras: extras.ok ? extras.extras : null,
        meta: meta.ok ? meta.meta : null,
      });
    },
  });
  return slot ?? data ?? null;
}
