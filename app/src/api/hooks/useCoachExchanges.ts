/* ============================================================
   API/HOOKS/USECOACHEXCHANGES.TS — Verlauf der KI-Coach-Runden
   (Fahrplan 9 Etappe B — docs/fahrplan-9-coach-loop.md)

   Lädt die coach_exchanges-Zeilen des angezeigten Athleten (Adapter kappt
   auf die letzten 20) und leitet je Zeile den Ausgang aus den proposals
   derselben group_id ab — die Ableitung ist die reine Funktion
   core/coach-exchange-outcome.js, der Join passiert HIER (nicht im Adapter,
   nicht in der Komponente). Muster: useProposals.ts.
   ============================================================ */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteCoachExchange,
  insertCoachExchange,
  listCoachExchanges,
} from "../supabase/coach-exchanges";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAuthUserId } from "./useSession";
import { useProposals } from "./useProposals";
import { deriveCoachExchangeOutcome } from "../../core/coach-exchange-outcome.js";
import { qk } from "../keys";
import { catchResult, ResultError_, unwrap } from "../result";
import type { CoachExchange, CoachExchangeOutcome, CoachExchangePreset, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};

/** coach_exchanges-Zeile plus den beim Laden abgeleiteten Ausgang und die
 *  Anzahl noch offener Vorschläge der Runde (für das Badge „offen (n)"). */
export interface CoachExchangeView extends CoachExchange {
  outcome: CoachExchangeOutcome;
  openCount: number;
}

function usePrependCoachExchange(athleteId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (fresh: CoachExchange) => {
      queryClient.setQueryData<CoachExchange[]>(qk.coachExchanges(athleteId), (rows) => [
        fresh,
        ...(rows ?? []),
      ]);
    },
    [queryClient, athleteId],
  );
}

/** Verlauf des Athleten, neueste zuerst, je Zeile mit `outcome`/`openCount`
 *  aus dem aktuellen proposals-Stand gejoint. Der Join läuft über `useMemo`,
 *  damit eine spätere Einzelentscheidung an einem Vorschlag den Ausgang der
 *  Verlaufszeile sofort mitzieht. */
export function useCoachExchanges(athleteId: string) {
  const queryClient = useQueryClient();
  const { data: proposals } = useProposals(athleteId);

  const query = useQuery({
    queryKey: qk.coachExchanges(athleteId),
    queryFn: async (): Promise<CoachExchange[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      return unwrap(await listCoachExchanges(profileId)).exchanges;
    },
  });

  const exchanges = useMemo<CoachExchangeView[]>(() => {
    const props = proposals ?? [];
    return (query.data ?? []).map((ex) => ({
      ...ex,
      outcome: deriveCoachExchangeOutcome(ex.proposalGroupId, props),
      openCount: ex.proposalGroupId
        ? props.filter((p) => p.groupId === ex.proposalGroupId && p.status === "open").length
        : 0,
    }));
  }, [query.data, proposals]);

  return { exchanges, isLoading: query.isLoading, isError: query.isError, error: query.error };
}

/** Legt eine Verlaufszeile an — eine je abgeschlossener Copy-Paste-Runde,
 *  beim „Importieren"-Klick (auch bei 0 Vorschlägen → `proposalGroupId:
 *  null`). Selbst-Import: `created_by = athlete_id = auth.uid()`. */
export function useCreateCoachExchange(athleteId: string) {
  const userId = useAuthUserId();
  const prepend = usePrependCoachExchange(athleteId);

  const mutation = useMutation({
    mutationFn: async (input: {
      preset: CoachExchangePreset;
      rawResponse: string;
      proposalGroupId: string | null;
    }) => unwrap(await insertCoachExchange(userId!, userId!, input)),
    onSuccess: ({ exchange }) => prepend(exchange),
  });

  const createExchange = useCallback(
    async (input: {
      preset: CoachExchangePreset;
      rawResponse: string;
      proposalGroupId: string | null;
    }): Promise<Result<{ exchange: CoachExchange }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(input));
    },
    [mutation, userId],
  );

  return { createExchange, isPending: mutation.isPending };
}

/** Entfernt eine Verlaufszeile (nur der Athlet selbst, RLS). */
export function useDeleteCoachExchange(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await deleteCoachExchange(id));
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<CoachExchange[]>(qk.coachExchanges(athleteId), (rows) =>
        (rows ?? []).filter((r) => r.id !== id),
      );
    },
  });

  const removeExchange = useCallback(
    async (id: string): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(async () => {
        await mutation.mutateAsync(id);
        return {};
      });
    },
    [mutation, userId],
  );

  return { removeExchange, isPending: mutation.isPending };
}
