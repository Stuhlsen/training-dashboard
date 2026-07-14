import { onAuthChange } from "../data-access/supabase/auth.js";
import { getProfile } from "../data-access/supabase/profiles.js";

let currentUser = null;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(currentUser);
}

/** Registriert onAuthChange, lädt bei Login das Profil, hält currentUser aktuell */
export function initSession() {
  onAuthChange(async (session) => {
    if (!session?.user) {
      currentUser = null;
      notify();
      return;
    }
    const profile = await getProfile(session.user.id);
    currentUser = profile?.error ? null : profile;
    notify();
  });
}

export function getSession() {
  return currentUser;
}

export function isAthlete() {
  return currentUser?.role === "athlete";
}

export function isCoach() {
  return currentUser?.role === "coach";
}

export function isAdmin() {
  return !!currentUser?.isAdmin;
}

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
