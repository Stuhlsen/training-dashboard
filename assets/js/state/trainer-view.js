/* ============================================================
   STATE/TRAINER-VIEW.JS — Trainer-Leiste: Kontext, Kategorien, Speicher-Modus
   (Phase 4 — Trainer-Sicht-Konzept §1/§5)

   Trägt drei zusammengehörige, aber unabhängig ladbare Zustände:
   - trainerContext: ist der eingeloggte User der Trainer des gerade
     angezeigten Athleten? (Voraussetzung für die gesamte Leiste)
   - categories: welche der 4 ZUSÄTZLICHEN, abwählbaren Kacheln aus
     OPTIONAL_CATEGORIES zeigt die Leiste (die 4 Standard-Kacheln aus
     DEFAULT_CATEGORIES sind immer sichtbar, Mockup 1) — DB-persistiert pro
     Trainer-Athlet-Paar (Fahrplan-Entscheidung zur Export/Import-Nachbar-
     frage "Kategorien-Persistenz")
   - saveMode: "direct" | "proposal" — steuert, wie Speichern-Aktionen im
     Trainer-Modus landen (Default "proposal", Trainer-Sicht-Konzept §5).
     Bewusst NUR Session-Zustand (kein Persistenz-Bedarf geäußert/erfragt),
     jeder neue Tab-Besuch startet wieder bei der konservativen Vorgabe.
   ============================================================ */

import { getProfileByDisplayName } from "../data-access/supabase/profiles.js";
import { getViewPrefs, setViewPrefs } from "../data-access/supabase/trainer-view-prefs.js";
import { getSession, isCoach } from "./session.js";
import { CONFIG } from "./config.js";

export const DEFAULT_CATEGORIES = ["checkin", "governor", "tsb", "proposals"];
export const OPTIONAL_CATEGORIES = ["wellbeing7d", "lastRides", "conflicts", "ctlAtl"];
export const CATEGORY_LABELS = {
  checkin: "Check-in heute",
  governor: "Governor heute",
  tsb: "TSB aktuell",
  proposals: "Vorschläge",
  wellbeing7d: "Wellbeing 7 Tage",
  lastRides: "Letzte Fahrten",
  conflicts: "Offene Konflikte",
  ctlAtl: "CTL/ATL-Verlauf",
};

let categories = [];
let saveMode = "proposal";
let loading = false;
let trainerContext = { isTrainer: false, athleteProfileId: null };
// Verhindert, dass eine überholte Antwort (schneller Athleten-Wechsel
// während des Ladens) den Kontext eines inzwischen verlassenen Athleten
// über den des aktuell angezeigten schreibt — analog zu state/plan-cards.js/
// state/events.js.
let requestId = 0;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(getState());
}

export function getState() {
  return { categories, saveMode, loading, trainerContext };
}

/** Prüft, ob der eingeloggte User der Trainer des gerade angezeigten
 *  Athleten ist — Voraussetzung für die gesamte Trainer-Leiste. Athlet
 *  selbst oder ein Besucher: immer false. Ruft KEINE `categories`/`saveMode`
 *  nach, das übernimmt loadCategories() separat (Aufrufer entscheidet die
 *  Reihenfolge, analog zu state/plan-cards.js/state/events.js). */
export async function loadTrainerContext(athleteId) {
  const myRequest = ++requestId;
  const user = getSession();
  if (!user || !isCoach()) {
    if (myRequest !== requestId) return trainerContext; // überholt
    trainerContext = { isTrainer: false, athleteProfileId: null };
    notify();
    return trainerContext;
  }
  const name = CONFIG.athleteConfig(athleteId)?.name;
  const result = name ? await getProfileByDisplayName(name) : { ok: true, profile: null };
  if (myRequest !== requestId) return trainerContext; // durch neueren Athletenwechsel überholt
  const profile = result.ok ? result.profile : null;
  trainerContext = {
    isTrainer: !!profile && profile.coachId === user.id,
    athleteProfileId: profile?.id ?? null,
  };
  notify();
  return trainerContext;
}

export function getSaveMode() {
  return saveMode;
}

export function setSaveMode(mode) {
  saveMode = mode === "direct" ? "direct" : "proposal";
  notify();
}

/** Lädt die gespeicherte Auswahl der ZUSÄTZLICHEN Kategorien (Teilmenge von
 *  OPTIONAL_CATEGORIES) für das aktuelle Trainer-Athlet-Paar (setzt
 *  loadTrainerContext() voraus) — fällt auf eine leere Auswahl zurück
 *  (nur die 4 Standard-Kacheln), solange nichts gespeichert ist. */
export async function loadCategories() {
  const user = getSession();
  if (!user || !trainerContext.athleteProfileId) {
    categories = [];
    notify();
    return { ok: true, categories };
  }
  loading = true;
  notify();
  const result = await getViewPrefs(user.id, trainerContext.athleteProfileId);
  loading = false;
  categories = result.ok && result.categories ? result.categories : [];
  notify();
  return { ok: result.ok, categories };
}

/** Speichert eine neue Kategorien-Auswahl (optimistisch — die Leiste soll
 *  sofort reagieren, ein Speicherfehler ist hier kein Grund, die gerade
 *  gewählte Ansicht wieder zurückzudrehen). */
export async function saveCategories(next) {
  categories = next;
  notify();
  const user = getSession();
  if (!user || !trainerContext.athleteProfileId) {
    return { ok: false, error: { code: "UNKNOWN", message: "Kein Trainer-Kontext" } };
  }
  return setViewPrefs(user.id, trainerContext.athleteProfileId, next);
}

export function onTrainerViewChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
