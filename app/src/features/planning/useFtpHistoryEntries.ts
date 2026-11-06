/* ============================================================
   FEATURES/PLANNING/USEFTPHISTORYENTRIES.TS — FTP-Historie des Athleten,
   geteilt von „Neuer Plan" und „Plan anpassen"

   useFtpHistory() liest owner-only per RLS immer die Historie des EINGELOGGTEN
   Users — nur bei isSelf gehört sie also zu diesem Athleten. Für den
   Trainer-für-Athlet-Fall liefert useRides() dieselbe Historie öffentlich/
   read-only aus der JSON-Pipeline (analog HeroPage.tsx::ftpHistoryEntries).
   Solange isSelf selbst noch lädt: leer lassen statt zwischenzeitlich die
   falsche Quelle zu ziehen — sonst flippt die Liste einmal beim Laden und noch
   einmal, sobald isSelf feststeht, und würde dazwischen unbemerkt eine schon
   erzeugte Vorschau verwerfen.
   ============================================================ */

import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { useRides } from "../../api/hooks/useRides";

export function useFtpHistoryEntries(athleteId: string) {
  const { data: rideData } = useRides(athleteId);
  const { isSelf, isLoading } = useIsSelfAthlete(athleteId);
  const { entries } = useFtpHistory();
  if (isLoading) return [];
  return isSelf ? entries : (rideData?.ftpHistory ?? []);
}
