/* ============================================================
   STATE/CHART-VIEW.JS — Fensterzustand der modernisierten Bestandscharts
   (Phase 5, Schritt 0 — PMC-Direktmodernisierung, kein separater Tab)

   Hält NUR Ansichtszustand (Fenster als Tagesindizes, Hover, What-if-
   Szenario-Parameter) — keine Trainingsdaten, kein Supabase, kein Async,
   keine Netzwerkzugriffe. Persistiert lokal je Athlet. Muster wie
   onProposalsChange/onSessionChange (state/proposals.js, state/session.js)
   und `loadedForAthleteId` wie state/plan-cards.js (Athletenwechsel darf nie
   den fremden Zustand laden).

   Schritt 0: das Fenster ist fest (letzte 90 Tage + Horizont) — Brushing
   folgt in einem späteren Schritt. `ws`/`we` existieren schon jetzt, damit
   der spätere Umbau von "immer volle Breite" auf "echtes Brush-Fenster"
   keine State-Form-Änderung braucht.

   Schritt 2: Hover wird als `dateISO` geführt, nicht als chart-lokaler
   Tagesindex — der Zustand wird über `Table.highlightByDate`/
   `Planned.scrollToDate` (beide datumsbasiert, s. AGENTS.md „Bekannte
   Eigenheiten") hinaus gebraucht, und ein Index ist nur innerhalb des
   Skeletts sinnvoll, das genau EIN Chart beim Zeichnen erzeugt hat. Diese
   Schicht bleibt trotzdem `state/` und importiert bewusst NICHT `ui/`
   (Schichtenregel) — wer auf einen Hover reagiert (Crosshair, Fahrtenbuch-
   Highlight), abonniert `onChartViewChange` aus der jeweiligen `ui/`-Stelle
   selbst, statt dass dieses Modul in die UI hineinruft.

   Schritt 3 — What-if-Szenarien (docs/phase-5-konzept-explorer.md §6):
   `scenario` hält NUR die drei Parameter + einen Ein/Aus-Schalter (das ist,
   was laut §6.4/X9 persistiert wird); `scenarioProjection` ist das daraus
   abgeleitete `projectLoad()`-Ergebnis (NICHT persistiert, flüchtig wie das
   Szenario selbst — wird nach jedem Laden/jeder Parameteränderung neu
   gerechnet). Cards/Ist-Fahrten/Events/FTP kommen wie bei
   state/plan-cards.js::configureProjection als injizierte Provider
   (`configureScenarioSources`), damit dieses Modul state/data.js o.ä. nicht
   am Top-Level importieren muss (sonst zöge tests/chart-view-state.test.js
   dieselbe esm.sh-Importkette herein wie tests/plan-cards-move.test.js). */

import { buildScenario } from "../core/scenario.js";
import { projectLoad } from "../core/projection.js";

const SCENARIO_DEFAULT = Object.freeze({
  enabled: false,
  weekTssPct: 0,
  restDays: 0,
  rampRatePct: 0,
});

let ws = 0; // Fensteranfang (Tagesindex)
let we = 0; // Fensterende (Tagesindex)
let hoveredDate = null; // dateISO oder null
let loadedForAthleteId = null;
let scenario = { ...SCENARIO_DEFAULT };
/** @type {ReturnType<typeof projectLoad> | null} */
let scenarioProjection = null;
// Default-Provider: leere Quellen, harmlos, solange configureScenarioSources()
// (aus app.js, Composition Root) noch nicht gelaufen ist.
let scenarioSources = {
  getCards: () => [],
  getActuals: () => [],
  getEvents: () => [],
  getFtp: () => undefined,
};

const listeners = new Set();

function storageKey(athleteId) {
  return `chart_view_${athleteId}`;
}

function notify() {
  const state = getState();
  for (const fn of listeners) fn(state);
}

/** Verdrahtet die Kartensatz-/Prognose-Quellen für Szenario-Berechnungen —
 *  einmalig aus app.js, analog zu state/plan-cards.js::configureProjection.
 *  @param {{getCards?: () => Array, getActuals?: () => Array, getEvents?: () => Array, getFtp?: () => number|undefined}} sources */
export function configureScenarioSources(sources) {
  scenarioSources = { ...scenarioSources, ...sources };
}

/** Rechnet `scenarioProjection` aus dem aktuellen `scenario`-Zustand neu.
 *  `scenario.enabled === false` löscht das Ergebnis (kein Recompute-Overhead
 *  für "aus"). `core/projection.js` bleibt unangetastet — die zweite Kurve
 *  ruft `projectLoad()` nur mit einem anderen (synthetischen) Kartensatz auf
 *  (§6.1). Die `uncertain`-Herkunft aus `buildScenario()` (K3-Typ-Default/
 *  Workout-Schätzung VOR der Skalierung, s. core/scenario.js-Kopfkommentar)
 *  wird hier über `day.cardIds` nachträglich in `day.uncertain` verknüpft —
 *  `projectLoad()`s EIGENE `estimateTss()`-Neuauswertung sähe die synthetische
 *  Karte fälschlich als "sicher" an, weil sie ein explizites `tssPlanned`
 *  trägt (Stufe 1 der Prioritätskette). Ohne diese Brücke würde eine aus
 *  dünner Datenbasis geschätzte Szenario-Kurve präziser aussehen, als sie ist
 *  (§6.3, Pflicht nicht Kür). */
function recomputeScenario() {
  if (!scenario.enabled) {
    scenarioProjection = null;
    return;
  }
  const cards = scenarioSources.getCards() || [];
  const actuals = scenarioSources.getActuals() || [];
  const events = scenarioSources.getEvents() || [];
  const ftp = scenarioSources.getFtp?.();
  const { cards: syntheticCards, uncertainCardIds } = buildScenario(cards, scenario, { ftp });
  const projection = projectLoad(syntheticCards, actuals, { events, ftp });
  for (const day of projection.days) {
    if (!day.uncertain && day.cardIds.some((id) => uncertainCardIds.has(id))) {
      day.uncertain = true;
    }
  }
  scenarioProjection = projection;
}

/** @returns {{ws:number, we:number, hoveredDate:string|null,
 *   scenario: typeof SCENARIO_DEFAULT, scenarioProjection: ReturnType<typeof projectLoad>|null}} */
export function getState() {
  return { ws, we, hoveredDate, scenario, scenarioProjection };
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
  hoveredDate = null;
  // typeof-Wache: defektes/fremdes JSON kann ein `scenario`-Feld mit falscher
  // Form enthalten (z.B. ein String) — { ...string } würde Zeichen-Indizes
  // als Eigenschaften einstreuen statt sauber auf den Default zurückzufallen.
  const savedScenario =
    saved?.scenario && typeof saved.scenario === "object" ? saved.scenario : {};
  scenario = { ...SCENARIO_DEFAULT, ...savedScenario };
  recomputeScenario();
  notify();
}

function persist() {
  if (!loadedForAthleteId) return;
  try {
    localStorage.setItem(storageKey(loadedForAthleteId), JSON.stringify({ ws, we, scenario }));
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

/** Aktualisiert einzelne Szenario-Parameter (merged, behält `enabled`) und
 *  rechnet die Szenario-Prognose neu — z.B. aus dem `input`-Handler eines
 *  Reglers in ui/charts/pmc.js (Teil D).
 *  @param {{weekTssPct?:number, restDays?:number, rampRatePct?:number}} params */
export function setScenarioParams(params) {
  scenario = { ...scenario, ...params };
  recomputeScenario();
  persist();
  notify();
}

/** Klares Ein-/Ausschalten des Szenarios (§6, Teil D) — getrennt von den
 *  Parametern, damit "Regler auf 0" nicht mit "Szenario aus" verwechselt
 *  werden kann: die Basisprognose muss jederzeit ohne Szenario betrachtbar
 *  bleiben, auch mit von 0 verschiedenen (nur noch nicht aktiven) Reglern.
 *  @param {boolean} enabled */
export function setScenarioEnabled(enabled) {
  scenario = { ...scenario, enabled };
  recomputeScenario();
  persist();
  notify();
}

/** Publiziert das gehoverte Datum (Phase 5, Schritt 2, Teil A/1B) — z.B. aus
 *  dem `mouseenter`-Handler eines PMC-Datenpunkts. Kein No-op-Guard bei
 *  gleichem Wert: `notify()` ist billig (State-Kopie + Listener-Aufrufe,
 *  keine Neuzeichnung), und ein Guard würde bei schnellem Rein/Raus
 *  zwischen zwei Punkten mit demselben Datum (kommt am Skelett-Rand vor)
 *  einen fälligen Re-Paint verschlucken.
 *  @param {string} dateISO */
export function setHovered(dateISO) {
  hoveredDate = dateISO;
  notify();
}

/** Löscht den Hover (z.B. `mouseleave`). */
export function clearHovered() {
  if (hoveredDate === null) return;
  hoveredDate = null;
  notify();
}
