/* Tests: state/chart-view.js — Fensterzustand der modernisierten Bestandscharts
   (Phase 5, Schritt 0). node --test kennt kein globales localStorage (kein DOM)
   — Stub nach demselben Muster wie andere state/-Tests dieser Art. */

import test from "node:test";
import assert from "node:assert/strict";
import { localISODate, addDaysISO } from "../assets/js/core/format.js";

// recomputeScenario() in state/chart-view.js ruft buildScenario()/projectLoad()
// ohne today-Override auf (nutzt das ECHTE Systemdatum) — Testkarten müssen
// deshalb relativ zu "heute" liegen, nicht auf ein festes Datum wie in
// tests/scenario.test.js (das today explizit übergibt).
const FUTURE_DATE = addDaysISO(localISODate(), 3);

function installLocalStorageStub() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

const store = installLocalStorageStub();
const {
  getState,
  loadForAthlete,
  setWindow,
  setHovered,
  clearHovered,
  onChartViewChange,
  configureScenarioSources,
  setScenarioParams,
  setScenarioEnabled,
} = await import("../assets/js/state/chart-view.js");

const SCENARIO_DEFAULT = { enabled: false, weekTssPct: 0, restDays: 0, rampRatePct: 0 };

test("loadForAthlete: legt den übergebenen Default an, wenn nichts gespeichert ist", () => {
  store.clear();
  loadForAthlete("athlete-cv-1", { ws: 0, we: 89 });
  assert.deepEqual(getState(), {
    ws: 0,
    we: 89,
    hoveredDate: null,
    scenario: SCENARIO_DEFAULT,
    scenarioProjection: null,
  });
});

test("setWindow: persistiert und ist nach erneutem Laden wieder da (Rundreise)", () => {
  store.clear();
  loadForAthlete("athlete-cv-2", { ws: 0, we: 10 });
  setWindow(3, 13);
  assert.deepEqual(getState().ws, 3);
  assert.deepEqual(getState().we, 13);

  const raw = store.get("chart_view_athlete-cv-2");
  assert.ok(raw, "muss unter dem athletenscharfen Schlüssel persistiert sein");
  assert.deepEqual(JSON.parse(raw), { ws: 3, we: 13, scenario: SCENARIO_DEFAULT });
});

test("loadForAthlete: Athletenwechsel lädt nicht den fremden Zustand", () => {
  store.clear();
  loadForAthlete("athlete-cv-a", { ws: 0, we: 10 });
  setWindow(5, 15);

  loadForAthlete("athlete-cv-b", { ws: 100, we: 110 });
  assert.deepEqual(getState().ws, 100);
  assert.deepEqual(getState().we, 110);

  // Erneuter Aufruf für athlete-cv-b (bereits geladen) darf den aktuell
  // aktiven Zustand nicht überschreiben.
  loadForAthlete("athlete-cv-b", { ws: 999, we: 999 });
  assert.deepEqual(getState().ws, 100);
  assert.deepEqual(getState().we, 110);
});

test("loadForAthlete: defektes JSON in localStorage führt zu Default statt Absturz", () => {
  store.clear();
  store.set("chart_view_athlete-cv-broken", "{not-json");
  assert.doesNotThrow(() => {
    loadForAthlete("athlete-cv-broken", { ws: 1, we: 91 });
  });
  assert.deepEqual(getState(), {
    ws: 1,
    we: 91,
    hoveredDate: null,
    scenario: SCENARIO_DEFAULT,
    scenarioProjection: null,
  });
});

/* setHovered/clearHovered — Phase 5, Schritt 2, Teil A (1B). */
test("setHovered: setzt hoveredDate und benachrichtigt Listener", () => {
  store.clear();
  loadForAthlete("athlete-cv-hover-1", { ws: 0, we: 10 });
  const seen = [];
  const unsubscribe = onChartViewChange((s) => seen.push(s.hoveredDate));

  setHovered("2026-07-20");
  assert.equal(getState().hoveredDate, "2026-07-20");
  assert.deepEqual(seen, ["2026-07-20"]);

  unsubscribe();
});

test("clearHovered: setzt hoveredDate zurück auf null, No-op-Guard verschluckt keinen fälligen Wechsel", () => {
  store.clear();
  loadForAthlete("athlete-cv-hover-2", { ws: 0, we: 10 });
  setHovered("2026-07-21");

  clearHovered();
  assert.equal(getState().hoveredDate, null);

  const seen = [];
  const unsubscribe = onChartViewChange((s) => seen.push(s.hoveredDate));
  clearHovered(); // bereits null → kein weiterer notify()
  assert.deepEqual(seen, []);
  unsubscribe();
});

test("loadForAthlete: Athletenwechsel setzt einen aktiven Hover zurück", () => {
  store.clear();
  loadForAthlete("athlete-cv-hover-a", { ws: 0, we: 10 });
  setHovered("2026-07-22");
  assert.equal(getState().hoveredDate, "2026-07-22");

  loadForAthlete("athlete-cv-hover-b", { ws: 0, we: 10 });
  assert.equal(getState().hoveredDate, null);
});

/* Szenario — Phase 5, Schritt 3, Teil B (docs/phase-5-konzept-explorer.md §6). */

test("setScenarioEnabled: aus → an rechnet scenarioProjection aus den injizierten Quellen", () => {
  store.clear();
  loadForAthlete("athlete-cv-scenario-1", { ws: 0, we: 10 });
  configureScenarioSources({
    getCards: () => [{ id: "a", date: FUTURE_DATE, tssPlanned: 100, typ: "Schwelle" }],
    getActuals: () => [{ dateISO: localISODate(), ctl: 48, atl: 40 }],
    getEvents: () => [],
    getFtp: () => 200,
  });

  assert.equal(getState().scenarioProjection, null, "aus → kein Ergebnis berechnet");
  setScenarioEnabled(true);
  assert.equal(getState().scenario.enabled, true);
  assert.ok(getState().scenarioProjection, "an → Ergebnis vorhanden");
  assert.ok(getState().scenarioProjection.days.length > 0);
});

test("setScenarioEnabled(false): löscht scenarioProjection, Parameter bleiben erhalten", () => {
  store.clear();
  loadForAthlete("athlete-cv-scenario-2", { ws: 0, we: 10 });
  configureScenarioSources({
    getCards: () => [{ id: "a", date: FUTURE_DATE, tssPlanned: 100, typ: "Schwelle" }],
    getActuals: () => [],
    getEvents: () => [],
    getFtp: () => 200,
  });

  setScenarioParams({ weekTssPct: 20 });
  setScenarioEnabled(true);
  assert.ok(getState().scenarioProjection);

  setScenarioEnabled(false);
  assert.equal(getState().scenarioProjection, null);
  assert.equal(getState().scenario.weekTssPct, 20, "Regler-Stellung bleibt erhalten (nicht 0=aus)");
});

test("setScenarioParams: Änderung während aktivem Szenario rechnet sofort neu", () => {
  store.clear();
  loadForAthlete("athlete-cv-scenario-3", { ws: 0, we: 10 });
  configureScenarioSources({
    getCards: () => [{ id: "a", date: FUTURE_DATE, tssPlanned: 100, typ: "Schwelle" }],
    getActuals: () => [{ dateISO: localISODate(), ctl: 48, atl: 40 }],
    getEvents: () => [],
    getFtp: () => 200,
  });
  setScenarioEnabled(true);
  const before = getState().scenarioProjection.days.find((d) => d.date === FUTURE_DATE).tss;

  setScenarioParams({ weekTssPct: 50 });
  const after = getState().scenarioProjection.days.find((d) => d.date === FUTURE_DATE).tss;
  assert.ok(after > before, "höhere Wochen-TSS-% erhöht die Tages-TSS im Szenario");
});

test("Szenario-Parameter persistieren und werden nach erneutem Laden wiederhergestellt", () => {
  store.clear();
  loadForAthlete("athlete-cv-scenario-4", { ws: 0, we: 10 });
  configureScenarioSources({
    getCards: () => [],
    getActuals: () => [],
    getEvents: () => [],
    getFtp: () => undefined,
  });
  setScenarioParams({ weekTssPct: 15, restDays: 1, rampRatePct: 5 });
  setScenarioEnabled(true);

  const raw = store.get("chart_view_athlete-cv-scenario-4");
  assert.deepEqual(JSON.parse(raw).scenario, {
    enabled: true,
    weekTssPct: 15,
    restDays: 1,
    rampRatePct: 5,
  });

  loadForAthlete("athlete-cv-scenario-4-reload", { ws: 0, we: 10 }); // anderer Athlet dazwischen
  loadForAthlete("athlete-cv-scenario-4", { ws: 0, we: 10 });
  // loadForAthlete ist ein No-op für einen bereits geladenen Athleten — hier
  // aber gezielt ein "erneutes Laden" simuliert, indem ein FREMDER Athlet
  // dazwischengeschoben wurde (Athletenwechsel + zurück), analog zum echten
  // Reload-Fall (loadedForAthleteId ist dann nicht mehr "athlete-cv-scenario-4").
  assert.deepEqual(getState().scenario, {
    enabled: true,
    weekTssPct: 15,
    restDays: 1,
    rampRatePct: 5,
  });
});

test("loadForAthlete: Athletenwechsel lädt nicht das fremde Szenario", () => {
  store.clear();
  loadForAthlete("athlete-cv-scenario-a", { ws: 0, we: 10 });
  configureScenarioSources({
    getCards: () => [],
    getActuals: () => [],
    getEvents: () => [],
    getFtp: () => undefined,
  });
  setScenarioParams({ weekTssPct: 30 });

  loadForAthlete("athlete-cv-scenario-b", { ws: 0, we: 10 });
  assert.deepEqual(getState().scenario, SCENARIO_DEFAULT);
});

test("defektes Szenario-JSON (falsche Form, kein Objekt) führt zu Default statt Absturz", () => {
  store.clear();
  store.set(
    "chart_view_athlete-cv-scenario-broken",
    JSON.stringify({ ws: 1, we: 91, scenario: "not-an-object" })
  );
  assert.doesNotThrow(() => {
    loadForAthlete("athlete-cv-scenario-broken", { ws: 1, we: 91 });
  });
  assert.deepEqual(getState().scenario, SCENARIO_DEFAULT);
});
