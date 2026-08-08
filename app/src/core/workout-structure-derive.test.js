/* Tests: core/workout-structure-derive.js (Auftrag "Rückwirkende
   Strukturableitung"). Reine Funktion, keine Mocks — Titel stammen aus dem
   echten plan_cards-Bestand beider Athleten (per read-only Abfrage geprüft
   bei Erstellung dieses Moduls), nicht erfunden. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { deriveWorkoutStructure } from "./workout-structure-derive.js";

/* ── Je Familie, reale Titel ─────────────────────────────────────── */

test("deriveWorkoutStructure: Sweet Spot (× ASCII-lower) ✓", () => {
  const result = deriveWorkoutStructure("Sweet Spot 3×10 min");
  assert.ok(result);
  assert.equal(result.derived, true);
  assert.deepEqual(result.structure, {
    version: 1,
    steps: [
      {
        kind: "set",
        reps: 3,
        work: { duration_s: 600, target_pct_ftp: 90 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
    ],
  });
});

test("deriveWorkoutStructure: SS-Präfix-Synonym (SS-Durability) ✓", () => {
  const result = deriveWorkoutStructure("SS-Durability 3×18 min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].work.duration_s, 1080);
  assert.equal(result.structure.steps[0].work.target_pct_ftp, 90);
});

test("deriveWorkoutStructure: Schwelle (deutsch) ✓", () => {
  const result = deriveWorkoutStructure("Schwelle 3×8 min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].reps, 3);
  assert.equal(result.structure.steps[0].work.duration_s, 480);
  assert.equal(result.structure.steps[0].work.target_pct_ftp, 100);
});

test("deriveWorkoutStructure: Threshold (englisch, Athlet 2) ✓", () => {
  const result = deriveWorkoutStructure("Threshold 2×10 Min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].reps, 2);
  assert.equal(result.structure.steps[0].work.duration_s, 600);
  assert.equal(result.structure.steps[0].work.target_pct_ftp, 100);
});

test("deriveWorkoutStructure: VO2max ASCII ✓", () => {
  const result = deriveWorkoutStructure("VO2max 5×3 min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].reps, 5);
  assert.equal(result.structure.steps[0].work.duration_s, 180);
  assert.equal(result.structure.steps[0].work.target_pct_ftp, 109);
});

test("deriveWorkoutStructure: VO₂max mit Unicode-Subskript-2 (NFKC) ✓", () => {
  const result = deriveWorkoutStructure("VO₂max 6×3 min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].reps, 6);
  assert.equal(result.structure.steps[0].work.target_pct_ftp, 109);
});

test("deriveWorkoutStructure: Sweetspot ohne Leerzeichen, großes Min (Athlet 2) ✓", () => {
  const result = deriveWorkoutStructure("Sweetspot 2×8 Min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].reps, 2);
  assert.equal(result.structure.steps[0].work.duration_s, 480);
});

/* ── Trennzeichen-/Schreibweisen-Varianten ───────────────────────── */

test("deriveWorkoutStructure: 'x' statt '×' ✓", () => {
  const result = deriveWorkoutStructure("Sweet Spot 3x12 min");
  assert.ok(result);
  assert.equal(result.structure.steps[0].reps, 3);
  assert.equal(result.structure.steps[0].work.duration_s, 720);
});

test("deriveWorkoutStructure: 'Minuten' ausgeschrieben ✓", () => {
  const result = deriveWorkoutStructure("Schwelle 2×20 Minuten");
  assert.ok(result);
  assert.equal(result.structure.steps[0].work.duration_s, 1200);
});

/* ── Pausenlängen-Branch (L2-Kopfkommentar: ≤15 min → 5 min, sonst 8 min) */

test("deriveWorkoutStructure: Pause 5 min bei Intervall = 15 min (Grenzfall) ✓", () => {
  const result = deriveWorkoutStructure("SS-Ausdauer 3×15 min");
  assert.equal(result.structure.steps[0].recovery.duration_s, 300);
});

test("deriveWorkoutStructure: Pause 8 min bei Intervall > 15 min ✓", () => {
  const result = deriveWorkoutStructure("SS-Durability 3×20 min");
  assert.equal(result.structure.steps[0].recovery.duration_s, 480);
});

/* ── Suffixe werden ignoriert, nicht interpretiert ───────────────── */

test("deriveWorkoutStructure: '@95%'-Suffix wird ignoriert (Familienwert bleibt maßgeblich) ✓", () => {
  const result = deriveWorkoutStructure("Threshold 3×12 Min @95%");
  assert.ok(result);
  assert.equal(result.structure.steps[0].work.target_pct_ftp, 100);
  assert.equal(result.structure.steps[0].work.duration_s, 720);
});

test("deriveWorkoutStructure: '+ Sprint'-Suffix wird ignoriert, kein accessory-Schritt ✓", () => {
  const result = deriveWorkoutStructure("Threshold 3×12 Min + Sprint");
  assert.ok(result);
  assert.equal(result.structure.steps.length, 1);
  assert.equal(result.structure.steps[0].kind, "set");
});

/* ── Over-Under: bewusst nicht unterstützt (Entscheidung, s. Kopfkommentar) */

test("deriveWorkoutStructure: 'Over-Under 3×8 Min' ohne Split-Angabe → null ✗", () => {
  assert.equal(deriveWorkoutStructure("Over-Under 3×8 Min"), null);
});

test("deriveWorkoutStructure: 'Over-Under 3×10 Min + Sprint' → null (auch mit Zahl×Zahl-Muster) ✗", () => {
  assert.equal(deriveWorkoutStructure("Over-Under 3×10 Min + Sprint"), null);
});

/* ── Nicht parsebare Titel ────────────────────────────────────────── */

test("deriveWorkoutStructure: Renn-/Eventtitel ohne Zahl×Zahl-Muster → null ✗", () => {
  assert.equal(deriveWorkoutStructure("MyWhoosh Crit"), null);
});

test("deriveWorkoutStructure: 'NLS6 Renntag' (kein Familienkeyword) → null ✗", () => {
  assert.equal(deriveWorkoutStructure("NLS6 Renntag"), null);
});

test("deriveWorkoutStructure: leerer/fehlender Titel → null ✗", () => {
  assert.equal(deriveWorkoutStructure(""), null);
  assert.equal(deriveWorkoutStructure("   "), null);
  assert.equal(deriveWorkoutStructure(null), null);
  assert.equal(deriveWorkoutStructure(undefined), null);
});

test("deriveWorkoutStructure: Familienkeyword ohne jede Zahlenangabe → null ✗", () => {
  assert.equal(deriveWorkoutStructure("Sweet Spot Ausdauer"), null);
});
