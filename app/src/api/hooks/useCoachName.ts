/* ============================================================
   API/HOOKS/USECOACHNAME.TS — Anzeigename des verknüpften Trainers
   (Settings, Bereich "Daten") — read-only, kein Self-Service-Verknüpfen.
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getCoachDisplayName } from "../supabase/profiles";
import { qk } from "../keys";
import { unwrap } from "../result";

export function useCoachName(coachId: string | null | undefined) {
  const query = useQuery({
    queryKey: qk.coachName(coachId ?? "none"),
    enabled: !!coachId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string | null> => unwrap(await getCoachDisplayName(coachId!)).name,
  });
  return { name: query.data ?? null, isLoading: query.isLoading };
}
