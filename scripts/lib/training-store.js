/* ============================================================
   SCRIPTS/LIB/TRAINING-STORE.JS — Trainingsdaten je Profil in die
   Supabase-Tabellen schreiben (Fahrplan 26, E2; Schema: Migration 0078).

   splitPayload()      rein: heutige rides*.json-Payload → Zeilen für
                       training_rides / training_wellness / training_profile_data
   saveTrainingData()  Upsert je Zeile + Löschen im geladenen Zeitraum,
                       Ergebnis im Result-Format (nie ein Wurf)

   Aufteilung des Payloads (Entscheidung E2):
   - rides[]      → training_rides, eine Zeile je Fahrt (Schlüssel ride_key)
   - wellness[]   → training_wellness, eine Zeile je Tag
   - powerCurves, forecast, athleteWeight, wellnessMeta → eigene Spalten
   - ftpHistory, plannedSessions, adjustments, powerCurveBlocks → `extra`
     (abgeleitet bzw. nicht in der DB; ftpHistory kommt nur bei ftp_public
     im Payload an, damit gilt das Gating auch hier)
   - alles übrige (updated, source, count, ftp, ftpPublic, ftpGoal,
     dataSources, hrMax/hrRest/hrEstimated, …) → `meta`. Ein neues Feld im
     Payload landet damit ohne Migration in `meta`.
   - athleteName entfällt (steht in profiles.display_name).

   Schreiben nur mit dem service_role-Key (RLS-Bypass), nie ein anon-Pfad.
   Kein Löschen-und-neu-Schreiben: erst Upsert, danach nur die Schlüssel
   löschen, die im geladenen Zeitraum bei intervals.icu nicht mehr da sind.
   Löschen entfällt, wenn der Lauf für die Tabelle gar nichts geladen hat —
   ein leerer Abruf ist von einem fehlgeschlagenen nicht zu unterscheiden
   (intervals.js gibt bei Fehlern [] zurück) und darf nichts leeren.
   ============================================================ */

const ROW_CHUNK = 100;
const DELETE_CHUNK = 50;
const PAGE = 1000;
const REQUEST_TIMEOUT_MS = 30000;
const BODY_PREVIEW = 200;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const RIDE_SPORTS = new Set(["ride", "run", "swim", "other"]);

const COLUMN_KEYS = {
  powerCurves: "power_curves",
  forecast: "forecast",
  athleteWeight: "athlete_weight",
  wellnessMeta: "wellness_meta",
};
const EXTRA_KEYS = ["ftpHistory", "plannedSessions", "adjustments", "powerCurveBlocks"];
const DROPPED_KEYS = new Set(["rides", "wellness", "athleteName"]);

/**
 * Eindeutiger Schlüssel je Fahrt: intervals.icu-Activity-ID, sonst (eingefrorene
 * Plan-1-Historie) Quelle + Datum + laufende Nummer am Tag.
 * @param {object} ride
 * @param {Map<string, number>} perDay  Zähler je Datum für den Ersatzschlüssel
 * @param {Set<string>} used
 */
function rideKeyOf(ride, perDay, used) {
  let key;
  if (ride.activityId != null && String(ride.activityId) !== "") {
    key = String(ride.activityId);
  } else {
    const n = (perDay.get(ride.date) ?? 0) + 1;
    perDay.set(ride.date, n);
    key = `${ride.dataSource || "src"}-${ride.date}-${n}`;
  }
  let unique = key;
  for (let i = 2; used.has(unique); i++) unique = `${key}~${i}`;
  used.add(unique);
  return unique;
}

/**
 * @param {object} payload  Ausgabeobjekt wie in rides*.json
 * @returns {{
 *   rides: Array<{ ride_key: string, ride_date: string, start_time: string|null, sport: string, data: object }>,
 *   wellness: Array<{ day: string, data: object }>,
 *   profileData: Record<string, unknown>,
 *   skipped: { rides: number, wellness: number }
 * }}
 */
export function splitPayload(payload) {
  const skipped = { rides: 0, wellness: 0 };

  const perDay = new Map();
  const used = new Set();
  const rides = [];
  for (const ride of payload?.rides ?? []) {
    if (!ride || !ISO_DAY.test(ride.date ?? "")) {
      skipped.rides++;
      continue;
    }
    rides.push({
      ride_key: rideKeyOf(ride, perDay, used),
      ride_date: ride.date,
      start_time: ride.startTime ?? null,
      sport: RIDE_SPORTS.has(ride.sport) ? ride.sport : ride.sport ? "other" : "ride",
      data: ride,
    });
  }

  const byDay = new Map();
  for (const w of payload?.wellness ?? []) {
    if (!w || !ISO_DAY.test(w.date ?? "")) {
      skipped.wellness++;
      continue;
    }
    byDay.set(w.date, { day: w.date, data: w });
  }

  const profileData = { meta: {}, extra: {} };
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (DROPPED_KEYS.has(key)) continue;
    if (COLUMN_KEYS[key]) profileData[COLUMN_KEYS[key]] = value ?? null;
    else if (EXTRA_KEYS.includes(key)) profileData.extra[key] = value;
    else profileData.meta[key] = value;
  }

  return { rides, wellness: [...byDay.values()], profileData, skipped };
}

/**
 * Schlüssel, die in der Tabelle stehen, aber nicht mehr zum geladenen Stand gehören.
 * @param {string[]} existing @param {Iterable<string>} wanted
 */
export function staleKeys(existing, wanted) {
  const keep = new Set(wanted);
  return existing.filter((k) => !keep.has(k));
}

class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** PostgREST-Liste `in.("a","b")` mit Anführungszeichen-Escaping. */
const inList = (keys) =>
  `in.(${keys.map((k) => `"${String(k).replace(/(["\\])/g, "\\$1")}"`).join(",")})`;

const chunks = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size)
  );

function makeRequest({ url, serviceKey, fetchImpl, signal }) {
  const base = url.replace(/\/+$/, "");
  return async function request(method, path, { body, prefer } = {}) {
    if (signal?.aborted) throw new StoreError("NETWORK", "abgebrochen (Zeitlimit des Accounts)");
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const pathname = path.split("?")[0];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    let res;
    let text;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      text = await res.text();
    } catch (err) {
      const reason = controller.signal.aborted
        ? "abgebrochen oder Zeitüberschreitung"
        : err?.message;
      throw new StoreError("NETWORK", `${method} ${pathname}: ${reason}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    if (!res.ok) {
      throw new StoreError(
        "HTTP",
        `${method} ${pathname} → HTTP ${res.status}: ${text.slice(0, BODY_PREVIEW)}`
      );
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new StoreError("SCHEMA", `${method} ${pathname}: Antwort ist kein JSON`);
    }
  };
}

const checkWindow = (w) => {
  if (w && !(ISO_DAY.test(w.from) && ISO_DAY.test(w.to))) {
    throw new StoreError("SCHEMA", "Zeitraum muss {from, to} als YYYY-MM-DD sein");
  }
};

/** Alle Schlüssel einer Tabelle im Zeitraum, seitenweise. */
async function existingKeys(request, table, keyCol, dateCol, profileId, window) {
  const out = [];
  const filter =
    `profile_id=eq.${encodeURIComponent(profileId)}` +
    `&${dateCol}=gte.${window.from}&${dateCol}=lte.${window.to}`;
  for (let offset = 0; ; offset += PAGE) {
    const page = await request(
      "GET",
      `/rest/v1/${table}?${filter}&select=${keyCol}&order=${keyCol}&limit=${PAGE}&offset=${offset}`
    );
    out.push(...(page ?? []).map((r) => r[keyCol]));
    if (!page || page.length < PAGE) return out;
  }
}

/** Upsert in Blöcken, danach nur die Schlüssel im Zeitraum löschen, die fehlen. */
async function syncTable(request, spec) {
  const { table, keyCol, dateCol, profileId, rows, window } = spec;
  for (const part of chunks(rows, ROW_CHUNK)) {
    await request("POST", `/rest/v1/${table}?on_conflict=profile_id,${keyCol}`, {
      body: part.map((r) => ({ ...r, profile_id: profileId })),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
  // Nichts geladen → nichts löschen (s. Kopfkommentar).
  if (!window || rows.length === 0) return { upserted: rows.length, deleted: 0 };

  const existing = await existingKeys(request, table, keyCol, dateCol, profileId, window);
  const stale = staleKeys(
    existing,
    rows.map((r) => r[keyCol])
  );
  for (const part of chunks(stale, DELETE_CHUNK)) {
    await request(
      "DELETE",
      `/rest/v1/${table}?profile_id=eq.${encodeURIComponent(profileId)}` +
        `&${dateCol}=gte.${window.from}&${dateCol}=lte.${window.to}` +
        `&${keyCol}=${encodeURIComponent(inList(part))}`,
      { prefer: "return=minimal" }
    );
  }
  return { upserted: rows.length, deleted: stale.length };
}

/**
 * Payload eines Profils in die Tabellen schreiben.
 * @param {{
 *   url: string, serviceKey: string, profileId: string, payload: object,
 *   window?: { rides?: {from: string, to: string}|null, wellness?: {from: string, to: string}|null },
 *   fetchImpl?: typeof fetch, signal?: { aborted: boolean, addEventListener: Function, removeEventListener: Function }
 * }} opts
 *   `window`: der bei intervals.icu geladene Zeitraum je Tabelle. Nur darin
 *   wird gelöscht; `null`/fehlend = nichts löschen.
 * @returns {Promise<{ ok: true, counts: { rides: number, wellness: number, deletedRides: number,
 *   deletedWellness: number, skipped: { rides: number, wellness: number } } }
 *   | { ok: false, error: { code: string, message: string } }>}
 */
export async function saveTrainingData(opts) {
  const { url, serviceKey, profileId, payload, window = {}, fetchImpl = fetch, signal } = opts;
  try {
    if (!url || !serviceKey)
      throw new StoreError("TOKEN_INVALID", "SUPABASE_URL/Service-Key fehlt");
    if (!profileId) throw new StoreError("NO_DATA", "profileId fehlt");
    checkWindow(window.rides);
    checkWindow(window.wellness);

    const request = makeRequest({ url, serviceKey, fetchImpl, signal });
    const { rides, wellness, profileData, skipped } = splitPayload(payload);

    const r = await syncTable(request, {
      table: "training_rides",
      keyCol: "ride_key",
      dateCol: "ride_date",
      profileId,
      rows: rides,
      window: window.rides ?? null,
    });
    const w = await syncTable(request, {
      table: "training_wellness",
      keyCol: "day",
      dateCol: "day",
      profileId,
      rows: wellness,
      window: window.wellness ?? null,
    });
    await request("POST", "/rest/v1/training_profile_data?on_conflict=profile_id", {
      body: [{ ...profileData, profile_id: profileId }],
      prefer: "resolution=merge-duplicates,return=minimal",
    });

    return {
      ok: true,
      counts: {
        rides: r.upserted,
        wellness: w.upserted,
        deletedRides: r.deleted,
        deletedWellness: w.deleted,
        skipped,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err instanceof StoreError ? err.code : "UNKNOWN",
        message: err?.message ?? String(err),
      },
    };
  }
}
