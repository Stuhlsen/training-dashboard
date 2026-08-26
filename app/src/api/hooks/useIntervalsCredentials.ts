/* ============================================================
   API/HOOKS/USEINTERVALSCREDENTIALS.TS — Read + Update-Mutation für die
   intervals.icu-Zugangsdaten des eingeloggten Users (Migration 0019).
   Ersetzt das frühere localStorage/window.prompt()-Muster für Wahoo-Push
   und ist zugleich Quelle für den Streams-Abruf im Planungstab-Detail-
   Chart. Muster wie api/hooks/useProfile.ts.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getIntervalsCredentials,
  updateIntervalsCredentials as updateIntervalsCredentialsAdapter,
} from "../supabase/intervals-credentials";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { IntervalsCredentials, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** `credentials: undefined` solange geladen wird, `null` ohne hinterlegte
 *  Zugangsdaten (normaler Zustand vor dem ersten Eintragen), sonst die
 *  gespeicherten Werte. */
export function useIntervalsCredentials() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.intervalsCredentials(userId ?? "anonymous"),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<IntervalsCredentials | null> =>
      unwrap(await getIntervalsCredentials(userId!)).credentials,
  });
  return { credentials: query.data ?? null, isLoading: query.isLoading };
}

export function useUpdateIntervalsCredentials() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.intervalsCredentials(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (credentials: IntervalsCredentials) => {
      unwrap(await updateIntervalsCredentialsAdapter(userId!, credentials));
      return { credentials };
    },
    onSuccess: ({ credentials }) => {
      queryClient.setQueryData<IntervalsCredentials>(key, credentials);
    },
  });

  const update = useCallback(
    async (credentials: IntervalsCredentials): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(credentials));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}
