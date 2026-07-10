/* Tests: Analyse-Tab-Kernlogik — Status-Briefing (core/briefing.js),
   Regeneration & Körper (core/body.js), Periodisierungs-Erfüllung
   (core/periodization.js), Konsistenz & Adhärenz (core/adherence.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBriefing,
  tsbSignal,
  loadSignal,
  readinessSignal,
} from "../assets/js/core/briefing.js";
import {
  availability,
  weightTrend,
  wattsPerKg,
  energyView,
  estimateBMR,
  hydrationSeries,
  rideKJ,
  MIN_POINTS,
} from "../assets/js/core/body.js";
import {
  phaseCompliance,
  matchesSignature,
  RECOVERY_MAX_SHARE,
} from "../assets/js/core/periodization.js";
import {
  weeklyStreak,
  frequencyTrend,
  planAdherence,
  buildConsistency,
  mondayOf,
} from "../assets/js/core/adherence.js";

/* ── Briefing ───────────────────────────────────────────────── */

test("tsbSignal: Schwellen für Ermüdung und Frische", () => {
  assert.equal(tsbSignal(-25).status, "alert");
  assert.equal(tsbSignal(-15).status, "caution");
  assert.equal(tsbSignal(-5).status, "ok");
  assert.equal(tsbSignal(10).status, "ok");
  assert.equal(tsbSignal(null).status, "nodata");
});

test("loadSignal + readinessSignal: Mapping der Stufen", () => {
  assert.equal(loadSignal("high").status, "alert");
  assert.equal(loadSignal("caution").status, "caution");
  assert.equal(loadSignal("ok").status, "ok");
  assert.equal(loadSignal(null).status, "nodata");
  assert.equal(readinessSignal({ level: "red" }).status, "alert");
  assert.equal(readinessSignal({ level: "yellow" }).status, "caution");
  assert.equal(readinessSignal(null).status, "nodata");
});

test("buildBriefing: rotes Erholungssignal schlägt grünen TSB", () => {
  const b = buildBriefing({ readiness: { level: "red" }, tsb: 10, loadRisk: "ok" });
  assert.equal(b.level, "red");
  assert.match(b.recommendation, /Erholung|Ruhetag|Ausrollen/);
});

test("buildBriefing: alles grün → green, mit nächster Einheit im Text", () => {
  const b = buildBriefing({
    readiness: { level: "green" },
    tsb: 2,
    loadRisk: "ok",
    nextSession: { date: "2026-07-09", title: "3×12 Sweet Spot" },
  });
  assert.equal(b.level, "green");
  assert.match(b.recommendation, /3×12 Sweet Spot/);
  assert.equal(b.degraded, false);
});

test("buildBriefing: ohne Readiness degradiert (degraded-Flag), caution → yellow", () => {
  const b = buildBriefing({ readiness: null, tsb: -15, loadRisk: "ok" });
  assert.equal(b.degraded, true);
  assert.equal(b.level, "yellow");
});

/* ── Body / Regeneration ────────────────────────────────────── */

const day = (date, extra) => ({ date, dateISO: date, ...extra });

test("availability: Mindestdichte in den letzten 30 Tagen, generisch pro Feld", () => {
  const today = "2026-07-05";
  const wellness = [];
  for (let i = 0; i < MIN_POINTS; i++) {
    wellness.push(day(`2026-06-2${i}`, { weight: 80 + i * 0.1 }));
  }
  const a = availability(wellness, today);
  assert.equal(a.weight, true);
  assert.equal(a.energy, false);
  assert.equal(a.hydration, false);
  assert.equal(a.any, true);

  // Alte Daten außerhalb des Fensters zählen nicht
  const stale = [day("2026-01-01", { weight: 80 }), day("2026-01-02", { weight: 80 })];
  assert.equal(availability(stale, today).any, false);
});

test("weightTrend: Glättung, aktueller Wert und 30d-Delta", () => {
  const wellness = [
    day("2026-06-01", { weight: 81.0 }),
    day("2026-06-10", { weight: 80.6 }),
    day("2026-06-18", { weight: 80.2 }),
    day("2026-06-26", { weight: 79.9 }),
    day("2026-07-04", { weight: 79.6 }),
  ];
  const t = weightTrend(wellness);
  assert.ok(t);
  assert.equal(t.current, 79.6);
  assert.equal(t.n, 5);
  // Referenz: letzter Punkt ≤ 30 Tage vor dem aktuellsten (2026-06-01 → 81.0)
  assert.equal(t.delta30d, Math.round((79.6 - 81.0) * 10) / 10);
  assert.equal(weightTrend(wellness.slice(0, 3)), null); // < MIN_POINTS
});

test("wattsPerKg + rideKJ: Grundrechnungen", () => {
  assert.equal(wattsPerKg(199, 80), 2.49);
  assert.equal(wattsPerKg(null, 80), null);
  assert.equal(wattsPerKg(199, 0), null);
  // 200W × 60min → 720 kJ
  assert.equal(rideKJ({ watt: 200, min: 60 }), 720);
  assert.equal(rideKJ({ min: 60 }), null);
});

test("energyView: Verbrauch (Grundumsatz+aktiv) und Zufuhr, datengetrieben", () => {
  const wellness = [
    day("2026-07-01", { restingEnergy: 1750, activeEnergy: 500, kcalConsumed: 2400 }),
    day("2026-07-02", { restingEnergy: 1750, activeEnergy: 900, kcalConsumed: 2900 }),
    day("2026-07-03", { restingEnergy: 1760, activeEnergy: 400 }),
    day("2026-07-04", { restingEnergy: 1740, activeEnergy: 700 }),
    day("2026-07-05", { restingEnergy: 1750, activeEnergy: 600 }),
  ];
  const e = energyView(wellness);
  assert.ok(e);
  assert.equal(e.n, 5);
  assert.equal(e.hasExpenditure, true);
  assert.equal(e.hasIntake, true);
  assert.equal(e.days.find((d) => d.date === "2026-07-02").burned, 2650);
  assert.equal(e.days.find((d) => d.date === "2026-07-02").intake, 2900);
  assert.equal(e.days.find((d) => d.date === "2026-07-03").intake, null);
  assert.equal(e.avgResting, 1750);

  // nur Zufuhr getrackt, kein Verbrauch
  const intakeOnly = [1, 2, 3, 4, 5].map((i) => day(`2026-08-0${i}`, { kcalConsumed: 2500 + i * 50 }));
  const e2 = energyView(intakeOnly);
  assert.equal(e2.hasExpenditure, false);
  assert.equal(e2.hasIntake, true);
  assert.equal(e2.avgBurned, null);

  assert.equal(energyView(wellness.slice(0, 2)), null);
});

test("hydrationSeries: bevorzugt Volumen, Fallback Score, null ohne Daten", () => {
  const vol = Array.from({ length: 5 }, (_, i) =>
    day(`2026-07-0${i + 1}`, { hydrationVolume: 2000 + i * 100, hydration: 3 })
  );
  assert.equal(hydrationSeries(vol).field, "hydrationVolume");
  const score = Array.from({ length: 5 }, (_, i) => day(`2026-07-0${i + 1}`, { hydration: 3 }));
  assert.equal(hydrationSeries(score).field, "hydration");
  assert.equal(hydrationSeries([day("2026-07-01", { weight: 80 })]), null);
});

/* ── Periodisierung ─────────────────────────────────────────── */

const weekIdx = (w) => parseInt(w.replace("P2-W", ""), 10);

test("matchesSignature: Typ-Match oder IF-Korridor (≥30min)", () => {
  assert.equal(matchesSignature({ typ: "Sweet Spot" }, "Sweet Spot"), true);
  assert.equal(matchesSignature({ typ: "Z2 Lang", if: 0.88, min: 60 }, "Sweet Spot"), true);
  assert.equal(matchesSignature({ typ: "Z2 Lang", if: 0.88, min: 20 }, "Sweet Spot"), false);
  assert.equal(matchesSignature({ typ: "Z2 Lang", if: 0.65, min: 120 }, "Sweet Spot"), false);
  assert.equal(matchesSignature({ typ: "VO2max" }, "Schwelle"), false);
});

test("phaseCompliance: Block-Status + Erholungswochen-Reduktion", () => {
  const r = (week, phase, typ, tss, extra = {}) => ({
    plan: "Plan 2",
    week,
    phase,
    typ,
    tss,
    dateISO: "2026-07-01",
    ...extra,
  });
  const rides = [
    // SS-Block, 2 Wochen à 2 Quality → voll erfüllt
    r("P2-W1", "Sweet Spot", "Sweet Spot", 90),
    r("P2-W1", "Sweet Spot", "Gruppenfahrt", 80, { if: 0.85, min: 90 }),
    r("P2-W1", "Sweet Spot", "Z2 Lang", 70),
    r("P2-W2", "Sweet Spot", "Sweet Spot", 95),
    r("P2-W2", "Sweet Spot", "Sweet Spot", 92),
    // Erholungswoche mit klar reduziertem TSS
    r("P2-W4", "Erholung", "Z1 Recovery", 40),
    // Schwellen-Woche OHNE Schwellen-Signatur → abweichend
    r("P2-W5", "Schwelle", "Z2 Lang", 85, { if: 0.65, min: 120 }),
    r("P2-W5", "Schwelle", "Z2 Dauer", 60, { if: 0.6, min: 70 }),
  ];
  const c = phaseCompliance(rides, weekIdx);
  assert.ok(c);
  const ss = c.blocks.find((b) => b.phase === "Sweet Spot");
  assert.equal(ss.quality, 4); // 3 Typ-Matches + 1 IF-Match
  assert.equal(ss.expectedQuality, 4); // 2 Wochen × 2
  assert.equal(ss.status, "ok");
  const thr = c.blocks.find((b) => b.phase === "Schwelle");
  assert.equal(thr.quality, 0);
  assert.equal(thr.status, "abweichend");
  // Erholung: 40 TSS vs. Nachbarwoche W5 (145) → 40 ≤ 145×0.6 → reduziert
  const rec = c.recovery.find((x) => x.week === "P2-W4");
  assert.equal(rec.reduced, 40 <= rec.refTss * RECOVERY_MAX_SHARE);
  assert.equal(rec.reduced, true);
});

test("phaseCompliance: null ohne Plan-2-Phasen (Athlet 2)", () => {
  const rides = [{ dateISO: "2026-06-01", tss: 50 }];
  assert.equal(phaseCompliance(rides, weekIdx), null);
});

/* ── Konsistenz & Adhärenz ──────────────────────────────────── */

test("mondayOf: Montag der Woche, lokal ohne UTC-Verschiebung", () => {
  assert.equal(mondayOf("2026-07-05"), "2026-06-29"); // So → Mo derselben Woche
  assert.equal(mondayOf("2026-06-29"), "2026-06-29"); // Mo bleibt Mo
});

test("weeklyStreak: zählt rückwärts, laufende Woche bricht nicht", () => {
  const today = "2026-07-05"; // Woche ab 2026-06-29
  const rides = [
    { dateISO: "2026-06-10" }, // Woche 08.06.
    { dateISO: "2026-06-17" }, // Woche 15.06.
    { dateISO: "2026-06-24" }, // Woche 22.06.
    // laufende Woche (29.06.–05.07.) ohne Fahrt → bricht nicht
  ];
  assert.equal(weeklyStreak(rides, today), 3);
  // Mit Fahrt in der laufenden Woche zählt sie mit
  assert.equal(weeklyStreak([...rides, { dateISO: "2026-07-01" }], today), 4);
  // Lücke bricht den Streak
  assert.equal(weeklyStreak([{ dateISO: "2026-06-10" }, { dateISO: "2026-06-24" }], today), 1);
  assert.equal(weeklyStreak([], today), 0);
});

test("frequencyTrend: letzte 4 abgeschlossene Wochen vs. 4 davor", () => {
  const today = "2026-07-05";
  const rides = [
    // letzte 4 Wochen (01.06.–28.06.): 8 Fahrten → 2/Woche
    ...Array.from({ length: 8 }, (_, i) => ({
      dateISO: `2026-06-${String(1 + i * 3).padStart(2, "0")}`,
    })),
    // 4 Wochen davor (04.05.–31.05.): 4 Fahrten → 1/Woche
    ...Array.from({ length: 4 }, (_, i) => ({
      dateISO: `2026-05-${String(5 + i * 6).padStart(2, "0")}`,
    })),
  ];
  const f = frequencyTrend(rides, today);
  assert.equal(f.recent, 2);
  assert.equal(f.previous, 1);
  assert.equal(f.delta, 1);
  assert.equal(frequencyTrend([], today), null);
});

test("planAdherence: Adjustments (Ausfall/Verschiebung) wie im Wochenrückblick", () => {
  const today = "2026-07-05";
  const planned = [
    { date: "2026-06-30", title: "Di Gruppe" },
    { date: "2026-07-02", title: "Do Intervalle" },
    { date: "2026-07-04", title: "Sa Z2" },
    { date: "2026-07-20", title: "Zukunft" }, // > today → zählt nicht
  ];
  const adjustments = {
    "2026-07-02": { movedTo: "2026-07-03" },
    "2026-07-04": { cancelled: true },
  };
  const rides = [{ dateISO: "2026-06-30" }, { dateISO: "2026-07-03" }];
  const a = planAdherence(rides, planned, adjustments, today);
  assert.equal(a.planned, 2); // Sa gestrichen, Zukunft raus
  assert.equal(a.done, 2); // Di direkt + Do auf verschobenem Datum
  assert.equal(a.quote, 100);
  assert.equal(a.missed.length, 0);
});

test("buildConsistency: ohne Plan bleiben Streak/Frequenz nutzbar, Adhärenz null", () => {
  const c = buildConsistency([{ dateISO: "2026-07-01" }], null, null, "2026-07-05");
  assert.equal(typeof c.streak, "number");
  assert.equal(c.adherence, null);
});
