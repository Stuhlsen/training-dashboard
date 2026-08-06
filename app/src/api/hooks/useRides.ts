import { useQuery } from "@tanstack/react-query";
import { loadAthleteData, type AthleteData } from "../pipeline";
import { qk } from "../keys";
import { unwrap } from "../result";

/** Die Lesedaten eines Athleten aus der JSON-Pipeline (Fahrten, Wellness,
 *  Power-Kurven, Wetter-Forecast) — Konzept 5.5, in Etappe 2b bestätigt:
 *  die per Cron erzeugten `data/*.json` bleiben die Quelle, die React-App
 *  liest dieselben Dateien wie die Vanilla-Seite.
 *
 *  `staleTime` fünf Minuten: die Dateien ändern sich nur alle sechs Stunden
 *  (Cron), häufiger nachzuladen bringt nichts. */
export function useRides(athleteId: string) {
  return useQuery({
    queryKey: qk.rides(athleteId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AthleteData> => unwrap(await loadAthleteData(athleteId)).data,
  });
}
