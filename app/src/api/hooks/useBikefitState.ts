/* ============================================================
   API/HOOKS/USEBIKEFITSTATE.TS — Aktives Fitting + Iterationen (Fahrplan 16 E5-E7)

   getActiveFitting()/getIterations() behandeln ein leeres bikeId/fittingId
   bereits selbst als "nichts vorhanden" (s. api/supabase/bikefit.ts) — die
   Queries laufen deshalb ohne `enabled`-Gate, wie beim Vorbild useEvents().
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getActiveFitting,
  startFitting as startFittingAdapter,
  completeFitting as completeFittingAdapter,
  getIterations,
  addIteration as addIterationAdapter,
  type BikefitFitting,
  type BikefitIteration,
  type TargetGoal,
} from "../supabase/bikefit";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

const EMPTY_ITERATIONS: BikefitIteration[] = [];

export function useActiveFitting(bikeId: string) {
  const query = useQuery({
    queryKey: qk.activeFitting(bikeId),
    queryFn: async () => unwrap(await getActiveFitting(bikeId)).fitting,
  });
  return { fitting: query.data ?? null, isLoading: query.isLoading };
}

export function useFittingIterations(fittingId: string) {
  const query = useQuery({
    queryKey: qk.fittingIterations(fittingId),
    queryFn: async () => unwrap(await getIterations(fittingId)).iterations,
  });
  return { iterations: query.data ?? EMPTY_ITERATIONS, isLoading: query.isLoading };
}

export function useStartFitting(bikeId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (params: { profileId: string; targetGoal: TargetGoal; notes?: string | null }) =>
      unwrap(await startFittingAdapter(params.profileId, bikeId, params.targetGoal, params.notes)).fitting,
    onSuccess: (fitting) => {
      queryClient.setQueryData<BikefitFitting | null>(qk.activeFitting(bikeId), fitting);
      queryClient.setQueryData<BikefitIteration[]>(qk.fittingIterations(fitting.id), []);
    },
  });

  const start = useCallback(
    (params: { profileId: string; targetGoal: TargetGoal; notes?: string | null }): Promise<Result<{ fitting: BikefitFitting }>> =>
      catchResult(async () => ({ fitting: await mutation.mutateAsync(params) })),
    [mutation],
  );
  return { start, isPending: mutation.isPending };
}

export function useCompleteFitting(bikeId: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (fittingId: string) => unwrap(await completeFittingAdapter(fittingId)).fitting,
    onSuccess: () => {
      queryClient.setQueryData<BikefitFitting | null>(qk.activeFitting(bikeId), null);
    },
  });

  const complete = useCallback(
    (fittingId: string): Promise<Result<{ fitting: BikefitFitting }>> =>
      catchResult(async () => ({ fitting: await mutation.mutateAsync(fittingId) })),
    [mutation],
  );
  return { complete, isPending: mutation.isPending };
}

export function useAddIteration(fittingId: string) {
  const queryClient = useQueryClient();
  const key = qk.fittingIterations(fittingId);
  const mutation = useMutation({
    mutationFn: async (params: {
      sequence: number;
      photoPathLegs?: string | null;
      photoPathRiding?: string | null;
      points: Record<string, unknown>;
      angles: Record<string, unknown>;
      recommendation: Record<string, unknown>;
    }) => unwrap(await addIterationAdapter({ fittingId, ...params })).iteration,
    onSuccess: (iteration) => {
      queryClient.setQueryData<BikefitIteration[]>(key, (iterations) => [...(iterations ?? []), iteration]);
    },
  });

  const addIteration = useCallback(
    (params: {
      sequence: number;
      photoPathLegs?: string | null;
      photoPathRiding?: string | null;
      points: Record<string, unknown>;
      angles: Record<string, unknown>;
      recommendation: Record<string, unknown>;
    }): Promise<Result<{ iteration: BikefitIteration }>> =>
      catchResult(async () => ({ iteration: await mutation.mutateAsync(params) })),
    [mutation],
  );
  return { addIteration, isPending: mutation.isPending };
}
