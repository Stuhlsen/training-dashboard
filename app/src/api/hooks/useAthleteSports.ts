/* ============================================================
   API/HOOKS/USEATHLETESPORTS.TS — Sportarten (Migration 0052)
   des GERADE BETRACHTETEN Athleten (nicht des eingeloggten Users).

   Fahrplan 21, E2: verschiebt die Sportarten-Lesequelle von
   `config.ts` (hartcodiertes `athleteConfig(id).sports`) auf den
   potenziell DB-gestützten Wert aus `profiles.sports`. Golden-Master:
   solange kein Athlet seine Sportarten in Settings (E3) ändert, ist
   der gelesene Wert identisch zu heute — der Hook fällt auf
   `config.ts` zurück, bis ein DB-Wert vorliegt, und die Migration (E1)
   hat exakt die heutigen `config.ts`-Werte geseedet.

   Aufbau 1:1 wie `useAthletePlanOffset` (0026): Selbst-Fall direkt aus
   `useCurrentProfile()` (eine Quelle, synchron über den Anzeigenamen
   erkannt), Fremd-Fall (gecoachter Athlet) über `profiles_visible`/
   `getProfileByDisplayName`. Fallback für beide Fälle auf
   `athleteConfig(id)?.sports ?? ["ride"]`.
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getProfileByDisplayName } from "../supabase/profiles";
import { athleteConfig } from "../../config";
import type { Sport } from "../types";
import { qk } from "../keys";
import { unwrap } from "../result";
import { useAuthUserId, useCurrentProfile } from "./useSession";

function configFallback(athleteId: string): readonly Sport[] {
  // config.ts erlaubt auch "other" in der Literal-Liste, die DB-Spalte (V2)
  // ist aber auf ride/run/swim beschränkt — der Cast ist sicher, solange kein
  // Athlet "other" trägt (kein gecasteter Runtime-Fall, nur Typnarrowing).
  return (athleteConfig(athleteId)?.sports ?? (["ride"] as const)) as readonly Sport[];
}

async function resolve(athleteId: string): Promise<readonly Sport[]> {
  const name = athleteConfig(athleteId)?.name;
  if (!name) return configFallback(athleteId);
  const { profile } = unwrap(await getProfileByDisplayName(name));
  return profile?.sports ?? configFallback(athleteId);
}

/** Sportarten des betrachteten Athleten — aus der DB, sobald ein Wert
 *  vorliegt, sonst der `config.ts`-Fallback (Golden-Master vor E3). */
export function useAthleteSports(athleteId: string): readonly Sport[] {
  const userId = useAuthUserId();
  const selfProfile = useCurrentProfile().data ?? null;
  const isSelf = !!selfProfile && athleteConfig(athleteId)?.name === selfProfile.displayName;

  const other = useQuery({
    queryKey: qk.athleteSports(userId ?? "anon", athleteId),
    queryFn: () => resolve(athleteId),
    // Nur bei einem gecoachten Fremdathleten (der Selbst-Fall kommt direkt
    // aus useCurrentProfile()).
    enabled: !!userId && !isSelf,
    staleTime: 5 * 60_000,
  });

  if (isSelf) return selfProfile.sports ?? configFallback(athleteId);
  return other.data ?? configFallback(athleteId);
}
