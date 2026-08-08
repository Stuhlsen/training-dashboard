import { test } from "vitest";
import assert from "node:assert/strict";
import { weekDisplayLabels } from "./week-labels.js";

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
