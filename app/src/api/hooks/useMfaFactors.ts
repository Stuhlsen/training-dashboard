/* ============================================================
   API/HOOKS/USEMFAFACTORS.TS — Zwei-Faktor-Login (TOTP) des eingeloggten
   Users (Settings, Bereich "Konto & Sicherheit"). Mutationen invalidieren
   statt optimistic setQueryData — der enroll→verify-Ablauf hat mehr
   Zustände als ein einfacher Boolean-Toggle (vgl. useSaveGoal/
   useDeactivateGoal, die aus demselben Grund invalidieren).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listMfaFactors,
  enrollTotpFactor as enrollTotpFactorAdapter,
  verifyTotpFactor as verifyTotpFactorAdapter,
  unenrollTotpFactor as unenrollTotpFactorAdapter,
  type MfaFactorStatus,
} from "../supabase/mfa";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

export function useMfaFactors() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.mfaFactors(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async (): Promise<{ status: MfaFactorStatus; factorId: string | null }> =>
      unwrap(await listMfaFactors()),
  });
  return { status: query.data?.status ?? "none", factorId: query.data?.factorId ?? null, isLoading: query.isLoading };
}

export function useEnrollTotpFactor() {
  const mutation = useMutation({
    mutationFn: async () => unwrap(await enrollTotpFactorAdapter()),
  });

  const enroll = useCallback(
    async (): Promise<Result<{ factorId: string; qrCodeSvg: string; secret: string }>> =>
      catchResult(() => mutation.mutateAsync()),
    [mutation],
  );

  return { enroll, isPending: mutation.isPending };
}

export function useVerifyTotpFactor() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.mfaFactors(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }) =>
      unwrap(await verifyTotpFactorAdapter(factorId, code)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const verify = useCallback(
    async (factorId: string, code: string): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync({ factorId, code }));
    },
    [mutation, userId],
  );

  return { verify, isPending: mutation.isPending };
}

export function useUnenrollTotpFactor() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.mfaFactors(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (factorId: string) => unwrap(await unenrollTotpFactorAdapter(factorId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const unenroll = useCallback(
    async (factorId: string): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(factorId));
    },
    [mutation, userId],
  );

  return { unenroll, isPending: mutation.isPending };
}
