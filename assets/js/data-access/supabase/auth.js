import { supabase } from "./client.js";

const NOT_CONFIGURED = "Supabase nicht konfiguriert";

export async function signIn(email, password) {
  if (!supabase) return { user: null, error: NOT_CONFIGURED };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

export async function signOut() {
  if (!supabase) return { error: NOT_CONFIGURED };
  const { error } = await supabase.auth.signOut();
  if (error) return { error: error.message };
  return { error: null };
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
