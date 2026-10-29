/* ============================================================
   SCRIPTS/LIB/WAHOO-FETCH.JS — Fahrten von der Wahoo Cloud API holen
   (Fahrplan 19 B4, Entscheidungen 1/5/7/8/11).

   Läuft NEBEN dem intervals.icu-Sync und ersetzt nichts: schreibt nur
   Metadaten nach data/wahoo-1.json, rides.json bleibt unberührt.

   TOKENS: Zeile in athlete_wahoo_tokens (nur service_role, Migration 0080).
   Nur dieser Sync erneuert Tokens. Wahoo rotiert Access- UND Refresh-Token;
   die alten werden erst ungültig, sobald mit den neuen ein API-Aufruf läuft.
   Darum PFLICHT-Reihenfolge: erneuern → neue Tokens in der Tabelle speichern
   → erst danach abrufen. Scheitert das Speichern, wird nicht abgerufen — die
   alten Tokens bleiben dann gültig und der nächste Lauf versucht es erneut.

   NICHT FATAL: syncWahoo() wirft nie und zählt nie als Fehler (nur Warnung).
   Fehlende Verbindung/Env oder ein Wahoo-Fehler lassen den Sync normal weiterlaufen;
   intervals.icu bleibt führend. Eine bestehende Datei bleibt bei Fehlern
   erhalten. Nur wenn die Token-Zeile sicher FEHLT (Athlet hat getrennt), wird
   die Datei entfernt (Wahoo-Bedingung: Datenlöschung bei Widerruf).

   DATENSCHUTZ: Ausgabe ist eine Whitelist (toRideMeta) — keine GPS-Daten,
   keine FIT-Datei-URL. Logs enthalten nie Tokens, Secrets oder Rohantworten.

   ANFRAGEBUDGET (Sandbox: 25/5 min, 100/h, 250/Tag; Token-Refresh zählt nicht):
   Sync alle 15 min = 96 Listenabrufe/Tag. Detailabrufe nur für noch nicht
   bekannte Fahrten (aus der vorhandenen Datei), höchstens MAX_DETAIL_CALLS je
   Lauf. Ein Lauf braucht damit höchstens 1–3 + 10 Anfragen.
   ============================================================ */

import fs from "node:fs";
import { URLSearchParams } from "node:url";
import { ENV } from "./env.js";
import { log } from "./log.js";
import { WAHOO_FILE_1, writeOutput } from "./output.js";

const API = "https://api.wahooligan.com";
const WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Token gilt als abgelaufen, wenn er in weniger als dieser Zeit endet. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const MAX_PAGES = 3;
const PER_PAGE = 30;
/** Detailabrufe je Lauf (Sandbox-Limit: 25 pro 5 Minuten). */
const MAX_DETAIL_CALLS = 10;
const REQUEST_TIMEOUT_MS = 20000;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Positiver Messwert oder null (Wahoo liefert 0 bei fehlendem Sensor). */
const positive = (v) => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

/**
 * Workout + workout_summary → Metadaten. Whitelist: nur diese Felder gehen
 * in die Datei, alles andere (Datei-URL, Positionsfelder …) fällt weg.
 * Wahoo liefert Dezimalwerte als Strings.
 * @returns {object}
 */
export function toRideMeta(workout, ws) {
  const meters = positive(ws.distance_accum);
  return {
    id: workout.id,
    startTime: workout.starts,
    date: String(workout.starts).slice(0, 10),
    workoutTypeId: num(workout.workout_type_id),
    distanceKm: meters === null ? null : Math.round((meters / 1000) * 1e4) / 1e4,
    movingTimeSec: positive(ws.duration_active_accum),
    totalTimeSec: positive(ws.duration_total_accum),
    avgPower: positive(ws.power_avg),
    avgHeartRate: positive(ws.heart_rate_avg),
    avgCadence: positive(ws.cadence_avg),
  };
}

/** Fetch mit Timeout; Netzwerkfehler → null (Details gehören nicht ins Log). */
async function request(fetchImpl, url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function removeFile(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    log.warn("Wahoo: Datei konnte nicht entfernt werden");
  }
}

function loadKnownRides(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    return new Map((Array.isArray(data?.rides) ? data.rides : []).map((r) => [r.id, r]));
  } catch {
    return new Map();
  }
}

/** → Zeile | null (keine Zeile) | undefined (Lesefehler) */
async function readTokenRow(ctx) {
  const url =
    `${ctx.supabaseUrl}/rest/v1/athlete_wahoo_tokens?profile_id=eq.${encodeURIComponent(ctx.profileId)}` +
    `&select=access_token,refresh_token,expires_at,scope`;
  const res = await request(ctx.fetchImpl, url, { headers: ctx.serviceHeaders });
  if (!res?.ok) return undefined;
  const rows = await res.json();
  if (!Array.isArray(rows)) return undefined;
  return rows[0] ?? null;
}

/** Refresh-Grant → neue Tokens | null */
async function refreshTokens(ctx, row) {
  const res = await request(ctx.fetchImpl, `${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: ctx.clientId,
      client_secret: ctx.clientSecret,
    }).toString(),
  });
  if (!res?.ok) return null;
  const body = await res.json();
  const expiresIn = Number(body?.expires_in);
  if (
    !body?.access_token ||
    !body?.refresh_token ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: new Date(ctx.now + expiresIn * 1000).toISOString(),
    scope: typeof body.scope === "string" && body.scope ? body.scope : (row.scope ?? ""),
  };
}

async function saveTokens(ctx, tokens) {
  const res = await request(
    ctx.fetchImpl,
    `${ctx.supabaseUrl}/rest/v1/athlete_wahoo_tokens?on_conflict=profile_id`,
    {
      method: "POST",
      headers: {
        ...ctx.serviceHeaders,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ profile_id: ctx.profileId, ...tokens }),
    }
  );
  return Boolean(res?.ok);
}

/** Gültiges Access-Token liefern, bei Bedarf erneuern (erst speichern!). */
async function ensureAccessToken(ctx, row) {
  const expiresAt = Date.parse(row.expires_at);
  if (Number.isFinite(expiresAt) && expiresAt - ctx.now > EXPIRY_BUFFER_MS) return row.access_token;

  const fresh = await refreshTokens(ctx, row);
  if (!fresh) {
    log.warn("Wahoo: Token-Erneuerung fehlgeschlagen — übersprungen");
    return null;
  }
  if (!(await saveTokens(ctx, fresh))) {
    log.warn("Wahoo: neue Tokens konnten nicht gespeichert werden — kein Abruf");
    return null;
  }
  return fresh.access_token;
}

/** Fahrten der letzten WINDOW_DAYS Tage (Liste, neueste zuerst) | null bei Fehler */
async function listRecentWorkouts(ctx, accessToken) {
  const cutoff = ctx.now - WINDOW_DAYS * DAY_MS;
  const found = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await request(
      ctx.fetchImpl,
      `${API}/v1/workouts?page=${page}&per_page=${PER_PAGE}`,
      bearer(accessToken)
    );
    if (!res?.ok) {
      log.warn(`Wahoo: Fahrtenliste nicht abrufbar${res ? ` (HTTP ${res.status})` : ""}`);
      return null;
    }
    const body = await res.json();
    if (!Array.isArray(body?.workouts)) {
      log.warn("Wahoo: Fahrtenliste hat unerwartetes Format");
      return null;
    }
    // Der Abbruch unten setzt "neueste zuerst" voraus. Kommt die Liste aufsteigend,
    // würde der erste alte Eintrag sie leeren und die bestehende Datei überschreiben.
    const first = Date.parse(body.workouts[0]?.starts);
    const last = Date.parse(body.workouts[body.workouts.length - 1]?.starts);
    if (
      body.workouts.length >= 2 &&
      Number.isFinite(first) &&
      Number.isFinite(last) &&
      first < last
    ) {
      log.warn("Wahoo: Fahrtenliste ist nicht absteigend sortiert — übersprungen");
      return null;
    }
    let reachedOlder = false;
    for (const w of body.workouts) {
      const ts = Date.parse(w?.starts);
      if (!Number.isFinite(ts)) continue;
      if (ts < cutoff) {
        reachedOlder = true;
        break;
      }
      found.push(w);
    }
    const perPage = num(body.per_page) ?? PER_PAGE;
    if (reachedOlder || body.workouts.length === 0 || page * perPage >= (num(body.total) ?? 0))
      break;
  }
  return found;
}

/** Metadaten je Fahrt: Bekanntes wiederverwenden, Neues einzeln abrufen. */
async function collectRides(ctx, accessToken, workouts, known) {
  const rides = [];
  let detailCalls = 0;
  let skipped = false;
  let stop = false;
  for (const w of workouts) {
    const old = known.get(w.id);
    if (old) {
      rides.push(old);
      continue;
    }
    if (stop || detailCalls >= MAX_DETAIL_CALLS) {
      skipped = true;
      continue;
    }
    detailCalls++;
    const res = await request(
      ctx.fetchImpl,
      `${API}/v1/workouts/${encodeURIComponent(w.id)}`,
      bearer(accessToken)
    );
    if (!res?.ok) {
      skipped = true;
      if (res && (res.status === 429 || res.status === 401)) {
        log.warn(`Wahoo: Detailabruf gestoppt (HTTP ${res.status})`);
        stop = true;
      }
      continue;
    }
    const ws = (await res.json())?.workout_summary;
    if (!ws || typeof ws !== "object") {
      skipped = true;
      continue;
    }
    rides.push(toRideMeta(w, ws));
  }
  return { rides, skipped, detailCalls };
}

/**
 * Wahoo-Fahrten für einen Athleten holen und nach data/wahoo-1.json schreiben.
 * Wirft nie.
 * @param {{profileId?: string|null, supabaseUrl?: string, serviceKey?: string,
 *   clientId?: string, clientSecret?: string, fetchImpl?: typeof fetch,
 *   now?: number, file?: string}} [opts]  Standardwerte kommen aus ENV
 * @returns {Promise<{status: "ok"|"partial"|"skipped"|"disconnected"|"error"}>}
 */
export async function syncWahoo(opts = {}) {
  const ctx = {
    profileId: opts.profileId ?? null,
    supabaseUrl: opts.supabaseUrl ?? ENV.SUPABASE_URL,
    serviceKey: opts.serviceKey ?? ENV.SUPABASE_SERVICE_ROLE_KEY,
    clientId: opts.clientId ?? ENV.WAHOO_CLIENT_ID,
    clientSecret: opts.clientSecret ?? ENV.WAHOO_CLIENT_SECRET,
    fetchImpl: opts.fetchImpl ?? fetch,
    now: opts.now ?? Date.now(),
  };
  const file = opts.file ?? WAHOO_FILE_1;

  if (!ctx.profileId || !ctx.supabaseUrl || !ctx.serviceKey) return { status: "skipped" };
  if (!ctx.clientId || !ctx.clientSecret) {
    log.info("ℹ️  Wahoo: WAHOO_CLIENT_ID/WAHOO_CLIENT_SECRET fehlen — übersprungen");
    return { status: "skipped" };
  }
  ctx.serviceHeaders = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` };

  try {
    const row = await readTokenRow(ctx);
    if (row === undefined || (row && (!row.access_token || !row.refresh_token))) {
      log.warn("Wahoo: Token-Zeile nicht lesbar — übersprungen");
      return { status: "error" };
    }
    if (row === null) {
      removeFile(file);
      log.info("ℹ️  Wahoo: nicht verbunden — keine Wahoo-Daten");
      return { status: "disconnected" };
    }

    const accessToken = await ensureAccessToken(ctx, row);
    if (!accessToken) return { status: "error" };

    const workouts = await listRecentWorkouts(ctx, accessToken);
    if (!workouts) return { status: "error" };

    const { rides, skipped, detailCalls } = await collectRides(
      ctx,
      accessToken,
      workouts,
      loadKnownRides(file)
    );
    rides.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    writeOutput(file, {
      source: "wahoo",
      generatedAt: new Date(ctx.now).toISOString(),
      windowDays: WINDOW_DAYS,
      rides,
    });
    log.info(`✅ Wahoo: ${rides.length} Fahrten (${detailCalls} Detailabrufe) → wahoo-1.json`);
    return { status: skipped ? "partial" : "ok" };
  } catch {
    log.warn("Wahoo: unerwarteter Fehler — übersprungen");
    return { status: "error" };
  }
}
