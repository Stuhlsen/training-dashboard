/* Tests: core/ladder.js (Progressionssteuerung D4/L1-L8)
   Teil 1: generateLadderSteps() an synthetischen Achsen (beweist die D4.2-
   Semantik selbst — primary×secondary zuerst, tertiary gated angehängt).
   Teil 2: resolveSteps()/stepAt()/neighborSteps()/formatSummary() gegen
   eine reale, aufgezählte Startbelegung (sweetspot-long, L2) — dieselbe
   "Vergleichstabelle als Test"-Konvention wie bei der Typerkennung. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateLadderSteps, resolveSteps, stepAt, neighborSteps, formatSummary, activeLockUntil } from "../assets/js/core/ladder.js";

test("generateLadderSteps: primary×secondary als Kreuzprodukt, primäre Achse äußere Schleife", () => {
  const axes = {
    primary: { name: "reps", values: [3, 4] },
    secondary: { name: "durationMin", values: [10, 12] },
  };
  const steps = generateLadderSteps(axes);
  assert.deepEqual(steps, [
    { reps: 3, durationMin: 10 },
    { reps: 3, durationMin: 12 },
    { reps: 4, durationMin: 10 },
    { reps: 4, durationMin: 12 },
  ]);
});

test("generateLadderSteps: tertiary nur an die letzte primary×secondary-Kombination angehängt, mit gate", () => {
  const axes = {
    primary: { name: "reps", values: [3] },
    secondary: { name: "durationMin", values: [10, 12] },
    tertiary: { name: "pctFtp", values: [90, 91], gate: "green-twice" },
  };
  const steps = generateLadderSteps(axes);
  assert.deepEqual(steps, [
    { reps: 3, durationMin: 10 },
    { reps: 3, durationMin: 12 },
    { reps: 3, durationMin: 12, pctFtp: 90, gate: "green-twice" },
    { reps: 3, durationMin: 12, pctFtp: 91, gate: "green-twice" },
  ]);
});

test("generateLadderSteps: fehlende/unvollständige Achsen liefern leere Liste statt zu werfen", () => {
  assert.deepEqual(generateLadderSteps(null), []);
  assert.deepEqual(generateLadderSteps({}), []);
  assert.deepEqual(generateLadderSteps({ primary: { name: "reps", values: [3] } }), []);
});

/** Startbelegung L2 (sweetspot-long), 1:1 aus dem Konzept — S5/S8 nutzen
 *  reps=2/duration=30min, außerhalb einer denkbaren primary:[3,4]/
 *  secondary:[10..20]-Achse, deshalb hier als explicitSteps geführt (s.
 *  Kopfkommentar core/ladder.js). */
const SWEETSPOT_LONG = {
  label: "Sweet Spot lang",
  axes: {
    explicitSteps: [
      { id: "S1", structureLabel: "3×10", pctFtp: 88, zoneTimeMin: 30 },
      { id: "S2", structureLabel: "3×12", pctFtp: 88, zoneTimeMin: 36 },
      { id: "S3", structureLabel: "3×15", pctFtp: 90, zoneTimeMin: 45 },
      { id: "S4", structureLabel: "4×12", pctFtp: 90, zoneTimeMin: 48 },
      { id: "S5", structureLabel: "2×20", pctFtp: 91, zoneTimeMin: 40 },
      { id: "S6", structureLabel: "3×18", pctFtp: 90, zoneTimeMin: 54 },
      { id: "S7", structureLabel: "3×20", pctFtp: 91, zoneTimeMin: 60 },
      { id: "S8", structureLabel: "2×30", pctFtp: 90, zoneTimeMin: 60 },
    ],
  },
};

test("resolveSteps: liest explicitSteps unverändert (keine Generierung)", () => {
  const steps = resolveSteps(SWEETSPOT_LONG);
  assert.equal(steps.length, 8);
  assert.equal(steps[4].id, "S5"); // S5 bleibt trotz sinkendem Volumen an Position 5
});

test("stepAt: 1-indexiert wie im Konzept (S1..S8), außerhalb des Bereichs null", () => {
  assert.equal(stepAt(SWEETSPOT_LONG, 1).id, "S1");
  assert.equal(stepAt(SWEETSPOT_LONG, 8).id, "S8");
  assert.equal(stepAt(SWEETSPOT_LONG, 0), null);
  assert.equal(stepAt(SWEETSPOT_LONG, 9), null);
});

test("neighborSteps: liefert die beiden Nachbarstufen, an den Rändern null", () => {
  assert.deepEqual(neighborSteps(SWEETSPOT_LONG, 1), { prev: null, next: stepAt(SWEETSPOT_LONG, 2) });
  const mid = neighborSteps(SWEETSPOT_LONG, 5);
  assert.equal(mid.prev.id, "S4");
  assert.equal(mid.next.id, "S6");
  assert.deepEqual(neighborSteps(SWEETSPOT_LONG, 8), { prev: stepAt(SWEETSPOT_LONG, 7), next: null });
});

test("formatSummary: E1-Textform 'Label · Stufe ID (Struktur)'", () => {
  assert.equal(formatSummary(SWEETSPOT_LONG, stepAt(SWEETSPOT_LONG, 3), 3), "Sweet Spot lang · Stufe S3 (3×15)");
});

test("formatSummary: unbekannte Stufe (außerhalb der Leiter) fällt auf Platzhaltertext zurück", () => {
  assert.equal(formatSummary(SWEETSPOT_LONG, null, 9), "Sweet Spot lang · Stufe 9 (unbekannt)");
});

/* activeLockUntil (D4b Schritt 2, "lockWeeks" aus presetAction() "reduce"
   tatsächlich durchsetzen) */

test("activeLockUntil: kein Eintrag mit lockedUntil -> null", () => {
  const history = [{ formatId: "sweetspot-long", step: 3, validFrom: "2026-08-01", lockedUntil: null }];
  assert.equal(activeLockUntil(history, "sweetspot-long", "2026-08-02"), null);
});

test("activeLockUntil: lockedUntil in der Zukunft -> aktiv", () => {
  const history = [{ formatId: "sweetspot-long", step: 2, validFrom: "2026-08-01", lockedUntil: "2026-08-15" }];
  assert.equal(activeLockUntil(history, "sweetspot-long", "2026-08-02"), "2026-08-15");
});

test("activeLockUntil: lockedUntil == heute -> noch aktiv (Grenzfall inklusiv)", () => {
  const history = [{ formatId: "sweetspot-long", step: 2, validFrom: "2026-08-01", lockedUntil: "2026-08-02" }];
  assert.equal(activeLockUntil(history, "sweetspot-long", "2026-08-02"), "2026-08-02");
});

test("activeLockUntil: lockedUntil in der Vergangenheit -> nicht mehr aktiv", () => {
  const history = [{ formatId: "sweetspot-long", step: 2, validFrom: "2026-07-01", lockedUntil: "2026-07-15" }];
  assert.equal(activeLockUntil(history, "sweetspot-long", "2026-08-02"), null);
});

test("activeLockUntil: nur das eigene formatId zählt", () => {
  const history = [{ formatId: "threshold-long", step: 2, validFrom: "2026-08-01", lockedUntil: "2026-08-15" }];
  assert.equal(activeLockUntil(history, "sweetspot-long", "2026-08-02"), null);
});

test("activeLockUntil: mehrere aktive Sperren -> das späteste Datum gewinnt", () => {
  const history = [
    { formatId: "sweetspot-long", step: 2, validFrom: "2026-07-01", lockedUntil: "2026-08-10" },
    { formatId: "sweetspot-long", step: 1, validFrom: "2026-08-01", lockedUntil: "2026-08-20" },
  ];
  assert.equal(activeLockUntil(history, "sweetspot-long", "2026-08-02"), "2026-08-20");
});

test("activeLockUntil: leere Historie -> null", () => {
  assert.equal(activeLockUntil([], "sweetspot-long", "2026-08-02"), null);
});
