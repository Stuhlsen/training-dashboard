/* ============================================================
   API/INTERVALS/STREAMS.TS — Sekunden-Rohdaten (Watt/Puls) einer einzelnen
   intervals.icu-Aktivität, für den Rausch-Chart im Planungstab-Detail-
   Chart (docs/offene-punkte.md, Planungstab-Abschnitt). Kein Supabase-
   Bezug, deshalb wie push.ts in einem eigenen Verzeichnis statt supabase/.

   Endpunkt `GET /activity/{id}/streams` live gegen einen echten Account
   verifiziert (26.08.2026): liefert u.a. `time`/`watts`/`heartrate` als
   Sekunden-Arrays gleicher Länge. Hier werden bewusst NUR diese drei
   Stream-Typen extrahiert — cadence/distance/altitude/… bleiben ungenutzt,
   kein Vorgriff auf eine Anzeige, die es noch nicht gibt.
   ============================================================ */

import type { Result } from "../types";

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: "Basic " + btoa("API_KEY:" + apiKey) };
}

interface RawStream {
  type: string;
  data: Array<number | null>;
}

export interface ActivityStreams {
  time: number[];
  watts: Array<number | null>;
  heartrate: Array<number | null>;
}

export async function getActivityStreams(activityId: string, apiKey: string): Promise<Result<ActivityStreams>> {
  try {
    const res = await fetch(`https://intervals.icu/api/v1/activity/${activityId}/streams`, {
      headers: authHeader(apiKey),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: { code: "HTTP", message: `intervals.icu Fehler ${res.status}: ${txt}` } };
    }
    const raw = (await res.json()) as RawStream[];
    const time = raw.find((s) => s.type === "time")?.data as number[] | undefined;
    const watts = raw.find((s) => s.type === "watts")?.data;
    const heartrate = raw.find((s) => s.type === "heartrate")?.data;
    if (!time?.length) {
      return { ok: false, error: { code: "NO_DATA", message: "Keine Sekunden-Rohdaten für diese Aktivität" } };
    }
    return { ok: true, time, watts: watts ?? [], heartrate: heartrate ?? [] };
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: e instanceof Error ? e.message : String(e) } };
  }
}
