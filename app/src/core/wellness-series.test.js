import { test } from "vitest";
import assert from "node:assert/strict";
import { mergedOwnPlanSeries } from "./wellness-series.js";

test("mergedOwnPlanSeries: kombiniert ride- und wellness-Werte, sortiert nach Datum", () => {
  const rides = [
    { dateISO: "2026-05-01", hrv: 60 },
    { dateISO: "2026-06-25", hrv: 65 },
  ];
  const wellness = [{ dateISO: "2026-06-30", hrv: 70 }];
  const result = mergedOwnPlanSeries(rides, wellness, "hrv", "hrv");
  assert.deepEqual(
    result.map((r) => r.dateISO),
    ["2026-05-01", "2026-06-25", "2026-06-30"],
  );
});

test("mergedOwnPlanSeries: wellness überschreibt rides am selben Datum", () => {
  const rides = [{ dateISO: "2026-06-25", hrv: 65 }];
  const wellness = [{ dateISO: "2026-06-25", hrv: 72 }];
  const result = mergedOwnPlanSeries(rides, wellness, "hrv", "hrv");
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 72);
});

test("mergedOwnPlanSeries: hrvMethod ist rmssd vor Plan-2-Start, sdnn danach", () => {
  const rides = [{ dateISO: "2026-05-01", hrv: 60 }];
  const wellness = [{ dateISO: "2026-06-25", hrv: 65 }];
  const result = mergedOwnPlanSeries(rides, wellness, "hrv", "hrv");
  assert.equal(result[0].hrvMethod, "rmssd");
  assert.equal(result[1].hrvMethod, "sdnn");
});

test("mergedOwnPlanSeries: unterstützt einen abweichenden ride-/wellness-Feldnamen (Ruhepuls)", () => {
  const rides = [{ dateISO: "2026-06-25", ruhepuls: 48 }];
  const wellness = [{ dateISO: "2026-06-26", restingHR: 47 }];
  const result = mergedOwnPlanSeries(rides, wellness, "ruhepuls", "restingHR");
  assert.deepEqual(
    result.map((r) => r.value),
    [48, 47],
  );
});

test("mergedOwnPlanSeries: liest w.date, wenn w.dateISO fehlt", () => {
  const wellness = [{ date: "2026-06-30", hrv: 70 }];
  const result = mergedOwnPlanSeries([], wellness, "hrv", "hrv");
  assert.equal(result[0].dateISO, "2026-06-30");
});

test("mergedOwnPlanSeries: leere Eingaben liefern ein leeres Array", () => {
  assert.deepEqual(mergedOwnPlanSeries([], [], "hrv", "hrv"), []);
});
