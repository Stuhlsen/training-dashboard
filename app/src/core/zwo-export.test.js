/* Tests: core/zwo-export.js — Plankarte → .zwo-Workout-Datei. Reine Funktion,
   keine Mocks. Beispielkarte ("Sweet Spot 3×10 min") ist die reale Form aus
   scripts/lib/plan2.js. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { buildZwoWorkout, canExportZwo, canExportCardZwo } from "./zwo-export.js";
import { CADENCE_TARGET_RPM } from "../sports/cycling/metrics.js";

// Drift-Guard: buildZwoWorkout() hat einen bare `90`-Default (core/ darf
// nicht aus sports/ importieren). Wird CADENCE_TARGET_RPM je geändert, muss
// dieser Test brechen, damit der Default nachgezogen wird.
test("buildZwoWorkout: bare-90-Default deckt sich mit CADENCE_TARGET_RPM", () => {
  assert.equal(CADENCE_TARGET_RPM, 90);
});

const NUMERIC_CARD = {
  date: "2026-07-02",
  name: "Sweet Spot 3×10 min",
  details: "SS-Erhaltung",
  workout: {
    warmup: 10,
    intervals: 3,
    duration: 10,
    rest: 3,
    cooldown: 8,
    zone: "SS",
    pct: [84, 97],
    watts: [162, 187],
    label: "3×10 min @ SS (84–97% FTP)",
  },
};

test("buildZwoWorkout: numerisches Workout -> gültige .zwo-XML mit korrekten Werten", () => {
  const result = buildZwoWorkout(NUMERIC_CARD);
  assert.equal(result.ok, true);
  assert.equal(result.filename, "2026-07-02-sweet-spot-3x10-min.zwo");
  // Ohne cadenceTarget-Argument: Default 90 -> Warmup 85, Intervall 90,
  // Pause/Cooldown 80 (Fahrplan 11, gleicher Abstand wie der Push-Text).
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.6" Cadence="85"\/>/);
  // Mittelwert aus pct [84,97] gerundet = 91 % FTP = 0.91. Pause NUR zwischen
  // den Wiederholungen (Repeat = intervals-1), keine nach der letzten — s.
  // core/ftp-progress.js::workoutSegments() ("keine Pause nach der letzten").
  assert.match(
    result.xml,
    /<IntervalsT Repeat="2" OnDuration="600" OffDuration="180" OnPower="0\.91" OffPower="0\.5" Cadence="90" CadenceResting="80"\/>/,
  );
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.91" Cadence="90"\/>/);
  assert.match(result.xml, /<Cooldown Duration="480" PowerLow="0\.5" PowerHigh="0\.4" Cadence="80"\/>/);
  // Datum vorne im angezeigten Titel (ISO) — gleicher Präfix wie der Push.
  assert.match(result.xml, /<name>2026-07-02 · Sweet Spot 3×10 min<\/name>/);
});

test("buildZwoWorkout: Dateiname = Datum + Slug aus dem Kartennamen (klein, × → x, Sonderzeichen → -)", () => {
  const mk = (name) => buildZwoWorkout({ ...NUMERIC_CARD, name }).filename;
  assert.equal(mk("Tempo 3×8 Min"), "2026-07-02-tempo-3x8-min.zwo");
  assert.equal(mk("Z2 50 Min (Erholungswoche)"), "2026-07-02-z2-50-min-erholungswoche.zwo");
  assert.equal(mk("20-Min-FTP-Test"), "2026-07-02-20-min-ftp-test.zwo");
  assert.equal(mk("VO₂max 5×3 min"), "2026-07-02-vo2max-5x3-min.zwo");
  // Kein sinnvoller Rest -> Fallback "workout", nie "<datum>-.zwo".
  assert.equal(mk("—"), "2026-07-02-workout.zwo");
});

test("buildZwoWorkout: cadenceTarget wird durchgereicht (Warmup T-5, Intervall T, Pause/Cooldown T-10)", () => {
  const result = buildZwoWorkout(NUMERIC_CARD, 78);
  assert.equal(result.ok, true);
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.6" Cadence="73"\/>/);
  assert.match(result.xml, /<IntervalsT [^>]*Cadence="78" CadenceResting="68"\/>/);
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.91" Cadence="78"\/>/);
  assert.match(result.xml, /<Cooldown [^>]*Cadence="68"\/>/);
});

test("buildZwoWorkout: bei genau einem Intervall (intervals: 1) kein IntervalsT-Pausenblock UND keine Kadenzvorgabe (freie Fahrt)", () => {
  const result = buildZwoWorkout({
    date: "2026-07-02",
    name: "Threshold 1×20 min",
    workout: { warmup: 10, intervals: 1, duration: 20, cooldown: 8, pct: [98, 102] },
  });
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.xml, /IntervalsT/);
  // Ein-Block-Fahrt: die Trittfrequenz ist frei -> KEIN Cadence-Attribut,
  // auch nicht an Warmup/Cooldown.
  assert.doesNotMatch(result.xml, /Cadence/);
  assert.match(result.xml, /<SteadyState Duration="1200" Power="1\.00"\/>/);
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.6"\/>/);
  assert.match(result.xml, /<Cooldown Duration="480" PowerLow="0\.5" PowerHigh="0\.4"\/>/);
});

test("canExportZwo: numerisches Workout mit Hauptsatz -> true, Blockform/Ramp-Test -> false", () => {
  assert.equal(canExportZwo(NUMERIC_CARD.workout), true);
  assert.equal(canExportZwo({ blocks: [] }), false);
  assert.equal(canExportZwo({ warmup: 10, intervals: null, duration: null, cooldown: 5, pct: null }), false);
  assert.equal(canExportZwo(null), false);
});

test("buildZwoWorkout: ohne Hauptsatz (nur warmup/cooldown, z. B. Ramp-Test mit intervals: null) -> NO_DATA", () => {
  const result = buildZwoWorkout({
    date: "2026-09-19",
    name: "FTP Ramp Test",
    workout: { warmup: 10, intervals: null, duration: null, rest: null, cooldown: 5, zone: "RAMP", pct: null },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: Freitext-Blockform -> NO_DATA statt geratenem Ergebnis", () => {
  const result = buildZwoWorkout({
    date: "2026-08-28",
    name: "VO2max 5×3 min",
    workout: { blocks: [{ type: "interval", text: "5×3 min @ 106–120% FTP" }] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: intervals gesetzt, aber pct unvollständig -> NO_DATA statt stillschweigend weggelassenem Hauptsatz", () => {
  const result = buildZwoWorkout({
    date: "2026-07-02",
    name: "Sweet Spot 3×10 min",
    workout: { warmup: 10, cooldown: 8, intervals: 3, duration: 10, pct: [84] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: kein workout -> NO_DATA", () => {
  const result = buildZwoWorkout({ date: "2026-08-28", name: "Z2 Lang", workout: null });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: Name/Details mit XML-Sonderzeichen werden escaped", () => {
  const result = buildZwoWorkout({
    ...NUMERIC_CARD,
    name: 'Test & <Intervalle> "hart"',
    details: "A & B",
  });
  assert.equal(result.ok, true);
  assert.match(result.xml, /<name>2026-07-02 · Test &amp; &lt;Intervalle&gt; &quot;hart&quot;<\/name>/);
  assert.match(result.xml, /<description>A &amp; B<\/description>/);
});

/* ── Generator-Karten mit genauer workout_structure ─────────────────────── */

const OVER_UNDER_CARD = {
  date: "2026-12-13",
  name: "Over-Under 3×9",
  details: null,
  // Grobe Form, wie der Generator sie zusätzlich speichert — darf NICHT gewinnen.
  workout: { warmup: 15, intervals: 3, duration: 9, rest: 3, cooldown: 10, pct: [88, 105] },
  workoutStructure: {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: 900, target_pct_ftp: 55 },
      {
        kind: "alternating",
        reps: 3,
        cycles: 3,
        duration_s: 540,
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 60, target_pct_ftp: 88 },
        recovery: { duration_s: 180, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
    ],
  },
};

const SPRINT_CARD = {
  ...OVER_UNDER_CARD,
  name: "Sweet Spot 3×10 + Sprint",
  workoutStructure: {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: 720, target_pct_ftp: 55 },
      { kind: "set", reps: 3, work: { duration_s: 600, target_pct_ftp: 90 }, recovery: { duration_s: 300, target_pct_ftp: 50 } },
      { kind: "accessory", subtype: "sprint", reps: 2, work: { duration_s: 12, target: "max" }, recovery: { duration_s: 240, target_pct_ftp: 40 } },
      { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
    ],
  },
};

const xmlSteps = (xml) => xml.match(/<(SteadyState|Cooldown|FreeRide|IntervalsT)\b[^>]*>/g) ?? [];

test("buildZwoWorkout: Over-Under aus der Struktur — echte Wechsel über/unter statt 3×9 konstant", () => {
  const result = buildZwoWorkout(OVER_UNDER_CARD, 90);
  assert.equal(result.ok, true);
  const steps = xmlSteps(result.xml);
  // Warm-up + 3 Blöcke × 6 Wechsel + 2 Pausen + Cool-down
  assert.equal(steps.length, 1 + 18 + 2 + 1);
  assert.equal(steps.filter((s) => /Duration="120" Power="1\.05" Cadence="90"/.test(s)).length, 9);
  assert.equal(steps.filter((s) => /Duration="60" Power="0\.88" Cadence="80"/.test(s)).length, 9);
  assert.equal(steps.filter((s) => /Duration="180" Power="0\.50" Cadence="80"/.test(s)).length, 2);
  assert.match(steps[0], /<SteadyState Duration="900" Power="0\.55" Cadence="85"\/>/);
  assert.match(steps.at(-1), /<Cooldown Duration="600" PowerLow="0\.50" PowerHigh="0\.40" Cadence="80"\/>/);
  // Die grobe Mittelwert-Form (0.97 konstant) taucht nicht auf.
  assert.doesNotMatch(result.xml, /0\.97/);
});

test("buildZwoWorkout: Sprints als FreeRide mit Hinweis, keine erfundene Wattzahl", () => {
  const result = buildZwoWorkout(SPRINT_CARD, 90);
  assert.equal(result.ok, true);
  assert.equal((result.xml.match(/<FreeRide Duration="12">/g) ?? []).length, 2);
  assert.match(result.xml, /<textevent timeoffset="0" message="Sprint max"\/>/);
});

test("buildZwoWorkout: Blockform gewinnt über eine stehengebliebene Struktur (editierte Karte)", () => {
  const edited = { ...OVER_UNDER_CARD, workout: { blocks: [{ type: "interval", text: "frei" }] } };
  assert.equal(buildZwoWorkout(edited).ok, false);
});

test("canExportCardZwo: Strukturkarte auch ohne numerisches workout exportierbar, sonst wie canExportZwo", () => {
  assert.equal(canExportCardZwo({ ...OVER_UNDER_CARD, workout: null }), true);
  assert.equal(canExportCardZwo({ workout: NUMERIC_CARD.workout, workoutStructure: null }), true);
  assert.equal(canExportCardZwo({ workout: { blocks: [] }, workoutStructure: null }), false);
});

const GUIDE = "Ziel: Schwelle – sauber & ruhig.\nRPE 7–8: hart, aber kontrolliert.";

test("buildZwoWorkout: Guide-Text steht nach details, getrennt durch eine Leerzeile", () => {
  const result = buildZwoWorkout(NUMERIC_CARD, 90, GUIDE);
  assert.equal(result.ok, true);
  assert.match(result.xml, /<description>SS-Erhaltung\n\nZiel: Schwelle – sauber &amp; ruhig\.\nRPE 7–8: hart, aber kontrolliert\.<\/description>/);
});

test("buildZwoWorkout: Guide-Text ohne details steht allein in der description", () => {
  const result = buildZwoWorkout({ ...NUMERIC_CARD, details: null }, 90, GUIDE);
  assert.match(result.xml, /<description>Ziel: Schwelle/);
});

test("buildZwoWorkout: ohne Guide-Text (fehlt / leer) byte-gleich wie bisher", () => {
  const base = buildZwoWorkout(NUMERIC_CARD, 90);
  assert.equal(buildZwoWorkout(NUMERIC_CARD, 90, "").xml, base.xml);
  assert.equal(buildZwoWorkout(NUMERIC_CARD, 90, undefined).xml, base.xml);
  assert.match(base.xml, /<description>SS-Erhaltung<\/description>/);
});

test("buildZwoWorkout: Guide-Text ändert nur die description, Strukturkarte inklusive", () => {
  const plain = buildZwoWorkout(OVER_UNDER_CARD, 90).xml;
  const withGuide = buildZwoWorkout(OVER_UNDER_CARD, 90, GUIDE).xml;
  assert.notEqual(plain, withGuide);
  const strip = (xml) => xml.replace(/<description>[\s\S]*?<\/description>/, "");
  assert.equal(strip(withGuide), strip(plain));
});

/* Fahrplan 34 E6, Q16: .zwo gibt es nur fürs Rad — Lauf und Schwimmen
   bekommen weder den Export noch einen Guide-Text darin. */
const RUN_CARD = {
  date: "2026-07-03",
  name: "Tempolauf",
  typ: "Tempolauf",
  sport: "run",
  // reale Form aus plan-workout-select-generic.js: Pace-Band, keine Rad-Struktur
  workout: { duration: 40, zone: "Schwelle", pct: [95, 105], speedTarget: [11, 12], label: "Tempolauf" },
  workoutStructure: null,
};

test("Lauf/Schwimmen: generierte Karten sind nicht als .zwo exportierbar", () => {
  assert.equal(canExportCardZwo(RUN_CARD), false);
  assert.equal(canExportCardZwo({ ...RUN_CARD, sport: "swim", typ: "Intervalle" }), false);
  const built = buildZwoWorkout(RUN_CARD, 90, "Ziel: nicht im Export");
  assert.equal(built.ok, false);
  assert.equal(built.error.code, "NO_DATA");
});

test("Lauf/Schwimmen: auch eine Karte mit Rad-förmigem Workout bleibt vom .zwo-Export ausgeschlossen", () => {
  for (const sport of ["run", "swim"]) {
    const card = { ...NUMERIC_CARD, sport };
    assert.equal(canExportCardZwo(card), false, sport);
    const built = buildZwoWorkout(card, 90, "Ziel: nicht im Export");
    assert.equal(built.ok, false, sport);
    assert.equal(JSON.stringify(built).includes("nicht im Export"), false, sport);
  }
});

test("Rad bleibt exportierbar, mit und ohne explizites sport: ride", () => {
  assert.equal(canExportCardZwo({ ...NUMERIC_CARD, sport: "ride" }), true);
  assert.equal(buildZwoWorkout({ ...NUMERIC_CARD, sport: "ride" }).ok, true);
});
