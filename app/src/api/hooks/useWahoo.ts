/* ============================================================
   API/HOOKS/USEWAHOO.TS — Wahoo-Verbindung des eingeloggten Users
   (Settings, Abschnitt "Wahoo", Fahrplan 19 B3). Muster wie
   useAccountDeletionRequest.ts.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { disconnectWahoo, getWahooStatus, startWahooConnect, type WahooStatus } from "../wahoo";
import { getEnvironment } from "../supabase/config";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, toResultError, unwrap } from "../result";
import type { Result, ResultError } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** Wahoo ist im Demo-Stack bewusst aus (Fahrplan 19, Entscheidung 9). */
export function isWahooAvailable(): boolean {
  return getEnvironment() !== "demo";
}

export function useWahooStatus(enabled = true) {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.wahooStatus(userId ?? "anonymous"),
    enabled: enabled && !!userId,
    retry: false,
    queryFn: async (): Promise<WahooStatus> => {
      const { connected, scope, expiresAt } = unwrap(await getWahooStatus());
      return { connected, scope, expiresAt };
    },
  });
  const error: ResultError | null = query.error ? toResultError(query.error) : null;
  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    error,
    notConfigured: error?.code === "NOT_CONFIGURED",
  };
}

/** Holt die Authorize-URL; die Weiterleitung macht die UI. */
export function useWahooConnect() {
  const mutation = useMutation({ mutationFn: async () => unwrap(await startWahooConnect()) });
  const start = useCallback(async (): Promise<Result<{ url: string }>> => catchResult(() => mutation.mutateAsync()), [mutation]);
  return { start, isPending: mutation.isPending };
}

export function useWahooDisconnect() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async () => unwrap(await disconnectWahoo()),
    onSuccess: () => {
      queryClient.setQueryData<WahooStatus>(qk.wahooStatus(userId ?? "anonymous"), {
        connected: false,
        scope: null,
        expiresAt: null,
      });
    },
  });

  const disconnect = useCallback(async (): Promise<Result<{ revoked: boolean }>> => {
    if (!userId) return { ok: false, error: NOT_LOGGED_IN };
    return catchResult(() => mutation.mutateAsync());
  }, [mutation, userId]);

  return { disconnect, isPending: mutation.isPending };
}
