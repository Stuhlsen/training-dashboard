import {
  listPlanCards as listPlanCardsAdapter,
  updatePlanCard as updatePlanCardAdapter,
  createPlanCard as createPlanCardAdapter,
  removePlanCard as removePlanCardAdapter,
} from "../data-access/supabase/plan-cards.js";
import { findProfileIdByDisplayName } from "../data-access/supabase/profiles.js";
import { pushCardWorkout } from "../data-access/intervals/push.js";
import { weekLabelForDate } from "../core/plan-drag.js";
import { projectLoad } from "../core/projection.js";
import { detectConflicts } from "../core/conflicts.js";
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
// JEDE Mutation bumpt mit, nicht nur loadPlanCards() — sonst sähe eine
// laufende Mutation die dazwischengeschobene andere nicht und würde deren
// Ergebnis überschreiben. Für movePlanCard() ist das scharf: es schreibt
// optimistisch und müsste bei einem Fehler zurückrollen — ein Rollback
// gegen einen inzwischen geänderten Stand macht die neuere Änderung
// unsichtbar, obwohl die DB sie führt.
let requestId = 0;
const listeners = new Set();
// athleteId ("athlete1"/"athlete2") -> aufgelöste Supabase-Profil-UUID.
// plan_cards.athlete_id ist eine echte UUID, Data.activeAthleteId aber nur
// die interne Kennung — ohne diese Auflösung würde jede Abfrage am
// uuid-Spaltentyp scheitern (s. findProfileIdByDisplayName-Kommentar).
const profileIdCache = new Map();

// ── Abgeleiteter State: TSS/CTL-Prognose + Konfliktliste (Phase 3, Schritt 4).
// Wird nach JEDER Karten-Mutation neu gerechnet (recomputeProjection() im
// notify()) — der eine Zusammenlaufpunkt, den Drag UND Button teilen. Schritt 5
// rendert daraus nur noch (Delta-Zeile, Badges), diese Schicht liefert Daten.
/** @type {ReturnType<typeof projectLoad> | null} */
let projection = null;
let conflicts = [];
// Ist-Fahrten/Events kommen als injizierte Provider (configureProjection),
// damit dieses Modul state/data.js/state/events.js NICHT am Top-Level
// importieren muss — sonst zöge tests/plan-cards-move.test.js transitiv
// data-access/supabase/client.js (esm.sh-URL) herein, das node:test nicht
// auflösen kann. Default = leere Quellen (Prognose harmlos, Baseline 0).
let projectionSources = {
  getActuals: () => [],
  getEvents: () => [],
  getFtp: () => undefined,
};

/** Verdrahtet die Prognose-Quellen (Ist-Fahrten/Events/FTP) — einmalig aus
 *  app.js (Composition Root, darf state/* lesen). Rechnet direkt einmal neu,
 *  damit der abgeleitete State ab Init konsistent ist. */
export function configureProjection(sources) {
  projectionSources = { ...projectionSources, ...sources };
  recomputeProjection();
}

/** Rechnet Prognose + Konfliktliste aus dem aktuellen `cards`-Stand neu. Rein
 *  synchron aus dem In-Memory-Zustand: eine überholte Server-Antwort kehrt vor
 *  notify() zurück und kann die Prognose daher nicht mit veraltetem Stand
 *  überschreiben (erbt den requestId-/Rollback-Schutz aus Schritt 3). Auch
 *  extern aufrufbar (app.js triggert nach einem Event-Load, s. onEventsChange),
 *  weil ein Event den Horizont und K-EVENT beeinflusst, aber keine
 *  Karten-Mutation ist. */
export function recomputeProjection() {
  const actuals = projectionSources.getActuals() || [];
  const events = projectionSources.getEvents() || [];
  const ftp = projectionSources.getFtp?.();
  projection = projectLoad(cards, actuals, { events, ftp });
  conflicts = detectConflicts(projection, cards, events);
}

function notify() {
  recomputeProjection();
  const state = getState();
  for (const fn of listeners) fn(state);
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
 *  error, loadedForAthleteId, projection, conflicts }. `loadedForAthleteId`
 *  lässt Konsumenten erkennen, ob `cards` wirklich zum gerade angeforderten
 *  Athleten gehört (analog state/events.js). `projection`/`conflicts` sind der
 *  nach jeder Mutation neu gerechnete abgeleitete State (Schritt 4) — Schritt 5
 *  rendert daraus Delta-Zeile + Konflikt-Badges. */
export function getState() {
  return { cards, loading, error, loadedForAthleteId, projection, conflicts };
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

/** Ersetzt eine Karte im lokalen Cache und hält die Sortierung stabil
 *  (Datum, dann sort_order — dieselbe Ordnung wie listPlanCards()). */
function replaceCard(next) {
  cards = cards
    .map((c) => (c.id === next.id ? next : c))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder);
}

function applyCardUpdate(result) {
  if (result.ok && cards.some((c) => c.id === result.card.id)) {
    replaceCard(result.card);
    notify();
  }
  return result;
}

/** Verschiebt eine Karte auf ein neues Datum — merkt sich das ursprüngliche
 *  Datum nur beim ERSTEN Verschieben (moved_from_date bleibt bei einer
 *  erneuten Verschiebung derselben Karte auf dem allerersten Ursprung
 *  stehen, analog zum bisherigen "Verschoben von …"-Badge-Verhalten).
 *
 *  Gemeinsamer Schreibpfad für BEIDE Eingabearten: den "Verschieben"-
 *  Button (Datumsfeld) und Drag & Drop (ui/planned.js). Optimistik und
 *  requestId-Schutz liegen deshalb hier und nicht im Drag-Handler — sonst
 *  hätte der Button-Pfad sie nicht.
 *
 *  Die Karte übernimmt das week/phase-Label der Zielwoche (core/plan-drag.js),
 *  sonst hinge sie nach einem Drop über die Wochengrenze unter der alten
 *  Wochenüberschrift; ist die Zielwoche leer, bleibt das Label stehen. */
export async function movePlanCard(id, newDate, reason) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const snapshot = cards.find((c) => c.id === id);
  if (!snapshot) return { ok: false, error: { code: "NO_DATA", message: "Karte nicht gefunden" } };

  const movedFromDate = snapshot.originalDate ?? snapshot.date;
  const label = weekLabelForDate(cards, newDate, id);
  // status/cancelReason mit zurücksetzen: eine Karte kann in der DB
  // theoretisch gleichzeitig "ausgefallen" UND "verschoben" markiert sein
  // (getrennte Spalten, kein Constraint) — das alte adjustments.json-Modell
  // kannte pro Datum nur EINEN aktiven Zustand. Verschieben einer
  // ausgefallenen Karte reaktiviert sie also implizit als geplant.
  const patch = {
    plannedDate: newDate,
    movedFromDate,
    moveReason: reason || "",
    status: "geplant",
    cancelReason: null,
    ...(label ? { week: label.week, phase: label.phase } : {}),
  };

  const myRequest = ++requestId;
  // Optimistisch: die Karte springt sofort an den Zieltag, ohne auf die
  // Runde zum Server zu warten (Konzept §4).
  replaceCard({
    ...snapshot,
    date: newDate,
    originalDate: movedFromDate,
    movedReason: reason || undefined,
    cancelled: undefined,
    cancelReason: undefined,
    ...(label ? { week: label.week, phase: label.phase } : {}),
  });
  notify();

  const result = await updatePlanCardAdapter(id, patch);
  // Überholt (schneller Zweit-Drop, Athletenwechsel): NICHT anwenden — und
  // vor allem NICHT zurückrollen. Ein blinder Rollback im Fehlerzweig würde
  // sonst den bereits gesetzten Zustand des NEUEREN Vorgangs überschreiben:
  // A optimistisch → B startet → A schlägt fehl → A's Snapshot klobbert B.
  if (myRequest !== requestId) return result;
  if (!result.ok) {
    replaceCard(snapshot);
    notify();
    return result;
  }
  return applyCardUpdate(result);
}

export async function cancelPlanCard(id, reason) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const myRequest = ++requestId;
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
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Mutation überholt
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
  const myRequest = ++requestId;

  if (card.cancelled) {
    const result = await updatePlanCardAdapter(id, { status: "geplant", cancelReason: null });
    if (myRequest !== requestId) return result; // durch neueren Aufruf/Mutation überholt
    return applyCardUpdate(result);
  }
  if (!card.originalDate) return { ok: true };
  const result = await updatePlanCardAdapter(id, {
    plannedDate: card.originalDate,
    movedFromDate: null,
    moveReason: null,
  });
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Mutation überholt
  return applyCardUpdate(result);
}

/** Legt eine neue Karte für `athleteId` an (Karten-Dialog, Teil B). Löst die
 *  Profil-UUID wie loadPlanCards() auf; sort_order wird als max()+1 unter
 *  den bereits geladenen Karten desselben Datums berechnet (0 wenn keine),
 *  damit zwei Karten am selben Tag stabil sortiert bleiben (s. Konzept §7). */
export async function createPlanCard(athleteId, cardData) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const profileId = await resolveAthleteProfileId(athleteId);
  if (!profileId)
    return { ok: false, error: { code: "NO_DATA", message: "Athlet hat (noch) keinen Supabase-Account" } };

  const sameDateOrders = cards.filter((c) => c.date === cardData.date).map((c) => c.sortOrder ?? 0);
  const sortOrder = sameDateOrders.length ? Math.max(...sameDateOrders) + 1 : 0;

  const result = await createPlanCardAdapter(profileId, { ...cardData, sortOrder });
  // Analog zu state/events.js::createEvent: ohne diesen Guard könnte ein
  // Athletenwechsel während des laufenden Inserts die neue Karte in die
  // inzwischen für einen ANDEREN Athleten geladene `cards`-Liste hängen.
  if (result.ok && (loadedForAthleteId === null || athleteId === loadedForAthleteId)) {
    cards = [...cards, result.card].sort(
      (a, b) => a.date.localeCompare(b.date) || a.sortOrder - b.sortOrder
    );
    loadedForAthleteId = athleteId;
    notify();
  }
  return result;
}

/** Vollbearbeitung einer bestehenden Karte (Karten-Dialog, Teil B) — anders
 *  als movePlanCard/cancelPlanCard, die nur einzelne Adjustment-Felder
 *  patchen, schreibt das hier Titel/Datum/Typ/TSS/km/Notiz/Workout in einem
 *  Zug. */
export async function updatePlanCard(id, cardData) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const myRequest = ++requestId;
  const result = await updatePlanCardAdapter(id, {
    plannedDate: cardData.date,
    title: cardData.name,
    typ: cardData.typ,
    tssPlanned: cardData.tssPlanned ?? null,
    km: cardData.km ?? null,
    details: cardData.details ?? null,
    workout: cardData.workout ?? null,
  });
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Mutation überholt
  return applyCardUpdate(result);
}

/** Löscht eine Karte unwiderruflich (Konzept §3 — eigener Fall neben
 *  "Ausgefallen"). Entfernt sie erst aus dem lokalen State, nachdem der
 *  Server die Löschung bestätigt hat (kein optimistisches Rollback nötig,
 *  analog zu den übrigen Aktionen in diesem Modul). */
export async function deletePlanCard(id) {
  const gate = requireUser();
  if (!gate.ok) return gate;
  const myRequest = ++requestId;
  const result = await removePlanCardAdapter(id);
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Mutation überholt
  if (result.ok) {
    const before = cards.length;
    cards = cards.filter((c) => c.id !== id);
    if (cards.length !== before) notify();
  }
  return result;
}

/** Pusht das Workout einer Karte zu intervals.icu (M3 — Karten-CRUD,
 *  Schritt 2). Holt die Karte aus dem bereits geladenen State (trägt das
 *  aufgelöste Datum inkl. Verschiebung), ruft data-access/intervals/push.js
 *  und persistiert bei Erfolg `pushed_external_id`, damit ein erneuter Push
 *  (nach einem Verschieben) über external_id aktualisiert statt dupliziert.
 *  Kein requireUser()-Gate — der Push braucht den intervals.icu-API-Key aus
 *  localStorage, keine Supabase-Session (ui/planned.js::_canEdit() blendet
 *  den Button ohnehin athletenscharf aus). */
export async function pushPlanCard(id, token, athleteId) {
  const card = cards.find((c) => c.id === id);
  if (!card) return { ok: false, error: { code: "NO_DATA", message: "Karte nicht gefunden" } };

  const result = await pushCardWorkout(card, token, athleteId);
  if (!result.ok) return result;

  const patchResult = await updatePlanCardAdapter(id, { pushedExternalId: card.id });
  applyCardUpdate(patchResult);
  return result;
}

export function onPlanCardsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
