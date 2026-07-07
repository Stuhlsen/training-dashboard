/* Tests: EF-Trend, Kadenz-Coach, FTP-Prognose, Bestwerte,
   Wochenrückblick, Konsistenzkalender, Plan-2-Blöcke */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isComparableRide, rollingMean, efficiencyTrend } from "../assets/js/core/efficiency.js";
import { cadenceCoach } from "../assets/js/core/cadence.js";
import { eftpHistory, forecastFtp } from "../assets/js/core/ftp-forecast.js";
import { recordProgression } from "../assets/js/core/records.js";
import { lastCompletedWeekRange, buildWeekReview } from "../assets/js/core/weekreview.js";
import { weeklyConsistency } from "../assets/js/core/consistency.js";
import { getPlan2Blocks } from "../scripts/lib/plan2.js";

/* ── EF-Trend ───────────────────────────────────────────────── */

test("isComparableRide: nur Z2 ≥60min bei moderater Temperatur", () => {
  const base = { efficiency: 1.2, typ: "Z2 Lang", min: 120, dateISO: "2026-06-01" };
  assert.equal(isComparableRide(base), true);
  assert.equal(isComparableRide({ ...base, typ: "Sweet Spot" }), false);
  assert.equal(isComparableRide({ ...base, min: 45 }), false);
  assert.equal(isComparableRide({ ...base, weather: { temp: 34 } }), false);
  assert.equal(isComparableRide({ ...base, weather: { temp: 22 } }), true);
  assert.equal(isComparableRide({ ...base, efficiency: null }), false);
});

test("rollingMean: trailing, erst ab 3 Punkten", () => {
  const rm = rollingMean([1, 2, 3, 4], 3);
  assert.equal(rm[0], null);
  assert.equal(rm[1], null);
  assert.equal(rm[2], 2);
  assert.equal(rm[3], 3);
});

test("efficiencyTrend: Steigung pro 30 Tage aus vergleichbaren Fahrten", () => {
  const rides = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date("2026-04-01T00:00:00");
    d.setDate(d.getDate() + i * 10);
    rides.push({
      dateISO: d.toISOString().split("T")[0],
      typ: "Z2 Lang",
      min: 90,
      efficiency: 1.1 + i * 0.02,
    });
  }
  rides.push({ dateISO: "2026-05-01", typ: "VO2max", min: 60, efficiency: 1.6 }); // wird gefiltert
  const t = efficiencyTrend(rides);
  assert.equal(t.comparable.length, 6);
  assert.ok(Math.abs(t.slopePer30d - 0.06) < 0.001); // +0.02 je 10 Tage
});

/* ── Kadenz-Coach ───────────────────────────────────────────── */

test("cadenceCoach: Entwicklung, Zielquote, Typ-Aufschlüsselung", () => {
  const rides = [];
  for (let i = 0; i < 20; i++) {
    rides.push({
      dateISO: `2026-05-${String(i + 1).padStart(2, "0")}`,
      kad: i < 10 ? 80 : 92,
      typ: i % 2 ? "Z2 Lang" : "Sweet Spot",
    });
  }
  const c = cadenceCoach(rides, 90);
  assert.equal(c.startAvg, 80);
  assert.equal(c.recentAvg, 92);
  assert.equal(c.delta, 12);
  assert.equal(c.shareAbove, 50);
  assert.equal(c.perType.length, 2);
});

test("cadenceCoach: zu wenig Daten → null", () => {
  assert.equal(cadenceCoach([{ dateISO: "2026-05-01", kad: 80 }], 90), null);
});

/* ── FTP-Prognose ───────────────────────────────────────────── */

test("eftpHistory: pro Tag der höchste Wert, chronologisch", () => {
  const h = eftpHistory([
    { dateISO: "2026-07-02", eftp: 198 },
    { dateISO: "2026-07-01", eftp: 195 },
    { dateISO: "2026-07-02", eftp: 199 },
    { dateISO: "2026-07-03" }, // kein eftp
  ]);
  assert.deepEqual(h, [
    { date: "2026-07-01", eftp: 195 },
    { date: "2026-07-02", eftp: 199 },
  ]);
});

test("forecastFtp: lineare Projektion mit Mindest-Band ±2 W", () => {
  // +1 W je 7 Tage, perfekt linear → Band = Minimum (±2)
  const history = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date("2026-05-04T00:00:00");
    d.setDate(d.getDate() + i * 7);
    history.push({ date: d.toISOString().split("T")[0], eftp: 190 + i });
  }
  const fc = forecastFtp(history, "2026-09-19", { windowDays: 60 });
  assert.equal(fc.slopePerWeek, 1);
  assert.ok(fc.projected > 197);
  assert.equal(fc.high - fc.projected, 2);
  assert.equal(forecastFtp(history.slice(0, 2), "2026-09-19"), null);
});

/* ── Bestwerte ──────────────────────────────────────────────── */

test("recordProgression: Ablöse-Historie chronologisch, NP nur ≥20min", () => {
  const rides = [
    { dateISO: "2026-04-01", km: 50, min: 130, np: 180, kmh: 24, name: "A" },
    { dateISO: "2026-05-01", km: 100, min: 260, np: 210, kmh: 26, name: "B" },
    { dateISO: "2026-05-15", km: 60, min: 15, np: 260, kmh: 30, name: "Sprint (zu kurz)" },
    { dateISO: "2026-06-01", km: 138, min: 320, np: 200, kmh: 27, name: "C" },
  ];
  const recs = recordProgression(rides);
  const km = recs.find((r) => r.key === "km");
  assert.equal(km.value, 138);
  assert.deepEqual(
    km.history.map((h) => h.value),
    [50, 100]
  );
  const np = recs.find((r) => r.key === "np20");
  assert.equal(np.value, 210); // 260 zählt nicht (15 min)
  const week = recs.find((r) => r.key === "weekKm");
  assert.ok(week.value > 0);
});

/* ── Wochenrückblick ────────────────────────────────────────── */

test("lastCompletedWeekRange: Mo–So der Vorwoche", () => {
  // Sa 04.07.2026 → letzte abgeschlossene Woche: Mo 22.06 – So 28.06
  assert.deepEqual(lastCompletedWeekRange("2026-07-04"), { from: "2026-06-22", to: "2026-06-28" });
  // Montag: die gerade beendete Woche endet gestern (So)
  assert.deepEqual(lastCompletedWeekRange("2026-06-29"), { from: "2026-06-22", to: "2026-06-28" });
});

test("buildWeekReview: Summen, stärkste Leistung, Plan-Erfüllung mit Adjustments", () => {
  const rides = [
    {
      dateISO: "2026-06-23",
      km: 68,
      min: 150,
      tss: 140,
      np: 175,
      name: "Gruppenfahrt",
      weather: { temp: 24, windSpeed: 15 },
    },
    {
      dateISO: "2026-06-27",
      km: 85,
      min: 220,
      tss: 180,
      np: 160,
      name: "Z2 Lang",
      weather: { temp: 31, windSpeed: 10 },
    },
  ];
  const sessions = [
    { date: "2026-06-23", name: "Gruppenfahrt" },
    { date: "2026-06-25", name: "Intervalle" }, // wird verschoben auf Sa
    { date: "2026-06-26", name: "Extra" }, // fällt aus
  ];
  const adjustments = {
    "2026-06-25": { movedTo: "2026-06-27" },
    "2026-06-26": { cancelled: true },
  };
  const rv = buildWeekReview(rides, sessions, adjustments, "2026-07-04");
  assert.equal(rv.km, 153);
  assert.equal(rv.best.name, "Gruppenfahrt"); // höchste NP
  assert.equal(rv.plan.planned, 2); // Ausfall zählt nicht
  assert.equal(rv.plan.done, 2); // verschobene Session am 27. erfüllt
  assert.match(rv.weatherNote, /31/);
  assert.equal(buildWeekReview([], sessions, {}, "2026-07-04"), null);
});

/* ── Konsistenzkalender ─────────────────────────────────────── */

test("weeklyConsistency: Wochen-Buckets, Lücken, Serien und Ø Tage/Woche", () => {
  const rides = [
    { dateISO: "2026-06-01", km: 30 }, // Mo – Woche 1
    { dateISO: "2026-06-03", km: 40 }, // Mi – Woche 1
    { dateISO: "2026-06-08", km: 50 }, // Mo – Woche 2
    // Woche 3 (ab 2026-06-15) bleibt leer → Lücke
    { dateISO: "2026-06-22", km: 60 }, // Mo – Woche 4
  ];
  const wc = weeklyConsistency(rides, "2026-06-24");
  assert.ok(wc);
  assert.equal(wc.totalWeeks, 4);
  assert.equal(wc.weeks[0].days, 2); // Mo + Mi
  assert.equal(wc.weeks[1].days, 1);
  assert.equal(wc.weeks[2].days, 0); // Lücke bleibt sichtbar
  assert.equal(wc.weeks[3].days, 1);
  assert.equal(wc.activeWeeks, 3);
  assert.equal(wc.activeDays, 4);
  assert.equal(wc.streakLongest, 2);   // Woche 1 + 2
  assert.equal(wc.streakCurrent, 1);   // aktuelle Woche aktiv, davor Lücke
  assert.equal(wc.avgDays, 1);         // 4 Tage / 4 Wochen
  assert.equal(weeklyConsistency([], "2026-06-24"), null);
});

/* ── Plan-2-Blöcke (Sync) ───────────────────────────────────── */

test("getPlan2Blocks: Plan 1 + begonnene Phasenblöcke, laufender Block gekappt", () => {
  const blocks = getPlan2Blocks("2026-07-04");
  assert.equal(blocks[0].key, "plan1");
  const ss = blocks.find((b) => b.label === "Sweet Spot");
  assert.ok(ss);
  assert.equal(ss.to, "2026-07-04"); // läuft noch → auf heute gekappt
  assert.equal(
    blocks.find((b) => b.label === "VO2max"),
    undefined
  ); // noch nicht begonnen
});

test("getPlan2Blocks: nach Saisonende alle Blöcke mit vollen Zeiträumen", () => {
  const blocks = getPlan2Blocks("2026-10-01");
  const labels = blocks.map((b) => b.label);
  assert.deepEqual(labels, ["Plan 1", "Sweet Spot", "Schwelle", "VO2max"]);
  assert.ok(blocks[1].to > blocks[1].from);
});
