import {
  listPlanCards as listPlanCardsAdapter,
  updatePlanCard as updatePlanCardAdapter,
} from "../data-access/supabase/plan-cards.js";
import { findProfileIdByDisplayName } from "../data-access/supabase/profiles.js";
import { CONFIG } from "./config.js";
import { getSession } from "./session.js";

let cards = [];
let loading = false;
let error = null;
let loadedForAthleteId = null;
// Analog zu state/events.js: verhindert, dass eine überholte Antwort noch
// den State überschreibt (Athletenwechsel während eines laufenden Loads,
// oder ein Move/Cancel/Undo, das schneller zurückkommt als ein zuvor
// gestarteter loadPlanCards()).
let requestId = 0;
const listeners = new Set();
// athleteId ("athlete1"/"athlete2") -> aufgelöste Supabase-Profil-UUID.
// plan_cards.athlete_id ist eine echte UUID, Data.activeAthleteId aber nur
// die interne Kennung — ohne diese Auflösung würde jede Abfrage am
// uuid-Spaltentyp scheitern (s. findProfileIdByDisplayName-Kommentar).
const profileIdCache = new Map();

function notify() {
  for (const fn of listeners) fn(getState());
}

function requireUser() {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  return { ok: true, user };
}

/** Löst die interne Athleten-ID auf ihre Supabase-Profil-UUID auf (gecacht,
 *  öffentlicher Read über den Anzeigenamen — s. profiles.js). null wenn der
 *  Athlet (noch) keinen Supabase-Account hat. */
async function resolveAthleteProfileId(athleteId) {
  if (profileIdCache.has(athleteId)) return profileIdCache.get(athleteId);
  const name = CONFIG.athleteConfig(athleteId)?.name;
  if (!name) return null;
  const result = await findProfileIdByDisplayName(name);
  const id = result.ok ? result.id : null;
  if (id) profileIdCache.set(athleteId, id);
  return id;
}

/** Aktueller In-Memory-Zustand der geladenen Karten → { cards, loading,
 *  error, loadedForAthleteId }. `loadedForAthleteId` lässt Konsumenten
 *  erkennen, ob `cards` wirklich zum gerade angeforderten Athleten gehört
 *  (analog state/events.js). */
export function getState() {
  return { cards, loading, error, loadedForAthleteId };
}

/** Lädt alle plan_cards von `athleteId` ("athlete1"/"athlete2") neu —
 *  öffentlich lesbar (E1), kein Login nötig. */
export async function loadPlanCards(athleteId) {
  const myRequest = ++requestId;
  loading = true;
  error = null;
  notify();

  const profileId = await resolveAthleteProfileId(athleteId);
  if (myRequest !== requestId) return { ok: false, error: { code: "UNKNOWN", message: "Überholt" } };
  if (!profileId) {
    loading = false;
    error = { code: "NO_DATA", message: "Athlet hat (noch) keinen Supabase-Account" };
    cards = [];
    loadedForAthleteId = athleteId;
    notify();
    return { ok: false, error };
  }

  const result = await listPlanCardsAdapter(profileId);
  if (myRequest !== requestId) return result; // durch neueren Aufruf überholt
  loading = false;
  if (result.ok) {
    cards = result.cards;
    loadedForAthleteId = athleteId;
  } else {
    error = result.error;
  }
  notify();
  return result;
}

function applyCardUpdate(result) {
  if (result.ok && cards.some((c) => c.id === result.card.id)) {
    cards = cards
      .map((c) => (c.id === result.card.id ? result.card : c))
      .sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);
    notify();
  }
  return result;
}

/** Verschiebt eine Karte auf ein neues Datum — merkt sich das ursprüngliche
 *  Datum nur beim ERSTEN Verschieben (moved_from_date bleibt bei einer
 *  erneuten Verschiebung derselben Karte auf dem allerersten Ursprung
 *  stehen, analog zum bisherigen "Verschoben von …"-Badge-Verhalten). */
export async function movePlanCard(id, newDate, reason) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const card = cards.find((c) => c.id === id);
  const movedFromDate = card?.originalDate ?? card?.date;
  // status/cancelReason mit zurücksetzen: eine Karte kann in der DB
  // theoretisch gleichzeitig "ausgefallen" UND "verschoben" markiert sein
  // (getrennte Spalten, kein Constraint) — das alte adjustments.json-Modell
  // kannte pro Datum nur EINEN aktiven Zustand. Verschieben einer
  // ausgefallenen Karte reaktiviert sie also implizit als geplant.
  const result = await updatePlanCardAdapter(id, {
    plannedDate: newDate,
    movedFromDate,
    moveReason: reason || "",
    status: "geplant",
    cancelReason: null,
  });
  return applyCardUpdate(result);
}

export async function cancelPlanCard(id, reason) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  // moved_from_date/move_reason mit löschen (s. movePlanCard-Kommentar) —
  // sonst bliebe eine bereits verschobene Karte nach dem Ausfallen mit
  // stehengebliebenen Verschiebe-Daten zurück, und "Rückgängig" bräuchte
  // zwei Klicks statt einen (einmal für den Ausfall, einmal für die
  // Verschiebung), um die Karte vollständig wiederherzustellen.
  const result = await updatePlanCardAdapter(id, {
    status: "ausgefallen",
    cancelReason: reason || "",
    movedFromDate: null,
    moveReason: null,
  });
  return applyCardUpdate(result);
}

/** Macht die aktive Anpassung einer Karte rückgängig — deckt beide Fälle
 *  ab, die der "↩"-Button im UI auslösen kann (analog zum alten
 *  Adjustments.remove(), das pro Datum genau EINE Anpassung — Verschiebung
 *  ODER Ausfall — kannte und sie unterschiedslos entfernte): ausgefallene
 *  Karte → zurück auf "geplant"; verschobene Karte → zurück auf
 *  moved_from_date. */
export async function undoAdjustment(id) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const card = cards.find((c) => c.id === id);
  if (!card) return { ok: true };

  if (card.cancelled) {
    const result = await updatePlanCardAdapter(id, { status: "geplant", cancelReason: null });
    return applyCardUpdate(result);
  }
  if (!card.originalDate) return { ok: true };
  const result = await updatePlanCardAdapter(id, {
    plannedDate: card.originalDate,
    movedFromDate: null,
    moveReason: null,
  });
  return applyCardUpdate(result);
}

export function onPlanCardsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
