import { supabase } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

export async function signIn(email, password) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, user: data.user };
}

export async function signOut() {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export function onAuthChange(callback) {
  if (!supabase) return null;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return subscription;
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

/** Ändert das Passwort des eingeloggten Users — mit Re-Authentifizierung
 *  (C5.2): eine aktive Session allein reicht Supabase für `updateUser()`,
 *  das prüft aber nicht, ob der Aufrufer das AKTUELLE Passwort kennt.
 *  `signInWithPassword()` mit dem aktuellen Passwort übernimmt diese Prüfung
 *  (löst dabei erneut ein onAuthStateChange aus — harmlos, state/session.js
 *  lädt nur dasselbe Profil erneut). Gilt für alle Rollen (C5.3), kein
 *  `isAthlete()`-Gate hier oder im Aufrufer.
 *  @param {string} currentPassword @param {string} newPassword
 *  @returns {Promise<import("../../types.js").Result>} */
export async function updatePassword(currentPassword, newPassword) {
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
