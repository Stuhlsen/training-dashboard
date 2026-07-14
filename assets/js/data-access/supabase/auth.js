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
    // supabase-js aktualisiert den intern für REST-Requests genutzten
    // Auth-Header offenbar erst NACH dem SIGNED_IN-Event, nicht davor —
    // ein sofortiger Folge-Request im Callback (z.B. getProfile direkt
    // nach dem Login) lief dadurch beobachtet noch mit anon-Rechten
    // raus (403, kein Authorization-Header). getSession() (rein lesend,
    // löst selbst keinen neuen Auth-Event aus, im Unterschied zu
    // setSession()) abwarten gibt dem internen Sync die nötige Zeit.
    if (session) await supabase.auth.getSession();
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
