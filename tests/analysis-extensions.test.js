/* Tests: Wellness-Sync-Mapping (scripts/lib/wellness.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapWellnessList,
  latestWeight,
  fieldCoverage,
  eftpFromSportInfo,
  pickHrvMethod,
} from "../scripts/lib/wellness.js";

/* ── Wellness-Sync-Mapping ──────────────────────────────────── */

test("mapWellnessList: erweiterte Felder, Tage ohne Werte entfallen, sortiert", () => {
  const raw = {
    "2026-07-02": {
      sleepSecs: 27000,
      sleepScore: 84.3,
      restingHR: 52,
      weight: 92.9,
      restingEnergy: 1755.6,
      activeEnergy: 640.2,
      hydrationVolume: 1.654,
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
  assert.equal(d2.sleepScore, 84);
  assert.equal(d2.weight, 92.9);
  assert.equal(d2.restingEnergy, 1756);
  assert.equal(d2.activeEnergy, 640);
  assert.equal(d2.hydrationVolume, 1.65); // Liter, 2 Nachkommastellen
  assert.equal(d2.eftp, 262);
  assert.equal(d2.hrv, null);
  // Satz enthält einen SDNN-Wert → Reihe gilt als SDNN
  assert.equal(list[0].hrvMethod, "sdnn");
  assert.equal(d2.hrvMethod, null, "kein HRV-Wert → keine Methode markiert");
});

test("mapWellnessList: nur rMSSD (Garmin) → hrv aus w.hrv, hrvMethod rmssd", () => {
  const raw = {
    "2026-08-29": { hrv: 78, restingHR: 51 },
    "2026-08-30": { hrv: 64, restingHR: 51 },
  };
  const list = mapWellnessList(raw);
  assert.equal(list.length, 2);
  assert.equal(list[0].hrv, 78);
  assert.equal(list[0].hrvMethod, "rmssd");
  assert.equal(list[1].hrv, 64);
  assert.equal(list[1].hrvMethod, "rmssd");
});

test("mapWellnessList: rMSSD-Reihe mit einem Fremd-SDNN-Tag → bleibt rMSSD, Garmin-Werte erhalten", () => {
  const raw = {
    "2026-08-28": { hrv: 78, restingHR: 51 },
    "2026-08-29": { hrv: 64, restingHR: 51 },
    "2026-08-30": { hrv: 83, restingHR: 51 },
    "2026-08-31": { hrvSDNN: 42, restingHR: 52 }, // Ausreißer (alter Sync)
  };
  const list = mapWellnessList(raw);
  assert.equal(list[0].hrv, 78);
  assert.equal(list[0].hrvMethod, "rmssd");
  assert.equal(list[2].hrv, 83, "Garmin-Tage werden nicht durch den Ausreißer genullt");
  assert.equal(list[3].hrv, null, "der SDNN-Ausreißer selbst trägt in einer rMSSD-Reihe kein hrv");
});

test("mapWellnessList: SDNN + rMSSD im selben Satz → SDNN gewinnt, rMSSD-Tage ohne hrv (kein Mischen)", () => {
  const raw = {
    "2026-07-01": { hrvSDNN: 43, restingHR: 50 },
    "2026-07-02": { hrv: 78, restingHR: 51 }, // nur rMSSD
  };
  const list = mapWellnessList(raw);
  assert.equal(list[0].hrv, 43);
  assert.equal(list[0].hrvMethod, "sdnn");
  assert.equal(list[1].hrv, null, "rMSSD wird nicht in eine SDNN-Reihe gemischt");
  assert.equal(list[1].hrvMethod, null);
  assert.equal(list[1].restingHR, 51, "Tag bleibt wegen restingHR erhalten");
});

test("pickHrvMethod: Mehrheit entscheidet, Gleichstand/leer → sdnn", () => {
  assert.equal(pickHrvMethod({ a: { hrv: 70 }, b: { hrv: 65 }, c: { hrv: 68 } }), "rmssd");
  // ein einzelner Fremd-SDNN-Tag kippt eine rMSSD-Reihe NICHT
  assert.equal(
    pickHrvMethod({ a: { hrv: 70 }, b: { hrv: 65 }, c: { hrv: 68 }, d: { hrvSDNN: 42 } }),
    "rmssd",
  );
  assert.equal(pickHrvMethod({ a: { hrvSDNN: 40 }, b: { hrv: 70 } }), "sdnn"); // Gleichstand
  assert.equal(pickHrvMethod({}), "sdnn");
});

test("mapWellnessList: sleepScore (gemessen) wird NICHT mit sleepQuality (self-reported) verwechselt", () => {
  // sleepQuality (kleine Integer-Skala, self-reported — analog soreness/
  // fatigue/stress/mood/motivation) ist absichtlich NICHT Teil des
  // objektiven Kanals, s. Kommentar in scripts/lib/wellness.js.
  const raw = { "2026-07-10": { sleepQuality: 3 } };
  const list = mapWellnessList(raw);
  assert.equal(list.length, 0, "sleepQuality allein macht den Tag nicht verwertbar");

  const raw2 = { "2026-07-11": { sleepScore: 91, sleepQuality: 2 } };
  const d = mapWellnessList(raw2)[0];
  assert.equal(d.sleepScore, 91, "liest sleepScore, nicht sleepQuality");
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
