/* Tests: FTP-Retest-Prognose (core/ftp-forecast.js)
   Regression für die FTP-Projektions-Fixes: gemergte eFTP-Historie
   (Ride + Wellness) und die invertierte Ziel-Horizont-Prognose für
   Athleten ohne Plan-Retest-Termin (Athlet 2). */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eftpHistory,
  eftpHistoryFromWellness,
  mergeEftpHistories,
  forecastFtp,
  dateForTarget,
} from "../assets/js/core/ftp-forecast.js";

test("eftpHistory: pro Tag der höchste Wert, chronologisch sortiert, Fahrten ohne eftp ignoriert", () => {
  const rides = [
    { dateISO: "2026-06-02", eftp: 190 },
    { dateISO: "2026-06-01", eftp: 185 },
    { dateISO: "2026-06-01", eftp: 188 }, // zweite Fahrt selben Tags, höherer Wert gewinnt
    { dateISO: "2026-06-03", eftp: null },
  ];
  const hist = eftpHistory(rides);
  assert.deepEqual(
    hist.map((h) => h.date),
    ["2026-06-01", "2026-06-02"]
  );
  assert.equal(hist[0].eftp, 188);
});

test("eftpHistoryFromWellness: liest date/dateISO-Fallback und filtert null", () => {
  const wellness = [
    { dateISO: "2026-06-01", eftp: 190 },
    { date: "2026-06-02", eftp: 192 },
    { dateISO: "2026-06-03", eftp: null },
  ];
  const hist = eftpHistoryFromWellness(wellness);
  assert.deepEqual(
    hist.map((h) => h.date),
    ["2026-06-01", "2026-06-02"]
  );
});

test("mergeEftpHistories: pro Tag der höchste Wert aus beiden Quellen (Ride + Wellness)", () => {
  const rideHist = [
    { date: "2026-06-01", eftp: 190 },
    { date: "2026-06-02", eftp: 195 },
  ];
  const wellnessHist = [
    { date: "2026-06-01", eftp: 193 }, // höher als Ride-Wert desselben Tages
    { date: "2026-06-03", eftp: 198 }, // Tag nur in Wellness vorhanden
  ];
  const merged = mergeEftpHistories(rideHist, wellnessHist);
  assert.deepEqual(
    merged.map((h) => [h.date, h.eftp]),
    [
      ["2026-06-01", 193],
      ["2026-06-02", 195],
      ["2026-06-03", 198],
    ]
  );
});

test("mergeEftpHistories: leere/fehlende Quellen ergeben keinen Fehler", () => {
  assert.deepEqual(mergeEftpHistories([], []), []);
  assert.deepEqual(mergeEftpHistories(undefined, undefined), []);
  assert.deepEqual(mergeEftpHistories([{ date: "2026-06-01", eftp: 190 }], undefined), [
    { date: "2026-06-01", eftp: 190 },
  ]);
});

test("forecastFtp: braucht mindestens 3 Punkte, sonst null", () => {
  assert.equal(forecastFtp(null, "2026-09-19"), null);
  assert.equal(
    forecastFtp(
      [
        { date: "2026-06-01", eftp: 190 },
        { date: "2026-06-08", eftp: 192 },
      ],
      "2026-09-19"
    ),
    null
  );
});

test("forecastFtp: projiziert einen steigenden Trend über das Zieldatum hinaus", () => {
  const history = [
    { date: "2026-06-01", eftp: 190 },
    { date: "2026-06-08", eftp: 193 },
    { date: "2026-06-15", eftp: 196 },
    { date: "2026-06-22", eftp: 199 },
  ];
  const fc = forecastFtp(history, "2026-06-29");
  assert.ok(fc);
  assert.ok(fc.projected > 199, "Projektion sollte über den letzten Messwert hinaus steigen");
  assert.ok(fc.low <= fc.projected && fc.projected <= fc.high);
  assert.ok(fc.slopePerWeek > 0);
});

test("dateForTarget: Ziel bereits erreicht → reached mit days 0", () => {
  const history = [
    { date: "2026-06-01", eftp: 260 },
    { date: "2026-06-08", eftp: 262 },
    { date: "2026-06-15", eftp: 265 },
  ];
  const t = dateForTarget(history, 260);
  assert.deepEqual(t, { reached: true, date: "2026-06-15", days: 0, slopePerWeek: 0 });
});

test("dateForTarget: steigender Trend → Zieldatum in der Zukunft (Athlet-2-Ziel-Horizont ohne Plan-Retest)", () => {
  const history = [
    { date: "2026-06-01", eftp: 255 },
    { date: "2026-06-08", eftp: 258 },
    { date: "2026-06-15", eftp: 261 },
  ];
  const t = dateForTarget(history, 300);
  assert.ok(t);
  assert.equal(t.reached, true);
  assert.ok(t.date > "2026-06-15");
  assert.ok(t.slopePerWeek > 0);
});

test("dateForTarget: flacher/fallender Trend → reason 'flat', kein Zieldatum", () => {
  const history = [
    { date: "2026-06-01", eftp: 261 },
    { date: "2026-06-08", eftp: 261 },
    { date: "2026-06-15", eftp: 260 },
  ];
  const t = dateForTarget(history, 300);
  assert.deepEqual(t.reached, false);
  assert.equal(t.reason, "flat");
});

test("dateForTarget: Ziel liegt beim aktuellen Trend >12 Monate entfernt → reason 'horizon'", () => {
  const history = [
    { date: "2026-06-01", eftp: 261.0 },
    { date: "2026-06-08", eftp: 261.05 },
    { date: "2026-06-15", eftp: 261.1 },
  ];
  const t = dateForTarget(history, 300);
  assert.equal(t.reached, false);
  assert.equal(t.reason, "horizon");
});

test("dateForTarget: zu wenig Datenpunkte oder kein Ziel → null", () => {
  assert.equal(dateForTarget([{ date: "2026-06-01", eftp: 260 }], 300), null);
  assert.equal(
    dateForTarget(
      [
        { date: "2026-06-01", eftp: 260 },
        { date: "2026-06-08", eftp: 262 },
        { date: "2026-06-15", eftp: 265 },
      ],
      0
    ),
    null
  );
});
