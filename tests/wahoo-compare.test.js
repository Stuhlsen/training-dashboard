/* Tests: scripts/lib/wahoo-compare.js (Fahrplan 19 B5)
   Reine Logik + Datei-Einlesen. Alles mit erfundenen Werten, Dateien nur in
   einem Temp-Ordner — nie data/. */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  percentDiff,
  wallClockMs,
  pairRides,
  compareRides,
  summarize,
  selectIcuWindow,
  readInput,
  formatReport,
  METRICS,
} from "../scripts/lib/wahoo-compare.js";

const TZ = "Europe/Berlin";

/** Wahoo-Fahrt (Format aus wahoo-fetch.js toRideMeta); Startzeit in UTC. */
const wahoo = (over = {}) => ({
  id: 1,
  startTime: "2026-10-20T06:00:00.000Z", // 08:00 Ortszeit (MESZ, UTC+2)
  date: "2026-10-20",
  distanceKm: 40,
  movingTimeSec: 3600,
  totalTimeSec: 3700,
  avgPower: 200,
  avgHeartRate: 140,
  avgCadence: 85,
  ...over,
});

/** intervals.icu-Fahrt (Format aus map-activity.js baseFields): Ortszeit ohne Zone. */
const icu = (over = {}) => ({
  date: "2026-10-20",
  startTime: "2026-10-20T08:00:30",
  km: 40,
  min: 60,
  watt: 200,
  hf: 140,
  kad: 85,
  ...over,
});

describe("percentDiff", () => {
  test("gleiche Werte → 0 %", () => {
    assert.equal(percentDiff(200, 200), 0);
  });
  test("Wahoo höher → positiv, relativ zu intervals.icu", () => {
    assert.equal(percentDiff(210, 200), 5);
  });
  test("Wahoo niedriger → negativ", () => {
    assert.equal(percentDiff(180, 200), -10);
  });
  test("fehlender Wert auf einer Seite → null (n/a), nicht 0", () => {
    assert.equal(percentDiff(null, 200), null);
    assert.equal(percentDiff(200, undefined), null);
    assert.equal(percentDiff(NaN, 200), null);
  });
  test("0 im Nenner oder bei Wahoo → null", () => {
    assert.equal(percentDiff(10, 0), null);
    assert.equal(percentDiff(0, 10), null);
  });
});

describe("wallClockMs", () => {
  test("UTC-Zeit wird in Ortszeit umgerechnet (Sommerzeit)", () => {
    assert.equal(wallClockMs("2026-07-01T06:00:00.000Z", TZ), Date.UTC(2026, 6, 1, 8, 0, 0));
  });
  test("Winterzeit: eine Stunde Unterschied statt zwei", () => {
    assert.equal(wallClockMs("2026-01-15T06:00:00Z", TZ), Date.UTC(2026, 0, 15, 7, 0, 0));
  });
  test("Zeit ohne Zone gilt schon als Ortszeit", () => {
    assert.equal(wallClockMs("2026-10-20T08:00:30", TZ), Date.UTC(2026, 9, 20, 8, 0, 30));
  });
  test("Zeit mit Offset wird umgerechnet", () => {
    assert.equal(wallClockMs("2026-10-20T08:00:00+02:00", TZ), Date.UTC(2026, 9, 20, 8, 0, 0));
  });
  test("ungültig → null", () => {
    assert.equal(wallClockMs("kaputt", TZ), null);
    assert.equal(wallClockMs(null, TZ), null);
  });
});

describe("pairRides", () => {
  test("passendes Paar wird zugeordnet", () => {
    const r = pairRides([wahoo()], [icu()], { timeZone: TZ });
    assert.equal(r.pairs.length, 1);
    assert.equal(r.onlyWahoo.length, 0);
    assert.equal(r.onlyIcu.length, 0);
  });

  test("Fahrt nur bei Wahoo", () => {
    const r = pairRides([wahoo()], [], { timeZone: TZ });
    assert.equal(r.onlyWahoo.length, 1);
    assert.equal(r.pairs.length, 0);
  });

  test("Fahrt nur bei intervals.icu", () => {
    const r = pairRides([], [icu()], { timeZone: TZ });
    assert.equal(r.onlyIcu.length, 1);
  });

  test("Startzeit zu weit weg → kein Paar, beide bleiben übrig", () => {
    const r = pairRides([wahoo()], [icu({ startTime: "2026-10-20T08:45:00" })], { timeZone: TZ });
    assert.equal(r.pairs.length, 0);
    assert.equal(r.onlyWahoo.length, 1);
    assert.equal(r.onlyIcu.length, 1);
  });

  test("Dauer passt nicht (gleiche Startzeit) → kein Paar", () => {
    const r = pairRides([wahoo()], [icu({ min: 20 })], { timeZone: TZ });
    assert.equal(r.pairs.length, 0);
  });

  test("falsche Zeitzone verhindert die Paarung (UTC statt Ortszeit)", () => {
    const r = pairRides([wahoo()], [icu()], { timeZone: "UTC" });
    assert.equal(r.pairs.length, 0);
  });

  test("zwei Fahrten am selben Tag werden richtig zugeordnet, ohne Doppelzuordnung", () => {
    const morgens = wahoo({ id: 1, startTime: "2026-10-20T06:00:00Z", movingTimeSec: 3600 });
    const abends = wahoo({ id: 2, startTime: "2026-10-20T15:00:00Z", movingTimeSec: 1800 });
    const icuAbends = icu({ startTime: "2026-10-20T17:01:00", min: 30, km: 15 });
    const icuMorgens = icu({ startTime: "2026-10-20T08:00:30", min: 60 });
    // Reihenfolge absichtlich vertauscht
    const r = pairRides([abends, morgens], [icuAbends, icuMorgens], { timeZone: TZ });
    assert.equal(r.pairs.length, 2);
    const byId = Object.fromEntries(r.pairs.map((p) => [p.wahoo.id, p.icu.min]));
    assert.deepEqual(byId, { 1: 60, 2: 30 });
  });

  test("zwei Wahoo-Fahrten um dieselbe intervals.icu-Fahrt: nur die nähere gewinnt", () => {
    const nah = wahoo({ id: 1, startTime: "2026-10-20T06:00:00Z" });
    const fern = wahoo({ id: 2, startTime: "2026-10-20T06:05:00Z" });
    const r = pairRides([fern, nah], [icu()], { timeZone: TZ });
    assert.equal(r.pairs.length, 1);
    assert.equal(r.pairs[0].wahoo.id, 1);
    assert.equal(r.onlyWahoo.length, 1);
    assert.equal(r.onlyWahoo[0].id, 2);
  });

  test("Randfall Mitternacht: Wahoo-UTC am Vortag, Ortszeit nach 00:00", () => {
    const w = wahoo({ startTime: "2026-10-20T22:30:00Z" }); // 21.10. 00:30 Ortszeit
    const i = icu({ date: "2026-10-21", startTime: "2026-10-21T00:30:10" });
    const r = pairRides([w], [i], { timeZone: TZ });
    assert.equal(r.pairs.length, 1);
  });

  test("Fahrt ohne Startzeit bleibt unzugeordnet, wird nicht verworfen", () => {
    const r = pairRides([wahoo()], [icu({ startTime: null })], { timeZone: TZ });
    assert.equal(r.pairs.length, 0);
    assert.equal(r.onlyIcu.length, 1);
    assert.equal(r.onlyWahoo.length, 1);
  });

  test("fehlende Dauer auf einer Seite: Paarung nur nach Startzeit", () => {
    const r = pairRides([wahoo({ movingTimeSec: null })], [icu()], { timeZone: TZ });
    assert.equal(r.pairs.length, 1);
  });
});

describe("compareRides", () => {
  test("perfektes Paar → überall 0 %", () => {
    const [row] = compareRides([{ wahoo: wahoo(), icu: icu() }], TZ);
    for (const m of METRICS) assert.equal(row.metrics[m.key].pct, 0, m.key);
    assert.equal(row.date, "2026-10-20");
    assert.equal(row.start, "08:00");
  });

  test("Abweichung mit Vorzeichen", () => {
    const [row] = compareRides(
      [{ wahoo: wahoo({ avgPower: 210, avgHeartRate: 126 }), icu: icu() }],
      TZ
    );
    assert.equal(row.metrics.power.pct, 5);
    assert.equal(row.metrics.heartRate.pct, -10);
  });

  test("Wert fehlt auf einer Seite → n/a (null)", () => {
    const [row] = compareRides(
      [{ wahoo: wahoo({ avgPower: null }), icu: icu({ hf: undefined }) }],
      TZ
    );
    assert.equal(row.metrics.power.pct, null);
    assert.equal(row.metrics.heartRate.pct, null);
  });

  test("0 in intervals.icu → n/a statt Division durch 0", () => {
    const [row] = compareRides([{ wahoo: wahoo(), icu: icu({ watt: 0 }) }], TZ);
    assert.equal(row.metrics.power.pct, null);
  });

  test("Dauer, Distanz und Kadenz werden wie bei intervals.icu gerundet", () => {
    // 3612 s = 60,2 min → 60; 40,04 km → 40,0; 85,4 → 85 — gleiche Rundung = 0 %
    const [row] = compareRides(
      [
        {
          wahoo: wahoo({ movingTimeSec: 3612, distanceKm: 40.04, avgCadence: 85.4 }),
          icu: icu(),
        },
      ],
      TZ
    );
    assert.equal(row.metrics.duration.pct, 0);
    assert.equal(row.metrics.distance.pct, 0);
    assert.equal(row.metrics.cadence.pct, 0);
  });

  test("vergleicht Durchschnitts-Power (watt), nicht die normalisierte Leistung (np)", () => {
    const [row] = compareRides([{ wahoo: wahoo(), icu: icu({ watt: 200, np: 260 }) }], TZ);
    assert.equal(row.metrics.power.icu, 200);
    assert.equal(row.metrics.power.pct, 0);
  });
});

describe("summarize", () => {
  const rows = [
    { metrics: { power: { pct: 4 }, heartRate: { pct: null } } },
    { metrics: { power: { pct: -2 }, heartRate: { pct: 1 } } },
    { metrics: { power: { pct: null }, heartRate: { pct: -3 } } },
  ];

  test("Anzahl, Mittel, mittlere absolute und größte Abweichung je Metrik", () => {
    const s = summarize(rows, [{ key: "power" }, { key: "heartRate" }]);
    assert.deepEqual(s.power, { n: 2, mean: 1, meanAbs: 3, max: 4 });
    assert.deepEqual(s.heartRate, { n: 2, mean: -1, meanAbs: 2, max: -3 });
  });

  test("größte Abweichung behält ihr Vorzeichen", () => {
    const s = summarize(
      [{ metrics: { power: { pct: 1 } } }, { metrics: { power: { pct: -7 } } }],
      [{ key: "power" }]
    );
    assert.equal(s.power.max, -7);
  });

  test("keine Werte → n = 0, Rest null", () => {
    const s = summarize([], [{ key: "power" }]);
    assert.deepEqual(s.power, { n: 0, mean: null, meanAbs: null, max: null });
  });
});

describe("selectIcuWindow", () => {
  const rides = [
    icu({ date: "2026-08-01", startTime: "2026-08-01T08:00:00" }),
    icu({ date: "2026-10-10", startTime: "2026-10-10T08:00:00" }),
  ];

  test("nimmt nur Fahrten ab dem Wahoo-Fenster (generatedAt − windowDays)", () => {
    const out = selectIcuWindow(rides, {
      generatedAt: "2026-10-29T12:00:00Z",
      windowDays: 30,
      rides: [wahoo()],
    });
    assert.deepEqual(
      out.map((r) => r.date),
      ["2026-10-10"]
    );
  });

  test("ohne Fensterangaben: ab der ersten Wahoo-Fahrt", () => {
    const out = selectIcuWindow(rides, { rides: [wahoo({ startTime: "2026-10-05T06:00:00Z" })] });
    assert.deepEqual(
      out.map((r) => r.date),
      ["2026-10-10"]
    );
  });
});

describe("readInput", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wahoo-cmp-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const put = (name, content) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, content, "utf-8");
    return f;
  };

  test("fehlende Datei → missing", () => {
    assert.equal(readInput(path.join(dir, "nix.json")).state, "missing");
  });
  test("leere Datei → missing", () => {
    assert.equal(readInput(put("leer.json", "  \n")).state, "missing");
  });
  test("kaputtes JSON → invalid", () => {
    assert.equal(readInput(put("kaputt.json", "{ nope")).state, "invalid");
  });
  test("gültiges JSON ohne rides-Liste → invalid", () => {
    assert.equal(readInput(put("form.json", '{"rides": 5}')).state, "invalid");
  });
  test("gültig → ok mit Daten", () => {
    const r = readInput(put("ok.json", '{"rides": []}'));
    assert.equal(r.state, "ok");
    assert.deepEqual(r.data.rides, []);
  });
});

describe("CLI scripts/compare-wahoo.js", () => {
  const CLI = fileURLToPath(new URL("../scripts/compare-wahoo.js", import.meta.url));
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wahoo-cli-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const put = (name, content) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, typeof content === "string" ? content : JSON.stringify(content), "utf-8");
    return f;
  };
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf-8" });

  test("keine Wahoo-Datei → ruhige Meldung, Exit 0", () => {
    const r = run(
      "--wahoo",
      path.join(dir, "nix.json"),
      "--rides",
      put("rides.json", { rides: [icu()] })
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Noch keine Wahoo-Daten/);
  });

  test("leere Wahoo-Liste → ruhige Meldung, Exit 0", () => {
    const r = run(
      "--wahoo",
      put("w.json", { rides: [] }),
      "--rides",
      put("rides.json", { rides: [icu()] })
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Noch keine Wahoo-Daten/);
  });

  test("kaputtes JSON → Exit 1", () => {
    const r = run(
      "--wahoo",
      put("w.json", "{ kaputt"),
      "--rides",
      put("rides.json", { rides: [] })
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /kaputt/);
  });

  test("rides.json fehlt → Hinweis, Exit 0", () => {
    const r = run(
      "--wahoo",
      put("w.json", { rides: [wahoo()] }),
      "--rides",
      path.join(dir, "nix.json")
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /rides\.json fehlt/);
  });

  test("Bericht: Tabelle mit Paar", () => {
    const r = run(
      "--wahoo",
      put("w.json", {
        generatedAt: "2026-10-29T12:00:00Z",
        windowDays: 30,
        rides: [wahoo({ avgPower: 210 })],
      }),
      "--rides",
      put("rides.json", { rides: [icu()] })
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\+5,0 %/);
    assert.match(r.stdout, /Zusammenfassung/);
  });

  test("--json gibt gültiges JSON auf stdout", () => {
    const r = run(
      "--json",
      "--wahoo",
      put("w.json", { generatedAt: "2026-10-29T12:00:00Z", windowDays: 30, rides: [wahoo()] }),
      "--rides",
      put("rides.json", { rides: [icu()] })
    );
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.pairs.length, 1);
    assert.equal(parsed.summary.power.n, 1);
  });

  test("unbekanntes Argument oder ungültige Zeitzone → Exit 2", () => {
    assert.equal(run("--nope").status, 2);
    assert.equal(run("--tz", "Mars/Olympus").status, 2);
  });
});

describe("formatReport", () => {
  test("Tabelle, Einzellisten und Zusammenfassung; keine Namen/IDs", () => {
    const result = pairRides(
      [wahoo({ avgPower: 210 }), wahoo({ id: 99, startTime: "2026-10-22T06:00:00Z" })],
      [
        icu({ name: "Geheimer Name" }),
        icu({ startTime: "2026-10-25T08:00:00", date: "2026-10-25" }),
      ],
      { timeZone: TZ }
    );
    const rows = compareRides(result.pairs, TZ);
    const text = formatReport({ rows, ...result, summary: summarize(rows, METRICS), timeZone: TZ });
    assert.match(text, /2026-10-20/);
    assert.match(text, /\+5,0 %/);
    assert.match(text, /nur Wahoo/i);
    assert.match(text, /nur intervals\.icu/i);
    assert.match(text, /Zusammenfassung/);
    assert.doesNotMatch(text, /Geheimer Name/);
    assert.doesNotMatch(text, /\b99\b/);
  });

  test("n/a steht als n/a in der Tabelle", () => {
    const result = pairRides([wahoo({ avgPower: null })], [icu()], { timeZone: TZ });
    const rows = compareRides(result.pairs, TZ);
    const text = formatReport({ rows, ...result, summary: summarize(rows, METRICS), timeZone: TZ });
    assert.match(text, /n\/a/);
  });
});
