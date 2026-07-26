/* ============================================================
   STATE/CHART-VIEW.JS — Fensterzustand der modernisierten Bestandscharts
   (Phase 5, Schritt 0 — PMC-Direktmodernisierung, kein separater Tab)

   Hält NUR Ansichtszustand (Fenster als Tagesindizes, Hover) — keine
   Trainingsdaten, kein Supabase, kein Async, keine Netzwerkzugriffe.
   Persistiert lokal je Athlet. Muster wie onProposalsChange/onSessionChange
   (state/proposals.js, state/session.js) und `loadedForAthleteId` wie
   state/plan-cards.js (Athletenwechsel darf nie den fremden Zustand laden).

   Schritt 0: das Fenster ist fest (letzte 90 Tage + Horizont) — Brushing
   folgt in einem späteren Schritt. `ws`/`we` existieren schon jetzt, damit
   der spätere Umbau von "immer volle Breite" auf "echtes Brush-Fenster"
   keine State-Form-Änderung braucht. */

let ws = 0; // Fensteranfang (Tagesindex)
let we = 0; // Fensterende (Tagesindex)
let hoveredIndex = null;
let loadedForAthleteId = null;

const listeners = new Set();

function storageKey(athleteId) {
  return `chart_view_${athleteId}`;
}

function notify() {
  const state = getState();
  for (const fn of listeners) fn(state);
}

/** @returns {{ws:number, we:number, hoveredIndex:number|null}} */
export function getState() {
  return { ws, we, hoveredIndex };
}

/** @param {(state: ReturnType<typeof getState>) => void} fn @returns {() => void} */
export function onChartViewChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Lädt den persistierten Zustand eines Athleten (oder legt den übergebenen
 * Default an, falls nichts/nur defektes JSON vorliegt). Wiederholte Aufrufe
 * für denselben Athleten sind ein No-op.
 * @param {string} athleteId
 * @param {{ws:number, we:number}} defaultWindow
 */
export function loadForAthlete(athleteId, defaultWindow) {
  if (loadedForAthleteId === athleteId) return;
  loadedForAthleteId = athleteId;

  let saved = null;
  try {
    const raw = localStorage.getItem(storageKey(athleteId));
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null; // defektes JSON oder localStorage nicht verfügbar → Default
  }

  ws = saved?.ws ?? defaultWindow.ws;
  we = saved?.we ?? defaultWindow.we;
  hoveredIndex = null;
  notify();
}

function persist() {
  if (!loadedForAthleteId) return;
  try {
    localStorage.setItem(storageKey(loadedForAthleteId), JSON.stringify({ ws, we }));
  } catch {
    // localStorage kann fehlschlagen (privater Modus, Speicherlimit) —
    // Zustand bleibt dann In-Memory für die laufende Sitzung gültig.
  }
}

/** @param {number} nextWs @param {number} nextWe */
export function setWindow(nextWs, nextWe) {
  ws = nextWs;
  we = nextWe;
  persist();
  notify();
}

/** @param {number|null} index */
export function setHoveredIndex(index) {
  hoveredIndex = index;
  notify();
}
