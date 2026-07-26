/* Tests: core/days.js — dichtes Tagesgerüst (Phase 5, Schritt 0)
   Hintergrund: docs/phase-5-konzept-explorer.md §2.2/§11 — densifyDays()
   ersetzt eine Zeitstempelskala; die Densifizierung betrifft nur das
   Achsengerüst, nicht die Serie (absence: "zero" | "gap"). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { densifyDays, alignToDays, fillGaps } from "../assets/js/core/days.js";

test("densifyDays: from === to liefert genau einen Tag", () => {
  assert.deepEqual(densifyDays("2026-07-15", "2026-07-15"), ["2026-07-15"]);
});

test("densifyDays: Monatswechsel lückenlos", () => {
  assert.deepEqual(densifyDays("2026-01-30", "2026-02-02"), [
    "2026-01-30",
    "2026-01-31",
    "2026-02-01",
    "2026-02-02",
  ]);
});

test("densifyDays: Jahreswechsel lückenlos", () => {
  assert.deepEqual(densifyDays("2026-12-30", "2027-01-02"), [
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
});

test("densifyDays: Achsenlänge hängt nur vom Bereich ab, nicht von der Datendichte", () => {
  // Zwei "Quellen" über demselben Bereich — eine mit Lücken, eine ohne. Da
  // densifyDays() nur fromISO/toISO kennt, ist die Achse in beiden Fällen
  // identisch lang; die Datendichte ist erst bei alignToDays() relevant.
  const dense = densifyDays("2026-06-01", "2026-06-10");
  const sparseSourceRange = densifyDays("2026-06-01", "2026-06-10");
  assert.equal(dense.length, sparseSourceRange.length);
  assert.equal(dense.length, 10);
});

test("alignToDays: absence 'zero' füllt fehlende Tage mit 0", () => {
  const days = densifyDays("2026-06-01", "2026-06-03");
  const values = new Map([["2026-06-01", 40]]); // 06-02/03 fehlen
  assert.deepEqual(alignToDays(days, values, "zero"), [40, 0, 0]);
});

test("alignToDays: absence 'gap' füllt fehlende Tage mit null", () => {
  const days = densifyDays("2026-06-01", "2026-06-03");
  const values = { "2026-06-01": 62, "2026-06-03": 58 };
  assert.deepEqual(alignToDays(days, values, "gap"), [62, null, 58]);
});

test("alignToDays: Serie nur aus Lücken bricht nichts", () => {
  const days = densifyDays("2026-06-01", "2026-06-03");
  assert.deepEqual(alignToDays(days, new Map(), "gap"), [null, null, null]);
  assert.deepEqual(alignToDays(days, {}, "zero"), [0, 0, 0]);
});

/* fillGaps — Regression: der Explorer-Hauptchart zeigte CTL/ATL beim ersten
   Rendern (Playwright-Screenshot) fälschlich auf 0 einbrechend an jedem
   Ruhetag, weil Data.rides nur Aktivitäten enthält (keine Ruhetags-Zeilen)
   und CTL/ATL mit absence:"zero" statt "gap"+fillGaps() aufgefüllt wurden.
   CTL/ATL sind Zustandsgrößen, keine Tagesbelastung — 0 ist dort falsch. */
test("fillGaps: interpoliert linear zwischen bekannten Nachbarn", () => {
  assert.deepEqual(fillGaps([40, null, null, 43]), [40, 41, 42, 43]);
});

test("fillGaps: Randlücken übernehmen den nächstliegenden bekannten Wert (kein Extrapolieren)", () => {
  assert.deepEqual(fillGaps([null, null, 50, 52, null]), [50, 50, 50, 52, 52]);
});

test("fillGaps: bereits vollständige Serie bleibt unverändert", () => {
  assert.deepEqual(fillGaps([1, 2, 3]), [1, 2, 3]);
});

test("fillGaps: komplett leere Serie (keinerlei bekannter Wert) bleibt komplett null", () => {
  assert.deepEqual(fillGaps([null, null, null]), [null, null, null]);
});
