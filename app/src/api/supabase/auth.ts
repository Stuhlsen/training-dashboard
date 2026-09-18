import type { Session, Subscription, User } from "@supabase/supabase-js";
import { supabase } from "./client";
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

/** Löst einen Einladungs-Token-Hash ein (Fahrplan 17 E7 V2, s. Kommentar in
 *  admin-api/invite.js): `verifyOtp({ token_hash, type })` ist ein POST,
 *  ausgeloest von echtem Browser-JS auf AcceptInvitePage.tsx — anders als
 *  GoTrues eigener `action_link` (reiner GET) unempfindlich gegen
 *  Linkvorschau-Bots (Signal etc.), die den Code sonst vor dem echten Klick
 *  verbrauchen. Baut bei Erfolg automatisch eine Session auf (wie
 *  `signInWithPassword`) — `onAuthChange` in AuthContext.tsx übernimmt sie. */
export async function verifyInviteToken(tokenHash: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Setzt das Passwort für einen frisch eingeladenen User (Onboarding-
 *  Assistent, Fahrplan 17 E7) — OHNE Re-Authentifizierung: nach dem
 *  Invite-Link existiert noch kein aktuelles Passwort, das man abfragen
 *  könnte. Die aktive Session aus dem Link reicht `updateUser()`. Der
 *  `has_password`-Trigger (V2) setzt danach serverseitig `profiles.
 *  has_password = true`. */
export async function setInitialPassword(newPassword: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
