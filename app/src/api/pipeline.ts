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
import type { FtpHistoryEntry } from "./supabase/ftp-history";

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
  /** Sichtbarkeits-Flag (Migration 0025 `profiles.ftp_public`). Fehlt in
   *  Alt-Payloads → als `true` behandeln. Bei `false` liefert der Sync weder
   *  `ftp` noch `ftpHistory`. */
  ftpPublic?: boolean;
  /** Ramp-Test-Zeitstrahl für die öffentliche Hero-Ansicht — nur bei
   *  `ftpPublic !== false` befüllt. Shape: `PublicFtpEntry` (types.js). */
  ftpHistory?: unknown[];
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
  /** `false` = der Athlet hat die FTP-Anzeige abgeschaltet; die Hero-Seite
   *  blendet Leistungsskala/Ringe/Zeitstrahl für Besucher dann komplett aus.
   *  Alt-Payload ohne Feld → `true`. */
  ftpPublic: boolean;
  /** Ramp-Test-Historie aus dem Payload (nur öffentlich, `note` stets null) —
   *  speist `buildHeroCore()`s `ftpHistoryEntries` für ausgeloggte Besucher,
   *  analog `useFtpHistory()` für den eingeloggten Athleten. */
  ftpHistory: FtpHistoryEntry[];
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
    ftpPublic: json.ftpPublic ?? true,
    // `note` gibt es im öffentlichen Payload bewusst nicht — fix null. Cast
    // wie bei rides/wellness: validateRidesPayload() hat die Struktur geprüft.
    ftpHistory: ((json.ftpHistory ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      ftpWatt: Number(r.ftpWatt),
      validFrom: String(r.validFrom),
      source: typeof r.source === "string" ? r.source : "ramp-test",
      note: null,
    })),
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

  // Schema-Prüfung: ein FEHLENDES/kaputtes `rides`-Feld (kein Array) ist
  // fatal, alles andere nur eine Abweichung. Ein LEERES `rides`-Array ist
  // seit Athlet 4 (Einsteiger, Plan-only bis der erste intervals.icu-Sync
  // läuft) ein gültiger Zustand — der Planungstab lebt von `plannedSessions`,
  // nicht von `rides`. Bleibt als Warnung sichtbar, blockiert aber nicht.
  const problems: string[] = validateRidesPayload(json);
  const fatal = problems.filter(
    (p) => p.startsWith("payload.rides") && !p.includes("leeres Array"),
  );
  if (fatal.length) {
    return { ok: false, error: { code: "SCHEMA", message: fatal.join(" · ") } };
  }

  return { ok: true, data: toAthleteData(json, problems) };
}
