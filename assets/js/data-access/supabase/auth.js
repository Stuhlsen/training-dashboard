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
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    // Ein einzelnes getSession() reichte nicht (weiterhin 403 ohne
    // Authorization-Header auf den ersten Folge-Request nach SIGNED_IN,
    // s. Commit 92a61bc) — bis zu 3 Versuche mit 50ms Pause, bis
    // getSession() einen Access-Token zurückgibt. Kein Endlos-Warten:
    // nach 3 Versuchen läuft der Callback so oder so weiter.
    if (session) {
      let attempt = 0;
      let synced = null;
      while (attempt < 3 && !synced?.access_token) {
        synced = (await supabase.auth.getSession()).data.session;
        if (!synced?.access_token) await new Promise((r) => setTimeout(r, 50));
        attempt++;
      }
    }
    callback(session);
  });
  return subscription;
}

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}
