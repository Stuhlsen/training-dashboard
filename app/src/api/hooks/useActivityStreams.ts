/* ============================================================
   API/HOOKS/USEACTIVITYSTREAMS.TS — On-Demand-Abruf der Sekunden-
   Rohdaten einer Fahrt (docs/offene-punkte.md, Planungstab-Abschnitt).

   Bewusst NICHT über die Sync-Pipeline/data/rides.json (zu groß auf
   Vorrat für alle Fahrten) — der Hook feuert nur, wenn er tatsächlich
   gemountet ist (DoneDetailChart rendert ihn nur für die gerade
   aufgeklappte Karte, s. DoneTable.tsx). Cache bleibt reiner React-Query-
   In-Memory-State (kein Persister in queryClient.ts) — der API-Key selbst
   verlässt den Aufrufer nie in Richtung localStorage/IndexedDB.
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { getActivityStreams, type ActivityStreams } from "../intervals/streams";
import { qk } from "../keys";
import { unwrap } from "../result";
import type { IntervalsCredentials } from "../types";

export function useActivityStreams(activityId: string | null | undefined, credentials: IntervalsCredentials | null) {
  const query = useQuery({
    queryKey: qk.activityStreams(activityId ?? ""),
    enabled: !!activityId && !!credentials,
    // Eine abgeschlossene Fahrt ändert sich nicht mehr — kein Refetch nötig.
    staleTime: Infinity,
    queryFn: async (): Promise<ActivityStreams> => unwrap(await getActivityStreams(activityId!, credentials!.apiKey)),
  });
  return { streams: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}
