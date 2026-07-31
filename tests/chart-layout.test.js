/* Tests: Label-Layout gegen Überlappung (ui/charts/base.js — pure Funktionen)
   Hintergrund-Bug: Charts zeichneten X-Labels pro Balken; bei Athlet 2
   (27+ Kalenderwochen à "2026-KWxx") überlappte die X-Achse komplett. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickLabelIndices,
  weekDisplayLabels,
  fitsLabel,
  makeIndexScale,
  pathD,
  flattestIndex,
  presetWindow,
  brushHitTest,
  nextBrushWindow,
} from "../assets/js/ui/charts/base.js";

test("pickLabelIndices: hält den Mindestabstand ein und enthält immer den letzten Punkt", () => {
  // 27 Balken auf 714px Plotbreite (Screenshot-Fall) — Pitch ~26px < 40px minPx
  const xs = Array.from({ length: 27 }, (_, i) => 50 + i * 26.4 + 13.2);
  const picked = [...pickLabelIndices(xs, 40)].sort((a, b) => a - b);

  assert.ok(picked.includes(26), "letzter Index muss enthalten sein");
  for (let k = 1; k < picked.length; k++) {
    assert.ok(
      xs[picked[k]] - xs[picked[k - 1]] >= 40,
      `Abstand ${xs[picked[k]] - xs[picked[k - 1]]}px zwischen Index ${picked[k - 1]} und ${picked[k]} unterschreitet 40px`
    );
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
  assert.deepEqual(weekDisplayLabels(["2026-KW51", "2026-KW52", "2027-KW01", "2027-KW02"]), [
    "KW51",
    "KW52",
    "KW01 ’27",
    "KW02",
  ]);
});

test("weekDisplayLabels: Monats-Keys kompakt, Notion-Plan-1-Wochenlabels unverändert", () => {
  assert.deepEqual(weekDisplayLabels(["2026-07", "2026-08"]), ["07/26", "08/26"]);
  assert.deepEqual(weekDisplayLabels(["W1", "W3", "Vorb."]), ["W1", "W3", "Vorb."]);
  assert.deepEqual(weekDisplayLabels([]), []);
});

/* fitsLabel — Regression: HRV/RHF-Chart zeichnete "W0 →" / "← W0" an den
   beiden Grenzen einer kurzen Übergangswoche, die sich bei schmalem Segment
   überlappten. Segment-Labels werden jetzt unterdrückt statt überlappend
   gezeichnet, wenn der verfügbare Platz nicht reicht. */
test("fitsLabel: kurzer Text in breitem Segment passt", () => {
  assert.equal(fitsLabel(200, "Plan 1"), true);
});

test("fitsLabel: Label in zu schmalem Segment (kurze Übergangswoche) passt nicht", () => {
  // Realistischer Fall: W0-Segment nur ~16px breit (s. tests/power-curve-blocks.test.js-
  // Nachbarschaft zu echten Sync-Daten mit kurzer Übergangsphase)
  assert.equal(fitsLabel(16, "Übergang"), false);
});

test("fitsLabel: Grenzfall exakt an der Formel", () => {
  const text = "Plan 2";
  const exact = text.length * 5.4 + 8;
  assert.equal(fitsLabel(exact, text), true);
  assert.equal(fitsLabel(exact - 1, text), false);
});

/* makeIndexScale — Phase 5, Schritt 0 (docs/phase-5-konzept-explorer.md §2.2/§11):
   Indexskala über ein dichtes Tagesgerüst. invert() ist die Umkehrung, die
   im Bestand bislang nirgends existierte (Brushing/Crosshair brauchen sie). */
test("makeIndexScale: x()/invert() als Rundreise", () => {
  const scale = makeIndexScale({ ws: 0, we: 99, padLeft: 40, width: 720 });
  for (const i of [0, 1, 37, 99]) {
    assert.ok(Math.abs(scale.invert(scale.x(i)) - i) < 1e-9, `Rundreise schlägt fehl bei i=${i}`);
  }
  assert.equal(scale.x(0), 40); // linker Rand = padLeft
  assert.equal(scale.x(99), 40 + 720); // rechter Rand = padLeft + width
});

test("makeIndexScale: Ein-Tages-Fenster (ws === we) teilt nicht durch 0", () => {
  const scale = makeIndexScale({ ws: 5, we: 5, padLeft: 10, width: 380 });
  assert.equal(scale.x(5), 10); // span auf 1 erzwungen (Math.max(1, we-ws))
  assert.ok(Number.isFinite(scale.x(5)));
  assert.ok(Math.abs(scale.invert(scale.x(5)) - 5) < 1e-9);
});

test("makeIndexScale: Index außerhalb des Fensters extrapoliert linear, ohne Klemmung", () => {
  const scale = makeIndexScale({ ws: 10, we: 20, padLeft: 0, width: 100 });
  assert.ok(scale.x(30) > 100, "ein Index jenseits von we liegt jenseits der Plotbreite");
  assert.ok(scale.x(0) < 0, "ein Index vor ws liegt vor dem linken Rand");
});

/* pathD — d-String aus Punktpaaren, ersetzt polyline points= */
test("pathD: baut M/L-Pfad aus Punktpaaren", () => {
  assert.equal(
    pathD([
      [0, 10],
      [5, 20],
      [10, 0],
    ]),
    "M0,10 L5,20 L10,0"
  );
});

test("pathD: leere Punktliste ergibt leeren Pfad", () => {
  assert.equal(pathD([]), "");
});

/* flattestIndex — Labelplatzierung auf dem flachsten Kurvenstück */
test("flattestIndex: findet das eindeutig flache Stück einer Kurve", () => {
  // Werte fallen steil, verlaufen zwischen Index 4..7 flach, steigen dann wieder
  const values = [100, 80, 60, 45, 40, 39, 38, 38, 60, 90];
  const idx = flattestIndex(values, 0, values.length - 1, (v) => v, 0, 1);
  assert.ok(idx >= 4 && idx <= 7, `erwarte einen Index im flachen Bereich, bekam ${idx}`);
});

test("flattestIndex: null-Werte (Lücken) werden übersprungen, kein Crash", () => {
  const values = [10, null, null, 12, 12, 40];
  const idx = flattestIndex(values, 0, values.length - 1, (v) => v, 0, 1);
  assert.equal(idx, 3); // 12→12 ist die einzige bewertbare flache Kante
});

test("flattestIndex: keine zwei benachbarten bekannten Werte im Fenster → null", () => {
  const values = [10, null, null, null, 40];
  const idx = flattestIndex(values, 0, values.length - 1, (v) => v, 0, 1);
  assert.equal(idx, null);
});

/* presetWindow — Phase 5, Schritt 1 (docs/phase-5-konzept-explorer.md §4):
   Fenster-Indizes für die Brush-Presets. 30/90/365 enden immer am
   Zukunftshorizont (totalWe), Plan 2 ist ein exakter Datenbereich. */
test("presetWindow: 30/90/365 enden am Horizont, beginnen N Tage vor heute, geklemmt an totalWs", () => {
  const ctx = { totalWs: 0, totalWe: 200, todayIdx: 120 };
  assert.deepEqual(presetWindow("30", ctx), { ws: 90, we: 200 });
  assert.deepEqual(presetWindow("90", ctx), { ws: 30, we: 200 });
  // 365 Tage vor Index 120 liegt vor totalWs=0 → geklemmt
  assert.deepEqual(presetWindow("365", ctx), { ws: 0, we: 200 });
});

test("presetWindow: ohne bekannten todayIdx (<0) verankert am Horizontende", () => {
  const ctx = { totalWs: 0, totalWe: 200, todayIdx: -1 };
  assert.deepEqual(presetWindow("30", ctx), { ws: 170, we: 200 });
});

test('presetWindow: "all" liefert das volle Skelett', () => {
  assert.deepEqual(presetWindow("all", { totalWs: 0, totalWe: 200, todayIdx: 50 }), {
    ws: 0,
    we: 200,
  });
});

test('presetWindow: "plan2" nutzt den exakten Datenbereich, erweitert auf minW wenn zu schmal', () => {
  const ctx = { totalWs: 0, totalWe: 300, todayIdx: 250, plan2FromIdx: 40, plan2ToIdx: 43, minW: 7 };
  assert.deepEqual(presetWindow("plan2", ctx), { ws: 40, we: 47 });
});

test('presetWindow: "plan2" ohne Daten liefert null (Aufrufer blendet Button aus)', () => {
  assert.equal(presetWindow("plan2", { totalWs: 0, totalWe: 200, todayIdx: 50 }), null);
});

test("presetWindow: unbekanntes Preset liefert null", () => {
  assert.equal(presetWindow("nope", { totalWs: 0, totalWe: 200, todayIdx: 50 }), null);
});

/* brushHitTest — reine Trefferzuordnung im Indexraum */
test("brushHitTest: nahe an einem Rand trifft den jeweiligen Griff, sonst pan/outside", () => {
  assert.equal(brushHitTest(10, 10, 50, 2), "left");
  assert.equal(brushHitTest(49, 10, 50, 2), "right");
  assert.equal(brushHitTest(30, 10, 50, 2), "pan");
  assert.equal(brushHitTest(5, 10, 50, 2), "outside");
  assert.equal(brushHitTest(60, 10, 50, 2), "outside");
});

test("brushHitTest: bei sehr schmalem Fenster bleiben beide Griffe einzeln erreichbar", () => {
  // Fenster [10,12] mit Toleranz 1 — je am eigenen Rand greifbar
  assert.equal(brushHitTest(10, 10, 12, 1), "left");
  assert.equal(brushHitTest(12, 10, 12, 1), "right");
});

/* nextBrushWindow — reine Fensterarithmetik für einen laufenden Drag */
test("nextBrushWindow: left-Resize verschiebt nur den linken Rand, MIN_W-geklemmt", () => {
  const args = { idx: 45, startIdx: 30, startWs: 20, startWe: 50, totalWs: 0, totalWe: 100, minW: 7 };
  assert.deepEqual(nextBrushWindow("left", args), { ws: 35, we: 50 });
});

test("nextBrushWindow: left-Resize kann den rechten Rand nicht überschreiten (MIN_W)", () => {
  const args = { idx: 90, startIdx: 30, startWs: 20, startWe: 50, totalWs: 0, totalWe: 100, minW: 7 };
  assert.deepEqual(nextBrushWindow("left", args), { ws: 43, we: 50 });
});

test("nextBrushWindow: right-Resize verschiebt nur den rechten Rand, an totalWe geklemmt", () => {
  const args = { idx: 130, startIdx: 30, startWs: 20, startWe: 50, totalWs: 0, totalWe: 100, minW: 7 };
  assert.deepEqual(nextBrushWindow("right", args), { ws: 20, we: 100 });
});

test("nextBrushWindow: pan verschiebt beide Ränder gleich, Breite bleibt konstant", () => {
  const args = { idx: 40, startIdx: 30, startWs: 20, startWe: 50, totalWs: 0, totalWe: 100, minW: 7 };
  assert.deepEqual(nextBrushWindow("pan", args), { ws: 30, we: 60 });
});

test("nextBrushWindow: pan klemmt an den Gesamtgrenzen, ohne die Breite zu ändern", () => {
  const left = nextBrushWindow("pan", {
    idx: -50,
    startIdx: 30,
    startWs: 20,
    startWe: 50,
    totalWs: 0,
    totalWe: 100,
  });
  assert.deepEqual(left, { ws: 0, we: 30 }); // Breite 30 bleibt erhalten
  const right = nextBrushWindow("pan", {
    idx: 200,
    startIdx: 30,
    startWs: 20,
    startWe: 50,
    totalWs: 0,
    totalWe: 100,
  });
  assert.deepEqual(right, { ws: 70, we: 100 });
});
