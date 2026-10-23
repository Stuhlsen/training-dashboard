/* ============================================================
   API/HOOKS/USETRAININGDATAPUBLIC.TS — Schalter „Trainingsdaten für alle
   Eingeloggten sichtbar" (profiles.training_data_public, Migration 0078,
   Fahrplan 26 E4). Standard aus. Muster wie useUpdateFtpPublic().
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTrainingDataPublic, setTrainingDataPublic } from "../supabase/profiles";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

export function useTrainingDataPublic() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.trainingDataPublic(userId ?? "anonymous");

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => unwrap(await getTrainingDataPublic(userId!)).value,
  });

  const mutation = useMutation({
    mutationFn: async (value: boolean) => {
      unwrap(await setTrainingDataPublic(userId!, value));
      return { value };
    },
    onSuccess: ({ value }) => {
      queryClient.setQueryData<boolean>(key, value);
    },
  });

  const update = useCallback(
    async (value: boolean): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(value));
    },
    [mutation, userId],
  );

  // Bei Lesefehler ist der Stand unbekannt: `isError` lässt die UI den Schalter
  // sperren, statt „aus" vorzutäuschen.
  return {
    isPublic: query.data ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    update,
    isPending: mutation.isPending,
  };
}
