/* ============================================================
   API/ADMIN-ATHLETES.TS — fetch-Wrapper für admin-api GET /admin/athletes

   Analog admin-invite.ts: reiner fetch-Aufruf gegen den admin-api-Container
   (Caddy-Proxy /admin/*, Fahrplan 15 V1/V3) — kein Supabase-.from()-Aufruf,
   deshalb bewusst nicht unter api/supabase/. `admin-api/server.js` antwortet
   bereits in der Result-Form ({ ok:true, athletes } bzw. { ok:false,
   error:{ code, message } }), wird hier nur durchgereicht (Fahrplan 17 E6).
   ============================================================ */

import { supabase } from "./supabase/client";
import { getConfig } from "./supabase/config";
import type { AdminAthleteRow, Result } from "./types";

function isResultShape(body: unknown): body is Result<{ athletes: AdminAthleteRow[] }> {
  return !!body && typeof body === "object" && "ok" in body;
}

export async function fetchAdminAthletes(): Promise<Result<{ athletes: AdminAthleteRow[] }>> {
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
    res = await fetch(`${config.projectUrl}/admin/athletes`, {
      headers: { Authorization: `Bearer ${token}` },
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

  if (!isResultShape(body)) {
    return {
      ok: false,
      error: { code: "UNKNOWN", message: `admin-api antwortete mit ${res.status}, unerwartetes Format` },
    };
  }
  return body;
}
