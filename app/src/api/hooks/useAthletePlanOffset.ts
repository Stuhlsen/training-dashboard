/* ============================================================
   API/HOOKS/USEATHLETEPLANOFFSET.TS — plan_offset_weeks (Migration 0026)
   des GERADE BETRACHTETEN Athleten (nicht des eingeloggten Users).

   Gebraucht für die Anzeige-Kohärenz im Planungstab (Ruhetag-Ableitung,
   Erholungs-Schattierung, Phasen-Überschriften) und die week/phase-
   Neuvergabe beim Einzel-Move — dort zählt der Offset des Athleten, dessen
   Plan gezeigt wird, nicht der des Trainers/Betrachters.

   Ist der betrachtete Athlet der eingeloggte User selbst (der Normalfall,
   und der EINZIGE, der den Offset schreiben kann — RLS auf die eigene
   profiles-Zeile), kommt der Wert direkt aus `useCurrentProfile()`: EINE
   Quelle (qk.profile), die `useUpdatePlanOffsetWeeks` synchron aktualisiert,
   kein zweiter Fetch, kein Auseinanderlaufen im Invalidate-Fenster.

   Nur für einen GECOACHTEN Fremdathleten wird `profiles_visible`
   (getProfileByDisplayName) gezogen. Ein Nicht-Coach-Betrachter sieht die
   Zeile nicht → 0 (nur Anzeige-Drift in einer reinen Betrachter-Ansicht).
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getProfileByDisplayName } from "../supabase/profiles";
import { athleteConfig } from "../../config";
import { qk } from "../keys";
import { unwrap } from "../result";
import { useAuthUserId, useCurrentProfile } from "./useSession";
import { useIsSelfAthlete } from "./useWriteAuthorization";

async function resolve(athleteId: string): Promise<number> {
  const name = athleteConfig(athleteId)?.name;
  if (!name) return 0;
  const { profile } = unwrap(await getProfileByDisplayName(name));
  return profile?.planOffsetWeeks ?? 0;
}

/** Ganzwochen-Verschiebung des betrachteten Athleten, `0` solange unbekannt. */
export function useAthletePlanOffset(athleteId: string): number {
  const userId = useAuthUserId();
  const { isSelf } = useIsSelfAthlete(athleteId);
  const selfProfile = useCurrentProfile().data ?? null;
  const other = useQuery({
    queryKey: qk.athletePlanOffset(athleteId),
    queryFn: () => resolve(athleteId),
    // Nur bei einem Fremdathleten (mit Login): profiles_visible ist anon
    // nicht lesbar, und beim Self-Athleten kommt der Wert aus useCurrentProfile.
    enabled: !!userId && !isSelf,
    staleTime: 5 * 60_000,
  });
  if (isSelf) return selfProfile?.planOffsetWeeks ?? 0;
  return other.data ?? 0;
}
