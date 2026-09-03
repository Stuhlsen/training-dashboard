/* ============================================================
   API/HOOKS/USEPROFILE.TS — Konto-Einstellungen des eingeloggten Users
   (Settings, Etappe 9)

   Wrapper um die Schreibpfade aus api/supabase/profiles.ts (Name,
   Wellbeing-öffentlich) + api/supabase/auth.ts (Passwort) — beide Adapter
   existieren bereits seit Etappe 1/2b, hier zum ersten Mal per Hook
   verdrahtet. Port von state/session.js::updateDisplayName()/
   updateWellbeingPublic()/updatePassword() (Vanilla).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateDisplayName as updateDisplayNameAdapter,
  updateWellbeingPublic as updateWellbeingPublicAdapter,
  updateFtpPublic as updateFtpPublicAdapter,
  updateLadderProgressionEnabled as updateLadderProgressionEnabledAdapter,
  updateUnitsPreference as updateUnitsPreferenceAdapter,
  updatePlanOffsetWeeks as updatePlanOffsetWeeksAdapter,
} from "../supabase/profiles";
import { updatePassword as updatePasswordAdapter } from "../supabase/auth";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Profile, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.profile(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      unwrap(await updateDisplayNameAdapter(userId!, name));
      return { name };
    },
    onSuccess: ({ name }) => {
      queryClient.setQueryData<Profile>(key, (profile) => (profile ? { ...profile, displayName: name } : profile));
    },
  });

  const update = useCallback(
    async (name: string): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(name));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

export function useUpdateWellbeingPublic() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.profile(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (value: boolean) => {
      unwrap(await updateWellbeingPublicAdapter(userId!, value));
      return { value };
    },
    onSuccess: ({ value }) => {
      queryClient.setQueryData<Profile>(key, (profile) => (profile ? { ...profile, wellbeingPublic: value } : profile));
    },
  });

  const update = useCallback(
    async (value: boolean): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(value));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

export function useUpdateFtpPublic() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.profile(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (value: boolean) => {
      unwrap(await updateFtpPublicAdapter(userId!, value));
      return { value };
    },
    onSuccess: ({ value }) => {
      queryClient.setQueryData<Profile>(key, (profile) => (profile ? { ...profile, ftpPublic: value } : profile));
    },
  });

  const update = useCallback(
    async (value: boolean): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(value));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

export function useUpdateLadderProgressionEnabled() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.profile(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (value: boolean) => {
      unwrap(await updateLadderProgressionEnabledAdapter(userId!, value));
      return { value };
    },
    onSuccess: ({ value }) => {
      queryClient.setQueryData<Profile>(key, (profile) =>
        profile ? { ...profile, ladderProgressionEnabled: value } : profile,
      );
    },
  });

  const update = useCallback(
    async (value: boolean): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(value));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

export function useUpdateUnitsPreference() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.profile(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (value: "km" | "mi") => {
      unwrap(await updateUnitsPreferenceAdapter(userId!, value));
      return { value };
    },
    onSuccess: ({ value }) => {
      queryClient.setQueryData<Profile>(key, (profile) => (profile ? { ...profile, unitsPreference: value } : profile));
    },
  });

  const update = useCallback(
    async (value: "km" | "mi"): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(value));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

/** Migration 0026 — Ganzwochen-Verschiebung des Trainingsplans (Punkt 1).
 *  Cache-Merge wie useUpdateUnitsPreference(). Der eigentliche Massen-Shift
 *  der plan_cards läuft in useShiftPlan() (usePlanCards.ts) und ruft diesen
 *  Adapter als letzten Schritt. Der Wert wird auf den DB-CHECK-Bereich
 *  (-8..12, Migration 0026) geklemmt, damit ein Fehlaufruf keine rohe
 *  Postgres-Constraint-Meldung in die UI trägt. */
export function useUpdatePlanOffsetWeeks() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.profile(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (value: number) => {
      const clamped = Math.max(-8, Math.min(12, Math.round(value || 0)));
      unwrap(await updatePlanOffsetWeeksAdapter(userId!, clamped));
      return { value: clamped };
    },
    onSuccess: ({ value }) => {
      queryClient.setQueryData<Profile>(key, (profile) =>
        profile ? { ...profile, planOffsetWeeks: value } : profile,
      );
    },
  });

  const update = useCallback(
    async (value: number): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(value));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

/** Passwortänderung — für ALLE Rollen (C5.3), kein Athlet-Gate wie die
 *  übrigen Settings-Hooks unten. Re-Authentifizierung passiert serverseitig
 *  in api/supabase/auth.ts::updatePassword() (C5.2). */
export function useUpdatePassword() {
  const mutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      unwrap(await updatePasswordAdapter(currentPassword, newPassword)),
  });

  const update = useCallback(
    async (currentPassword: string, newPassword: string): Promise<Result> =>
      catchResult(() => mutation.mutateAsync({ currentPassword, newPassword })),
    [mutation],
  );

  return { update, isPending: mutation.isPending };
}
