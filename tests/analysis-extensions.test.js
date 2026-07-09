/* Tests: Analyse-Erweiterungen bestehender Module — Zonen-Gesamtverteilung
   + IF-Fallback + Formklassifikation (core/zones.js), Decoupling-Trend
   (core/efficiency.js), Ziel-Horizont + Wellness-eFTP (core/ftp-forecast.js),
   Wochen-Einordnung (core/loadguard.js), Wellness-Sync-Mapping
   (scripts/lib/wellness.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  overallZoneShares,
  overallBandsFromIF,
  distributionShape,
  rideIF,
  LOW_INTENSITY_TARGET,
} from "../assets/js/core/zones.js";
import { decouplingTrend, DECOUPLING_MIN_POINTS } from "../assets/js/core/efficiency.js";
import {
  dateForTarget,
  eftpHistoryFromWellness,
  mergeEftpHistories,
} from "../assets/js/core/ftp-forecast.js";
import { describeWeek } from "../assets/js/core/loadguard.js";
import {
  mapWellnessList,
  latestWeight,
  fieldCoverage,
  eftpFromSportInfo,
} from "../scripts/lib/wellness.js";

/* ── Zonen ──────────────────────────────────────────────────── */

test("overallZoneShares: aggregiert über Fahrten, null ohne zoneTimes", () => {
  const rides = [
    { zoneTimes: [3600, 3600, 0, 0, 0] }, // 2h low
    { zoneTimes: [0, 0, 1800, 0, 0] }, // 0.5h mid
    { zoneTimes: [{ id: "Z5", secs: 900 }] }, // 0.25h high? Nein: Index 0 = Z1
  ];
  // Objektformat: Index bestimmt die Zone — [900] ist Z1 (low)
  const s = overallZoneShares(rides);
  assert.ok(s);
  assert.equal(s.low, 3600 + 3600 + 900);
  assert.equal(s.mid, 1800);
  assert.equal(s.nRides, 3);
  assert.equal(overallZoneShares([{ km: 50 }]), null);
});

test("rideIF: bevorzugt r.if, leitet sonst aus NP/FTP ab", () => {
  assert.equal(rideIF({ if: 0.84 }), 0.84);
  assert.equal(rideIF({ np: 163, ftpWatt: 193 }), 163 / 193);
  assert.equal(rideIF({ np: 163 }), null); // ohne FTP keine Ableitung
  assert.equal(rideIF({ km: 10 }), null);
});

test("overallBandsFromIF: Dauer-gewichtete Näherung, IF aus NP/FTP abgeleitet", () => {
  const rides = [
    { if: 0.6, min: 120 }, // low: 7200s (direktes IF)
    { np: 175, ftpWatt: 193, min: 60 }, // IF≈0.91 → mid: 3600s (abgeleitet)
    { if: 1.1, min: 30 }, // high: 1800s
    { min: 60 }, // kein IF ableitbar → fällt raus
  ];
  const b = overallBandsFromIF(rides);
  assert.equal(b.low, 7200);
  assert.equal(b.mid, 3600);
  assert.equal(b.high, 1800);
  assert.equal(b.source, "if");
  assert.equal(b.nRides, 3);
  assert.equal(overallBandsFromIF([{ km: 10 }]), null);
});

test("distributionShape: polarisiert / pyramidal / schwellenlastig", () => {
  assert.equal(distributionShape({ low: 0.85, mid: 0.05, high: 0.1 }).shape, "polarisiert");
  assert.equal(distributionShape({ low: 0.82, mid: 0.13, high: 0.05 }).shape, "pyramidal");
  assert.equal(distributionShape({ low: 0.45, mid: 0.5, high: 0.05 }).shape, "schwellenlastig");
  assert.equal(
    distributionShape({ low: 0.85, mid: 0.05, high: 0.1 }).onTarget,
    0.85 >= LOW_INTENSITY_TARGET
  );
  assert.equal(distributionShape({ low: 0.6, mid: 0.3, high: 0.1 }).onTarget, false);
});

/* ── Decoupling-Trend ───────────────────────────────────────── */

test("decouplingTrend: nur Steady-State-Fahrten, Median + stabiler Anteil", () => {
  const mk = (date, value, typ = "Z2 Lang", min = 90) => ({
    dateISO: date,
    decoupling: value,
    typ,
    min,
  });
  const rides = [
    mk("2026-06-01", 6.0),
    mk("2026-06-08", 5.0),
    mk("2026-06-15", 4.0),
    mk("2026-06-22", 3.0),
    mk("2026-06-29", 2.0),
    mk("2026-06-30", 9.9, "VO2max"), // falscher Typ → raus
    mk("2026-07-01", 9.9, "Z2 Lang", 45), // zu kurz → raus
  ];
  const t = decouplingTrend(rides);
  assert.ok(t);
  assert.equal(t.n, 5);
  assert.equal(t.median, 4);
  assert.equal(t.stableShare, 60); // 3 von 5 unter 5%
  assert.ok(t.slopePer30d < 0); // fallender Trend
  assert.equal(decouplingTrend(rides.slice(0, DECOUPLING_MIN_POINTS - 1)), null);
});

/* ── FTP: Ziel-Horizont + Wellness-Quelle ───────────────────── */

test("dateForTarget: steigender Trend → Zieldatum, flacher Trend → unreachable", () => {
  // +1 W pro Woche ab 250W
  const hist = Array.from({ length: 8 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 4, 1 + i * 7)).toISOString().split("T")[0],
    eftp: 250 + i,
  }));
  const r = dateForTarget(hist, 265);
  assert.equal(r.reached, true);
  assert.ok(r.days > 0);
  assert.ok(r.date > hist[hist.length - 1].date);

  const flat = hist.map((h) => ({ ...h, eftp: 250 }));
  const rf = dateForTarget(flat, 265);
  assert.equal(rf.reached, false);
  assert.equal(rf.reason, "flat");

  // Ziel bereits erreicht → sofort
  const done = dateForTarget(hist, 255);
  assert.equal(done.reached, true);
  assert.equal(done.days, 0);

  assert.equal(dateForTarget(hist.slice(0, 2), 265), null); // zu wenig Daten
});

test("eftpHistoryFromWellness + mergeEftpHistories: Tageswerte, pro Tag Maximum", () => {
  const wellness = [
    { date: "2026-06-02", eftp: 200 },
    { date: "2026-06-01", eftp: 198 },
    { date: "2026-06-03", eftp: null },
  ];
  const h = eftpHistoryFromWellness(wellness);
  assert.equal(h.length, 2);
  assert.equal(h[0].date, "2026-06-01");

  const merged = mergeEftpHistories(h, [
    { date: "2026-06-01", eftp: 202 },
    { date: "2026-06-05", eftp: 205 },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((x) => x.date === "2026-06-01").eftp, 202);
});

/* ── LoadGuard-Wocheneinordnung ─────────────────────────────── */

test("describeWeek: benennt das treibende Signal", () => {
  assert.equal(describeWeek({ ramp: 9, monotony: 1.2, risk: "high" }).label, "Übersteuert");
  assert.equal(describeWeek({ ramp: 4, monotony: 2.6, risk: "high" }).label, "Eintönig hart");
  assert.equal(describeWeek({ ramp: 7, monotony: 1.2, risk: "caution" }).label, "Zügiger Aufbau");
  assert.equal(describeWeek({ ramp: 4, monotony: 2.1, risk: "caution" }).label, "Wenig Rhythmus");
  assert.equal(describeWeek({ ramp: -3, monotony: 1.0, risk: "ok" }).label, "Entlastung");
  assert.equal(describeWeek({ ramp: 4, monotony: 1.0, risk: "ok" }).label, "Produktiver Aufbau");
  assert.equal(describeWeek({ ramp: 1, monotony: 1.0, risk: "ok" }).label, "Stabil");
});

/* ── Wellness-Sync-Mapping ──────────────────────────────────── */

test("mapWellnessList: erweiterte Felder, Tage ohne Werte entfallen, sortiert", () => {
  const raw = {
    "2026-07-02": {
      sleepSecs: 27000,
      restingHR: 52,
      weight: 92.9,
      restingEnergy: 1755.6,
      activeEnergy: 640.2,
      hydrationVolume: 2200,
      sportInfo: [{ type: "Ride", eftp: 262.3 }],
    },
    "2026-07-01": { hrvSDNN: 43 },
    "2026-07-03": {}, // komplett leer → raus
  };
  const list = mapWellnessList(raw);
  assert.equal(list.length, 2);
  assert.equal(list[0].date, "2026-07-01");
  const d2 = list[1];
  assert.equal(d2.sleepHours, 7.5);
  assert.equal(d2.weight, 92.9);
  assert.equal(d2.restingEnergy, 1756);
  assert.equal(d2.activeEnergy, 640);
  assert.equal(d2.hydrationVolume, 2200);
  assert.equal(d2.eftp, 262);
  assert.equal(d2.hrv, null);
});

test("eftpFromSportInfo: nur Ride-Eintrag mit eftp > 0", () => {
  assert.equal(
    eftpFromSportInfo({
      sportInfo: [
        { type: "Run", eftp: 300 },
        { type: "Ride", eftp: 261.7 },
      ],
    }),
    262
  );
  assert.equal(eftpFromSportInfo({ sportInfo: [{ type: "Ride", eftp: 0 }] }), null);
  assert.equal(eftpFromSportInfo({}), null);
});

test("latestWeight + fieldCoverage: neuester Wert, non-null-Zählung", () => {
  const raw = {
    "2026-06-01": { weight: 93.4 },
    "2026-06-20": { weight: 92.9 },
    "2026-06-25": { sleepSecs: 27000 },
  };
  const lw = latestWeight(raw);
  assert.equal(lw.weight, 92.9);
  assert.equal(lw.date, "2026-06-20");
  assert.equal(latestWeight({}), null);

  const cov = fieldCoverage(mapWellnessList(raw));
  assert.equal(cov.weight, 2);
  assert.equal(cov.sleepHours, 1);
  assert.equal(cov.activeEnergy, 0);
});
