/* ============================================================
   API/HOOKS/USEACCOUNTDELETIONREQUEST.TS — Löschantrag des eingeloggten
   Users (Settings, Bereich "Datenschutz & Account"). Muster wie
   useIntervalsCredentials.ts.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAccountDeletionRequest,
  requestAccountDeletion as requestAccountDeletionAdapter,
} from "../supabase/account-deletion";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** `requestedAt: undefined` solange geladen wird, `null` ohne offenen Antrag. */
export function useAccountDeletionRequest() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.accountDeletionRequest(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async (): Promise<string | null> => unwrap(await getAccountDeletionRequest(userId!)).requestedAt,
  });
  return { requestedAt: query.data ?? null, isLoading: query.isLoading };
}

export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.accountDeletionRequest(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async () => unwrap(await requestAccountDeletionAdapter(userId!)),
    onSuccess: ({ requestedAt }) => {
      queryClient.setQueryData<string>(key, requestedAt);
    },
  });

  const request = useCallback(async (): Promise<Result> => {
    if (!userId) return { ok: false, error: NOT_LOGGED_IN };
    return catchResult(() => mutation.mutateAsync());
  }, [mutation, userId]);

  return { request, isPending: mutation.isPending };
}
