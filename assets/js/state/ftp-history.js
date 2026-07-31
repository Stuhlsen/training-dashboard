import {
  getFtpHistory as getFtpHistoryAdapter,
  saveFtpEntry as saveFtpEntryAdapter,
} from "../data-access/supabase/ftp-history.js";
import { getSession } from "./session.js";

/** FTP-Historie des eingeloggten Athleten → { ok, entries, error } */
export async function getFtpHistory() {
  const user = getSession();
  if (!user) return { ok: true, entries: [] };
  return getFtpHistoryAdapter(user.id);
}

/** Legt einen neuen FTP-Historie-Eintrag für den eingeloggten Athleten an */
export async function saveFtpEntry(entry) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  return saveFtpEntryAdapter(user.id, entry);
}
