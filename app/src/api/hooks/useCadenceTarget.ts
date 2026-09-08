/* ============================================================
   API/HOOKS/USECADENCETARGET.TS — Intervall-Kadenz-Ziel des eingeloggten
   Users (Tabelle athlete_sync_config, Migration 0036, Fahrplan 11).
   Muster wie api/hooks/useSyncLocation.ts (eine Zeile je Profil,
   session-gebunden über useAuthUserId, expliziter Result nach dem
   Speichern).

   `rawTarget` ist `null`, solange nichts hinterlegt ist — der normale
   Zustand vor dem ersten Eintragen, kein Fehlerbild. `target` ist derselbe
   Wert mit Fallback auf DEFAULT_CADENCE_TARGET_RPM, damit die Consumer
   (Push-Text-Bau, .zwo-Export, Analyse-Anzeige) immer eine Zahl bekommen.

   DEFAULT_CADENCE_TARGET_RPM ist bewusst hier lokal und nicht aus
   sports/cycling/metrics.ts importiert (die api/-Schicht importiert nicht
   aus sports/). Der Wert MUSS gleich CADENCE_TARGET_RPM dort bleiben —
   useCadenceTarget.test.ts hält das mit einer Drift-Assertion fest.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCadenceTarget, updateCadenceTarget as updateCadenceTargetAdapter } from "../supabase/athlete-sync-config";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

/** Fallback-Kadenzziel, wenn der Athlet nichts hinterlegt hat. Spiegelt
 *  sports/cycling/metrics.ts::CADENCE_TARGET_RPM (dort für Chart/Analyse,
 *  hier für den Push-/Export-Pfad in der api/-Schicht). */
export const DEFAULT_CADENCE_TARGET_RPM = 90;

/** Erlaubter Bereich (= CHECK-Constraint aus Migration 0036). */
export const CADENCE_TARGET_MIN = 60;
export const CADENCE_TARGET_MAX = 120;

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

export function useCadenceTarget() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.cadenceTarget(userId ?? "anonymous");

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => unwrap(await getCadenceTarget(userId!)).target,
  });

  const mutation = useMutation({
    mutationFn: async (target: number | null) => {
      unwrap(await updateCadenceTargetAdapter(userId!, target));
      return { target };
    },
    onSuccess: ({ target }) => {
      queryClient.setQueryData<number | null>(key, target);
    },
  });

  const update = useCallback(
    async (target: number | null): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(target));
    },
    [mutation, userId],
  );

  const rawTarget = query.data ?? null;
  return {
    /** Roh-Wert (null = nichts hinterlegt) — für das Settings-Formular. */
    rawTarget,
    /** Effektives Ziel mit Fallback — für Push-Text / .zwo / Anzeige. */
    target: rawTarget ?? DEFAULT_CADENCE_TARGET_RPM,
    isLoading: query.isLoading,
    update,
    isPending: mutation.isPending,
  };
}
