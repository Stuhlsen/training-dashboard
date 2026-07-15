import {
  listEvents as listEventsAdapter,
  createEvent as createEventAdapter,
  updateEvent as updateEventAdapter,
  removeEvent as removeEventAdapter,
} from "../data-access/supabase/events.js";
import { getSession } from "./session.js";
import { localISODate } from "../core/format.js";

let events = [];
let loading = false;
let error = null;
let loadedForAthleteId = null;
// Analog zu state/wellbeing.js: verhindert, dass eine überholte Antwort noch
// den State überschreibt. Anders als wellbeing.js (nur ein Request-Typ,
// saveToday) zählt hier auch jede Mutation (create/update/remove) hoch, sonst
// könnte eine langsamere, gleichzeitig laufende loadEvents()-Antwort (Snapshot
// von VOR der Mutation) eine gerade erfolgreich geschriebene Änderung wieder
// aus dem lokalen State verschwinden lassen.
let requestId = 0;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(getState());
}

function byEventDate(a, b) {
  return a.eventDate.localeCompare(b.eventDate);
}

function requireUser() {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  return { ok: true, user };
}

/** Aktueller In-Memory-Zustand der geladenen Events → { events, loading, error } */
export function getState() {
  return { events, loading, error };
}

/** Lädt alle Events von `athleteId` neu — öffentlich lesbar (E1), kein Login
 *  nötig. `athleteId` ist der gerade betrachtete Athlet (Data.activeAthleteId),
 *  NICHT zwingend der eingeloggte User. */
export async function loadEvents(athleteId) {
  const myRequest = ++requestId;
  loading = true;
  error = null;
  notify();
  const result = await listEventsAdapter(athleteId);
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Mutation überholt
  loading = false;
  if (result.ok) {
    events = result.events;
    loadedForAthleteId = athleteId;
  } else {
    error = result.error;
  }
  notify();
  return result;
}

/** Nächstes zukünftige Rennen/Tour-Event aus dem bereits geladenen State —
 *  abgeleiteter Wert, kein zusätzlicher Request (Konzept Abschnitt 6/8). */
export function nextRaceEvent(todayIso = localISODate()) {
  const upcoming = events.filter((e) => e.type === "race" && e.eventDate >= todayIso);
  if (upcoming.length === 0) return null;
  return upcoming.reduce((soonest, e) => (e.eventDate < soonest.eventDate ? e : soonest));
}

/** Countdown zum nächsten Rennen/Tour-Event (Konzept Abschnitt 6/9: "Heute!"
 *  bei eventDate === todayIso, sonst Tage-Differenz). null wenn kein
 *  zukünftiges Rennen im geladenen State. */
export function raceCountdown(todayIso = localISODate()) {
  const event = nextRaceEvent(todayIso);
  if (!event) return null;
  const days = Math.round((Date.parse(event.eventDate) - Date.parse(todayIso)) / 86400000);
  return { event, days, label: days === 0 ? "Heute!" : `Noch ${days} Tage` };
}

/** Legt ein Event für `athleteId` an — Athlet selbst, sein Trainer oder Admin
 *  dürfen das (Konzept Abschnitt 5, RLS in 0004_events.sql). Hier nur die
 *  Login-Pflicht als Gate, kein UI-seitiges Rollen-Gate (würde die DB-Regel
 *  nur duplizieren). */
export async function createEvent(athleteId, event) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const myRequest = ++requestId;
  // type -> "other" macht priority/ftp_goal ungültig (Check-Constraint
  // events_priority_only_for_race) — hier erzwingen statt jedem Aufrufer
  // (aktuell ui/event-form.js, künftig ggf. Quick-Add/Import) zuzumuten,
  // das selbst zu wissen. Spiegelt updateEvent()s Logik.
  const payload = event.type === "other" ? { ...event, priority: null, ftpGoal: null } : event;
  const result = await createEventAdapter(athleteId, payload);
  if (myRequest !== requestId) return result; // durch neueren Aufruf überholt
  // loadedForAthleteId === null: noch nie geladen (z.B. Quick-Add ohne
  // vorherigen Timeline-Besuch) — Cache trotzdem für athleteId initialisieren,
  // statt den Erfolg lokal stillschweigend zu verwerfen.
  if (result.ok && (loadedForAthleteId === null || athleteId === loadedForAthleteId)) {
    events = [...events, result.event].sort(byEventDate);
    loadedForAthleteId = athleteId;
    notify();
  }
  return result;
}

export async function updateEvent(id, patch) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const myRequest = ++requestId;
  const result = await updateEventAdapter(id, patch);
  if (myRequest !== requestId) return result; // durch neueren Aufruf überholt
  if (result.ok && events.some((e) => e.id === id)) {
    events = events.map((e) => (e.id === id ? result.event : e)).sort(byEventDate);
    notify();
  }
  return result;
}

export async function removeEvent(id) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const myRequest = ++requestId;
  const result = await removeEventAdapter(id);
  if (myRequest !== requestId) return result; // durch neueren Aufruf überholt
  if (result.ok) {
    const before = events.length;
    events = events.filter((e) => e.id !== id);
    if (events.length !== before) notify();
  }
  return result;
}

export function onEventsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
