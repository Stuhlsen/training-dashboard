/* ============================================================
   API/PIPELINE.TS — JSON-Pipeline (Konzept 5.5, Etappe 2b bestätigt)

   Die per GitHub-Action alle 6h erzeugten `data/*.json` bleiben die Quelle
   der LESEDATEN (Fahrten, Wellness, Power-Kurven, Wetter-Forecast). Weder
   `scripts/generate-data.js` noch das Dateiformat werden angefasst — die
   React-App liest dieselben Dateien wie die Vanilla-Seite. Eine spätere
   Ablösung nach Supabase wäre ein eigenes Vorhaben.

   Unterschied zur Vanilla-`state/data.js`: kein STATIC_RIDES-Fallback.
   Der existierte, weil `file://` keine Fetches erlaubt; der Vite-Dev-Server
   liefert `/data/` direkt aus (s. serveRepoData() in vite.config.ts), der
   Fallback hätte hier keinen Auslöser mehr. Ein Ladefehler ist jetzt ein
   Ladefehler und wird als solcher sichtbar, statt hinter Beispieldaten zu
   verschwinden.
   ============================================================ */

import { normalizeRide, normalizeWellness } from "../core/normalize.js";
import { validateRidesPayload } from "../core/validate.js";
import { athleteConfig } from "../config";
import type { Result } from "./types";

/** Rohes Payload einer `rides*.json`. Die Feldtypen sind hier bewusst weich
 *  (`unknown[]`): die Laufzeitprüfung macht `core/validate.js`, und die
 *  Ride-/Wellness-Shapes selbst leben als JSDoc in `src/types.js` — sie
 *  hier ein zweites Mal zu deklarieren wäre genau die zweite Wahrheit, die
 *  das Schema-Kapitel in AGENTS.md verhindern soll. */
export interface RidesPayload {
  rides: unknown[];
  wellness?: unknown[];
  wellnessMeta?: unknown;
  powerCurves?: unknown;
  powerCurveBlocks?: unknown[];
  athleteWeight?: number | null;
  ftp?: number | null;
  plannedSessions?: unknown[];
  adjustments?: Record<string, unknown>;
  forecast?: Record<string, unknown>;
  updated?: string;
}

export interface AthleteData {
  rides: unknown[];
  wellness: unknown[];
  wellnessMeta: unknown;
  powerCurves: unknown;
  powerCurveBlocks: unknown[];
  athleteWeight: number | null;
  athleteFtp: number | null;
  plannedSessions: unknown[];
  adjustments: Record<string, unknown>;
  forecast: Record<string, unknown>;
  updated?: string;
  /** Nicht-fatale Schema-Abweichungen aus core/validate.js — der Aufrufer
   *  entscheidet, ob und wie er sie anzeigt. Fatale (fehlende/leere
   *  `rides`) kommen als `{ ok: false }` zurück, nicht hier. */
  warnings: string[];
}

function toAthleteData(json: RidesPayload, warnings: string[]): AthleteData {
  return {
    // Der Cast ist die Grenze zwischen ungeprüftem JSON und den
    // core-Normalisierern: validateRidesPayload() oben hat die Struktur
    // bereits geprüft, die Normalisierer erwarten laut JSDoc ein Objekt.
    rides: json.rides.map((r) => normalizeRide(r as object)),
    wellness: (json.wellness ?? []).map((w) => normalizeWellness(w as object)),
    wellnessMeta: json.wellnessMeta ?? null,
    powerCurves: json.powerCurves ?? null,
    powerCurveBlocks: json.powerCurveBlocks ?? [],
    athleteWeight: json.athleteWeight ?? null,
    athleteFtp: json.ftp ?? null,
    plannedSessions: json.plannedSessions ?? [],
    adjustments: json.adjustments ?? {},
    forecast: json.forecast ?? {},
    updated: json.updated,
    warnings,
  };
}

/** Lädt und normalisiert den Datensatz eines Athleten.
 *  `import.meta.env.BASE_URL` davor, damit der Pfad unter GitHub Pages
 *  (Projektseite mit Unterverzeichnis) genauso stimmt wie lokal. */
export async function loadAthleteData(athleteId: string): Promise<Result<{ data: AthleteData }>> {
  const cfg = athleteConfig(athleteId);
  if (!cfg) {
    return { ok: false, error: { code: "UNKNOWN", message: `Unbekannter Athlet: ${athleteId}` } };
  }
  const url = `${import.meta.env.BASE_URL}${cfg.endpoint}?_=${Date.now()}`;

  let json: RidesPayload;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: { code: "HTTP", message: `HTTP ${res.status} für ${cfg.endpoint}` } };
    }
    json = (await res.json()) as RidesPayload;
  } catch (err) {
    return {
      ok: false,
      error: { code: "NETWORK", message: err instanceof Error ? err.message : String(err) },
    };
  }

  // Schema-Prüfung wie bisher: fehlende/leere `rides` sind fatal, alles
  // andere nur eine Abweichung, die den Datensatz nicht unbrauchbar macht.
  const problems: string[] = validateRidesPayload(json);
  const fatal = problems.filter((p) => p.startsWith("payload.rides"));
  if (fatal.length) {
    return { ok: false, error: { code: "SCHEMA", message: fatal.join(" · ") } };
  }

  return { ok: true, data: toAthleteData(json, problems) };
}
