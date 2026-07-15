import {
  getRange as getRangeAdapter,
  upsertToday as upsertTodayAdapter,
} from "../data-access/supabase/wellbeing.js";
import { getSession, onSessionChange } from "./session.js";
import { localISODate, addDaysISO } from "../core/format.js";
import { getSubjectiveReadiness } from "../core/readiness.js";

let checkin = null;
// Subjektiver Kanal für den Governor (core/briefing.js::buildBriefing) —
// aus denselben 2 Tagen abgeleitet, die loadToday() ohnehin lädt (Konzept
// docs/phase-2-konzept-morgen-checkin.md Abschnitt 5.4: "nur gestern zählt
// als veraltet-aber-relevant"). Ableitung passiert hier, nicht im Aufrufer —
// core/readiness.js::getSubjectiveReadiness bleibt eine reine Funktion,
// state/ ist wie überall sonst die einzige Schicht mit Athleten-/Datumsbezug.
let subjective = null;
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

/** Aktueller In-Memory-Zustand → { checkin, subjective, loading, error } */
export function getState() {
  return { checkin, subjective, loading, error };
}

/** Lädt den heutigen (+gestrigen, für den Governor) Check-in des
 *  eingeloggten Athleten neu */
export async function loadToday() {
  const myRequest = ++requestId;
  const user = getSession();
  if (!user) {
    checkin = null;
    subjective = null;
    loadedForUserId = null;
    error = null;
    loading = false;
    notify();
    return { ok: true, checkin: null };
  }
  loading = true;
  error = null;
  notify();
  const today = localISODate();
  const result = await getRangeAdapter(user.id, addDaysISO(today, -1), today);
  // durch neueren Aufruf/Session-Wechsel überholt — Rückgabe trotzdem auf den
  // bisherigen { ok, checkin }-Vertrag reshapen (getRangeAdapter liefert
  // { ok, checkins: [...] }, nicht direkt .checkin), damit ein Aufrufer wie
  // ui/checkin-dialog.js weiterhin result.checkin lesen kann.
  if (myRequest !== requestId) {
    return result.ok
      ? { ok: true, checkin: result.checkins.find((c) => c.date === today) || null }
      : result;
  }
  loading = false;
  if (result.ok) {
    // Exakter "heute"-Treffer — bewahrt den bisherigen getToday()-Vertrag 1:1
    // für ui/checkin-dialog.js/ui/wellbeing-card.js (nie ein Vortagswert im Formular).
    checkin = result.checkins.find((c) => c.date === today) || null;
    subjective = getSubjectiveReadiness(result.checkins, today);
    loadedForUserId = user.id;
  } else {
    error = result.error;
  }
  notify();
  // Bei Fehler KEIN checkin-Feld zurückgeben (bisheriger getToday()-Vertrag:
  // Fehler-Rückgabe war immer nur { ok: false, error }) — sonst würde hier
  // versehentlich der stehengebliebene Modul-State (checkin von einem
  // früheren erfolgreichen Aufruf) als Teil eines Fehler-Ergebnisses
  // mitgegeben, obwohl er nichts mit dieser fehlgeschlagenen Anfrage zu tun hat.
  return result.ok ? { ok: true, checkin } : result;
}

/** Speichert/aktualisiert den heutigen Check-in (Upsert auf denselben Tag) */
export async function saveToday({ energy, muscleFeel, mood, note }) {
  const user = getSession();
  if (!user) return { ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } };
  const myRequest = ++requestId;
  const today = localISODate();
  const result = await upsertTodayAdapter(user.id, today, { energy, muscleFeel, mood, note });
  if (myRequest !== requestId) return result; // durch neueren Aufruf/Session-Wechsel überholt
  if (result.ok) {
    checkin = result.checkin;
    // "Heute" allein reicht für freshness "vorhanden" (getSubjectiveReadiness
    // prüft zuerst auf einen exakten Today-Treffer) — kein erneuter
    // Range-Request nur um den gestrigen Wert erneut mitzuschleppen.
    subjective = getSubjectiveReadiness([result.checkin], today);
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
    subjective = null;
    loadedForUserId = null;
    error = null;
    loading = false;
    notify();
    return;
  }
  if (user.id !== loadedForUserId) loadToday();
});
