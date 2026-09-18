import type { Session, Subscription, User } from "@supabase/supabase-js";
import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export async function signIn(email: string, password: string): Promise<Result<{ user: User }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, user: data.user };
}

export async function signOut(): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export function onAuthChange(callback: (session: Session | null) => void): Subscription | null {
  if (!supabase) return null;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return subscription;
}

/** Ändert das Passwort des eingeloggten Users — mit Re-Authentifizierung:
 *  eine aktive Session allein reicht Supabase für `updateUser()`, das prüft
 *  aber nicht, ob der Aufrufer das AKTUELLE Passwort kennt.
 *  `signInWithPassword()` mit dem aktuellen Passwort übernimmt diese Prüfung. */
export async function updatePassword(
  currentPassword: string,
  newPassword: string,
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email;
  if (!email) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };

  const reauth = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauth.error) {
    return { ok: false, error: { code: "UNKNOWN", message: "Aktuelles Passwort ist falsch." } };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }
  return { ok: true };
}

/** Löst einen Einladungs- oder Link-erneut-senden-Token-Hash ein (Fahrplan
 *  17 E7 V2, erweitert Fahrplan 18 E2/V2: `type` generalisiert von
 *  hartkodiert "invite" auf "invite"|"recovery" — Admin-Aktion "Link
 *  erneut senden" für einen Account mit vergessenem Passwort liefert
 *  `type: "recovery"`, s. admin-api/users.js::resendUserLink()).
 *  `verifyOtp({ token_hash, type })` ist ein POST, ausgeloest von echtem
 *  Browser-JS auf AcceptInvitePage.tsx — anders als GoTrues eigener
 *  `action_link` (reiner GET) unempfindlich gegen Linkvorschau-Bots (Signal
 *  etc.), die den Code sonst vor dem echten Klick verbrauchen. Baut bei
 *  Erfolg automatisch eine Session auf (wie `signInWithPassword`) —
 *  `onAuthChange` in AuthContext.tsx übernimmt sie. */
export async function verifyInviteToken(tokenHash: string, type: "invite" | "recovery" = "invite"): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Setzt das Passwort für einen frisch eingeladenen User (Onboarding-
 *  Assistent, Fahrplan 17 E7) — OHNE Re-Authentifizierung: nach dem
 *  Invite-Link existiert noch kein aktuelles Passwort, das man abfragen
 *  könnte. Die aktive Session aus dem Link reicht `updateUser()`.
 *
 *  `has_password` wird danach explizit per RPC gesetzt (Migration 0042,
 *  V2-Fix nach Vorfall admin-Invite/Tony 18.09.2026) — NICHT mehr über
 *  einen DB-Trigger auf `auth.users.encrypted_password`: GoTrue setzt bei
 *  `/admin/generate_link` bereits beim Einladen selbst einen (zufälligen)
 *  Passwort-Hash, der frühere Trigger hätte has_password dadurch sofort auf
 *  true gesetzt, noch bevor die Person hier überhaupt war — der
 *  Pflicht-Schritt wäre für jede Einladung übersprungen worden. */
export async function setInitialPassword(newPassword: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };

  // getAuthedClient(), nicht der Singleton `supabase`: der aktualisiert
  // seinen intern fuer REST-/RPC-Requests genutzten Authorization-Header
  // nach dem Login nicht zuverlaessig (s. Kommentar in client.ts) — ein
  // `supabase.rpc(...)` hier liefe sonst faktisch als `anon`, die RPC faende
  // per `auth.uid()` niemanden und wuerde still 0 Zeilen treffen (kein
  // Fehler, aber auch kein Effekt — empirisch genau so beobachtet).
  const authedClient = await getAuthedClient();
  if (!authedClient) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
  const { error: rpcError } = await authedClient.rpc("mark_password_set");
  if (rpcError) return { ok: false, error: { code: "UNKNOWN", message: rpcError.message } };
  return { ok: true };
}
