import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadAthleteData, type AthleteData } from "../pipeline";
import { qk } from "../keys";
import { unwrap } from "../result";
import { useEffectiveSport } from "./useActiveSport";
import { ridesForSport } from "../../core/activity-sport.js";

/** Die Lesedaten eines Athleten aus der JSON-Pipeline (Fahrten, Wellness,
 *  Power-Kurven, Wetter-Forecast) — Konzept 5.5, in Etappe 2b bestätigt:
 *  die per Cron erzeugten `data/*.json` bleiben die Quelle, die React-App
 *  liest dieselben Dateien wie die Vanilla-Seite.
 *
 *  `staleTime` fünf Minuten: die Dateien ändern sich nur alle sechs Stunden
 *  (Cron), häufiger nachzuladen bringt nichts.
 *
 *  SPORTART-FILTER (Fahrplan 10 E8a): `api/pipeline.ts` liefert seit E8a ALLE
 *  Aktivitäten (Rad/Lauf/Schwimm). Hier über `select` auf die im Umschalter
 *  aktive Sportart eingegrenzt (`useEffectiveSport` klemmt sie auf die
 *  `config.ts::sports` des Athleten — Athlet 1/2/4 haben nur `["ride"]`, für
 *  sie ist das Ergebnis identisch zum bisherigen `onlyCyclingRides()`-Filter
 *  in der Pipeline). Kein zusätzlicher Fetch: der Query-Key bleibt
 *  athletenscharf, `select` transformiert nur den Cache.
 *
 *  `ridesAll` (Fahrplan 10 E8b): die ungefilterte Liste ALLER Sportarten,
 *  zusätzlich mitgegeben. Die gemeinsame CTL/ATL/TSB-Anzeige (`buildBriefingInfo`
 *  → `currentPmc`/`tsbTrend`) verankert „heute" darüber, damit der Fitness-/
 *  Form-Wert auf jedem Sportart-Tab derselbe ist (jede Ride-Zeile trägt `ctl`/
 *  `atl` bereits als intervals-kombinierten Tageswert). Der Wochen-Lastdeckel
 *  (`buildLoadGuard`) bleibt sport-eigen. Für Athlet 1/2/4 ist
 *  `ridesAll === rides` (Single-Sport). */
export function useRides(athleteId: string) {
  const { effectiveSport } = useEffectiveSport(athleteId);
  const select = useCallback(
    (data: AthleteData): AthleteData => ({
      ...data,
      rides: ridesForSport(
        data.rides as Array<{ sport?: string | null }>,
        effectiveSport,
      ) as unknown[],
      ridesAll: data.rides,
    }),
    [effectiveSport],
  );
  return useQuery({
    queryKey: qk.rides(athleteId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AthleteData> => unwrap(await loadAthleteData(athleteId)).data,
    select,
  });
}
