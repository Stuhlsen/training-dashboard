/* ============================================================
   API/HOOKS/USEFTPHISTORY.TS — FTP-Historie des eingeloggten Athleten
   (Etappe 7c: Lesepfad; Etappe 9: Schreibpfad)

   Port von state/ftp-history.js (Vanilla). Lesepfad seit 7c für
   core/export-briefing.js (F1, aktueller Ramp-Test-Eintrag,
   core/ftp-history.js::currentFtpEntry). Schreibpfad (ui/settings-
   panel.js::FTP-Eintragen) folgt hier in Settings — v1 wie im Original NUR
   anlegen (kein Bearbeiten/Löschen bestehender Einträge), source fest
   "ramp-test" (UI-Einschränkung, DB-Constraint erlaubt weiterhin
   "schaetzung", s. Adapter/Migration 0009). */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFtpHistory, saveFtpEntry as saveFtpEntryAdapter } from "../supabase/ftp-history";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Result } from "../types";
import type { FtpHistoryEntry } from "../supabase/ftp-history";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** Stabile Referenz für den "keine Einträge/nicht eingeloggt"-Fall — `query.data
 *  ?? []` würde sonst bei jedem Render ein NEUES Array liefern (React Query
 *  liefert `undefined`, solange `enabled: false` bleibt, z.B. Besucher ohne
 *  Login), was jeden Aufrufer, der `entries` in einer useMemo/useEffect-
 *  Dependency-Liste hat, bei jedem Render neu auslösen würde (Object.is-
 *  Vergleich schlägt jedes Mal fehl) — s. HeroPage.tsx::core. */
const EMPTY_ENTRIES: FtpHistoryEntry[] = [];

/** FTP-Historie des eingeloggten Profils, älteste zuerst. */
export function useFtpHistory() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.ftpHistory(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async () => unwrap(await getFtpHistory(userId!)).entries,
  });
  return { entries: query.data ?? EMPTY_ENTRIES, isLoading: query.isLoading };
}

export interface FtpEntryInput {
  ftpWatt: number;
  validFrom: string;
  note?: string | null;
}

export function useSaveFtpEntry() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.ftpHistory(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (entry: FtpEntryInput) =>
      unwrap(await saveFtpEntryAdapter(userId!, { ...entry, source: "ramp-test" })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const save = useCallback(
    async (entry: FtpEntryInput): Promise<Result<{ id: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(entry));
    },
    [mutation, userId],
  );

  return { save, isPending: mutation.isPending };
}
