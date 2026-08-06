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

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
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
