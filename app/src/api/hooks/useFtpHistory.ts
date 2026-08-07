/* ============================================================
   API/HOOKS/USEFTPHISTORY.TS — FTP-Historie des eingeloggten Athleten
   (Etappe 7c)

   Port des Lesepfads von state/ftp-history.js (Vanilla) — nur, was
   core/export-briefing.js für den Fortschrittsblock (F1) braucht
   (aktueller Ramp-Test-Eintrag, core/ftp-history.js::currentFtpEntry).
   Der Schreibpfad (ui/settings-panel.js::FTP-Eintragen) ist bewusst NICHT
   Teil von 7c — eigenständiges spätere Etappe (Analyse-Tab/Settings).
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getFtpHistory } from "../supabase/ftp-history";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { unwrap } from "../result";

/** FTP-Historie des eingeloggten Profils, älteste zuerst. */
export function useFtpHistory() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.ftpHistory(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async () => unwrap(await getFtpHistory(userId!)).entries,
  });
  return { entries: query.data ?? [], isLoading: query.isLoading };
}
