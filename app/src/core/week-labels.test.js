import { test } from "vitest";
import assert from "node:assert/strict";
import { rideWeekKey, weekDisplayLabels } from "./week-labels.js";

test("weekDisplayLabels kürzt ISO-Kalenderwochen auf 'KWnn'", () => {
  assert.deepEqual(weekDisplayLabels(["2026-KW27", "2026-KW28"]), ["KW27", "KW28"]);
});

test("weekDisplayLabels markiert einen Jahreswechsel innerhalb der Liste", () => {
  assert.deepEqual(weekDisplayLabels(["2026-KW52", "2027-KW01", "2027-KW02"]), [
    "KW52",
    "KW01 '27",
    "KW02",
  ]);
});

test("weekDisplayLabels kürzt Monats-Buckets auf 'MM/JJ'", () => {
  assert.deepEqual(weekDisplayLabels(["2026-07", "2026-08"]), ["07/26", "08/26"]);
});

test("weekDisplayLabels lässt unbekannte Formate unverändert", () => {
  assert.deepEqual(weekDisplayLabels(["Vor W1", "W3"]), ["Vor W1", "W3"]);
});

test("weekDisplayLabels: leere/undefined Liste ergibt leeres Array", () => {
  assert.deepEqual(weekDisplayLabels([]), []);
  assert.deepEqual(weekDisplayLabels(undefined), []);
});

test("rideWeekKey nimmt die Plan-Woche, wenn die Fahrt eine trägt", () => {
  assert.equal(rideWeekKey({ week: "W3", dateISO: "2026-07-08" }), "W3");
});

test("rideWeekKey fällt ohne Plan-Woche auf die ISO-Kalenderwoche zurück", () => {
  assert.equal(rideWeekKey({ week: null, dateISO: "2026-09-22" }), "2026-KW39");
});

test("rideWeekKey liefert null ohne Plan-Woche und ohne Datum", () => {
  assert.equal(rideWeekKey({ week: null, dateISO: null }), null);
});
