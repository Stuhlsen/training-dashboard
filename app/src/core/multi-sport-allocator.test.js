/* Tests: core/multi-sport-allocator.js::allocateWeek() — Fahrplan 44 E3 (V2).
   Reine Berechnung: Rad zuerst und unberührt, weitere Sportarten auf eigenen
   Tagen, harte Tage mit Abstand (zyklische Woche), Hinweise statt stiller
   Änderung. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { allocateWeek } from "./multi-sport-allocator.js";
import { generatePlan, emptyHistory, FIXED_INTERVAL_TYP } from "./plan-generator.js";

const RIDE_FIXED = [
  { weekday: 1, typ: "Gruppenfahrt", keepInRecoveryWeek: false },
  { weekday: 3, typ: "Gruppenfahrt", keepInRecoveryWeek: false },
  { weekday: 6, typ: FIXED_INTERVAL_TYP, keepInRecoveryWeek: false },
];
const hardFix = (weekday, typ = "Schwelle") => ({ weekday, typ, keepInRecoveryWeek: false });
const ride = (over = {}) => ({ sport: "ride", hours: 8, weekdays: [1, 3, 6, 7], fixedDays: RIDE_FIXED, ...over });
const run = (over = {}) => ({ sport: "run", hours: 3, weekdays: [2, 4, 5], fixedDays: [], ...over });
const swim = (over = {}) => ({ sport: "swim", hours: 2, weekdays: [2, 4], fixedDays: [], ...over });

const plan = (r, sport) => r.plans.find((p) => p.sport === sport);
const codes = (r) => r.hints.map((h) => h.code);
const pinsOf = (r, sport) =>
  plan(r, sport)
    .fixedDays.filter((d) => d.typ === FIXED_INTERVAL_TYP)
    .map((d) => d.weekday);
const cyc = (a, b) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));

/** Wochentage (ISO 1..7), an denen generatePlan() eine harte Karte legt. */
function hardWeekdays(input) {
  const out = generatePlan(input);
  const days = new Set();
  for (const w of out.weeks ?? []) {
    for (const c of w.cards ?? []) {
      if (!c.isQuality) continue;
      days.add(((new Date(`${c.date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1);
    }
  }
  return days;
}

function runInput(p, over = {}) {
  return {
    sport: "run",
    startDate: "2026-09-07",
    mode: "open",
    weeks: 10,
    trainingWeekdays: p.trainingWeekdays,
    fixedDays: p.fixedDays,
    weeklyHours: p.weeklyHours,
    currentFtp: null,
    ftpMeasuredDate: null,
    ftpTarget: null,
    focus: "allgemein",
    level: "einsteiger",
    model: "linear",
    history: emptyHistory(),
    ...over,
  };
}

/* ── Identität (Regel 1) ─────────────────────────────────────── */

test("eine Sportart: Eingabe kommt unverändert zurück, ohne Hinweise", () => {
  const r = allocateWeek({ sports: [ride()], blockedDays: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.hints, []);
  assert.deepEqual(r.plans, [{ sport: "ride", weeklyHours: 8, trainingWeekdays: [1, 3, 6, 7], fixedDays: RIDE_FIXED }]);
});

test("eine Sportart: generatePlan() liefert mit der Ausgabe exakt dasselbe", () => {
  const base = {
    startDate: "2026-09-07",
    mode: "open",
    weeks: 8,
    trainingWeekdays: [1, 3, 6, 7],
    fixedDays: RIDE_FIXED,
    weeklyHours: 8,
    currentFtp: 250,
    ftpMeasuredDate: "2026-08-20",
    ftpTarget: null,
    focus: "allgemein",
    level: "fortgeschritten",
    model: "pyramidal",
    history: emptyHistory(),
  };
  const p = allocateWeek({ sports: [ride()], blockedDays: [] }).plans[0];
  const viaAllocator = { ...base, weeklyHours: p.weeklyHours, trainingWeekdays: p.trainingWeekdays, fixedDays: p.fixedDays };
  assert.deepEqual(generatePlan(viaAllocator), generatePlan(base));
});

test("eine Sportart ohne fixedDays: leere Liste, keine Hinweise", () => {
  const r = allocateWeek({ sports: [run({ fixedDays: undefined })] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plans[0].fixedDays, []);
  assert.deepEqual(r.hints, []);
});

/* ── Pflichtfall ─────────────────────────────────────────────── */

test("Pflichtfall: Rad unverändert, Laufen auf eigenen Tagen, kein harter Lauftag, ein Hinweis", () => {
  const r = allocateWeek({ sports: [run(), ride()], blockedDays: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(plan(r, "ride"), { sport: "ride", weeklyHours: 8, trainingWeekdays: [1, 3, 6, 7], fixedDays: RIDE_FIXED });
  const l = plan(r, "run");
  assert.deepEqual(l.trainingWeekdays, [2, 4, 5]);
  assert.equal(l.weeklyHours, 3);
  assert.deepEqual(pinsOf(r, "run"), []);
  assert.equal(r.hints.length, 1);
  assert.equal(r.hints[0].code, "HARD_DAY_MISSING");
  assert.equal(r.hints[0].sport, "run");
});

/* ── Platz, Pins, Generator-Falle (Regel 7) ──────────────────── */

test("Rad plus Laufen mit genug Platz: keine Pins, keine Hinweise", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [2], fixedDays: [] }), run({ weekdays: [4, 5, 6, 7] })] });
  assert.deepEqual(r.hints, []);
  assert.deepEqual(plan(r, "run").fixedDays, []);
  assert.deepEqual(plan(r, "run").trainingWeekdays, [4, 5, 6, 7]);
});

test("natürliche Qualitätstage zu nah: Pins auf gültige Tage, generatePlan() meidet verbotene Tage", () => {
  // Rad hart nur Mo → verboten für harte Läufe: So, Mo, Di
  const r = allocateWeek({
    sports: [ride({ weekdays: [1], fixedDays: [hardFix(1)] }), run({ weekdays: [2, 3, 4, 6] })],
  });
  assert.deepEqual(pinsOf(r, "run"), [3, 6]);
  assert.deepEqual(r.hints, []);
  const hard = hardWeekdays(runInput(plan(r, "run")));
  assert.ok(hard.size > 0);
  for (const wd of hard) assert.ok(![7, 1, 2].includes(wd), `harter Lauftag am verbotenen Tag ${wd}`);
});

test("nur ein gültiger harter Tag von zwei: Pin plus Hinweis HARD_DAY_REDUCED", () => {
  // Rad hart Mo, Sa → verboten: So, Mo, Di, Fr, Sa. Laufen Di, Mi, Do → gültig nur Mi, Do (benachbart)
  const r = allocateWeek({
    sports: [ride({ weekdays: [1, 6], fixedDays: [hardFix(1), hardFix(6, "VO2max")] }), run({ weekdays: [2, 3, 4] })],
  });
  assert.ok(codes(r).includes("HARD_DAY_REDUCED"));
  const pins = pinsOf(r, "run");
  assert.equal(pins.length, 1);
  assert.ok([3, 4].includes(pins[0]));
});

test("fester harter Tag des neuen Sports zu nah an Rad: bleibt, Hinweis HARD_CONFLICT", () => {
  const r = allocateWeek({
    sports: [ride({ weekdays: [1], fixedDays: [hardFix(1)] }), run({ weekdays: [2, 4, 6], fixedDays: [hardFix(2, "Tempolauf")] })],
  });
  assert.ok(plan(r, "run").fixedDays.some((d) => d.weekday === 2));
  assert.ok(codes(r).includes("HARD_CONFLICT"));
});

/* ── Tage ─────────────────────────────────────────────────────── */

test("eigene Tage zuerst: Laufen belegt keinen Radtag, solange freie Auswahltage da sind", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [1, 6], fixedDays: [] }), run({ weekdays: [1, 2, 6, 7] })] });
  // Mo und Sa sind locker belegt und werden mangels Not nicht geteilt … aber die Auswahl bleibt Auswahl:
  // freie Tage zuerst, der Rest wird nur im Notfall geteilt.
  assert.ok(plan(r, "run").trainingWeekdays.includes(2));
  assert.ok(plan(r, "run").trainingWeekdays.includes(7));
});

test("Laufen teilt keinen harten Radtag, wenn eine Lücke frei ist, und meldet fehlende Tage", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [1, 6], fixedDays: [hardFix(1), hardFix(6)] }), run({ weekdays: [1, 2, 6, 7] })] });
  assert.deepEqual(plan(r, "run").trainingWeekdays, [2, 7]);
  assert.ok(codes(r).includes("DAYS_SHORT"));
});

test("alle Tage belegt: Laufen teilt lockere Tage mit Hinweis", () => {
  const r = allocateWeek({
    sports: [ride({ weekdays: [1, 2, 3, 4, 5, 6, 7], fixedDays: [hardFix(1)] }), run({ weekdays: [3, 5] })],
  });
  assert.deepEqual(plan(r, "run").trainingWeekdays, [3, 5]);
  assert.equal(codes(r).filter((c) => c === "SHARED_DAY").length, 2);
});

test("harter Radtag wird nur geteilt, wenn gar keine Lücke mehr frei ist", () => {
  const full = allocateWeek({
    sports: [ride({ weekdays: [1, 2, 3, 4, 5, 6, 7], fixedDays: [hardFix(1)] }), run({ weekdays: [1] })],
  });
  assert.deepEqual(plan(full, "run").trainingWeekdays, [1]);
  assert.ok(codes(full).includes("SHARED_HARD_DAY"));
  // Lücke vorhanden (Rad ohne Do) → kein Teilen des harten Tags
  const gap = allocateWeek({
    sports: [ride({ weekdays: [1, 2, 3, 5, 6, 7], fixedDays: [hardFix(1)] }), run({ weekdays: [1] })],
  });
  assert.deepEqual(plan(gap, "run").trainingWeekdays, []);
  assert.ok(codes(gap).includes("DAYS_SHORT"));
});

test("blockierter Tag wird nie belegt", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [1], fixedDays: [] }), run({ weekdays: [3, 4, 5] })], blockedDays: [4] });
  assert.deepEqual(plan(r, "run").trainingWeekdays, [3, 5]);
  assert.ok(codes(r).includes("BLOCKED_DAY"));
  assert.ok(codes(r).includes("DAYS_SHORT"));
});

test("fester Tag auf blockiertem Tag: blockiert gewinnt, mit Hinweis", () => {
  const r = allocateWeek({
    sports: [ride({ weekdays: [1], fixedDays: [] }), run({ weekdays: [3, 5], fixedDays: [{ weekday: 4, typ: "Longrun", keepInRecoveryWeek: false }] })],
    blockedDays: [4],
  });
  assert.equal(plan(r, "run").trainingWeekdays.includes(4), false);
  assert.equal(plan(r, "run").fixedDays.some((d) => d.weekday === 4), false);
  assert.ok(codes(r).includes("BLOCKED_DAY"));
});

test("Rad auf blockiertem Tag bleibt unberührt, mit Hinweis", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [1, 4], fixedDays: [] }), run({ weekdays: [2] })], blockedDays: [4] });
  assert.deepEqual(plan(r, "ride").trainingWeekdays, [1, 4]);
  assert.ok(codes(r).includes("KEPT_ON_BLOCKED_DAY"));
});

test("Woche ist zyklisch: So und Mo sind Folgetage", () => {
  // Rad hart So → verboten: Sa, So, Mo. Laufen Mo, Mi, Do → Pins nie auf Mo
  const r = allocateWeek({
    sports: [ride({ weekdays: [7], fixedDays: [hardFix(7)] }), run({ weekdays: [1, 3, 4] })],
  });
  assert.ok(!pinsOf(r, "run").includes(1));
  assert.ok(pinsOf(r, "run").every((d) => [3, 4].includes(d)));
  // Gegenprobe: Rad hart Mo → auch Sonntag ist für harte Läufe verboten
  const r2 = allocateWeek({
    sports: [ride({ weekdays: [1], fixedDays: [hardFix(1)] }), run({ weekdays: [3, 7] })],
  });
  assert.ok(pinsOf(r2, "run").every((d) => d !== 7));
  assert.ok(codes(r2).includes("HARD_DAY_REDUCED") || codes(r2).includes("HARD_DAY_MISSING"));
});

/* ── Drei Sportarten, Eingabereihenfolge, Determinismus ──────── */

test("drei Sportarten: harte Tage von Rad, Laufen, Schwimmen mit Abstand", () => {
  const r = allocateWeek({
    sports: [ride({ weekdays: [1], fixedDays: [hardFix(1)] }), run({ weekdays: [4] }), swim({ weekdays: [2, 3, 6] })],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plans.map((p) => p.sport), ["ride", "run", "swim"]);
  // Rad hart Mo, Laufen hart Do (natürlich, keine Pins nötig), Schwimmen nur Sa gültig
  assert.deepEqual(plan(r, "run").fixedDays, []);
  assert.deepEqual(pinsOf(r, "swim"), [6]);
  assert.ok(cyc(6, 1) >= 2 && cyc(6, 4) >= 2);
  assert.ok(codes(r).includes("HARD_DAY_REDUCED"));
});

test("Reihenfolge der Eingabe ist egal, gleiche Eingabe gibt gleiche Ausgabe", () => {
  const a = allocateWeek({ sports: [ride(), run(), swim()], blockedDays: [] });
  const b = allocateWeek({ sports: [swim(), run(), ride()], blockedDays: [] });
  const c = allocateWeek({ sports: [ride(), run(), swim()], blockedDays: [] });
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test("Eingabe wird nicht verändert", () => {
  const input = { sports: [ride(), run()], blockedDays: [4] };
  const snapshot = JSON.parse(JSON.stringify(input));
  allocateWeek(input);
  assert.deepEqual(input, snapshot);
});

/* ── Stunden (Regel 8) ───────────────────────────────────────── */

test("Stunden bleiben je Sportart erhalten, auch wenn Tage fehlen", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [1, 6], fixedDays: [hardFix(1), hardFix(6)] }), run({ hours: 4.5, weekdays: [1, 6] })] });
  assert.equal(plan(r, "run").weeklyHours, 4.5);
  assert.equal(plan(r, "ride").weeklyHours, 8);
  assert.ok(codes(r).includes("DAYS_SHORT"));
});

test("sehr viele Stunden auf wenigen Tagen: Hinweis HOURS_DENSE, Stunden bleiben", () => {
  const r = allocateWeek({ sports: [ride({ weekdays: [1], fixedDays: [] }), run({ hours: 12, weekdays: [3, 5] })] });
  assert.equal(plan(r, "run").weeklyHours, 12);
  assert.ok(codes(r).includes("HOURS_DENSE"));
});

/* ── Hinweise ─────────────────────────────────────────────────── */

test("Hinweise tragen code, text und sport", () => {
  const r = allocateWeek({ sports: [run(), ride()] });
  assert.ok(r.hints.length > 0);
  for (const h of r.hints) {
    assert.equal(typeof h.code, "string");
    assert.ok(h.text.length > 0);
    assert.ok(["ride", "run", "swim"].includes(h.sport));
  }
});

/* ── Eingabefehler (Regel 9) ─────────────────────────────────── */

const invalid = (input) => {
  const r = allocateWeek(input);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "VALIDATION");
  assert.equal(typeof r.error.message, "string");
};

test("Eingabefehler: unbekannte Sportart", () => {
  invalid({ sports: [ride(), { sport: "kraft", hours: 2, weekdays: [2], fixedDays: [] }] });
});
test("Eingabefehler: doppelte Sportart", () => {
  invalid({ sports: [run(), run()] });
});
test("Eingabefehler: Stunden nicht positiv", () => {
  invalid({ sports: [ride({ hours: 0 })] });
  invalid({ sports: [ride({ hours: -1 })] });
  invalid({ sports: [ride({ hours: Number.NaN })] });
  invalid({ sports: [ride({ hours: "8" })] });
});
test("Eingabefehler: Wochentag außerhalb 1 bis 7", () => {
  invalid({ sports: [ride({ weekdays: [0, 3] })] });
  invalid({ sports: [ride({ weekdays: [3, 8] })] });
  invalid({ sports: [ride({ weekdays: [1.5] })] });
  invalid({ sports: [ride({ fixedDays: [{ weekday: 9, typ: "Tempo" }] })] });
  invalid({ sports: [ride()], blockedDays: [0] });
});
test("Eingabefehler: keine Sportart / kein Objekt", () => {
  invalid({ sports: [] });
  invalid({});
  invalid(null);
});
