import { useQuery, type QueryClient } from "@tanstack/react-query";
import { findProfileIdByDisplayName } from "../supabase/profiles";
import { athleteConfig } from "../../config";
import { qk } from "../keys";
import { unwrap } from "../result";

/** Löst die interne Athleten-Kennung ("athlete1"/"athlete2") auf die
 *  Supabase-Profil-UUID auf. Nötig, weil alle athletenscoped Tabellen eine
 *  echte `uuid` als `athlete_id` führen — ein `.eq("athlete_id", "athlete1")`
 *  scheitert am Spaltentyp.
 *
 *  `null`, wenn der Athlet (noch) keinen Supabase-Account hat. Das ist kein
 *  Fehler: Athlet 2 war lange genau in diesem Zustand, und die lesenden
 *  Bereiche zeigen dann schlicht nichts an.
 *
 *  In der Vanilla-Version war das eine handgeschriebene `Map` in
 *  state/plan-cards.js — hier übernimmt der Query-Cache das Cachen, und
 *  weil die Zuordnung sich praktisch nie ändert, mit `staleTime: Infinity`. */
async function resolve(athleteId: string): Promise<string | null> {
  const name = athleteConfig(athleteId)?.name;
  if (!name) return null;
  const { id } = unwrap(await findProfileIdByDisplayName(name));
  return id;
}

export function useAthleteProfileId(athleteId: string) {
  return useQuery({
    queryKey: qk.athleteProfileId(athleteId),
    queryFn: () => resolve(athleteId),
    staleTime: Infinity,
  });
}

/** Dieselbe Auflösung außerhalb der Render-Phase — für queryFn/mutationFn,
 *  die die UUID brauchen, bevor sie ihren eigentlichen Request stellen.
 *  `fetchQuery` teilt sich Cache und Deduplizierung mit dem Hook oben, es
 *  entsteht also kein zweiter Request. */
export function fetchAthleteProfileId(
  queryClient: QueryClient,
  athleteId: string,
): Promise<string | null> {
  return queryClient.fetchQuery({
    queryKey: qk.athleteProfileId(athleteId),
    queryFn: () => resolve(athleteId),
    staleTime: Infinity,
  });
}
