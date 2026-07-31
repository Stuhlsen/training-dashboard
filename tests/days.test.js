/* Tests: core/days.js — dichtes Tagesgerüst (Phase 5, Schritt 0)
   Hintergrund: docs/phase-5-konzept-explorer.md §2.2/§11 — densifyDays()
   ersetzt eine Zeitstempelskala. joinSeries() bekommt drei absence-Modi;
   "carry" ist die Regressionsabsicherung für einen zuvor aufgetretenen Bug:
   CTL/ATL fielen mit absence:"zero" fälschlich auf 0 an jedem Ruhetag, weil
   Data.rides nur Aktivitäten führt, keine Ruhetage. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { densifyDays, joinSeries } from "../assets/js/core/days.js";

test("densifyDays: from === to liefert genau einen Tag", () => {
  assert.deepEqual(densifyDays("2026-07-15", "2026-07-15"), [{ dateISO: "2026-07-15", index: 0 }]);
});

test("densifyDays: Monatswechsel lückenlos, aufsteigender Index", () => {
  assert.deepEqual(densifyDays("2026-01-30", "2026-02-02"), [
    { dateISO: "2026-01-30", index: 0 },
    { dateISO: "2026-01-31", index: 1 },
    { dateISO: "2026-02-01", index: 2 },
    { dateISO: "2026-02-02", index: 3 },
  ]);
});

test("densifyDays: Jahreswechsel lückenlos", () => {
  const days = densifyDays("2026-12-30", "2027-01-02");
  assert.deepEqual(
    days.map((d) => d.dateISO),
    ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]
  );
});

test("densifyDays: DST-Übergang (Europa, letzter Sonntag im März) erzeugt keinen Doppel-/Fehltag", () => {
  // 2026: DST-Wechsel in Europa am 29.03. — localISODate()-Konvention (kalendertag-
  // basiert über setDate) muss robust dagegen sein, s. core/format.js::addDaysISO.
  const days = densifyDays("2026-03-27", "2026-03-31").map((d) => d.dateISO);
  assert.deepEqual(days, ["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
});

test("densifyDays: Achsenlänge hängt nur vom Bereich ab, nicht von der Datendichte", () => {
  const withGaps = densifyDays("2026-06-01", "2026-06-10");
  const withoutGaps = densifyDays("2026-06-01", "2026-06-10");
  assert.equal(withGaps.length, withoutGaps.length);
  assert.equal(withGaps.length, 10);
});

test('joinSeries: absence "zero" füllt jeden fehlenden Tag mit 0, unabhängig von der Lauflänge', () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-05");
  const rows = [{ dateISO: "2026-06-01", tss: 80 }]; // 06-02..05 fehlen (4 Tage am Stück)
  assert.deepEqual(joinSeries(skeleton, rows, { key: "tss", absence: "zero" }), [80, 0, 0, 0, 0]);
});

test('joinSeries: absence "carry" übernimmt bei EINEM fehlenden Tag den letzten bekannten Wert (Regressionstest)', () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  const rows = [
    { dateISO: "2026-06-01", ctl: 40 },
    { dateISO: "2026-06-03", ctl: 42 },
  ]; // 06-02 fehlt einzeln — darf NICHT auf 0 fallen
  assert.deepEqual(joinSeries(skeleton, rows, { key: "ctl", absence: "carry" }), [40, 40, 42]);
});

test('joinSeries: absence "carry" wird ab ZWEI aufeinanderfolgenden fehlenden Tagen zur echten Lücke', () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-05");
  const rows = [
    { dateISO: "2026-06-01", ctl: 40 },
    { dateISO: "2026-06-05", ctl: 46 },
  ]; // 06-02..04 fehlen drei Tage am Stück — kein Fortschreiben, echte Lücke
  assert.deepEqual(joinSeries(skeleton, rows, { key: "ctl", absence: "carry" }), [
    40,
    null,
    null,
    null,
    46,
  ]);
});

test('joinSeries: absence "carry" ohne Vorgänger (Serienanfang) bleibt Lücke, kein Extrapolieren', () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  const rows = [{ dateISO: "2026-06-03", ctl: 42 }]; // 06-01/02 fehlen VOR dem ersten bekannten Wert
  assert.deepEqual(joinSeries(skeleton, rows, { key: "ctl", absence: "carry" }), [null, null, 42]);
});

test('joinSeries: absence "gap" füllt jeden fehlenden Tag mit null, nie interpoliert', () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  const rows = [{ dateISO: "2026-06-01", ef: 1.4 }];
  assert.deepEqual(joinSeries(skeleton, rows, { key: "ef", absence: "gap" }), [1.4, null, null]);
});

test("joinSeries: Serie ganz ohne bekannten Wert bricht nichts (alle drei Modi)", () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  assert.deepEqual(joinSeries(skeleton, [], { key: "ctl", absence: "zero" }), [0, 0, 0]);
  assert.deepEqual(joinSeries(skeleton, [], { key: "ctl", absence: "carry" }), [null, null, null]);
  assert.deepEqual(joinSeries(skeleton, [], { key: "ctl", absence: "gap" }), [null, null, null]);
});

test("joinSeries: Zeilen außerhalb des Skelett-Zeitraums werden ignoriert", () => {
  const skeleton = densifyDays("2026-06-02", "2026-06-03");
  const rows = [
    { dateISO: "2026-06-01", ctl: 99 }, // vor dem Skelett
    { dateISO: "2026-06-05", ctl: 99 }, // nach dem Skelett
  ];
  assert.deepEqual(joinSeries(skeleton, rows, { key: "ctl", absence: "gap" }), [null, null]);
});
