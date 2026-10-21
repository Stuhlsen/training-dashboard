/* Tests: Demo-Payload (scripts/demo/lib/payload.js, Fahrplan 31 E2, Vertrag V4)
   Liest KEINE echte Datei aus data/ — die Schlüsselliste unten ist von Hand
   gepflegt (Stand: Ride-Felder der heutigen Sync-Ausgabe). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

await import("../scripts/demo/lib/register-app-core.js");
const { buildDemoTimeline } = await import("../scripts/demo/lib/timeline.js");
const { buildDemoAthlete } = await import("../scripts/demo/lib/payload.js");
const { demoAthlete } = await import("../scripts/demo/lib/roster.js");
const { validateRidesPayload, checkObject, RIDE_SCHEMA, WELLNESS_SCHEMA, FTP_HISTORY_SCHEMA } =
  await import("../app/src/core/validate.js");
const { inferTypFromIF } = await import("../scripts/lib/map-activity.js");
const { addDaysISO } = await import("../app/src/core/format.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED = "demo-test";
const EPOCH = "2025-01-06"; // Montag
const TODAY = "2026-10-20";

const build = (athleteId, seed = SEED) => {
  const timeline = buildDemoTimeline({ seed, athleteId, epoch: EPOCH, today: TODAY });
  return { timeline, ...buildDemoAthlete(timeline, demoAthlete(athleteId)) };
};
const A1 = build("demo1");
const A2 = build("demo2");
const BOTH = [A1, A2];

/** Ride-Felder der heutigen Sync-Ausgabe. `compliance` fehlt bewusst: der
 *  Sync setzt es nur bei echtem Soll-Ist-Match (s. app/src/types.js). */
const RIDE_KEYS = [
  "name",
  "week",
  "phase",
  "typ",
  "typPlanned",
  "typDetected",
  "typDetection",
  "typSource",
  "dataSource",
  "sport",
  "date",
  "startTime",
  "activityId",
  "km",
  "min",
  "kmh",
  "watt",
  "maxWatt",
  "np",
  "hf",
  "hfMax",
  "kad",
  "hoehe",
  "hmProKm",
  "tss",
  "if",
  "vi",
  "trimp",
  "ctl",
  "atl",
  "tsb",
  "decoupling",
  "dtl",
  "zoneTimes",
  "eftp",
  "rpe",
  "feelIcu",
  "weather",
  "wetter",
  "source",
  "ruhepuls",
  "hrv",
  "avgSleepingHR",
  "sleepHours",
  "feel",
  "notizen",
];
const TOP_KEYS = [
  "athleteName",
  "ftpPublic",
  "ftp",
  "ftpHistory",
  "rides",
  "wellness",
  "wellnessMeta",
  "powerCurves",
  "powerCurveBlocks",
  "athleteWeight",
  "plannedSessions",
  "adjustments",
  "forecast",
  "updated",
  "source",
  "count",
];
const FORECAST_KEYS = [
  "temp",
  "tempFeel",
  "humidity",
  "windSpeed",
  "windDir",
  "precipProb",
  "weatherCode",
  "uvMax",
];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test("gleicher Input → gleiches Ergebnis", () => {
  assert.deepEqual(build("demo1"), A1);
});

test("json besteht validate.js ohne Warnung — auch über ALLE Einträge", () => {
  for (const { json } of BOTH) {
    assert.deepEqual(validateRidesPayload(json), []);
    json.rides.forEach((r, i) => assert.deepEqual(checkObject(r, RIDE_SCHEMA, `rides[${i}]`), []));
    json.wellness.forEach((w, i) =>
      assert.deepEqual(checkObject(w, WELLNESS_SCHEMA, `wellness[${i}]`), [])
    );
    json.ftpHistory.forEach((f, i) =>
      assert.deepEqual(checkObject(f, FTP_HISTORY_SCHEMA, `ftpHistory[${i}]`), [])
    );
  }
});

test("Feld-Abgleich: jedes Ride-Feld und jedes Top-Level-Feld ist da", () => {
  for (const { json } of BOTH) {
    for (const k of TOP_KEYS) assert.ok(k in json, `Top-Level ${k} fehlt`);
    for (const r of json.rides)
      for (const k of RIDE_KEYS) assert.ok(k in r, `${r.activityId}: ${k} fehlt`);
    assert.equal(json.source, "demo");
    assert.equal(json.count, json.rides.length);
  }
  assert.equal(A2.json.hrMax, demoAthlete("demo2").hrMax);
  assert.equal(A2.json.hrRest, demoAthlete("demo2").hrRest);
  assert.ok(!("hrMax" in A1.json));
});

test("TSS = h × IF² × 100, Rad-IF = NP ÷ FTP, typ über inferTypFromIF-Grenzen", () => {
  for (const { json, timeline } of BOTH) {
    for (const r of json.rides) {
      assert.ok(
        Math.abs(r.tss - (r.min / 60) * r.if ** 2 * 100) <= 1,
        `${r.activityId}: TSS ${r.tss}`
      );
      if (r.sport !== "ride") {
        assert.equal(r.np, null);
        assert.equal(r.zoneTimes, null);
        continue;
      }
      const ftp = [...timeline.ftpSteps].reverse().find((s) => s.date <= r.date).watts;
      assert.ok(Math.abs(r.if - r.np / ftp) <= 0.01, `${r.activityId}: IF ${r.if}`);
      assert.equal(r.typ, inferTypFromIF(r.np, r.min, ftp));
    }
  }
});

test("Einheiten nur vor heute, nie an ausgelassenen Tagen; Renntage tragen das Rennen", () => {
  for (const { json, timeline } of BOTH) {
    const races = new Set(timeline.cycles.map((c) => c.raceDate));
    const byDate = new Map(timeline.days.map((d) => [d.date, d]));
    const ids = new Set();
    for (const r of json.rides) {
      assert.ok(r.date < TODAY);
      assert.ok(!ids.has(r.activityId), "activityId doppelt");
      ids.add(r.activityId);
      if (!races.has(r.date))
        assert.ok(!["skipped", "rest"].includes(byDate.get(r.date).fulfilment));
    }
  }
  const pastRace = A2.timeline.cycles.find((c) => c.raceDate < TODAY).raceDate;
  assert.deepEqual(
    A2.json.rides.filter((r) => r.date === pastRace).map((r) => r.sport),
    ["swim", "ride", "run"]
  );
  assert.equal(A1.json.rides.filter((r) => r.date === pastRace).length, 1);
});

test("CTL-Rampe ≤ 8 pro Woche, CTL startet nicht bei 0", () => {
  for (const seed of [SEED, "a", "b", "c"]) {
    for (const id of ["demo1", "demo2"]) {
      const { json } = build(id, seed);
      const ctl = new Map(json.rides.map((r) => [r.date, r.ctl]));
      for (const [date, c] of ctl) {
        const weekAgo = ctl.get(addDaysISO(date, -7));
        if (weekAgo != null) assert.ok(c - weekAgo <= 8, `${seed}/${id} ${date}: +${c - weekAgo}`);
      }
      assert.ok(json.rides[0].ctl > 20, `${seed}/${id}: Start-CTL ${json.rides[0].ctl}`);
      // TSB aus den ungerundeten Werten (wie der Sync) → ±0,1 gegen gerundete ctl/atl
      for (const r of json.rides) assert.ok(Math.abs(r.tsb - (r.ctl - r.atl)) <= 0.11);
    }
  }
});

test("HRV-Delle (−20 bis −30 %) und Ruhepuls +5–8 in der Krankheitswoche", () => {
  for (const { json, timeline } of BOTH) {
    const athlete = demoAthlete(timeline.athleteId);
    const w = new Map(json.wellness.map((x) => [x.date, x]));
    const sick = timeline.sickWindows.find((s) => s.start >= timeline.windowStart);
    const inSick = [];
    for (let d = sick.start; d <= sick.end; d = addDaysISO(d, 1)) inSick.push(w.get(d));
    const before = [];
    for (let i = 14; i >= 1; i--) before.push(w.get(addDaysISO(sick.start, -i)));
    const ratio = mean(inSick.map((x) => x.hrv)) / mean(before.map((x) => x.hrv));
    assert.ok(ratio <= 0.82 && ratio >= 0.65, `HRV-Verhältnis ${ratio}`);
    const rhrUp = mean(inSick.map((x) => x.restingHR)) - athlete.hrRest;
    assert.ok(rhrUp >= 4.5 && rhrUp <= 9, `Ruhepuls +${rhrUp}`);
  }
});

test("Schlaf 6,5–8,5 h, Wellness bis heute, Ride-Wellness = Tageswert", () => {
  for (const { json } of BOTH) {
    for (const x of json.wellness) assert.ok(x.sleepHours >= 6.5 && x.sleepHours <= 8.5);
    assert.equal(json.wellness.at(-1).date, TODAY);
    assert.equal(json.wellnessMeta.lastUpdated.hrv, TODAY);
    const w = new Map(json.wellness.map((x) => [x.date, x]));
    for (const r of json.rides) {
      assert.equal(r.hrv, w.get(r.date).hrv);
      assert.equal(r.ruhepuls, w.get(r.date).restingHR);
    }
  }
});

test("ftpHistory = ftpSteps, eFTP folgt den Sprüngen mit Verzug", () => {
  for (const { json, timeline } of BOTH) {
    assert.deepEqual(
      json.ftpHistory.map((f) => [f.validFrom, f.ftpWatt]),
      timeline.ftpSteps.map((s) => [s.date, s.watts])
    );
    const w = new Map(json.wellness.map((x) => [x.date, x]));
    for (let i = 1; i < timeline.ftpSteps.length; i++) {
      const { date, watts } = timeline.ftpSteps[i];
      if (addDaysISO(date, 42) > TODAY) continue;
      const prev = timeline.ftpSteps[i - 1].watts;
      const atJump = w.get(date).eftp;
      const later = w.get(addDaysISO(date, 42)).eftp;
      assert.ok(
        Math.abs(atJump - prev) <= Math.abs(atJump - watts) + 3,
        `eFTP springt sofort (${date})`
      );
      assert.ok(
        Math.abs(later - watts) <= Math.abs(watts - prev) / 2 + 3,
        `eFTP holt nicht auf (${date})`
      );
    }
  }
});

test("Powerkurve: 20-min ≈ FTP ÷ 0,95, fallend; Vergleichsblöcke vorhanden", () => {
  for (const { json } of BOTH) {
    const best = json.powerCurves.list[0];
    const p20 = best.watts[best.secs.indexOf(1200)];
    assert.ok(Math.abs(p20 / (json.ftp / 0.95) - 1) <= 0.05, `20 min ${p20} W bei FTP ${json.ftp}`);
    for (let i = 1; i < best.watts.length; i++) assert.ok(best.watts[i] <= best.watts[i - 1]);
    assert.deepEqual(
      json.powerCurveBlocks.map((b) => b.key),
      ["letzte-6-wochen", "6-wochen-davor"]
    );
  }
});

test("forecast: 7 fiktive Tage ab heute, nirgends Koordinaten", () => {
  for (const { json, rows } of BOTH) {
    const dates = Object.keys(json.forecast);
    assert.equal(dates.length, 7);
    assert.equal(dates[0], TODAY);
    for (const d of dates)
      assert.deepEqual(Object.keys(json.forecast[d]).sort(), [...FORECAST_KEYS].sort());
    const all = JSON.stringify({ json, rows });
    assert.doesNotMatch(
      all,
      /"(lat|lon|latitude|longitude|weather_lat|weather_lon|weather_location_label)"/
    );
  }
});

/** Spaltennamen je Tabelle aus dem Adapter-Quelltext (Row-Interfaces + Inserts). */
const ADAPTERS = {
  training_plans: "training-plans",
  plan_cards: "plan-cards",
  wellbeing: "wellbeing",
  events: "events",
  goals: "goals",
  ftp_history: "ftp-history",
  athlete_sync_config: "athlete-sync-config",
};
function adapterColumns(file) {
  const src = readFileSync(path.join(ROOT, "app/src/api/supabase", `${file}.ts`), "utf8");
  return new Set([...src.matchAll(/^\s+([a-z][a-z0-9_]*)\??:/gm)].map((m) => m[1]));
}

test("rows-Spalten passen zu den Adaptern, ohne UUIDs/Fremdschlüssel/Koordinaten", () => {
  for (const { rows } of BOTH) {
    assert.deepEqual(Object.keys(rows).sort(), Object.keys(ADAPTERS).sort());
    for (const [table, file] of Object.entries(ADAPTERS)) {
      const cols = adapterColumns(file);
      assert.ok(rows[table].length > 0, `${table} leer`);
      for (const row of rows[table]) {
        for (const k of Object.keys(row)) {
          if (k.startsWith("_")) continue;
          assert.ok(cols.has(k), `${table}.${k} gibt es im Adapter nicht`);
          assert.ok(
            !["id", "athlete_id", "profile_id", "created_by", "plan_id", "goal_event_id"].includes(
              k
            )
          );
        }
      }
    }
  }
});

test("rows: Verweise lösen auf, pro Sportart genau ein aktiver Plan", () => {
  for (const { rows, timeline } of BOTH) {
    const planRefs = new Set(rows.training_plans.map((p) => p._ref));
    const eventRefs = new Set(rows.events.map((e) => e._ref));
    for (const c of rows.plan_cards) assert.ok(planRefs.has(c._planRef), c._planRef);
    for (const p of rows.training_plans) assert.ok(eventRefs.has(p._goalEventRef), p._goalEventRef);
    for (const s of demoAthlete(timeline.athleteId).sports) {
      assert.equal(rows.training_plans.filter((p) => p.sport === s && p.is_active).length, 1, s);
    }
    for (const w of rows.wellbeing) {
      for (const k of ["energy", "muscle_feel", "mood"]) assert.ok(w[k] >= 1 && w[k] <= 5);
    }
  }
});

test("Generator-Code: kein Math.random(), kein Date.now()", () => {
  const dir = path.join(ROOT, "scripts/demo/lib");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    // Kommentare raus — die Kopfkommentare nennen das Verbot selbst
    const code = readFileSync(path.join(dir, f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /Math\.random\(|Date\.now\(/, f);
  }
});

// ── Abnahme E7: Plausibilität ────────────────────────────────

const { getSubjectiveReadiness } = await import("../app/src/core/readiness.js");
const { energyView, hydrationSeries } = await import("../app/src/core/body.js");
const { buildPaceCurve } = await import("../app/src/core/pace-curve.js");
const { estimateThresholdSpeed } = await import("../app/src/core/critical-speed.js");
const { shortenActivity } = await import("../scripts/demo/lib/rides.js");

test("Morgen-Check-in (E7): gesunde Tage meist fit, Krankheitswoche nie", () => {
  for (const { rows, timeline } of BOTH) {
    const sick = new Map(timeline.days.map((d) => [d.date, d.isSick]));
    const levels = { healthy: [], sick: [] };
    for (const w of rows.wellbeing) {
      const { level } = getSubjectiveReadiness(
        [{ date: w.date, energy: w.energy, muscleFeel: w.muscle_feel, mood: w.mood }],
        w.date
      );
      levels[sick.get(w.date) ? "sick" : "healthy"].push(level);
    }
    const green = levels.healthy.filter((l) => l === "green").length / levels.healthy.length;
    assert.ok(green >= 0.5, `nur ${Math.round(green * 100)} % grüne Tage`);
    assert.ok(levels.sick.length > 0 && !levels.sick.includes("green"));
  }
});

test("FTP-Ziel (E7): goals, json.ftpGoal und Besetzung stimmen überein", () => {
  for (const { rows, json, timeline } of BOTH) {
    const { ftpGoal } = demoAthlete(timeline.athleteId);
    assert.equal(rows.goals[0].target_value, ftpGoal);
    assert.equal(json.ftpGoal, ftpGoal);
  }
});

test("FTP-Historie (E7): kein Eintrag nach heute, DB-Zeilen = JSON", () => {
  for (const { rows, json } of BOTH) {
    assert.ok(json.ftpHistory.every((f) => f.validFrom <= TODAY));
    assert.deepEqual(
      rows.ftp_history.map((r) => r.valid_from),
      json.ftpHistory.map((f) => f.validFrom)
    );
  }
});

test("Energiebilanz und Trinkmenge (E7): Analyse-Kacheln haben Daten", () => {
  for (const { json } of BOTH) {
    const e = energyView(json.wellness);
    assert.ok(e?.hasIntake && e.hasResting, "Energiebilanz leer");
    assert.ok(e.avgIntake > 1200 && e.avgIntake < 4500, `Zufuhr ${e.avgIntake}`);
    assert.ok(Math.abs(e.avgIntake - e.avgBurned) < 300, "Bilanz unplausibel");
    assert.equal(hydrationSeries(json.wellness)?.field, "hydrationVolume");
  }
});

test("Lauf (E7): Pace-Kurve wird von kurz nach lang langsamer, Testlauf je Zyklus", () => {
  const runs = A2.json.rides.filter((r) => r.sport === "run");
  const curve = buildPaceCurve(runs);
  assert.ok(curve.length >= 4);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i].paceSec >= curve[i - 1].paceSec, `${curve[i].label} schneller als davor`);
  }
  assert.ok(runs.some((r) => r.name.startsWith("Testlauf")));
});

test("Schwimmen (E7): CSS-Test 400 + 200 m macht die CSS schätzbar", () => {
  const swims = A2.json.rides.filter((r) => r.sport === "swim");
  const tests = swims.filter((r) => r.name.startsWith("CSS-Test"));
  assert.ok(tests.some((r) => r.km === 0.4) && tests.some((r) => r.km === 0.2));
  const est = estimateThresholdSpeed(A2.json.rides, { sport: "swim" });
  // Schwelle 3,6 km/h ≈ 1:40/100 m — die Schätzung liegt in der Nähe
  assert.ok(est.speed > 3 && est.speed < 3.9, `CSS ${est.speed}`);
  assert.equal(new Set(A2.json.rides.map((r) => r.activityId)).size, A2.json.rides.length);
});

test("shortenActivity verlängert nie (kurze Testeinheiten bleiben kurz)", () => {
  const athlete = demoAthlete("demo2");
  const swim = A2.json.rides.find((r) => r.name === "CSS-Test 200 m");
  assert.equal(shortenActivity(swim, 0.5, athlete).min, swim.min);
});

test("Grundlagenanteil (E7): Wochen im Schnitt ≥ 78 % Z1+Z2, harte Einheit nicht nur Zielzone", async () => {
  const { weeklyZoneShares } = await import("../app/src/core/zones.js");
  const mondayOf = (r) => {
    const d = new Date(`${r.date}T00:00:00`);
    return addDaysISO(r.date, -((d.getDay() + 6) % 7));
  };
  for (const { json } of BOTH) {
    const weeks = weeklyZoneShares(json.rides, mondayOf, (a, b) => a.localeCompare(b));
    const avg = mean(weeks.map((w) => w.lowShare));
    assert.ok(avg >= 0.78, `Ø Grundlagenanteil ${Math.round(avg * 100)} %`);
    const vo2 = json.rides.find((r) => r.sport === "ride" && r.typ === "VO2max");
    const z = Object.fromEntries(vo2.zoneTimes.map((x) => [x.id, x.secs]));
    assert.ok((z.Z1 + z.Z2) / (vo2.min * 60) >= 0.5, "VO2max-Einheit ohne Ein-/Ausfahren");
    for (const r of json.rides.filter((x) => x.zoneTimes)) {
      const sum = r.zoneTimes.filter((x) => x.id !== "SS").reduce((s, x) => s + x.secs, 0);
      assert.equal(sum, r.min * 60);
    }
  }
});
