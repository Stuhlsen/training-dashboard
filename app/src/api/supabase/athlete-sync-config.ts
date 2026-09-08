/* ============================================================
   API/SUPABASE/ATHLETE-SYNC-CONFIG.TS — grober Standort des eingeloggten
   Users für die Sync-Wettervorschau (Tabelle `athlete_sync_config`,
   Migration 0023, Fahrplan 7 CRED2).

   Nur die Standort-Spalten (`weather_lat`/`weather_lon`). Die
   intervals.icu-Zugangsdaten derselben Tabelle pflegt bis zum
   Lese-Umstieg des Sync (CRED3) weiterhin api/supabase/intervals-
   credentials.ts über die Alt-Tabelle `intervals_credentials` — der
   Upsert hier fasst nur die weather_*-Spalten an, bestehende
   intervals_*-Werte einer Zeile bleiben unangetastet.

   DATENSCHUTZ (AGENTS.md, höchste Priorität): Die verbindliche Rundung
   auf 2 Nachkommastellen macht der Spaltentyp numeric(5,2)/(6,2)
   serverseitig (0023). `roundCoord()` hier ist nur die Anzeige-Konsistenz
   vor dem Senden, keine Sicherheitsgrenze. RLS lässt ausschließlich die
   eigene Zeile zu, kein anon-Zugriff.
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { Result, SyncLocation } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/** Auf 2 Nachkommastellen (~1,1 km) runden — spiegelt die serverseitige
 *  numeric(x,2)-Rundung aus Migration 0023, damit die UI sofort denselben
 *  Wert zeigt, der gespeichert wird. `null` bleibt `null`. */
export function roundCoord(n: number | null): number | null {
  return n === null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100;
}

interface SyncConfigLocationRow {
  weather_lat: number | string | null;
  weather_lon: number | string | null;
}

/** PostgREST liefert `numeric` je nach Client mal als Zahl, mal als String
 *  (Präzisionserhalt) — beides auf `number | null` normalisieren. */
function toNum(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

export async function getSyncLocation(
  userId: string,
): Promise<Result<{ location: SyncLocation }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("athlete_sync_config")
    .select("weather_lat, weather_lon")
    .eq("profile_id", userId)
    .maybeSingle<SyncConfigLocationRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return {
    ok: true,
    location: {
      lat: data ? toNum(data.weather_lat) : null,
      lon: data ? toNum(data.weather_lon) : null,
    },
  };
}

export async function updateSyncLocation(
  userId: string,
  { lat, lon }: SyncLocation,
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("athlete_sync_config").upsert(
    {
      profile_id: userId,
      weather_lat: roundCoord(lat),
      weather_lon: roundCoord(lon),
    },
    { onConflict: "profile_id" },
  );
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/* --- Intervall-Kadenz-Ziel (Migration 0036) -----------------------------
   Dieselbe Zeile/RLS wie der Standort, aber KEIN Sync-Bezug: der Wert
   wirkt rein im Frontend (Push-Text, .zwo-Export, Analyse-Anzeige). `null`
   = nichts hinterlegt ⇒ die App fällt auf CADENCE_TARGET_RPM (90) zurück.
   Der Upsert fasst nur diese eine Spalte an, die weather-/intervals-Werte
   einer bestehenden Zeile bleiben unangetastet (wie updateSyncLocation). */

interface SyncConfigCadenceRow {
  interval_cadence_target: number | string | null;
}

export async function getCadenceTarget(
  userId: string,
): Promise<Result<{ target: number | null }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("athlete_sync_config")
    .select("interval_cadence_target")
    .eq("profile_id", userId)
    .maybeSingle<SyncConfigCadenceRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, target: data ? toNum(data.interval_cadence_target) : null };
}

export async function updateCadenceTarget(userId: string, target: number | null): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("athlete_sync_config").upsert(
    { profile_id: userId, interval_cadence_target: target },
    { onConflict: "profile_id" },
  );
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
