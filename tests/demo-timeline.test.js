/* Tests: Demo-Zeitachse (scripts/demo/lib/timeline.js, Fahrplan 31 E1) */

import { test } from "node:test";
import assert from "node:assert/strict";

// Hook zuerst, dann dynamisch laden — timeline.js importiert app/src/core/
// (dort .ts-Module unter .js-Namen, s. scripts/demo/lib/register-app-core.js).
await import("../scripts/demo/lib/register-app-core.js");
const { buildDemoTimeline, fulfilmentFor } = await import("../scripts/demo/lib/timeline.js");
const { addDaysISO, diffDays } = await import("../app/src/core/format.js");

const SEED = "demo-test";
const EPOCH = "2025-01-06"; // Montag
const TODAY = "2026-10-20";

const build = (athleteId, today = TODAY, seed = SEED) =>
  buildDemoTimeline({ seed, athleteId, epoch: EPOCH, today });

const T1 = build("demo1");
const T2 = build("demo2");

test("gleicher Input → gleiches Ergebnis", () => {
  assert.deepEqual(build("demo1"), T1);
  assert.deepEqual(build("demo2"), T2);
});

test("anderer Startwert ändert die Erfüllung, nicht den Plan", () => {
  const other = build("demo1", TODAY, "anderer-seed");
  assert.deepEqual(
    other.days.map((d) => d.planned),
    T1.days.map((d) => d.planned)
  );
  assert.notDeepEqual(
    other.days.map((d) => d.fulfilment),
    T1.days.map((d) => d.fulfilment)
  );
});

test("Fenster: 365 Tage zurück, 42 Tage voraus, lückenlos", () => {
  assert.equal(T1.windowStart, addDaysISO(TODAY, -365));
  assert.equal(T1.windowEnd, addDaysISO(TODAY, 42));
  assert.equal(T1.days.length, 365 + 42 + 1);
  T1.days.forEach((d, i) => assert.equal(d.date, addDaysISO(T1.windowStart, i)));
});

test("Tag d ist identisch für today und today + 30", () => {
  for (const id of ["demo1", "demo2"]) {
    const early = id === "demo1" ? T1 : T2;
    const late = build(id, addDaysISO(TODAY, 30));
    const lateByDate = new Map(late.days.map((d) => [d.date, d]));
    const shared = early.days.filter((d) => lateByDate.has(d.date));
    assert.ok(shared.length > 300);
    for (const d of shared) assert.deepEqual(lateByDate.get(d.date), d, `${id} ${d.date}`);
  }
});

test("es gibt immer genau ein kommendes Rennen in 1–84 Tagen", () => {
  // Zyklusgrenzen inklusive: Renntag selbst (Sonntag) und Tag danach
  const todays = [TODAY, "2026-11-01", "2026-11-02", "2025-01-06", "2025-03-30", "2025-03-31"];
  for (let i = 0; i < 84; i += 9) todays.push(addDaysISO(TODAY, i));
  for (const today of todays) {
    const t = build("demo1", today);
    const upcoming = t.cycles.filter((c) => {
      const inDays = diffDays(c.raceDate, today);
      return inDays >= 1 && inDays <= 84;
    });
    assert.equal(upcoming.length, 1, `today ${today}`);
  }
});

test("Zyklen: 12 Wochen, Rennen am Sonntag, ein A-Rennen pro Saison", () => {
  for (const c of T1.cycles) {
    assert.equal(diffDays(c.raceDate, c.start), 83);
    assert.equal(new Date(`${c.raceDate}T00:00:00`).getDay(), 0);
    assert.equal(diffDays(c.start, EPOCH) % 84, 0);
  }
  assert.ok(T1.cycles.some((c) => c.priority === "main"));
  assert.ok(T1.cycles.some((c) => c.priority === "secondary"));
});

test("am Renntag keine geplante Trainingseinheit", () => {
  const raceDates = new Set(T2.cycles.map((c) => c.raceDate));
  for (const d of T2.days) if (raceDates.has(d.date)) assert.deepEqual(d.planned, []);
});

for (const [id, t] of [
  ["demo1", T1],
  ["demo2", T2],
]) {
  test(`${id}: Erfüllungsquote 80–90 % über Nicht-Krankheits-Tage`, () => {
    const healthy = t.days.filter((d) => !d.isSick && d.planned.length > 0);
    const met = healthy.filter((d) => ["done", "shorter", "harder"].includes(d.fulfilment));
    const share = met.length / healthy.length;
    assert.ok(share >= 0.8 && share <= 0.9, `Quote ${share.toFixed(3)}`);
  });

  test(`${id}: Krankheitswoche im Fenster, überwiegend skipped`, () => {
    assert.ok(t.sickWindows.length >= 1);
    for (const w of t.sickWindows) assert.equal(diffDays(w.end, w.start), 6);
    const sick = t.days.filter((d) => d.isSick && d.planned.length > 0);
    assert.ok(sick.length > 0);
    const skipped = sick.filter((d) => d.fulfilment === "skipped").length;
    assert.ok(skipped / sick.length > 0.5, `${skipped}/${sick.length}`);
  });

  test(`${id}: zwei FTP-Anstiege im Fenster`, () => {
    const rises = t.ftpSteps.filter((s, i) => i > 0 && s.watts > t.ftpSteps[i - 1].watts);
    assert.ok(rises.length >= 2, JSON.stringify(t.ftpSteps));
  });

  test(`${id}: Phasen und Erholungswochen kommen aus dem Plan-Generator`, () => {
    assert.ok(t.days.every((d) => d.phase !== ""));
    assert.ok(t.days.some((d) => d.isRecoveryWeek));
    assert.ok(t.days.some((d) => d.phase === "Taper"));
  });
}

test("demo2 plant Rad, Lauf und Schwimmen mit Doppel-Tagen", () => {
  const sports = new Set(T2.days.flatMap((d) => d.planned.map((p) => p.sport)));
  assert.deepEqual([...sports].sort(), ["ride", "run", "swim"]);
  assert.ok(T2.days.some((d) => d.planned.length >= 2));
  assert.ok(T1.days.every((d) => d.planned.every((p) => p.sport === "ride")));
});

test("fulfilmentFor: Ruhetag ohne Plan ist immer rest", () => {
  assert.equal(fulfilmentFor(SEED, "demo1", TODAY, false, false), "rest");
  assert.equal(fulfilmentFor(SEED, "demo1", TODAY, false, true), "rest");
});

test("ungültige Eingaben werfen", () => {
  const base = { seed: SEED, athleteId: "demo1", epoch: EPOCH, today: TODAY };
  assert.throws(() => buildDemoTimeline({ ...base, epoch: "2025-01-07" }), /Montag/);
  assert.throws(() => buildDemoTimeline({ ...base, today: "20.10.2026" }), /ISO/);
  assert.throws(() => buildDemoTimeline({ ...base, seed: "" }), /seed/);
  assert.throws(() => buildDemoTimeline({ ...base, athleteId: "athlete1" }), /Unbekannter/);
});
