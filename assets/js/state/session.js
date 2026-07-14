import { onAuthChange, signIn as signInAdapter, signOut as signOutAdapter } from "../data-access/supabase/auth.js";
import {
  getProfile,
  updateDisplayName as updateDisplayNameAdapter,
  updateWellbeingPublic as updateWellbeingPublicAdapter,
} from "../data-access/supabase/profiles.js";

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

/** Reicht signIn/signOut aus data-access/ durch, damit ui/ nie direkt
 *  gegen data-access/ importiert (Schichtenregel). currentUser wird
 *  jeweils via onAuthChange aktualisiert, nicht hier. */
export async function signIn(email, password) {
  return signInAdapter(email, password);
}

export async function signOut() {
  return signOutAdapter();
}

/** Speichert den Display-Namen des eingeloggten Users und hält currentUser
 *  synchron, damit Header/Settings-Panel ohne Reload den neuen Wert zeigen. */
export async function updateDisplayName(name) {
  if (!currentUser) return { error: "Nicht eingeloggt" };
  const result = await updateDisplayNameAdapter(currentUser.id, name);
  if (!result.error) {
    currentUser = { ...currentUser, displayName: name };
    notify();
  }
  return result;
}

/** Speichert wellbeing_public des eingeloggten Users, currentUser synchron */
export async function updateWellbeingPublic(value) {
  if (!currentUser) return { error: "Nicht eingeloggt" };
  const result = await updateWellbeingPublicAdapter(currentUser.id, value);
  if (!result.error) {
    currentUser = { ...currentUser, wellbeingPublic: value };
    notify();
  }
  return result;
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
