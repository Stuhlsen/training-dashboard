/* ============================================================
   API/HOOKS/USESESSIONFORMATCATALOG.TS — Admin-Editor für session_formats
   (Settings, Fahrplan 8 E11)

   Anders als useAthleteFormats() (voller Katalog + Aktiv-Status EINES
   Profils) liefert dieser Hook nur den athletenunabhängigen Katalog und
   die drei Admin-Schreibpfade. Sichtbarkeits-/Rollen-Gate sitzt in der
   Sektion (profile.isAdmin); RLS (Migration 0014) setzt es serverseitig
   durch.

   Die Schema-Validierung des Formulars liegt als reine Funktion in
   features/settings/format-catalog-view-model.ts — dieser Hook schreibt,
   was ihm übergeben wird (Muster wie useGoals / useSetAthleteFormatActive).

   Nach jeder Änderung wird zusätzlich qk.athleteFormats(userId) entwertet,
   damit die Familienauswahl (FormatsSection) ein neues/gelöschtes Format
   sofort sieht.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSessionFormats,
  createSessionFormat,
  updateSessionFormat,
  deleteSessionFormat,
  type SessionFormat,
  type SessionFormatInput,
} from "../supabase/session-formats";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

/** Voller Formatkatalog, nach `id` sortiert. */
export function useSessionFormatCatalog() {
  const query = useQuery({
    queryKey: qk.sessionFormatCatalog(),
    queryFn: async (): Promise<SessionFormat[]> => {
      const formats = unwrap(await getSessionFormats()).formats;
      return [...formats].sort((a, b) => a.id.localeCompare(b.id));
    },
  });
  return { formats: query.data ?? [], isLoading: query.isLoading };
}

/** Anlegen / Ändern / Löschen eines Formats (Admin). */
export function useSessionFormatMutations() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: qk.sessionFormatCatalog() });
    void queryClient.invalidateQueries({ queryKey: qk.athleteFormats(userId ?? "anonymous") });
  }

  const createMutation = useMutation({
    mutationFn: async (input: SessionFormatInput) => unwrap(await createSessionFormat(input)),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SessionFormatInput }) =>
      unwrap(await updateSessionFormat(id, input)),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => unwrap(await deleteSessionFormat(id)),
    onSuccess: invalidate,
  });

  const create = useCallback(
    (input: SessionFormatInput): Promise<Result<{ id: string }>> =>
      catchResult(() => createMutation.mutateAsync(input)),
    [createMutation],
  );
  const update = useCallback(
    (id: string, input: SessionFormatInput): Promise<Result> =>
      catchResult(async () => {
        await updateMutation.mutateAsync({ id, input });
        return {};
      }),
    [updateMutation],
  );
  const remove = useCallback(
    (id: string): Promise<Result> =>
      catchResult(async () => {
        await deleteMutation.mutateAsync(id);
        return {};
      }),
    [deleteMutation],
  );

  return {
    create,
    update,
    remove,
    isPending: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
