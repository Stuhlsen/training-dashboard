import {
  getToday as getTodayAdapter,
  upsertToday as upsertTodayAdapter,
} from "../data-access/supabase/wellbeing.js";
import { getSession, onSessionChange } from "./session.js";
import { localISODate } from "../core/format.js";

let checkin = null;
let loading = false;
let error = null;
let loadedForUserId = null;
// Erhöht sich bei jedem loadToday()/saveToday()-Aufruf und bei Logout. Eine
// Async-Antwort schreibt den State nur, wenn sie noch zur aktuellen
// "Generation" gehört — verhindert, dass eine durch Login/Logout/einen
// weiteren Aufruf überholte Antwort veraltete oder fremde Athletendaten in
// den geteilten Modul-State schreibt (z. B. Athlet A loggt sich während
// eines laufenden loadToday() aus, oder B loggt sich unmittelbar danach ein).
let requestId = 0;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(getState());
}

/** Aktueller In-Memory-Zustand des heutigen Check-ins → { checkin, loading, error } */
export function getState() {
  return { checkin, loading, error };
}

/** Lädt den heutigen Check-in des eingeloggten Athleten neu */
export async function loadToday() {
  const myRequest = ++requestId;
  const user = getSession();
  if (!user) {
    checkin = null;
    loadedForUserId = null;
    error = null;
    loading = false;
    notify();
    return { ok: true, checkin: null };
  }
  loading = true;
  error = null;
  notify();
  const result = await getTodayAdapter(user.id, localISODate());
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Session-Wechsel überholt
  loading = false;
  if (result.ok) {
    checkin = result.checkin;
    loadedForUserId = user.id;
  } else {
    error = result.error;
  }
  notify();
  return result;
}

/** Speichert/aktualisiert den heutigen Check-in (Upsert auf denselben Tag) */
export async function saveToday({ energy, muscleFeel, mood, note }) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  const myRequest = ++requestId;
  const result = await upsertTodayAdapter(user.id, localISODate(), { energy, muscleFeel, mood, note });
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Session-Wechsel überholt
  if (result.ok) {
    checkin = result.checkin;
    loadedForUserId = user.id;
    error = null;
  } else {
    error = result.error;
  }
  notify();
  return result;
}

export function onWellbeingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Reagiert auf Login/Logout: neuer eingeloggter User → heutigen Check-in
// laden, Logout → State leeren. Der Athleten-Toggle (Data.activeAthleteId,
// Ansicht fremder Athleten) betrifft das bewusst nicht — der Check-in hängt
// an der auth.uid() des eingeloggten Users, nicht an der Toggle-Auswahl.
onSessionChange((user) => {
  if (!user) {
    requestId++; // laufende Requests für den alten User ungültig machen
    checkin = null;
    loadedForUserId = null;
    error = null;
    loading = false;
    notify();
    return;
  }
  if (user.id !== loadedForUserId) loadToday();
});
