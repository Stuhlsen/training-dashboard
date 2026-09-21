import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getIterationDates } from "../supabase/bikefit";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { qk } from "../keys";
import { unwrap } from "../result";

/** Zeitpunkte aller Bike-Fit-Iterationen des ANGEZEIGTEN Athleten, für den
 *  🚲-Marker im Fahrtenbuch (Fahrplan 16 E9/OF-4). Wie useEvents() über den
 *  Query-Cache statt einem rohen useEffect — verhindert, dass beim schnellen
 *  Athleten-Wechsel eine überholte Antwort die Marker des zuvor angezeigten
 *  Athleten überschreibt. */
export function useBikefitMarkerDates(athleteId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.bikefitMarkerDates(athleteId),
    queryFn: async (): Promise<string[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return [];
      return unwrap(await getIterationDates(profileId)).dates;
    },
  });
}
