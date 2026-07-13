/* ============================================================
   CORE/ADHERENCE.JS — Konsistenz & Adhärenz (kein DOM)
   Trainingskonsistenz ist der stärkste einzelne Prädiktor für
   Langzeitfortschritt — wichtiger als jede Einzelsession. Die
   Adhärenz-Quote (nur mit eigenem Plan) zeigt zusätzlich, ob der
   Plan zur Lebensrealität passt oder angepasst werden sollte.

   Generalisiert die Plan-Erfüllungs-Logik aus core/weekreview.js
   (eine Woche) auf den gesamten Zeitraum.
   ============================================================ */

import { effectiveSessions } from "./planning.js";

/** Lokales ISO-Datum ohne UTC-Verschiebung @param {Date} d */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Montag der Woche eines ISO-Datums @param {string} dateISO */
export function mondayOf(dateISO) {
  const d = new Date(dateISO + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // Mo=0
  d.setDate(d.getDate() - dow);
  return isoLocal(d);
}

/**
 * Wochen-Streak: Anzahl aufeinanderfolgender Kalenderwochen mit ≥1 Fahrt,
 * rückwärts gezählt ab der letzten abgeschlossenen Woche. Die laufende
 * Woche zählt mit, wenn sie schon eine Fahrt hat, bricht den Streak aber
 * nicht, wenn (noch) nicht.
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {number}
 */
export function weeklyStreak(rides, todayISO) {
  const weeksWithRide = new Set((rides || []).map((r) => mondayOf(r.dateISO || r.date)));
  if (!weeksWithRide.size) return 0;

  const currentMonday = mondayOf(todayISO);
  let streak = 0;
  let cursor = currentMonday;

  // Laufende Woche: zählt wenn vorhanden, sonst neutral überspringen
  if (weeksWithRide.has(cursor)) streak++;
  // ab letzter abgeschlossener Woche rückwärts
  for (let i = 0; i < 520; i++) {
    const d = new Date(cursor + "T00:00:00");
    d.setDate(d.getDate() - 7);
    cursor = isoLocal(d);
    if (weeksWithRide.has(cursor)) streak++;
    else break;
  }
  return streak;
}

/**
 * Frequenz-Trend: Fahrten/Woche der letzten 4 abgeschlossenen Wochen
 * vs. der 4 Wochen davor.
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {null | {recent: number, previous: number|null, delta: number|null}}
 */
export function frequencyTrend(rides, todayISO) {
  const currentMonday = mondayOf(todayISO);
  const weekStarts = [];
  let cursor = currentMonday;
  for (let i = 0; i < 8; i++) {
    const d = new Date(cursor + "T00:00:00");
    d.setDate(d.getDate() - 7);
    cursor = isoLocal(d);
    weekStarts.push(cursor); // letzte 8 abgeschlossene Wochen, neueste zuerst
  }

  const countIn = (starts) => {
    const set = new Set(starts);
    return (rides || []).filter((r) => set.has(mondayOf(r.dateISO || r.date))).length;
  };

  const recentN = countIn(weekStarts.slice(0, 4));
  const prevN = countIn(weekStarts.slice(4, 8));
  if (!recentN && !prevN) return null;

  const recent = Math.round((recentN / 4) * 10) / 10;
  const previous = prevN ? Math.round((prevN / 4) * 10) / 10 : null;
  return {
    recent,
    previous,
    delta: previous != null ? Math.round((recent - previous) * 10) / 10 : null,
  };
}

/**
 * Plan-Adhärenz über alle Wochen bis heute: geplante Termine nach
 * Adjustments (ausgefallen raus, verschoben aufs neue Datum) vs.
 * tatsächliche Fahrten am jeweiligen Datum. Identisches Matching wie
 * core/weekreview.js::buildWeekReview, nur über den ganzen Zeitraum.
 * @param {import("../types.js").Ride[]} rides
 * @param {Array<{date: string, title?: string}>} plannedSessions
 * @param {Record<string, {cancelled?: boolean, movedTo?: string}>} adjustments
 * @param {string} todayISO
 * @returns {null | {planned: number, done: number, quote: number, missed: Array<{date: string, title: string}>}}
 */
export function planAdherence(rides, plannedSessions, adjustments, todayISO) {
  if (!plannedSessions?.length) return null;

  const effective = effectiveSessions(plannedSessions, adjustments).filter(
    (s) => s.date <= todayISO
  );
  if (!effective.length) return null;

  const doneDates = new Set((rides || []).map((r) => r.dateISO || r.date));
  const done = effective.filter((s) => doneDates.has(s.date));
  const missed = effective
    .filter((s) => !doneDates.has(s.date))
    .map((s) => ({ date: s.date, title: s.title || "Einheit" }));

  return {
    planned: effective.length,
    done: done.length,
    quote: Math.round((done.length / effective.length) * 100),
    missed: missed.slice(-5), // letzte 5 reichen für die Anzeige
  };
}

/**
 * Gesamtbild Konsistenz & Adhärenz.
 * Adhärenz nur mit plannedSessions (Athlet 1) — sonst null-Felder,
 * die Sektion bleibt für Athlet 2 trotzdem vollwertig (Streak/Frequenz).
 * @param {import("../types.js").Ride[]} rides
 * @param {Array<{date: string, title?: string}>|null} plannedSessions
 * @param {Record<string, Object>|null} adjustments
 * @param {string} todayISO
 * @returns {{streak: number, frequency: ReturnType<typeof frequencyTrend>, adherence: ReturnType<typeof planAdherence>}}
 */
export function buildConsistency(rides, plannedSessions, adjustments, todayISO) {
  return {
    streak: weeklyStreak(rides, todayISO),
    frequency: frequencyTrend(rides, todayISO),
    adherence: planAdherence(rides, plannedSessions || [], adjustments || {}, todayISO),
  };
}
