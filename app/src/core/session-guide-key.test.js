/* Tests: Familien-Ableitung für Trainings-Guides (core/session-guide-key.js)
   — Fahrplan 34, E1. Jede Zeile der V2-Tabelle (nur Rad) ein Fall. */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { guideKeyFor, hasSprintStep } from "./session-guide-key.js";

const WARM = { kind: "warmup", duration_s: 600, target_pct_ftp: 55 };
const COOL = { kind: "cooldown", duration_s: 300, target_pct_ftp: 50 };
const SET = {
  kind: "set",
  reps: 3,
  work: { duration_s: 720, target_pct_ftp: 90 },
  recovery: { duration_s: 300, target_pct_ftp: 55 },
};
const ALT = {
  kind: "alternating",
  reps: 2,
  cycles: 3,
  duration_s: 540,
  over: { duration_s: 60, target_pct_ftp: 105 },
  under: { duration_s: 120, target_pct_ftp: 85 },
  recovery: { duration_s: 300, target_pct_ftp: 55 },
};
const SPRINT = {
  kind: "accessory",
  subtype: "sprint",
  reps: 4,
  work: { duration_s: 10, target: "max" },
  recovery: { duration_s: 120, target_pct_ftp: 50 },
};

const struct = (...steps) => ({ version: 1, steps });
const card = (typ, workoutStructure, extra = {}) => ({ typ, workoutStructure, ...extra });

describe("guideKeyFor — Typ ohne Struktur", () => {
  const cases = [
    ["Sweet Spot", "ride:sweetspot-long"],
    ["Schwelle", "ride:threshold-long"],
    ["VO2max", "ride:vo2-long"],
    ["FTP-Test", "ride:ftp-test"],
    ["Z2 Lang", "ride:z2-lang"],
    ["Z2 Dauer", "ride:z2-dauer"],
    ["Z1 Recovery", "ride:z1-recovery"],
  ];
  for (const [typ, key] of cases) {
    test(`${typ} → ${key}`, () => {
      assert.equal(guideKeyFor(card(typ, null)), key);
    });
  }
});

describe("guideKeyFor — Format-Familie aus der Struktur", () => {
  test("Schwelle + alternating → over-under", () => {
    assert.equal(guideKeyFor(card("Schwelle", struct(WARM, ALT, COOL))), "ride:over-under");
  });
  test("Schwelle + set → threshold-long", () => {
    assert.equal(guideKeyFor(card("Schwelle", struct(WARM, SET, COOL))), "ride:threshold-long");
  });
  test("VO2max + alternating → vo2-short", () => {
    assert.equal(guideKeyFor(card("VO2max", struct(WARM, ALT, COOL))), "ride:vo2-short");
  });
  test("VO2max + set → vo2-long", () => {
    assert.equal(guideKeyFor(card("VO2max", struct(WARM, SET, COOL))), "ride:vo2-long");
  });
  test("Sweet Spot bleibt sweetspot-long, auch mit Sprint-Schritt", () => {
    assert.equal(guideKeyFor(card("Sweet Spot", struct(WARM, SET, SPRINT, COOL))), "ride:sweetspot-long");
  });
  test("alternating bei Sweet Spot ändert den Schlüssel nicht", () => {
    assert.equal(guideKeyFor(card("Sweet Spot", struct(WARM, ALT, COOL))), "ride:sweetspot-long");
  });
  test("ungültige Struktur wird ignoriert (Typ-Schlüssel)", () => {
    assert.equal(guideKeyFor(card("Schwelle", { version: 1, steps: [{ kind: "alternating" }] })), "ride:threshold-long");
  });
  test("zur Blockform editierte Karte: alte Struktur zählt nicht", () => {
    const c = card("Schwelle", struct(WARM, ALT, COOL), { workout: { blocks: [] } });
    assert.equal(guideKeyFor(c), "ride:threshold-long");
  });
});

describe("guideKeyFor — Sportart und Unbekanntes", () => {
  test("sport fehlt → Rad (Default)", () => {
    assert.equal(guideKeyFor({ typ: "Z2 Lang" }), "ride:z2-lang");
  });
  test("sport: ride explizit", () => {
    assert.equal(guideKeyFor({ typ: "Z2 Lang", sport: "ride" }), "ride:z2-lang");
  });
  test("Lauf/Schwimmen sind in E1 noch nicht dabei → null", () => {
    assert.equal(guideKeyFor({ typ: "Dauerlauf", sport: "run" }), null);
    assert.equal(guideKeyFor({ typ: "Longswim", sport: "swim" }), null);
  });
  test("unbekannter Typ → null", () => {
    assert.equal(guideKeyFor(card("Gruppenfahrt", null)), null);
    assert.equal(guideKeyFor(card("Etappe", null)), null);
    assert.equal(guideKeyFor(card("Ausrollen", null)), null);
  });
  test("echte Alt-Typen ohne Guide-Text bleiben null (nicht raten)", () => {
    for (const typ of ["Z2 Kadenz", "Z2 Erholung", "Z2", "Tempo", "Rennen", "Race", "Freestyle"]) {
      assert.equal(guideKeyFor(card(typ, null)), null, typ);
    }
  });
  test("leere/fehlende Eingaben → null", () => {
    assert.equal(guideKeyFor(null), null);
    assert.equal(guideKeyFor(undefined), null);
    assert.equal(guideKeyFor({}), null);
    assert.equal(guideKeyFor({ typ: "" }), null);
    assert.equal(guideKeyFor({ typ: 42 }), null);
  });
});

describe("guideKeyFor — Schreibweisen (Alias)", () => {
  test("Groß-/Kleinschreibung und Leerraum", () => {
    assert.equal(guideKeyFor(card("  sweet spot ", null)), "ride:sweetspot-long");
    assert.equal(guideKeyFor(card("VO2MAX", null)), "ride:vo2-long");
    assert.equal(guideKeyFor(card("ftp-test", null)), "ride:ftp-test");
    assert.equal(guideKeyFor(card("z1 recovery", null)), "ride:z1-recovery");
  });
});

describe("hasSprintStep", () => {
  test("Sprint-Schritt (target max) → true", () => {
    assert.equal(hasSprintStep(card("Sweet Spot", struct(WARM, SET, SPRINT, COOL))), true);
  });
  test("ohne Sprint → false", () => {
    assert.equal(hasSprintStep(card("Sweet Spot", struct(WARM, SET, COOL))), false);
  });
  test("Zusatzschritt ohne target max ist kein Sprint", () => {
    const tempo = { ...SPRINT, work: { duration_s: 30, target_pct_ftp: 120 } };
    assert.equal(hasSprintStep(card("Sweet Spot", struct(WARM, SET, tempo, COOL))), false);
  });
  test("keine/ungültige Struktur → false", () => {
    assert.equal(hasSprintStep(card("Sweet Spot", null)), false);
    assert.equal(hasSprintStep(null), false);
    assert.equal(hasSprintStep({ typ: "Sweet Spot", workoutStructure: { version: 1, steps: [] } }), false);
  });
  test("Blockform-Karte: alte Struktur zählt nicht", () => {
    const c = card("Sweet Spot", struct(WARM, SET, SPRINT, COOL), { workout: { blocks: [] } });
    assert.equal(hasSprintStep(c), false);
  });
});
