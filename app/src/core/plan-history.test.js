/* Tests: core/plan-history.js::buildHistoryAggregate() — Fahrplan 8 E4.
   Reine Aggregation des V3 HistoryAggregate aus Rides / Wellness /
   Plan-Karten. Prüft Wochen-Fensterung, Ausschluss der laufenden Woche,
   Historien-Anfang, CTL/eFTP-Ableitung, Erfüllungsquote und Determinismus. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { buildHistoryAggregate, emptyHistory } from "./plan-history.js";
import { addDaysISO } from "./format.js";

const TODAY = "2026-09-09"; // Mittwoch; Montag der laufenden Woche = 2026-09-07

/** Ride-Fixture mit den Feldern, die die Aggregation liest. */
function ride(dateISO, over = {}) {
  return { dateISO, tss: 50, ...over };
}

test("keine Rides → emptyHistory-Form, ageYears + eFTP-Fallback bleiben", () => {
  const agg = buildHistoryAggregate({
    rides: [],
    todayISO: TODAY,
    ageYears: 41,
    eftpFallback: 260,
  });
  assert.deepEqual(agg, {
    ...emptyHistory(),
    ageYears: 41,
    currentEftp: 260,
  });
  assert.equal(agg.powerCurveWeakness, null);
  assert.deepEqual(agg.weeklyActualTss, []);
});

test("weeklyActualTss: nur abgeschlossene Wochen, laufende Woche ausgeschlossen", () => {
  const rides = [
    ride("2026-08-25", { tss: 100 }), // vorletzte abgeschlossene Woche
    ride("2026-08-27", { tss: 40 }),
    ride("2026-09-01", { tss: 80 }), // letzte abgeschlossene Woche
    ride("2026-09-08", { tss: 999 }), // laufende Woche — zählt NICHT
    ride("2026-09-09", { tss: 999 }), // heute — zählt NICHT
  ];
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY });
  // erste Fahrt in der Woche ab 2026-08-24 → 2 abgeschlossene Wochen-Slots
  assert.deepEqual(agg.weeklyActualTss, [140, 80]);
});

test("weeklyActualTss: Lücken-Woche ohne Fahrt ergibt echte 0", () => {
  const rides = [
    ride("2026-08-24", { tss: 60 }), // Woche A
    // Woche B (ab 2026-08-31) ohne Fahrt
    ride("2026-09-01", { tss: 0 }), // liegt in Woche B? nein: 09-01 ist Di der Woche ab 08-31
  ];
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY });
  assert.equal(agg.weeklyActualTss.length, 2);
  assert.equal(agg.weeklyActualTss[0], 60);
  assert.equal(agg.weeklyActualTss[1], 0);
});

test("weeklyActualTss: höchstens 8 Wochen, alt → neu", () => {
  const rides = [];
  for (let w = 0; w < 20; w++) {
    // je eine Fahrt pro Woche, weit zurück (Montag der jeweiligen Woche)
    rides.push(ride(addDaysISO("2026-09-07", -7 * (w + 1)), { tss: 10 + w }));
  }
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY });
  assert.equal(agg.weeklyActualTss.length, 8);
  // älteste der 8 (= Woche vor 8 Wochen, w=7 → tss 17) zuerst, neueste (w=0 → 10) zuletzt
  assert.equal(agg.weeklyActualTss[0], 17);
  assert.equal(agg.weeklyActualTss[7], 10);
});

test("tss fällt auf trimp zurück, wenn kein tss-Feld", () => {
  const rides = [ride("2026-09-01", { tss: undefined, trimp: 70 })];
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY });
  assert.equal(agg.weeklyActualTss.at(-1), 70);
});

test("currentCtl aus ctl/atl der letzten Fahrt", () => {
  const rides = [
    ride("2026-08-20", { ctl: 50, atl: 45 }),
    ride("2026-09-01", { ctl: 58, atl: 60 }),
  ];
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY });
  assert.ok(agg.currentCtl != null);
  // lastfrei ab 2026-09-01 vorwärtsprojiziert (currentPmc) → positiver Wert
  // unter dem Ausgangs-CTL 58, kein roher Ride-Wert
  assert.ok(agg.currentCtl > 0 && agg.currentCtl < 58);
});

test("currentEftp aus der Ride-eFTP-Reihe schlägt den Fallback", () => {
  const rides = [
    ride("2026-08-20", { eftp: 240 }),
    ride("2026-09-01", { eftp: 252 }),
  ];
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY, eftpFallback: 200 });
  assert.equal(agg.currentEftp, 252);
});

test("currentEftp fällt auf den config-Wert, wenn keine eFTP-Historie", () => {
  const rides = [ride("2026-09-01", { eftp: undefined })];
  const agg = buildHistoryAggregate({ rides, todayISO: TODAY, eftpFallback: 261 });
  assert.equal(agg.currentEftp, 261);
});

test("planAdherence: Quote 0..1 über das 6-Wochen-Fenster", () => {
  const rides = [ride("2026-08-25"), ride("2026-09-01")];
  const planCards = [
    { date: "2026-08-25", name: "Intervalle" }, // erfüllt
    { date: "2026-09-01", name: "Sweet Spot" }, // erfüllt
    { date: "2026-09-03", name: "VO2max" }, // offen (<= heute, nicht gefahren)
    { date: "2026-01-01", name: "uralt" }, // außerhalb Fenster → ignoriert
  ];
  const agg = buildHistoryAggregate({ rides, planCards, todayISO: TODAY });
  assert.ok(agg.planAdherence > 0 && agg.planAdherence < 1);
  assert.equal(agg.planAdherence, Math.round((2 / 3) * 100) / 100);
});

test("planAdherence: null ohne Plan-Karten", () => {
  const agg = buildHistoryAggregate({ rides: [ride("2026-09-01")], todayISO: TODAY });
  assert.equal(agg.planAdherence, null);
  const agg2 = buildHistoryAggregate({ rides: [ride("2026-09-01")], planCards: [], todayISO: TODAY });
  assert.equal(agg2.planAdherence, null);
});

test("deterministisch: gleicher Input → gleicher Output", () => {
  const rides = [ride("2026-08-25", { ctl: 50, atl: 48, eftp: 244 }), ride("2026-09-01", { eftp: 250 })];
  const args = { rides, todayISO: TODAY, ageYears: 40, eftpFallback: 200 };
  assert.deepEqual(buildHistoryAggregate(args), buildHistoryAggregate(args));
});
