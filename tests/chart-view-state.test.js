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
const { getState, loadForAthlete, setWindow } = await import("../assets/js/state/chart-view.js");

test("loadForAthlete: legt den übergebenen Default an, wenn nichts gespeichert ist", () => {
  store.clear();
  loadForAthlete("athlete-cv-1", { ws: 0, we: 89 });
  assert.deepEqual(getState(), { ws: 0, we: 89, hoveredIndex: null });
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
  assert.deepEqual(getState(), { ws: 1, we: 91, hoveredIndex: null });
});
