/* ============================================================
   API/GEOCODING.TS — Open-Meteo-Geocoding-Client (kein API-Key), löst eine
   eingetippte Stadt in Koordinaten auf. Nur Konsument: SyncLocationSection.tsx
   (Fahrplan 17 E4, Stadt-Suche statt roher Koordinatenfelder). Kein
   Supabase-Bezug, deshalb wie api/intervals/streams.ts außerhalb von
   api/supabase/.
   ============================================================ */

import type { Result } from "./types";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export interface CityMatch {
  name: string;
  admin1: string | null;
  country: string | null;
  lat: number;
  lon: number;
}

interface RawGeocodingResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

interface RawGeocodingResponse {
  results?: RawGeocodingResult[];
}

/** Anzeige-Label für einen Treffer, z. B. "Bremen, Deutschland" — bei
 *  mehrdeutigen Stadtnamen unterscheidet admin1 (Bundesland/Region), z. B.
 *  "Springfield, Illinois, Vereinigte Staaten". */
export function formatCityLabel(match: Pick<CityMatch, "name" | "admin1" | "country">): string {
  return [match.name, match.admin1, match.country].filter(Boolean).join(", ");
}

/** Sucht Städte per Open-Meteo-Geocoding (kostenlos, kein Key). Unter 2
 *  Zeichen liefert bewusst keine Treffer statt eines Netzwerk-Calls je
 *  Tastendruck. */
export async function searchCities(query: string): Promise<Result<{ matches: CityMatch[] }>> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { ok: true, matches: [] };

  try {
    const url = `${GEOCODING_URL}?name=${encodeURIComponent(trimmed)}&count=8&language=de&format=json`;
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: { code: "HTTP", message: `Geocoding-Fehler ${res.status}` } };
    }
    const data = (await res.json()) as RawGeocodingResponse;
    const matches: CityMatch[] = (data.results ?? []).map((r) => ({
      name: r.name,
      admin1: r.admin1 ?? null,
      country: r.country ?? null,
      lat: r.latitude,
      lon: r.longitude,
    }));
    return { ok: true, matches };
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: e instanceof Error ? e.message : String(e) } };
  }
}
