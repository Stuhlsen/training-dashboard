import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { emptyAthleteData, type AthleteData } from "../pipeline";
import { loadProfileTrainingData } from "../training-payload";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { qk } from "../keys";
import { unwrap } from "../result";
import { useEffectiveSport } from "./useActiveSport";
import { ridesForSport } from "../../core/activity-sport.js";

/** Die Lesedaten eines Athleten (Fahrten, Wellness, Power-Kurven,
 *  Wetter-Forecast) — seit Fahrplan 26 E5 für ALLE Einträge (Plätze aus
 *  `config.ts` und `self`) aus den Tabellen `training_*` über die Profil-UUID
 *  (`training-payload.ts`); `data/rides*.json` liest die App nicht mehr.
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
 *  `atl` bereits als intervals-kombinierten Tageswert). Seit Fahrplan 13 E1/X1
 *  bekommt auch der Wochen-Lastdeckel (`buildLoadGuard`) für Multi-Sport-
 *  Athleten (`multiSport:true`) dieses `ridesAll` statt der tab-gefilterten
 *  `rides` — s. hero-view-model.ts::buildBriefingInfo. Für Athlet 1/2/4 ist
 *  `ridesAll === rides` (Single-Sport), also ohne jeden Unterschied. */
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.rides(athleteId),
    staleTime: 5 * 60_000,
    // Alle Einträge über die Profil-UUID aus den Tabellen. Ohne auflösbares
    // Profil ein leerer Datensatz statt eines Fehlers, damit Supabase-Seiten
    // nicht hängen.
    queryFn: async (): Promise<AthleteData> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return { ...emptyAthleteData(), trainingDataEmpty: true };
      return unwrap(await loadProfileTrainingData(profileId)).data;
    },
    select,
  });
}
