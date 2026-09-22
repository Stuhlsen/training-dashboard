/* ============================================================
   API/HOOKS/USEBIKES.TS — Räder-Verwaltung (Fahrplan 16, E3/E5)

   Zwei getrennte Lesepfade (Migration 0051, Security-Review-Fund):
   - useOwnBikes(): volle Zeile inkl. notes, nur für den eingeloggten User
     selbst — Settings-Verwaltung (BikesSection.tsx).
   - useBikesPublic(athleteId): bikes_public-View ohne notes, für einen
     BELIEBIGEN angezeigten Athleten — Bike-Fit-Tab (BikefitPage.tsx).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBikes,
  getBikesPublic,
  createBike as createBikeAdapter,
  updateBike as updateBikeAdapter,
  deleteBike as deleteBikeAdapter,
  type Bike,
  type BikeInput,
  type PublicBike,
} from "../supabase/bikes";
import { useAuthUserId } from "./useSession";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const EMPTY_BIKES: Bike[] = [];
const EMPTY_PUBLIC_BIKES: PublicBike[] = [];

export function useOwnBikes() {
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  const key = qk.bikes(userId ?? "anonymous");

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async () => unwrap(await getBikes(userId!)).bikes,
  });

  const createMutation = useMutation({
    mutationFn: async (input: BikeInput) => unwrap(await createBikeAdapter(userId!, input)).bike,
    onSuccess: (bike) => {
      queryClient.setQueryData<Bike[]>(key, (bikes) => [...(bikes ?? []), bike]);
    },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<BikeInput> }) =>
      unwrap(await updateBikeAdapter(id, input)).bike,
    onSuccess: (bike) => {
      queryClient.setQueryData<Bike[]>(key, (bikes) => (bikes ?? []).map((b) => (b.id === bike.id ? bike : b)));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await deleteBikeAdapter(id));
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Bike[]>(key, (bikes) => (bikes ?? []).filter((b) => b.id !== id));
    },
  });

  const create = useCallback(
    async (input: BikeInput): Promise<Result<{ bike: Bike }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(async () => ({ bike: await createMutation.mutateAsync(input) }));
    },
    [createMutation, userId],
  );
  const update = useCallback(
    async (id: string, input: Partial<BikeInput>): Promise<Result<{ bike: Bike }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(async () => ({ bike: await updateMutation.mutateAsync({ id, input }) }));
    },
    [updateMutation, userId],
  );
  const remove = useCallback(
    async (id: string): Promise<Result<{ deletedId: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(async () => ({ deletedId: await deleteMutation.mutateAsync(id) }));
    },
    [deleteMutation, userId],
  );

  return {
    bikes: query.data ?? EMPTY_BIKES,
    isLoading: query.isLoading,
    create,
    update,
    remove,
    isPending: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}

export function useBikesPublic(athleteId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.bikesPublic(athleteId),
    queryFn: async (): Promise<PublicBike[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return [];
      return unwrap(await getBikesPublic(profileId)).bikes;
    },
  });
  return { bikes: query.data ?? EMPTY_PUBLIC_BIKES, isLoading: query.isLoading };
}
