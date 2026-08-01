/* Tests: core/workout-validator.js — Struktur-/Semantikprüfung für
   plan_cards.workout_structure (Progressionssteuerung D1). Reine
   Funktionen, keine Mocks. */

import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkoutStructure, WORKOUT_SCHEMA_VERSION } from "../assets/js/core/workout-validator.js";

/* ── Gültige Strukturen (Konzept-Beispiele, D1/D1.3) ─────────────── */

test("validateWorkoutStructure: Sweet-Spot-Beispiel aus dem Konzept (D1) ✓", () => {
  const structure = {
    version: WORKOUT_SCHEMA_VERSION,
    steps: [
      { kind: "warmup", duration_s: 600, target_pct_ftp: 55 },
      {
        kind: "set",
        reps: 3,
        work: { duration_s: 900, target_pct_ftp: 90 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
    ],
  };
  assert.deepEqual(validateWorkoutStructure(structure), { valid: true, errors: [] });
});

test("validateWorkoutStructure: alternating (Over-Under, D1.3) mit exakter Blockdauer ✓", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 3,
        cycles: 3,
        duration_s: 720, // 3 × (120+120)
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 120, target_pct_ftp: 88 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
    ],
  };
  assert.deepEqual(validateWorkoutStructure(structure), { valid: true, errors: [] });
});

test("validateWorkoutStructure: accessory mit target:'max' (D1.3) ✓", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "accessory",
        subtype: "sprint",
        reps: 4,
        work: { duration_s: 15, target: "max" },
        recovery: { duration_s: 285, target_pct_ftp: 50 },
      },
    ],
  };
  assert.deepEqual(validateWorkoutStructure(structure), { valid: true, errors: [] });
});

test("validateWorkoutStructure: accessory mit target_pct_ftp statt 'max' ist ebenfalls erlaubt (D1.2)", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "accessory",
        subtype: "standing-start",
        reps: 3,
        work: { duration_s: 10, target_pct_ftp: 150 },
        recovery: { duration_s: 180, target_pct_ftp: 50 },
      },
    ],
  };
  assert.deepEqual(validateWorkoutStructure(structure), { valid: true, errors: [] });
});

test("validateWorkoutStructure: steady-Block (ununterbrochen, ohne Wiederholung) ✓", () => {
  const structure = { version: 1, steps: [{ kind: "steady", duration_s: 3600, target_pct_ftp: 65 }] };
  assert.deepEqual(validateWorkoutStructure(structure), { valid: true, errors: [] });
});

/* ── Struktur-Fehler ──────────────────────────────────────────── */

test("validateWorkoutStructure: kein Objekt → Fehler statt Crash", () => {
  assert.equal(validateWorkoutStructure(null).valid, false);
  assert.equal(validateWorkoutStructure("x").valid, false);
  assert.equal(validateWorkoutStructure([1, 2]).valid, false);
});

test("validateWorkoutStructure: unbekannte Version → Fehler", () => {
  const result = validateWorkoutStructure({ version: 2, steps: [{ kind: "steady", duration_s: 60, target_pct_ftp: 50 }] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Version")));
});

test("validateWorkoutStructure: fehlende/leere steps → Fehler", () => {
  assert.equal(validateWorkoutStructure({ version: 1 }).valid, false);
  assert.equal(validateWorkoutStructure({ version: 1, steps: [] }).valid, false);
});

test("validateWorkoutStructure: unbekanntes Top-Level-Feld → Fehler", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [{ kind: "steady", duration_s: 60, target_pct_ftp: 50 }],
    extra: 1,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Unbekannte Felder")));
});

test("validateWorkoutStructure: unbekannte Schrittart → Fehler", () => {
  const result = validateWorkoutStructure({ version: 1, steps: [{ kind: "sprint-intervall", duration_s: 60 }] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("kind")));
});

test("validateWorkoutStructure: unbekanntes Feld je Schrittart → Fehler (D1.1, keine Verschachtelung)", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [{ kind: "steady", duration_s: 60, target_pct_ftp: 50, nested: { steps: [] } }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("unbekannte Felder")));
});

test("validateWorkoutStructure: target_pct_ftp absolut statt relativ ist nicht prüfbar, aber Watt-artige Werte außerhalb der Grenze fliegen raus (D1.2)", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [{ kind: "steady", duration_s: 60, target_pct_ftp: 250 }], // z.B. versehentlich Watt statt %
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("target_pct_ftp")));
});

test("validateWorkoutStructure: target:'max' außerhalb accessory → Fehler (D1.2-Ausnahme gilt nur dort)", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [{ kind: "steady", duration_s: 60, target: "max" }],
  });
  assert.equal(result.valid, false);
});

test("validateWorkoutStructure: negative/Null-Dauer → Fehler", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [{ kind: "steady", duration_s: 0, target_pct_ftp: 50 }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("duration_s")));
});

test("validateWorkoutStructure: 'set' ohne work/recovery → Fehler", () => {
  const result = validateWorkoutStructure({ version: 1, steps: [{ kind: "set", reps: 3 }] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("work")));
  assert.ok(result.errors.some((e) => e.includes("recovery")));
});

test("validateWorkoutStructure: 'set' mit reps 0 → Fehler", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [
      {
        kind: "set",
        reps: 0,
        work: { duration_s: 60, target_pct_ftp: 90 },
        recovery: { duration_s: 60, target_pct_ftp: 50 },
      },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("reps")));
});

test("validateWorkoutStructure: accessory ohne subtype → Fehler", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [
      {
        kind: "accessory",
        reps: 3,
        work: { duration_s: 10, target: "max" },
        recovery: { duration_s: 100, target_pct_ftp: 50 },
      },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("subtype")));
});

test("validateWorkoutStructure: accessory-Arbeit mit target_pct_ftp UND target:'max' gleichzeitig → Fehler", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [
      {
        kind: "accessory",
        subtype: "sprint",
        reps: 3,
        work: { duration_s: 10, target: "max", target_pct_ftp: 150 },
        recovery: { duration_s: 100, target_pct_ftp: 50 },
      },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("nicht beides")));
});

/* ── D1.4: alternating-Restprüfung ────────────────────────────── */

test("validateWorkoutStructure: alternating mit krummem Rest → Fehler, kein Runden (D1.4)", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 3,
        cycles: 3,
        duration_s: 600, // 3×(120+120)=720, NICHT 600 — bewusst falsch
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 120, target_pct_ftp: 88 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
    ],
  };
  const result = validateWorkoutStructure(structure);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("D1.4")));
});

test("validateWorkoutStructure: alternating ohne cycles/duration_s → eigene Fehler, keine D1.4-Prüfung auf undefined", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 1,
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 120, target_pct_ftp: 88 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("cycles")));
  assert.ok(result.errors.some((e) => e.includes("steps[0].duration_s")));
  assert.ok(!result.errors.some((e) => e.includes("D1.4")), "keine Folgefehler auf bereits ungültigen Werten");
});

/* ── Sammelt alle Fehler ──────────────────────────────────────── */

test("validateWorkoutStructure: sammelt Fehler über mehrere Schritte hinweg", () => {
  const result = validateWorkoutStructure({
    version: 1,
    steps: [
      { kind: "steady", duration_s: -1, target_pct_ftp: 999 },
      { kind: "unbekannt" },
    ],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3);
});
