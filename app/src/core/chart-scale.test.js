/* Tests: core/chart-scale.js — Pixel-Mathematik für Charts (Etappe 8a)
   Hintergrund: docs/phase-5-konzept-explorer.md §1.4/§2.2 — makeIndexScale()
   ersetzt eine Zeitstempelskala, pickLabelIndices() dünnt Achsen-Labels aus. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { makeIndexScale, pathD, pickLabelIndices } from "./chart-scale.js";

test("makeIndexScale: x()/invert() sind eine Rundreise über das Fenster", () => {
  const scale = makeIndexScale({ ws: 0, we: 10, padLeft: 40, width: 200 });
  for (const i of [0, 2.5, 5, 10]) {
    assert.equal(Math.round(scale.invert(scale.x(i)) * 1e6) / 1e6, i);
  }
});

test("makeIndexScale: x(ws) trifft padLeft, x(we) trifft padLeft+width", () => {
  const scale = makeIndexScale({ ws: 5, we: 15, padLeft: 40, width: 200 });
  assert.equal(scale.x(5), 40);
  assert.equal(scale.x(15), 240);
});

test("makeIndexScale: invert() extrapoliert unbegrenzt über das Fenster hinaus", () => {
  const scale = makeIndexScale({ ws: 0, we: 10, padLeft: 0, width: 100 });
  assert.equal(scale.invert(-10), -1);
  assert.equal(scale.invert(110), 11);
});

test("makeIndexScale: Ein-Tages-Fenster (ws === we) bricht nicht (span mind. 1)", () => {
  const scale = makeIndexScale({ ws: 3, we: 3, padLeft: 0, width: 100 });
  assert.equal(scale.x(3), 0);
  assert.equal(Number.isFinite(scale.x(4)), true);
});

test("pathD: baut einen M/L-Pfad aus Punktpaaren", () => {
  assert.equal(pathD([[0, 0], [10, 5], [20, 0]]), "M0,0 L10,5 L20,0");
});

test("pathD: leere Punktliste liefert leeren String", () => {
  assert.equal(pathD([]), "");
});

test("pickLabelIndices: Mindestabstand wird eingehalten, letzter Punkt immer dabei", () => {
  const xs = [0, 5, 10, 40, 80, 120];
  const picked = pickLabelIndices(xs, 38);
  assert.equal(picked.has(xs.length - 1), true);
  const sorted = [...picked].sort((a, b) => a - b);
  for (let k = 1; k < sorted.length; k++) {
    assert.ok(xs[sorted[k]] - xs[sorted[k - 1]] >= 38);
  }
});

test("pickLabelIndices: leere Eingabe liefert leeres Set", () => {
  assert.deepEqual(pickLabelIndices([], 38), new Set());
});

test("pickLabelIndices: einzelner Punkt ist immer der letzte und wird gewählt", () => {
  assert.deepEqual(pickLabelIndices([42], 38), new Set([0]));
});
