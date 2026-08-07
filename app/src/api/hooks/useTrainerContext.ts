/* ============================================================
   API/HOOKS/USETRAINERCONTEXT.TS — Ist der eingeloggte User Trainer
   DIESES Athleten? (Etappe 7a, Trainer-Leiste)

   Port von state/trainer-view.js::loadTrainerContext() (Vanilla). Wichtig
   (Bugfix-Pattern aus ui/trainer-bar.js::_draw(), Z. 178-196, Playwright-
   bestätigt 25.07.2026): `isTrainer` muss bei JEDEM Athletenwechsel frisch
   geprüft werden, sonst erscheint die Leiste fälschlich beim Athleten
   selbst. Mit einem keyed Query (Key trägt userId+athleteId, s. api/keys.ts)
   ist das strukturell garantiert — solange die Antwort für einen neuen
   Athleten noch aussteht, ist `query.data` `undefined`, `isTrainer` also
   fail-closed `false` statt eines gecachten Stands vom vorherigen Athleten.
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { resolveTrainerContext } from "../write-authorization";
import { useSessionProfile } from "./useSession";
import { qk } from "../keys";

export interface TrainerContext {
  isTrainer: boolean;
  athleteProfileId: string | null;
}

/** @param athleteId interne Kennung ("athlete1"/"athlete2") des GERADE
 *    BETRACHTETEN Athleten. */
export function useTrainerContext(athleteId: string): TrainerContext & { isLoading: boolean } {
  const user = useSessionProfile();
  const query = useQuery({
    queryKey: qk.trainerContext(user?.id ?? null, athleteId),
    queryFn: () => resolveTrainerContext(user, athleteId),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  return {
    isTrainer: query.data?.isTrainer === true,
    athleteProfileId: query.data?.athleteProfileId ?? null,
    isLoading: query.isLoading,
  };
}
