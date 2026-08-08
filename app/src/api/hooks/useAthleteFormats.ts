/* ============================================================
   API/HOOKS/USEATHLETEFORMATS.TS — Formatkatalog + Aktiv-Status
   (Settings, Etappe 9)

   Anders als useLadderState() (Etappe 7c, nur aktive Formate für die
   Export-Panel-Zeile) liefert dieser Hook den VOLLEN Katalog + je Format
   den Aktiv-Status des eingeloggten Profils — genau das braucht die
   Formate-Sektion in Settings zum Umschalten (Port von state/formats.js +
   ui/settings-panel.js::buildFormatsSection()).

   Die L1.1-Regel ("max. zwei aktive Familien pro Blockziel") ist reine
   UI-Logik ohne I/O und lebt als geprüfte Funktion in
   features/settings/formats-view-model.ts, nicht hier — dieser Hook
   schreibt, was ihm übergeben wird, ohne die Regel selbst zu kennen (wie
   im Vanilla-Original: die Prüfung sitzt im Klick-Handler, nicht im
   Adapter/State-Modul).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSessionFormats, type SessionFormat } from "../supabase/session-formats";
import { getAthleteFormats, setAthleteFormatActive } from "../supabase/athlete-formats";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";

export interface AthleteFormatEntry {
  format: SessionFormat;
  active: boolean;
}

async function loadAthleteFormats(profileId: string): Promise<AthleteFormatEntry[]> {
  const [catalogResult, athleteFormatsResult] = await Promise.all([
    getSessionFormats(),
    getAthleteFormats(profileId),
  ]);
  const { formats } = unwrap(catalogResult);
  const { athleteFormats } = unwrap(athleteFormatsResult);
  const activeById = new Map(athleteFormats.map((af) => [af.formatId, af.active]));
  return formats.map((format) => ({ format, active: activeById.get(format.id) ?? false }));
}

/** Formatkatalog mit Aktiv-Status des eingeloggten Profils. */
export function useAthleteFormats() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.athleteFormats(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: () => loadAthleteFormats(userId!),
  });
  return { entries: query.data ?? [], isLoading: query.isLoading };
}

/** Setzt/upsertet den Aktiv-Status EINES Formats. Kein Login-Gate wie bei
 *  den übrigen Save-Hooks: die Sektion ist ohnehin athletengated (nur
 *  eingeloggte Athleten sehen sie), ein `userId`-`null`-Aufruf kann hier
 *  nicht vorkommen. */
export function useSetAthleteFormatActive() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.athleteFormats(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async ({ formatId, active }: { formatId: string; active: boolean }) =>
      unwrap(await setAthleteFormatActive(userId!, formatId, active)),
    onMutate: async ({ formatId, active }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AthleteFormatEntry[]>(key);
      queryClient.setQueryData<AthleteFormatEntry[]>(key, (entries) =>
        (entries ?? []).map((e) => (e.format.id === formatId ? { ...e, active } : e)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback bei Schreibfehler — sonst zeigt der Toggle einen Zustand,
      // der serverseitig nicht ankam (Vanilla-Pendant: der Rollback-Block
      // in buildFormatsSection()).
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
  });

  const setActive = useCallback(
    async (formatId: string, active: boolean): Promise<Result> =>
      catchResult(async () => {
        await mutation.mutateAsync({ formatId, active });
        return {};
      }),
    [mutation],
  );

  return { setActive, isPending: mutation.isPending };
}
