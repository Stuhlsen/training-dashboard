/* Tests: Label-Layout gegen Überlappung (ui/charts/base.js — pure Funktionen)
   Hintergrund-Bug: Charts zeichneten X-Labels pro Balken; bei Athlet 2
   (27+ Kalenderwochen à "2026-KWxx") überlappte die X-Achse komplett. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLabelIndices, weekDisplayLabels } from "../assets/js/ui/charts/base.js";

test("pickLabelIndices: hält den Mindestabstand ein und enthält immer den letzten Punkt", () => {
  // 27 Balken auf 714px Plotbreite (Screenshot-Fall) — Pitch ~26px < 40px minPx
  const xs = Array.from({ length: 27 }, (_, i) => 50 + i * 26.4 + 13.2);
  const picked = [...pickLabelIndices(xs, 40)].sort((a, b) => a - b);

  assert.ok(picked.includes(26), "letzter Index muss enthalten sein");
  for (let k = 1; k < picked.length; k++) {
    assert.ok(xs[picked[k]] - xs[picked[k - 1]] >= 40,
      `Abstand ${xs[picked[k]] - xs[picked[k - 1]]}px zwischen Index ${picked[k - 1]} und ${picked[k]} unterschreitet 40px`);
  }
  assert.ok(picked.length < 27, "es muss ausgedünnt werden");
  assert.ok(picked.length >= 10, "aber nicht übermäßig");
});

test("pickLabelIndices: keine End-Kollision — vorletzter Kandidat weicht dem letzten", () => {
  // Modulo-Step-Guards zeichneten i%ls===0 UND den letzten → Kollision möglich.
  const xs = [0, 39, 78, 117, 130]; // 117 läge nur 13px vor dem letzten (130)
  const picked = pickLabelIndices(xs, 38);
  assert.ok(picked.has(4));
  assert.ok(!picked.has(3), "Index 3 kollidiert mit dem letzten und muss entfallen");
});

test("pickLabelIndices: genug Platz → alle Labels; leere Eingabe → leer", () => {
  const xs = [0, 100, 200, 300];
  assert.equal(pickLabelIndices(xs, 38).size, 4);
  assert.equal(pickLabelIndices([], 38).size, 0);
  assert.deepEqual([...pickLabelIndices([42], 38)], [0]);
});

test("weekDisplayLabels: Kalenderwochen kompakt, Jahreswechsel markiert", () => {
  assert.deepEqual(
    weekDisplayLabels(["2026-KW51", "2026-KW52", "2027-KW01", "2027-KW02"]),
    ["KW51", "KW52", "KW01 ’27", "KW02"]
  );
});

test("weekDisplayLabels: Monats-Keys kompakt, Plan-Wochen unverändert", () => {
  assert.deepEqual(weekDisplayLabels(["2026-07", "2026-08"]), ["07/26", "08/26"]);
  assert.deepEqual(weekDisplayLabels(["W1", "P2-W3", "Vorb."]), ["W1", "P2-W3", "Vorb."]);
  assert.deepEqual(weekDisplayLabels([]), []);
});
