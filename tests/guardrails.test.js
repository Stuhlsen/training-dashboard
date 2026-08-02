/* Tests: core/guardrails.js — Leitplanken-Zusammenfassung (P1, Fenster E1c).
   Ein durchgehendes, von Hand nachgerechnetes Szenario deckt alle sieben
   Felder ab; ein paar isolierte Randfälle (leere Eingaben, kein Korridor)
   daneben. Reine core/-Funktion, keine Mocks. */

import test from "node:test";
import assert from "node:assert/strict";
import { buildGuardrailSummary } from "../assets/js/core/guardrails.js";
import { addDaysISO } from "../assets/js/core/format.js";

/* ── Szenario: 7 Ist-Wochen (KW23–KW29, Montage 01.06.–13.07.2026) für die
   Rampen-Zahlen, "heute" = Montag 20.07.2026 (KW30). ctl steigt beschleunigt
   an, damit sowohl ein normaler als auch ein über-RAMP_HIGH(8)-Sprung
   vorkommt (KW28→KW29: 68→80 = +12). */
const RAMP_WEEKS = [
  { date: "2026-06-01", ctl: 40 },
  { date: "2026-06-08", ctl: 44 },
  { date: "2026-06-15", ctl: 48 },
  { date: "2026-06-22", ctl: 53, if: 0.85 },
  { date: "2026-06-29", ctl: 60, if: 0.99 },
  { date: "2026-07-06", ctl: 68, if: 0.9 },
  { date: "2026-07-13", ctl: 80, if: 1.0 },
];
const ACTUALS = RAMP_WEEKS.map((w, i) => ({ dateISO: w.date, ctl: w.ctl, tss: 50, if: w.if ?? null, id: i }));

const TODAY = "2026-07-20"; // Montag, KW30 (s. tests/conflicts.test.js-Kommentar zu KW30/KW31)

// Planungshorizont: KW30 (20.–26.07., mäßige Last) + KW31 (27.07.–02.08.,
// hohe Last) — CTL linear +1/Tag, startCtl=54 (Stand VOR dem ersten Tag).
function buildProjectionDays() {
  const days = [];
  for (let i = 0; i < 14; i++) {
    days.push({
      date: addDaysISO("2026-07-20", i),
      ctl: 55 + i,
      tss: i < 7 ? 60 : 80,
    });
  }
  return days;
}
const PROJECTION = { days: buildProjectionDays(), startCtl: 54 };

const CARDS = [
  { id: "c1", date: "2026-07-20", typ: "Sweet Spot", phase: "Sweet Spot" },
  { id: "c2", date: "2026-07-21", typ: "Z1 Recovery", phase: "Sweet Spot" },
  { id: "c3", date: "2026-07-23", typ: "Schwelle", phase: "Sweet Spot" },
  { id: "c4", date: "2026-07-27", typ: "VO2max", phase: "Sweet Spot" },
  { id: "c5", date: "2026-07-28", typ: "VO2max", phase: "Sweet Spot" },
];

test("buildGuardrailSummary: vollständiges Szenario — alle sieben Felder korrekt", () => {
  const g = buildGuardrailSummary({ actuals: ACTUALS, cards: CARDS, projection: PROJECTION, today: TODAY });

  // rampActual4w: Mittel der letzten 4 Wochen-Ramps (KW26–KW29: 5,7,8,12) = 8.0
  assert.equal(g.rampActual4w, 8);
  // rampProjectedHorizon: Mittel der 2 vollen Planwochen-Ramps (7, 7) = 7.0
  assert.equal(g.rampProjectedHorizon, 7);
  // rampHistoricalHitRate: 1 von 6 bewerteten Wochen (4,4,5,7,8,12) > 8 → 1/6
  assert.equal(Math.round(g.rampHistoricalHitRate * 1000) / 1000, Math.round((1 / 6) * 1000) / 1000);

  assert.deepEqual(g.hardDaysPerWeek, [
    { week: "2026-KW30", count: 2 },
    { week: "2026-KW31", count: 2 },
  ]);
  assert.equal(g.shortestHardGap, 1); // 27.07. → 28.07.

  assert.deepEqual(g.tidVsCorridor, { phase: "Sweet Spot", shareAboveCorridor: 0.5 }); // 2 von 4 Fahrten über ifMax 0.97

  assert.deepEqual(g.weeklyTssVsCeiling, [
    { week: "2026-KW30", tss: 420, ceiling: 432, overCeiling: false },
    { week: "2026-KW31", tss: 560, ceiling: 488, overCeiling: true },
  ]);
});

test("buildGuardrailSummary: leere Eingaben crashen nicht, liefern Leerwerte", () => {
  const g = buildGuardrailSummary({ actuals: [], cards: [], projection: null, today: TODAY });
  assert.equal(g.rampActual4w, null);
  assert.equal(g.rampProjectedHorizon, null);
  assert.equal(g.rampHistoricalHitRate, null);
  assert.deepEqual(g.hardDaysPerWeek, []);
  assert.equal(g.shortestHardGap, null);
  assert.equal(g.tidVsCorridor, null);
  assert.deepEqual(g.weeklyTssVsCeiling, []);
});

test("buildGuardrailSummary: tidVsCorridor ist null ohne Korridor-Phase (z.B. Taper/Übergang)", () => {
  const cards = [{ id: "c1", date: TODAY, typ: "Ausrollen", phase: "Taper" }];
  const g = buildGuardrailSummary({ actuals: ACTUALS, cards, projection: null, today: TODAY });
  assert.equal(g.tidVsCorridor, null);
});

test("buildGuardrailSummary: shortestHardGap null bei weniger als zwei harten Tagen", () => {
  const cards = [{ id: "c1", date: TODAY, typ: "Sweet Spot", phase: "Sweet Spot" }];
  const g = buildGuardrailSummary({ actuals: [], cards, projection: null, today: TODAY });
  assert.equal(g.shortestHardGap, null);
});
