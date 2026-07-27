/* Tests: state/chart-view.js — Fensterzustand der modernisierten Bestandscharts
   (Phase 5, Schritt 0). node --test kennt kein globales localStorage (kein DOM)
   — Stub nach demselben Muster wie andere state/-Tests dieser Art. */

import test from "node:test";
import assert from "node:assert/strict";

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
const { getState, loadForAthlete, setWindow, setHovered, clearHovered, onChartViewChange } =
  await import("../assets/js/state/chart-view.js");

test("loadForAthlete: legt den übergebenen Default an, wenn nichts gespeichert ist", () => {
  store.clear();
  loadForAthlete("athlete-cv-1", { ws: 0, we: 89 });
  assert.deepEqual(getState(), { ws: 0, we: 89, hoveredDate: null });
});

test("setWindow: persistiert und ist nach erneutem Laden wieder da (Rundreise)", () => {
  store.clear();
  loadForAthlete("athlete-cv-2", { ws: 0, we: 10 });
  setWindow(3, 13);
  assert.deepEqual(getState().ws, 3);
  assert.deepEqual(getState().we, 13);

  const raw = store.get("chart_view_athlete-cv-2");
  assert.ok(raw, "muss unter dem athletenscharfen Schlüssel persistiert sein");
  assert.deepEqual(JSON.parse(raw), { ws: 3, we: 13 });
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
  assert.deepEqual(getState(), { ws: 1, we: 91, hoveredDate: null });
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
