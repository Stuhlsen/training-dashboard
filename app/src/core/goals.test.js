import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  GOAL_CATALOG,
  GOAL_KEYS,
  MAX_WEEKLY_LOSS_PCT,
  PROTEIN_G_PER_KG,
  goalConflicts,
  goalNutritionProfile,
  goalPlanProfile,
} from "./goals.js";

const g = (goalKey) => ({ goalKey });

describe("GOAL_CATALOG", () => {
  test("Schlüssel entsprechen exakt dem Check der Migration 0084", () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/0084_goals_catalog_fields.sql", import.meta.url)),
      "utf8",
    );
    const block = sql.match(/goal_key in \(([^)]*)\)/);
    assert.ok(block, "goal_key-Check in der Migration nicht gefunden");
    const inSql = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual([...GOAL_KEYS].sort(), inSql);
  });

  test("jeder Eintrag hat Label, Sportarten, hasTargetValue und availability", () => {
    for (const entry of GOAL_CATALOG) {
      assert.ok(entry.key && entry.label, entry.key);
      assert.ok(Array.isArray(entry.sports) && entry.sports.length > 0, entry.key);
      assert.equal(typeof entry.hasTargetValue, "boolean", entry.key);
      assert.ok(["ready", "needsStrength"].includes(entry.availability), entry.key);
    }
  });

  test("nur muskeln_kraft braucht den Kraftbereich", () => {
    const needs = GOAL_CATALOG.filter((e) => e.availability === "needsStrength").map((e) => e.key);
    assert.deepEqual(needs, ["muskeln_kraft"]);
  });
});

describe("goalPlanProfile", () => {
  test("ohne Ziele: neutral", () => {
    const p = goalPlanProfile(null, null);
    assert.ok(Object.values(p).every((v) => v === null));
  });

  test("sonstiges und unbekannter Schlüssel: neutral, kein Fehler", () => {
    assert.deepEqual(goalPlanProfile(g("sonstiges"), null), goalPlanProfile(null, null));
    assert.deepEqual(goalPlanProfile(g("gibt-es-nicht"), g("auch-nicht")), goalPlanProfile(null, null));
    assert.deepEqual(goalPlanProfile({}, undefined), goalPlanProfile(null, null));
  });

  test("ausdauer: langstrecke, mehr lockerer Umfang", () => {
    const p = goalPlanProfile(g("ausdauer"), null);
    assert.equal(p.focus, "langstrecke");
    assert.equal(p.moreEasyVolume, true);
  });

  test("ftp: Schwelle/VO2max, Sweet Spot nur als Ergänzung", () => {
    const p = goalPlanProfile(g("ftp"), null);
    assert.equal(p.focus, "allgemein");
    assert.equal(p.intensityFocus, "schwelle-vo2max");
    assert.equal(p.sweetSpot, "ergaenzung");
  });

  test("fett_verlieren: harte Reize bleiben, flache Rampe", () => {
    const p = goalPlanProfile(g("fett_verlieren"), null);
    assert.equal(p.keepHardStimuli, true);
    assert.equal(p.ramp, "flach");
  });

  test("bergauf: focus berg", () => {
    assert.equal(goalPlanProfile(g("bergauf"), null).focus, "berg");
  });

  test("muskeln_kraft: keine Planänderung", () => {
    assert.deepEqual(goalPlanProfile(g("muskeln_kraft"), null), goalPlanProfile(null, null));
  });

  test("event: Event-Modus", () => {
    assert.equal(goalPlanProfile(g("event"), null).eventMode, true);
  });

  test("laufen_starten: einsteiger, sanfte Rampe, niedriger Startumfang", () => {
    const p = goalPlanProfile(g("laufen_starten"), null);
    assert.equal(p.level, "einsteiger");
    assert.equal(p.ramp, "sanft");
    assert.equal(p.lowStartVolume, true);
  });

  test("fit_bleiben: allgemein; wiedereinstieg: flache Rampe", () => {
    assert.equal(goalPlanProfile(g("fit_bleiben"), null).focus, "allgemein");
    assert.equal(goalPlanProfile(g("wiedereinstieg"), null).ramp, "flach");
  });

  test("Hauptziel gewinnt, Nebenziel füllt nur Offenes", () => {
    const p = goalPlanProfile(g("ftp"), g("bergauf"));
    assert.equal(p.focus, "allgemein"); // ftp gewinnt gegen berg
    const q = goalPlanProfile(g("muskeln_kraft"), g("bergauf"));
    assert.equal(q.focus, "berg"); // Hauptziel lässt focus offen
    const r = goalPlanProfile(g("ftp"), g("ausdauer"));
    assert.equal(r.focus, "allgemein");
    assert.equal(r.moreEasyVolume, true); // von ausdauer gefüllt
  });

  test("sonstiges als Nebenziel ändert nichts", () => {
    assert.deepEqual(goalPlanProfile(g("ftp"), g("sonstiges")), goalPlanProfile(g("ftp"), null));
  });

  test("liefert unabhängige Kopien", () => {
    const a = goalPlanProfile(g("ftp"), null);
    a.focus = "berg";
    assert.equal(goalPlanProfile(g("ftp"), null).focus, "allgemein");
  });
});

describe("goalNutritionProfile", () => {
  test("ohne Ziele, sonstiges, unbekannt: neutral", () => {
    const n = goalNutritionProfile(null, null);
    assert.ok(Object.values(n).every((v) => v === null));
    assert.deepEqual(goalNutritionProfile(g("sonstiges"), null), n);
    assert.deepEqual(goalNutritionProfile(g("xyz"), g("abc")), n);
  });

  test("ausdauer: Kohlenhydrate an Last, kein Train-low", () => {
    const n = goalNutritionProfile(g("ausdauer"), null);
    assert.equal(n.carbs.followLoad, true);
    assert.equal(n.carbs.trainLow, false);
  });

  test("ftp: halten, harte Tage versorgt", () => {
    const n = goalNutritionProfile(g("ftp"), null);
    assert.equal(n.energy.mode, "maintain");
    assert.equal(n.carbs.hardDaysFueled, true);
  });

  test("fett_verlieren: kleines Defizit, Wochen-Obergrenze, Eiweiß, kein Defizit vor harten Tagen", () => {
    const n = goalNutritionProfile(g("fett_verlieren"), null);
    assert.equal(n.energy.mode, "lose");
    assert.equal(n.energy.maxWeeklyLossPct, MAX_WEEKLY_LOSS_PCT);
    assert.equal(MAX_WEEKLY_LOSS_PCT, 0.5);
    assert.equal(n.energy.noDeficitBeforeHardDays, true);
    assert.deepEqual(n.protein, PROTEIN_G_PER_KG.fett_verlieren);
    assert.deepEqual(PROTEIN_G_PER_KG.fett_verlieren, { min: 1.8, max: 2.2 });
  });

  test("bergauf: halten oder kleines Defizit", () => {
    const n = goalNutritionProfile(g("bergauf"), null);
    assert.equal(n.energy.mode, "maintain");
    assert.equal(n.energy.smallDeficitOk, true);
  });

  test("muskeln_kraft: halten, Eiweiß 1,6–2,0, kein Überschuss", () => {
    const n = goalNutritionProfile(g("muskeln_kraft"), null);
    assert.equal(n.energy.mode, "maintain");
    assert.deepEqual(n.protein, { min: 1.6, max: 2.0 });
  });

  test("event: Renntag-Verpflegung", () => {
    assert.equal(goalNutritionProfile(g("event"), null).raceDayFueling, true);
  });

  test("laufen_starten: keine Änderung; fit_bleiben und wiedereinstieg: halten", () => {
    const neutral = goalNutritionProfile(null, null);
    assert.deepEqual(goalNutritionProfile(g("laufen_starten"), null), neutral);
    assert.equal(goalNutritionProfile(g("fit_bleiben"), null).energy.mode, "maintain");
    assert.equal(goalNutritionProfile(g("wiedereinstieg"), null).energy.mode, "maintain");
  });

  test("Hauptziel gewinnt je Gruppe; Nebenziel füllt nur Offenes", () => {
    // ftp setzt energy → fett_verlieren darf kein Defizit hineinreichen
    const n = goalNutritionProfile(g("ftp"), g("fett_verlieren"));
    assert.equal(n.energy.mode, "maintain");
    assert.equal(n.energy.maxWeeklyLossPct, undefined);
    assert.deepEqual(n.protein, PROTEIN_G_PER_KG.fett_verlieren); // von side gefüllt
    // event lässt energy offen → side fett_verlieren füllt
    const m = goalNutritionProfile(g("event"), g("fett_verlieren"));
    assert.equal(m.raceDayFueling, true);
    assert.equal(m.energy.mode, "lose");
  });

  test("liefert unabhängige Kopien", () => {
    const a = goalNutritionProfile(g("fett_verlieren"), null);
    a.energy.mode = "gain";
    assert.equal(goalNutritionProfile(g("fett_verlieren"), null).energy.mode, "lose");
  });
});

describe("goalConflicts", () => {
  test("ohne Ziele oder ohne Nebenziel: none", () => {
    assert.deepEqual(goalConflicts(null, null), { level: "none", text: "" });
    assert.deepEqual(goalConflicts(g("ftp"), null), { level: "none", text: "" });
  });

  test("Paare ohne Reibung: none", () => {
    assert.equal(goalConflicts(g("ftp"), g("bergauf")).level, "none");
    assert.equal(goalConflicts(g("fett_verlieren"), g("sonstiges")).level, "none");
  });

  for (const other of ["muskeln_kraft", "ftp", "event"]) {
    test(`fett_verlieren + ${other}: hint, in beiden Reihenfolgen gleich`, () => {
      const a = goalConflicts(g("fett_verlieren"), g(other));
      const b = goalConflicts(g(other), g("fett_verlieren"));
      assert.equal(a.level, "hint");
      assert.ok(a.text.length > 20);
      assert.deepEqual(a, b);
    });
  }

  test("Texte sind sachlich: keine Diagnose, kein Wirkversprechen, kein Druck", () => {
    for (const other of ["muskeln_kraft", "ftp", "event"]) {
      const { text } = goalConflicts(g("fett_verlieren"), g(other));
      assert.doesNotMatch(text, /!|garantier|sicher erreich|musst|Essstörung|RED-S|Diagnose/i);
    }
  });

  test("gleiches Ziel doppelt oder unbekannt: none, kein Fehler", () => {
    assert.equal(goalConflicts(g("ftp"), g("ftp")).level, "none");
    assert.equal(goalConflicts(g("xyz"), g("fett_verlieren")).level, "none");
  });
});
