/* ============================================================
   API/HOOKS/USEATHLETEPLANOFFSET.TS — plan_offset_weeks (Migration 0026)
   des GERADE BETRACHTETEN Athleten (nicht des eingeloggten Users).

   Gebraucht für die Anzeige-Kohärenz im Planungstab (Ruhetag-Ableitung,
   Erholungs-Schattierung, Phasen-Überschriften) und die week/phase-
   Neuvergabe beim Einzel-Move — dort zählt der Offset des Athleten, dessen
   Plan gezeigt wird, nicht der des Trainers/Betrachters.

   Liest über `profiles_visible` (getProfileByDisplayName): die View zeigt die
   eigene Zeile UND die gecoachter Athleten. Ein Nicht-Coach, der per Toggle
   auf einen Fremdathleten schaut, sieht die Zeile nicht → 0 (nur
   Anzeige-Drift in einer reinen Betrachter-Ansicht — der Schreibpfad
   „Plan verschieben" ist ohnehin self-only, RLS auf die eigene profiles-Zeile).
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getProfileByDisplayName } from "../supabase/profiles";
import { athleteConfig } from "../../config";
import { qk } from "../keys";
import { unwrap } from "../result";
import { useAuthUserId } from "./useSession";

async function resolve(athleteId: string): Promise<number> {
  const name = athleteConfig(athleteId)?.name;
  if (!name) return 0;
  const { profile } = unwrap(await getProfileByDisplayName(name));
  return profile?.planOffsetWeeks ?? 0;
}

/** Ganzwochen-Verschiebung des betrachteten Athleten, `0` solange unbekannt.
 *  Nur mit Login: `profiles_visible` ist anon nicht lesbar (401), und der
 *  Offset ist ohnehin nur für eingeloggte Bearbeiter/Coaches relevant —
 *  gleiche `enabled: !!user`-Gate wie useTrainerContext. */
export function useAthletePlanOffset(athleteId: string): number {
  const userId = useAuthUserId();
  return (
    useQuery({
      queryKey: qk.athletePlanOffset(athleteId),
      queryFn: () => resolve(athleteId),
      enabled: !!userId,
      staleTime: 5 * 60_000,
    }).data ?? 0
  );
}
