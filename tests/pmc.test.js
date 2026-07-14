/* Tests: CTL-Interpolation und TSB-Ableitung (core/pmc.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolateCtl, tsbOf, projectPmc, currentPmc, tsbTrend } from "../assets/js/core/pmc.js";

test("tsbOf: expliziter Wert vor Ableitung, null ohne Daten", () => {
  assert.equal(tsbOf({ tsb: -12, ctl: 50, atl: 40 }), -12);
  assert.equal(tsbOf({ ctl: 50, atl: 40 }), 10);
  assert.equal(tsbOf({ ctl: 50 }), null);
  assert.equal(tsbOf({}), null);
});

test("interpolateCtl: Lücke in der Mitte wird linear gefüllt", () => {
  const rides = [
    { dateISO: "2026-06-01", ctl: 40 },
    { dateISO: "2026-06-02", ctl: null },
    { dateISO: "2026-06-03", ctl: 50 },
  ];
  const out = interpolateCtl(rides);
  assert.equal(out.length, 3);
  assert.equal(out[0].interpolated, false);
  assert.equal(out[1].interpolated, true);
  assert.equal(out[1].ctlVal, 45);
  assert.equal(out[2].ctlVal, 50);
});

test("interpolateCtl: Randpunkte übernehmen nächsten bekannten Wert", () => {
  const rides = [
    { dateISO: "2026-06-01", ctl: null }, // nur next vorhanden
    { dateISO: "2026-06-02", ctl: 42 },
    { dateISO: "2026-06-03", ctl: null }, // nur prev vorhanden
  ];
  const out = interpolateCtl(rides);
  assert.equal(out[0].ctlVal, 42);
  assert.equal(out[0].interpolated, true);
  assert.equal(out[2].ctlVal, 42);
  assert.equal(out[2].interpolated, true);
});

test("interpolateCtl: Fahrten ganz ohne CTL-Kontext werden verworfen", () => {
  const out = interpolateCtl([
    { dateISO: "2026-06-01", ctl: null },
    { dateISO: "2026-06-02", ctl: null },
  ]);
  assert.equal(out.length, 0);
});

/* ── projectPmc / currentPmc / tsbTrend ─────────────────────────
   Standard-PMC-Zeitkonstanten (CTL 42d, ATL 7d) ohne weitere Last
   vorwärts angewendet — Erwartungswerte unabhängig via
   ctl*(41/42)^d bzw. atl*(6/7)^d nachgerechnet. */

test("projectPmc: 0 Tage lässt CTL/ATL/TSB unverändert", () => {
  const p = projectPmc(50, 70, 0);
  assert.equal(p.ctl, 50);
  assert.equal(p.atl, 70);
  assert.equal(p.tsb, -20);
});

test("projectPmc: mehrere lastfreie Tage lassen TSB Richtung 0 steigen (ATL zerfällt schneller als CTL)", () => {
  const p = projectPmc(50, 70, 2);
  assert.equal(Math.round(p.ctl * 100) / 100, 47.65);
  assert.equal(Math.round(p.atl * 100) / 100, 51.43);
  assert.equal(Math.round(p.tsb * 100) / 100, -3.78);
});

test("currentPmc: Ruhetage seit der letzten Fahrt werden vorwärtsprojiziert statt eingefroren", () => {
  const rides = [{ dateISO: "2026-07-10", ctl: 50, atl: 70 }];
  const c = currentPmc(rides, "2026-07-12"); // 2 Ruhetage danach
  assert.equal(c.asOfDate, "2026-07-10");
  assert.equal(c.daysProjected, 2);
  assert.equal(Math.round(c.tsb * 100) / 100, -3.78);
  // Ohne Projektion (alter Bug) bliebe TSB bei -20 eingefroren
  assert.ok(c.tsb > -20);
});

test("currentPmc: Fahrt am selben Tag → keine Projektion, TSB = CTL-ATL", () => {
  const rides = [{ dateISO: "2026-07-10", ctl: 50, atl: 70 }];
  const c = currentPmc(rides, "2026-07-10");
  assert.equal(c.daysProjected, 0);
  assert.equal(c.tsb, -20);
});

test("currentPmc: null ohne Fahrt mit einem TSB-Signal an oder vor todayISO", () => {
  assert.equal(currentPmc([], "2026-07-10"), null);
  assert.equal(currentPmc([{ dateISO: "2026-07-11", ctl: 50, atl: 70 }], "2026-07-10"), null);
});

test("currentPmc: expliziter TSB ohne ctl/atl (manuelle Plan-1-Notion-Fahrt) wird übernommen, aber nicht projiziert", () => {
  const rides = [{ dateISO: "2026-07-10", tsb: -12 }];
  const c = currentPmc(rides, "2026-07-12"); // 2 Tage später
  assert.equal(c.tsb, -12);
  assert.equal(c.daysProjected, 0); // keine ctl/atl-Aufschlüsselung → keine Projektion möglich
  assert.equal(c.ctl, null);
  assert.equal(c.atl, null);
});

test("currentPmc: expliziter TSB schlägt eine ältere Fahrt mit ctl/atl (gleiche Vorrangregel wie tsbOf)", () => {
  const rides = [
    { dateISO: "2026-07-08", ctl: 50, atl: 70 },
    { dateISO: "2026-07-10", tsb: -5 }, // neuer, nur expliziter TSB
  ];
  const c = currentPmc(rides, "2026-07-10");
  assert.equal(c.asOfDate, "2026-07-10");
  assert.equal(c.tsb, -5);
  assert.equal(c.daysProjected, 0);
});

test("tsbTrend: mehrtägige Ruhephase nach hartem Block → Trend 'steigend', auch wenn TSB weiter im Alert-Bereich liegt", () => {
  // Letzte Fahrt am Ende eines harten Blocks, danach nur Ruhetage.
  const rides = [{ dateISO: "2026-07-08", ctl: 70, atl: 170 }];
  const t = tsbTrend(rides, "2026-07-11"); // 3 Tage danach, Standardfenster
  assert.equal(t.direction, "steigend");
  assert.ok(t.delta > 50); // deutlicher Anstieg ggü. dem Stand vor 3 Tagen (roh -100)
});

test("tsbTrend: null, wenn für das Vergleichsfenster keine Fahrt vorliegt", () => {
  const rides = [{ dateISO: "2026-07-09", ctl: 50, atl: 60 }];
  assert.equal(tsbTrend(rides, "2026-07-10", 3), null); // vor 3 Tagen noch keine Fahrt
});
