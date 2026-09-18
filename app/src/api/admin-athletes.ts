/* ============================================================
   API/ADMIN-ATHLETES.TS — fetch-Wrapper für admin-api /admin/users/*

   Analog admin-invite.ts: reiner fetch-Aufruf gegen den admin-api-Container
   (Caddy-Proxy /admin/*, Fahrplan 15 V1/V3) — kein Supabase-.from()-Aufruf,
   deshalb bewusst nicht unter api/supabase/. `admin-api/server.js` antwortet
   bereits in der Result-Form ({ ok:true, ... } bzw. { ok:false,
   error:{ code, message } }), wird hier nur durchgereicht (Fahrplan 17 E6).

   Fahrplan 18 E2: GET /admin/athletes → GET /admin/users (alle Rollen,
   V3), plus ban/unban/delete/resend (V2). Gemeinsame Auth-/Fetch-/
   Result-Logik in adminFetch() gebündelt statt fünffach dupliziert.
   ============================================================ */

import { supabase } from "./supabase/client";
import { getConfig } from "./supabase/config";
import type { AdminUserRow, Result } from "./types";

function isResultShape<T extends object>(body: unknown): body is Result<T> {
  return !!body && typeof body === "object" && "ok" in body;
}

async function adminFetch<T extends object = object>(path: string, init: RequestInit = {}): Promise<Result<T>> {
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
    res = await fetch(`${config.projectUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: e instanceof Error ? e.message : String(e) } };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, kein JSON` },
    };
  }

  if (!isResultShape<T>(body)) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, unerwartetes Format` },
    };
  }
  return body;
}

export async function fetchAdminUsers(): Promise<Result<{ users: AdminUserRow[] }>> {
  return adminFetch(`/admin/users`);
}

export async function banUser(userId: string): Promise<Result> {
  return adminFetch(`/admin/users/${userId}/ban`, { method: "POST" });
}

export async function unbanUser(userId: string): Promise<Result> {
  return adminFetch(`/admin/users/${userId}/unban`, { method: "POST" });
}

export async function deleteUser(userId: string, confirmEmail: string): Promise<Result> {
  return adminFetch(`/admin/users/${userId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmEmail }),
  });
}

export async function resendUserLink(
  userId: string
): Promise<Result<{ hashedToken: string; type: "invite" | "recovery" }>> {
  return adminFetch(`/admin/users/${userId}/resend`, { method: "POST" });
}
