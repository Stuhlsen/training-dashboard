/* ============================================================
   API/HOOKS/USESYNCLOCATION.TS — grober Standort des eingeloggten Users
   für die Sync-Wettervorschau (Tabelle athlete_sync_config, Migration
   0023, Fahrplan 7 CRED2). Muster wie api/hooks/useIntervalsCredentials.ts
   (eine Zeile je Profil, expliziter Result nach dem Speichern).

   `location` ist `{ lat: null, lon: null }`, solange nichts hinterlegt ist
   — der normale Zustand vor dem ersten Eintragen, kein Fehlerbild.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSyncLocation, updateSyncLocation as updateSyncLocationAdapter } from "../supabase/athlete-sync-config";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result, SyncLocation } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const EMPTY: SyncLocation = { lat: null, lon: null };

export function useSyncLocation() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.syncLocation(userId ?? "anonymous");

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SyncLocation> => unwrap(await getSyncLocation(userId!)).location,
  });

  const mutation = useMutation({
    mutationFn: async (location: SyncLocation) => {
      unwrap(await updateSyncLocationAdapter(userId!, location));
      return { location };
    },
    onSuccess: ({ location }) => {
      queryClient.setQueryData<SyncLocation>(key, location);
    },
  });

  const update = useCallback(
    async (location: SyncLocation): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(location));
    },
    [mutation, userId],
  );

  return { location: query.data ?? EMPTY, isLoading: query.isLoading, update, isPending: mutation.isPending };
}
