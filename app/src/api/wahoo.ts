/* ============================================================
   API/WAHOO.TS — fetch-Wrapper für admin-api /api/wahoo/*
   (Fahrplan 19 B3; Server-Vertrag: admin-api/README.md,
   Abschnitt "Wahoo-Anbindung")

   Gleiches Muster wie recipe-submission.ts: Bearer-Token aus der Session,
   Basis-URL aus der Supabase-Config, Antwort schon in Result-Form. Einzige
   Ergänzung: HTTP 503 heißt "Wahoo nicht konfiguriert" und bekommt den Code
   NOT_CONFIGURED, damit die UI das ruhig statt als Fehler zeigt.
   ============================================================ */

import { supabase } from "./supabase/client";
import { getConfig } from "./supabase/config";
import type { Result } from "./types";

export interface WahooStatus {
  connected: boolean;
  scope: string | null;
  expiresAt: string | null;
}

function isResultShape(body: unknown): body is Result<Record<string, unknown>> {
  return !!body && typeof body === "object" && "ok" in body;
}

async function call<T extends object>(method: "GET" | "POST", path: string): Promise<Result<T>> {
  const config = getConfig();
  if (!supabase || !config) {
    return { ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
  }

  let res: Response;
  try {
    res = await fetch(`${config.projectUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: e instanceof Error ? e.message : String(e) } };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, kein JSON` } };
  }
  if (!isResultShape(json)) {
    return { ok: false, error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, unerwartetes Format` } };
  }
  if (res.status === 503 && !json.ok) {
    return { ok: false, error: { ...json.error, code: "NOT_CONFIGURED" } };
  }
  return json as Result<T>;
}

export function getWahooStatus(): Promise<Result<WahooStatus>> {
  return call("GET", "/api/wahoo/status");
}

/** Liefert die fertige Authorize-URL; das Frontend leitet selbst dorthin weiter. */
export function startWahooConnect(): Promise<Result<{ url: string }>> {
  return call("POST", "/api/wahoo/start");
}

export function disconnectWahoo(): Promise<Result<{ revoked: boolean }>> {
  return call("POST", "/api/wahoo/disconnect");
}
