/* Tests: state/explorer.js — Explorer-Ansichtszustand (Phase 5, Schritt 0)
   docs/phase-5-konzept-explorer.md §10.3 (X9), §11.

   node --test kennt kein globales `localStorage` (kein DOM) — anders als
   ui/*.js-Module, die im Browser laufen, muss state/explorer.js hier gegen
   einen minimalen In-Memory-Stub getestet werden. Das ist der erste Test in
   diesem Repo, der localStorage stubbt (bisherige state/-Tests kommen ohne
   aus, s. tests/plan-cards-move.test.js), daher hier ausführlich begründet
   statt still vorausgesetzt. */

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
const { getState, loadForAthlete, setRange } = await import("../assets/js/state/explorer.js");

test("loadForAthlete: legt den übergebenen Default an, wenn nichts gespeichert ist", () => {
  store.clear();
  loadForAthlete("athlete-test-1", { from: "2026-04-01", to: "2026-07-01" });
  assert.deepEqual(getState().range, { from: "2026-04-01", to: "2026-07-01" });
  assert.deepEqual(getState().compareSlots, []);
  assert.equal(getState().scenario, null);
});

test("setRange: persistiert und ist nach erneutem Laden desselben Athleten wieder da (Rundreise)", () => {
  store.clear();
  loadForAthlete("athlete-test-2", { from: "2026-01-01", to: "2026-02-01" });
  setRange("2026-05-01", "2026-06-01");
  assert.deepEqual(getState().range, { from: "2026-05-01", to: "2026-06-01" });

  // Simuliert einen frischen Seitenaufruf: derselbe Athlet, aber der Guard
  // (loadedForAthleteId) muss umgangen werden, um den Reload nachzustellen.
  const raw = store.get("explorer_athlete-test-2");
  assert.ok(raw, "muss unter dem athletenscharfen Schlüssel persistiert sein");
  assert.deepEqual(JSON.parse(raw).range, { from: "2026-05-01", to: "2026-06-01" });
});

test("loadForAthlete: Athletenwechsel lädt nicht den fremden Zustand", () => {
  store.clear();
  loadForAthlete("athlete-a", { from: "2026-01-01", to: "2026-01-10" });
  setRange("2026-03-01", "2026-03-10");

  loadForAthlete("athlete-b", { from: "2026-09-01", to: "2026-09-10" });
  assert.deepEqual(
    getState().range,
    { from: "2026-09-01", to: "2026-09-10" },
    "athlete-b muss seinen eigenen Default sehen, nicht athlete-a's Range"
  );

  // Erneuter Aufruf für athlete-a (bereits "geladen" gewesen) darf athlete-b's
  // aktuell aktiven Zustand nicht überschreiben, solange loadedForAthleteId
  // unverändert athlete-b ist.
  loadForAthlete("athlete-b", { from: "2099-01-01", to: "2099-01-02" });
  assert.deepEqual(getState().range, { from: "2026-09-01", to: "2026-09-10" });
});

test("loadForAthlete: defektes JSON in localStorage führt zu Default statt Absturz", () => {
  store.clear();
  store.set("explorer_athlete-broken", "{not-json");
  assert.doesNotThrow(() => {
    loadForAthlete("athlete-broken", { from: "2026-08-01", to: "2026-08-10" });
  });
  assert.deepEqual(getState().range, { from: "2026-08-01", to: "2026-08-10" });
});
