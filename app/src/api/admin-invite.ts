/* ============================================================
   API/ADMIN-INVITE.TS — fetch-Wrapper für admin-api POST /admin/invite

   Reiner fetch-Aufruf gegen den admin-api-Container (Caddy-Proxy /admin/*,
   Fahrplan 15 V1/V3) — kein Supabase-.from()-Aufruf, deshalb bewusst nicht
   unter api/supabase/. `admin-api/server.js` antwortet bereits in der
   Result-Form ({ ok:true, link } bzw. { ok:false, error:{ code, message } }),
   wird hier nur durchgereicht statt neu gebaut.

   Kein SMTP lokal/produktiv (Nachtrag V1 nach E3): der Erfolgsfall liefert
   `hashedToken` im Response-Body zurück, es wird keine Mail verschickt — die
   UI baut daraus selbst den Link (s. Kommentar in InviteAthleteSection.tsx,
   V2-Fix gegen Linkvorschau-Bots) und macht ihn anzeigbar/kopierbar.
   ============================================================ */

import { supabase } from "./supabase/client";
import { getConfig } from "./supabase/config";
import type { Result } from "./types";

function isResultShape(body: unknown): body is Result<{ hashedToken: string }> {
  return !!body && typeof body === "object" && "ok" in body;
}

export async function inviteAthlete(email: string): Promise<Result<{ hashedToken: string }>> {
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
    res = await fetch(`${config.projectUrl}/admin/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email }),
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
