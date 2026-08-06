/* Tests: core/compare.js — Vergleichsmodus (Phase 5, Schritt 4)
   (docs/phase-5-konzept-explorer.md §5, X1). Pure Funktion, keine Mocks. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCompare } from "./compare.js";

function ride(dateISO, { tss = null, ctl = null, atl = null, tsb = null, typ = null } = {}) {
  return { dateISO, tss, ctl, atl, tsb, typ };
}

test("buildCompare: gleich lange Slots — dayOffset-Ausrichtung + Kennzahlen von Hand nachgerechnet", () => {
  const rides = [
    ride("2026-06-01", { tss: 60, ctl: 40, typ: "Z2 Dauer" }),
    ride("2026-06-02", { tss: 100, ctl: 42, typ: "Schwelle" }),
    ride("2026-06-03", { tss: 40, ctl: 41, typ: "Z2 Dauer" }),
    ride("2026-07-01", { tss: 80, ctl: 50, typ: "Sweet Spot" }),
    ride("2026-07-02", { tss: 50, ctl: 51, typ: "Z2 Dauer" }),
    ride("2026-07-03", { tss: 90, ctl: 53, typ: "Schwelle" }),
  ];
  const slotA = { from: "2026-06-01", to: "2026-06-03" };
  const slotB = { from: "2026-07-01", to: "2026-07-03" };

  const { a, b } = buildCompare(rides, slotA, slotB);

  assert.equal(a.days.length, 3);
  assert.equal(b.days.length, 3);
  assert.deepEqual(
    a.days.map((d) => d.dayOffset),
    [0, 1, 2]
  );
  assert.deepEqual(
    a.days.map((d) => d.dateISO),
    ["2026-06-01", "2026-06-02", "2026-06-03"]
  );

  assert.equal(a.metrics.sumTss, 200);
  assert.equal(a.metrics.avgCtl, 41); // (40+42+41)/3
  assert.equal(a.metrics.ramp, 1); // 41 - 40
  assert.equal(a.metrics.hardDays, 1); // nur "Schwelle" am 06-02

  assert.equal(b.metrics.sumTss, 220);
  assert.equal(b.metrics.hardDays, 2); // "Sweet Spot" + "Schwelle"
});

test("buildCompare: ungleich lange Slots — kürzerer Slot endet früher, keine Streckung", () => {
  const rides = [
    ride("2026-06-01", { tss: 50, ctl: 40 }),
    ride("2026-06-05", { tss: 50, ctl: 41 }),
    ride("2026-06-10", { tss: 50, ctl: 42 }),
  ];
  const slotA = { from: "2026-06-01", to: "2026-06-10" }; // 10 Tage
  const slotB = { from: "2026-06-01", to: "2026-06-04" }; // 4 Tage

  const { a, b } = buildCompare(rides, slotA, slotB);

  assert.equal(a.days.length, 10);
  assert.equal(b.days.length, 4);
  // Der letzte Tag von B ist NICHT der letzte Tag von A — keine Angleichung.
  assert.notEqual(b.days[b.days.length - 1].dateISO, a.days[a.days.length - 1].dateISO);
  assert.equal(b.days[b.days.length - 1].dateISO, "2026-06-04");
});

test("buildCompare: leerer Slot (null) liefert leeres Ergebnis statt Absturz", () => {
  const rides = [ride("2026-06-01", { tss: 50, ctl: 40 })];
  const { a, b } = buildCompare(rides, null, undefined);

  assert.deepEqual(a.days, []);
  assert.deepEqual(a.metrics, { sumTss: 0, avgCtl: null, ramp: null, hardDays: 0 });
  assert.deepEqual(b.days, []);
  assert.deepEqual(b.metrics, { sumTss: 0, avgCtl: null, ramp: null, hardDays: 0 });
});

test("buildCompare: from > to (ungültiger Bereich) liefert leeres Ergebnis statt Absturz", () => {
  const { a } = buildCompare([], { from: "2026-06-10", to: "2026-06-01" }, null);
  assert.deepEqual(a.days, []);
  assert.equal(a.metrics.sumTss, 0);
});

test("buildCompare: überlappende Slots werden unabhängig berechnet (keine gegenseitige Beeinflussung)", () => {
  const rides = [
    ride("2026-06-01", { tss: 30, ctl: 40, typ: "Z2 Dauer" }),
    ride("2026-06-05", { tss: 70, ctl: 44, typ: "Schwelle" }),
    ride("2026-06-10", { tss: 40, ctl: 45, typ: "Z2 Dauer" }),
  ];
  const slotA = { from: "2026-06-01", to: "2026-06-07" };
  const slotB = { from: "2026-06-03", to: "2026-06-10" }; // überlappt mit A (06-03..06-07)

  const { a, b } = buildCompare(rides, slotA, slotB);

  assert.equal(a.metrics.sumTss, 100); // 06-01 + 06-05
  assert.equal(b.metrics.sumTss, 110); // 06-05 + 06-10
  assert.equal(a.metrics.hardDays, 1);
  assert.equal(b.metrics.hardDays, 1);
});

test("buildCompare: CTL-Einzeltag-Lücke wird fortgeschrieben (carry), 2+ Tage bleiben Lücke", () => {
  const rides = [
    ride("2026-06-01", { ctl: 40 }),
    // 06-02 fehlt (Einzeltag) → carry
    ride("2026-06-03", { ctl: 44 }),
    // 06-04, 06-05 fehlen (2 Tage) → echte Lücke
    ride("2026-06-06", { ctl: 46 }),
  ];
  const { a } = buildCompare(rides, { from: "2026-06-01", to: "2026-06-06" }, null);
  const byDate = Object.fromEntries(a.days.map((d) => [d.dateISO, d.ctl]));
  assert.equal(byDate["2026-06-02"], 40, "einzelner fehlender Tag wird fortgeschrieben");
  assert.equal(byDate["2026-06-04"], null, "Lauf von 2 fehlenden Tagen bleibt Lücke");
  assert.equal(byDate["2026-06-05"], null);
});

test("buildCompare: ramp ist null bei weniger als 2 bekannten CTL-Punkten", () => {
  const rides = [ride("2026-06-01", { ctl: 40, tss: 10 })];
  const { a } = buildCompare(rides, { from: "2026-06-01", to: "2026-06-03" }, null);
  assert.equal(a.metrics.ramp, null);
  assert.equal(a.metrics.avgCtl, 40);
});

test("buildCompare: Tag mit mehreren Rides — TSS summiert, hard wenn irgendeine Ride hart ist", () => {
  const rides = [
    ride("2026-06-01", { tss: 30, ctl: 40, typ: "Z2 Dauer" }),
    { dateISO: "2026-06-01", tss: 60, ctl: 41, atl: null, tsb: null, typ: "Schwelle", startTime: "2026-06-01T16:00:00Z" },
  ];
  const { a } = buildCompare(rides, { from: "2026-06-01", to: "2026-06-01" }, null);
  assert.equal(a.metrics.sumTss, 90);
  assert.equal(a.metrics.hardDays, 1);
});
