/* ============================================================
   SCRIPTS/LIB/SYNC-CONFIG-FETCH.JS — alle Sync-Zugangsdaten je Athlet aus
   Supabase laden (Tabelle athlete_sync_config, Migration 0023).

   Fahrplan 7 CRED3: Löst den früheren "Login als ein Athlet, lies seine
   intervals_credentials-Zeile"-Weg ab (scripts/lib/intervals-credentials-
   fetch.js). Jetzt EIN service_role-Aufruf (RLS-Bypass) für ALLE Athleten
   auf einmal — intervals.icu-Key + Athlete-ID und der grobe Standort für
   die Wettervorschau.

   Die Zeile trägt entweder eine profile_id (Athlet mit Supabase-Login,
   Owner-only-RLS, self-service über Settings) ODER einen athlete_key
   ("athlete2" — Vergleichsathlet ohne Login, admin-gepflegt). loadSyncConfig()
   löst beide auf denselben internen Slug ("athlete1" …) auf: profile_id →
   profiles.display_name → NAME_TO_SLUG, athlete_key → der Key selbst.

   FEHLERVERHALTEN — bewusst FATAL (throw), anders als scripts/lib/http.js::
   fetchJson ("return null, Aufrufer entscheidet"): fehlt der Service-Role-
   Key oder scheitert der Tabellen-Read, hat der Sync ohne Config nichts zu
   tun. Ein stiller Fallback würde nur alten/leeren Stand schreiben.
   generate-data.js fängt den Wurf in main().catch → process.exit(1), bevor
   irgendein writeOutput() gelaufen ist.
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";
import { log } from "./log.js";

/** Anzeigename (profiles.display_name in Supabase) → interne Athleten-ID.
 *  Spiegel von app/src/config.ts::ATHLETES[].name — bei einem neuen Athleten
 *  BEIDE Stellen pflegen. Keine Klarnamen, nur die selbstgewählten Pseudonyme.
 *  Lookup läuft über slugForName() case-insensitiv + getrimmt: display_name ist
 *  vom Nutzer in Settings editierbar, ein Tippfehler in Groß/Kleinschreibung
 *  darf einen Athleten nicht aus dem Sync fallen lassen. */
export const NAME_TO_SLUG = {
  Stuhlsen: "athlete1",
  hc_diZee: "athlete2",
  bentastiic: "athlete4",
};

const SLUG_BY_LC = new Map(
  Object.entries(NAME_TO_SLUG).map(([name, slug]) => [name.trim().toLowerCase(), slug]),
);

/** display_name → Slug, tolerant gegen Groß/Kleinschreibung + Randleerzeichen. */
export function slugForName(displayName) {
  if (!displayName) return undefined;
  return SLUG_BY_LC.get(displayName.trim().toLowerCase());
}

/** PostgREST liefert numeric je nach Zeile als Zahl oder String — auf
 *  `number | null` normalisieren (Muster wie
 *  app/src/api/supabase/athlete-sync-config.ts::toNum). */
function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** GET mit Timeout + einem Retry (fetchJson, scripts/lib/http.js) und danach
 *  FATAL: fetchJson gibt bei jedem Fehler null zurück und loggt ihn selbst —
 *  hier wird daraus ein throw, weil der Sync ohne Config nichts zu tun hat. */
async function getOrThrow(url, key, label) {
  const data = await fetchJson(
    url,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    { label },
  );
  if (data == null) {
    throw new Error(`${label}: fehlgeschlagen (Details im Log oben) — Sync bricht ab`);
  }
  return data;
}

/**
 * Alle Athleten-Zeilen aus athlete_sync_config per service_role laden.
 * @returns {Promise<Map<string, {profileId: string|null, apiKey: string|null,
 *   athleteId: string|null, lat: number|null, lon: number|null}>>}
 *   Key = interne Athleten-ID ("athlete1" …).
 */
export async function loadSyncConfig() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "athlete_sync_config: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen — der Sync kann ohne Config-Tabelle nicht laufen"
    );
  }
  const key = ENV.SUPABASE_SERVICE_ROLE_KEY;

  const rows = await getOrThrow(
    `${ENV.SUPABASE_URL}/rest/v1/athlete_sync_config` +
      `?select=profile_id,athlete_key,intervals_api_key,intervals_athlete_id,weather_lat,weather_lon`,
    key,
    "athlete_sync_config: Abruf"
  );
  const profiles = await getOrThrow(
    `${ENV.SUPABASE_URL}/rest/v1/profiles?select=id,display_name`,
    key,
    "profiles: Abruf"
  );
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));

  const bySlug = new Map();
  for (const row of rows) {
    let slug;
    if (row.profile_id) {
      const name = nameById.get(row.profile_id);
      slug = slugForName(name);
      if (!slug) {
        log.warn(
          `athlete_sync_config: Zeile für profile_id ${row.profile_id} (display_name ${name ?? "?"}) ` +
            `keinem bekannten Athleten zugeordnet — übersprungen (NAME_TO_SLUG prüfen)`
        );
        continue;
      }
    } else if (row.athlete_key) {
      slug = row.athlete_key;
    } else {
      continue; // XOR-CHECK in Migration 0023 schließt das eigentlich aus
    }
    if (bySlug.has(slug)) {
      log.warn(
        `athlete_sync_config: mehrere Zeilen für "${slug}" (z. B. profile_id- UND athlete_key-Zeile) — ` +
          `die zuletzt gelesene gewinnt, bitte eine entfernen`
      );
    }
    bySlug.set(slug, {
      profileId: row.profile_id ?? null,
      apiKey: row.intervals_api_key ?? null,
      athleteId: row.intervals_athlete_id ?? null,
      lat: toNum(row.weather_lat),
      lon: toNum(row.weather_lon),
    });
  }

  log.info(
    `✅ athlete_sync_config: ${bySlug.size} Athleten-Zeile(n) geladen ` +
      `(${[...bySlug.keys()].join(", ") || "keine"})`
  );
  return bySlug;
}
