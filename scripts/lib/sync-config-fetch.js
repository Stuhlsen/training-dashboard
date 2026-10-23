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
   profiles.display_name → slugForName() (sync-profiles.js), athlete_key → der Key selbst.

   FEHLERVERHALTEN — bewusst FATAL (throw), anders als scripts/lib/http.js::
   fetchJson ("return null, Aufrufer entscheidet"): fehlt der Service-Role-
   Key oder scheitert der Tabellen-Read, hat der Sync ohne Config nichts zu
   tun. Ein stiller Fallback würde nur alten/leeren Stand schreiben.
   generate-data.js fängt den Wurf in main().catch → process.exit(1), bevor
   irgendein Tabellen-Schreiben gelaufen ist.
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";
import { log } from "./log.js";
import { tanakaHrMax } from "./hr.js";
import { slugForName, hasOwnSyncBehavior } from "./sync-profiles.js";

export { slugForName };

/** Schlüssel eines Accounts ohne festen Platz (Fahrplan 26 E2): die Profil-ID. */
export const profileKey = (profileId) => `profile:${profileId}`;

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
 *   athleteId: string|null, lat: number|null, lon: number|null,
 *   ftpPublic: boolean, planOffsetWeeks: number,
 *   hrMax: number|null, hrRest: number|null, sports: string[]|null}>>}
 *   Key = interne Athleten-ID ("athlete1" …) für Profile mit eigenem Sync-Verhalten (sync-profiles.js),
 *   sonst `profile:<profile_id>` (Fahrplan 26 E2, `profileKey()`). `ftpPublic` steuert, ob der
 *   Sync die gemessene FTP + Ramp-Test-Historie in rides*.json schreibt
 *   (profiles.ftp_public, Migration 0025) — Default true, wenn keine
 *   profiles-Zeile zugeordnet ist. `planOffsetWeeks` (profiles.plan_offset_weeks,
 *   Migration 0026) verschiebt die generierte Trainingsplan-Vorlage um N ganze
 *   Wochen — Default 0. `hrMax`/`hrRest` sind die HF-Grundlage für den
 *   Multi-Sport-TRIMP-Lastpfad (Migration 0035, Fahrplan 10 E5a) — beide
 *   `null` ohne Profil-Zeile bzw. ohne hinterlegten Wert; Konsument folgt in
 *   E6. `hrMax` bevorzugt seit Fahrplan 17 E2 den GEMESSENEN Wert
 *   (profiles.hr_max, Migration 0039, Settings-Self-Service) vor der
 *   Tanaka-Schätzung aus profiles.birthdate — exakt das Muster
 *   `ftpMeasured` vor `eFTP`. `hrRest` bleibt der rohe `profiles.resting_hr`.
 */
export async function loadSyncConfig() {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "athlete_sync_config: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen — der Sync kann ohne Config-Tabelle nicht laufen"
    );
  }
  const key = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const todayISO = new Date().toISOString().slice(0, 10);

  const rows = await getOrThrow(
    `${ENV.SUPABASE_URL}/rest/v1/athlete_sync_config` +
      `?select=profile_id,athlete_key,intervals_api_key,intervals_athlete_id,weather_lat,weather_lon`,
    key,
    "athlete_sync_config: Abruf"
  );
  const profiles = await getOrThrow(
    `${ENV.SUPABASE_URL}/rest/v1/profiles?select=id,display_name,ftp_public,plan_offset_weeks,birthdate,resting_hr,hr_max,sports`,
    key,
    "profiles: Abruf"
  );
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name]));
  // profiles.sports (Fahrplan 21) — steuert bei Accounts ohne festen Platz,
  // welche Aktivitätstypen der Sync holt. Fehlt der Wert: nur Rad.
  const sportsById = new Map(profiles.map((p) => [p.id, Array.isArray(p.sports) ? p.sports : null]));
  // profiles.ftp_public (Migration 0025) — steuert das FTP-Gating im Sync.
  const ftpPublicById = new Map(profiles.map((p) => [p.id, p.ftp_public !== false]));
  // profiles.plan_offset_weeks (Migration 0026) — Ganzwochen-Verschiebung der
  // generierten Trainingsplan-Vorlage. numeric/int kommt je Zeile als Zahl
  // oder String (toNum), Default 0.
  const planOffsetById = new Map(profiles.map((p) => [p.id, toNum(p.plan_offset_weeks) ?? 0]));
  // profiles.birthdate / profiles.resting_hr (Migration 0035, Fahrplan 10 E5a)
  // — HF-Grundlage für den Multi-Sport-TRIMP-Lastpfad (E6). hrMax wird hier
  // nach Tanaka geschätzt (scripts/lib/hr.js), hrRest ist der rohe Wert.
  const restingHrById = new Map(profiles.map((p) => [p.id, toNum(p.resting_hr)]));
  const birthdateById = new Map(profiles.map((p) => [p.id, p.birthdate ?? null]));
  // profiles.hr_max (Migration 0039, Fahrplan 17 E1/E2) — GEMESSENER Wert,
  // vom Athleten selbst in Settings eingetragen (E3). Gewinnt vor der
  // Tanaka-Schätzung, wenn gesetzt.
  const measuredHrMaxById = new Map(profiles.map((p) => [p.id, toNum(p.hr_max)]));

  const bySlug = new Map();
  for (const row of rows) {
    let slug;
    if (row.profile_id) {
      if (!nameById.has(row.profile_id)) {
        log.warn(
          `athlete_sync_config: Zeile für profile_id ${row.profile_id} ohne profiles-Zeile — übersprungen`
        );
        continue;
      }
      // Profil mit eigenem Sync-Verhalten → fester Slug; jeder andere Account
      // wird unter seiner Profil-ID geführt (beide landen in den Tabellen).
      slug = slugForName(nameById.get(row.profile_id)) ?? profileKey(row.profile_id);
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
      // profiles.ftp_public (0025) — nur profile_id-Zeilen haben ein Profil;
      // athlete_key-Zeilen (nicht in Nutzung) defaulten auf sichtbar.
      ftpPublic: row.profile_id ? (ftpPublicById.get(row.profile_id) ?? true) : true,
      // profiles.plan_offset_weeks (0026) — Default 0 ohne Profil-Zeile.
      planOffsetWeeks: row.profile_id ? (planOffsetById.get(row.profile_id) ?? 0) : 0,
      // profiles.birthdate / resting_hr (0035) — nur profile_id-Zeilen haben
      // ein Profil; ohne Wert bzw. ohne Profil-Zeile bleibt beides null
      // (E6-TRIMP überspringt die Aktivität dann + loggt, s. Fahrplan 10 E6).
      // hrMax: GEMESSENER Wert (profiles.hr_max, Fahrplan 17 E2) vor der
      // Tanaka-Schätzung aus dem Geburtsdatum — Muster ftpMeasured vor eFTP.
      hrMax: row.profile_id
        ? (measuredHrMaxById.get(row.profile_id) ?? tanakaHrMax(birthdateById.get(row.profile_id) ?? null, todayISO))
        : null,
      hrRest: row.profile_id ? (restingHrById.get(row.profile_id) ?? null) : null,
      // profiles.sports — null ohne Profil-Zeile bzw. ohne Wert.
      sports: row.profile_id ? (sportsById.get(row.profile_id) ?? null) : null,
    });
  }

  const known = [...bySlug.keys()].filter((k) => hasOwnSyncBehavior(k));
  log.info(
    `✅ athlete_sync_config: ${bySlug.size} Athleten-Zeile(n) geladen ` +
      `(${known.join(", ") || "keine Sonderprofile"}${bySlug.size > known.length ? ` + ${bySlug.size - known.length} weitere` : ""})`
  );
  return bySlug;
}
