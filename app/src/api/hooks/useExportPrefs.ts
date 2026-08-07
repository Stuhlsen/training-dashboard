/* ============================================================
   API/HOOKS/USEEXPORTPREFS.TS — Export-Richtungsvorgabe (Etappe 7c)

   Port von state/export-prefs.js (Vanilla). Ein Profil hat höchstens eine
   Zeile (Primärschlüssel profile_id aus 0008_export_prefs.sql) — anders als
   trainer_view_prefs (Trainer-Athlet-Paar) hängt der Key nur am eingeloggten
   User, nicht am angezeigten Athleten-Toggle: `export_prefs.profile_id`
   bezeichnet immer den exportierenden Athleten selbst (R8, kein
   Trainer-Zugriff aufs Export-Panel).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getExportPrefs, setExportPrefs } from "../supabase/export-prefs";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { unwrap } from "../result";

export const DEFAULT_EXPORT_PRESET = "general";

/** Lädt/speichert Preset + Zielevent des eingeloggten Profils. Kein
 *  gespeicherter Eintrag (frisches Profil) → Default 'general', kein
 *  gesondertes Fehlerbild (R6). Speichern ist optimistisch, wie
 *  useTrainerViewPrefs — ein Speicherfehler dreht die gerade gewählte
 *  Anzeige nicht wieder zurück. */
export function useExportPrefs() {
  const userId = useAuthUserId();
  const queryClient = useQueryClient();
  const enabled = !!userId;
  const key = qk.exportPrefs(userId ?? "anonymous");

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async (): Promise<{ preset: string; eventId: string | null }> => {
      const result = unwrap(await getExportPrefs(userId!));
      return { preset: result.preset ?? DEFAULT_EXPORT_PRESET, eventId: result.eventId };
    },
  });

  const mutation = useMutation({
    mutationFn: async (next: { preset: string; eventId: string | null }) => {
      queryClient.setQueryData(key, next);
      return unwrap(await setExportPrefs(userId!, next));
    },
  });

  const save = useCallback(
    (preset: string, eventId: string | null = null) => {
      if (!enabled) return;
      mutation.mutate({ preset, eventId });
    },
    [enabled, mutation],
  );

  return {
    preset: query.data?.preset ?? DEFAULT_EXPORT_PRESET,
    eventId: query.data?.eventId ?? null,
    save,
    isLoading: query.isLoading,
  };
}
