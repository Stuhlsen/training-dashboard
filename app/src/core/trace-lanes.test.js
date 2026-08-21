/* Tests: core/trace-lanes.js — Geometrie-Engine für die Analyse-Tab-Spuren
   „Antworten & Spuren". Deckt die strukturellen Regeln aus dem Handoff ab
   (eine Skala pro Spur, Prognose gestrichelt, Ruhewert-Aggregate ohne
   Fadenkreuz), nicht jede Pixel-Nachkommastelle. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  buildValueLane,
  buildFitnessLane,
  buildTsbLane,
  buildTssBarsLane,
  buildZoneStackLane,
  buildDivergeLane,
  buildWeatherLane,
  buildLaneGeometry,
  TSB_OVERLOAD,
  TSB_BUILD_HIGH,
  TSB_FRESH_LOW,
  TSB_FRESH_HIGH,
} from "./trace-lanes.js";

test("buildValueLane/line: bricht bei null-Lücken in mehrere Liniensegmente auf", () => {
  const vals = [10, 12, null, 15, 16];
  const geo = buildValueLane("line", { vals }, 0, 4, 50, null);
  assert.equal(geo.lines.length, 2);
});

test("buildValueLane/line: area nur wenn series.area gesetzt ist", () => {
  const vals = [10, 12, 14];
  const withArea = buildValueLane("line", { vals, area: true }, 0, 2, 50, null);
  const withoutArea = buildValueLane("line", { vals }, 0, 2, 50, null);
  assert.equal(withArea.areas.length, 1);
  assert.equal(withoutArea.areas.length, 0);
});

test("buildValueLane/dots: goodAbove klassifiziert korrekt (Kadenz-artig, größer ist besser)", () => {
  const vals = [85, 92];
  const geo = buildValueLane("dots", { vals, target: 90, goodAbove: true }, 0, 1, 50, null);
  assert.equal(geo.dots[0].good, false);
  assert.equal(geo.dots[1].good, true);
});

test("buildValueLane/dots: goodAbove=false klassifiziert 'kleiner ist besser' (Entkopplung-artig)", () => {
  const vals = [3, 7];
  const geo = buildValueLane("dots", { vals, target: 5, goodAbove: false }, 0, 1, 50, null);
  assert.equal(geo.dots[0].good, true);
  assert.equal(geo.dots[1].good, false);
});

test("buildValueLane: Fadenkreuz liest den Cursor-Wert, sonst den letzten bekannten Wert", () => {
  const vals = [10, null, 14];
  const withCursor = buildValueLane("line", { vals }, 0, 2, 50, 2);
  assert.equal(withCursor.readValue, 14);
  assert.equal(withCursor.readKind, "cursor");
  const withoutCursor = buildValueLane("line", { vals }, 0, 2, 50, null);
  assert.equal(withoutCursor.readValue, 14);
  assert.equal(withoutCursor.readKind, "last");
});

test("buildFitnessLane: Linien nach todayIdx sind gestrichelt (Prognose)", () => {
  const ctlVals = [40, 41, 42, 43];
  const atlVals = [30, 31, 32, 33];
  const geo = buildFitnessLane({ ctlVals, atlVals, todayIdx: 2 }, 0, 3, 80, null);
  const dashed = geo.lines.filter((l) => l.dash !== "0");
  const solid = geo.lines.filter((l) => l.dash === "0");
  assert.ok(dashed.length >= 2, "CTL und ATL sollten je ein gestricheltes Prognose-Segment haben");
  assert.ok(solid.length >= 2);
});

test("buildTsbLane: liefert die drei Korridorbänder in der Handoff-Reihenfolge", () => {
  const tsbVals = [-30, -20, -10, 0, 10, 20];
  const geo = buildTsbLane({ tsbVals, todayIdx: 5 }, 0, 5, 82, null);
  assert.deepEqual(
    geo.zones.map((z) => z.band),
    ["overload", "build", "fresh"]
  );
});

test("buildFitnessLane: beschriftet CTL/ATL am rechten Kurvenende", () => {
  const ctlVals = [40, 41, 42];
  const atlVals = [30, 31, 45];
  const geo = buildFitnessLane({ ctlVals, atlVals, todayIdx: 2 }, 0, 2, 80, null);
  assert.deepEqual(
    geo.labels.map((l) => l.text),
    ["CTL", "ATL"]
  );
});

test("buildTsbLane: unterdrückt das Überlast-Label, wenn es zu nah am unteren Skalenrand liegt", () => {
  const tsbVals = [0, 1, 2];
  const geo = buildTsbLane({ tsbVals, todayIdx: 2 }, 0, 2, 82, null);
  // Werte liegen nahe 0 -> tmin bleibt beim Default (-30), das Überlast-Label
  // (nahe TSB_OVERLOAD=-25) liegt dann zu nah am Rand und wird gefiltert —
  // Aufbau- und Frische-Label bleiben.
  assert.deepEqual(
    geo.labels.map((l) => l.role),
    ["fresh", "build"]
  );
});

test("buildTsbLane: readKind klassifiziert den Cursor-Wert korrekt in den Korridor", () => {
  const tsbVals = [TSB_OVERLOAD - 5, TSB_BUILD_HIGH - 1, 0, TSB_FRESH_LOW + 1, TSB_FRESH_HIGH + 5];
  const geo = buildTsbLane({ tsbVals, todayIdx: 4 }, 0, 4, 82, 0);
  assert.equal(geo.readKind, "overload");
  const geoFresh = buildTsbLane({ tsbVals, todayIdx: 4 }, 0, 4, 82, 4);
  assert.equal(geoFresh.readKind, "too-fresh");
});

test("buildTssBarsLane: Balken nach todayIdx sind 'planned', davor 'actual'", () => {
  const vals = [50, 60, 70, 55];
  const geo = buildTssBarsLane({ vals, todayIdx: 1 }, 0, 3, 54, null);
  const byIdx = geo.bars.map((b) => b.kind);
  assert.deepEqual(byIdx, ["actual", "actual", "planned", "planned"]);
});

test("buildTssBarsLane: Ruhewert ohne Fadenkreuz ist die 7-Tage-Summe, nicht '—'", () => {
  const vals = [10, 20, 30];
  const geo = buildTssBarsLane({ vals, todayIdx: 2 }, 0, 2, 54, null);
  assert.equal(geo.readValue, 60);
  assert.equal(geo.readKind, "sum7");
});

test("buildZoneStackLane: zeichnet eine Zielband-Linie bei targetShare", () => {
  const weeks = [{ startIdx: 0, endIdx: 6, low: 0.8, mid: 0.15, high: 0.05 }];
  const geo = buildZoneStackLane({ weeks }, 0, 6, 46, null, 0.8);
  assert.equal(geo.hlines.length, 1);
  assert.equal(geo.hlines[0].kind, "target");
});

test("buildDivergeLane: Balken oberhalb/unterhalb der Nulllinie sind pos/neg klassifiziert", () => {
  const vals = [200, -300];
  const geo = buildDivergeLane({ vals }, 0, 1, 52, null);
  assert.deepEqual(
    geo.bars.map((b) => b.kind),
    ["pos", "neg"]
  );
});

test("buildDivergeLane: Ruhewert ohne Fadenkreuz ist der 30-Tage-Durchschnitt", () => {
  const vals = [100, -300, 200];
  const geo = buildDivergeLane({ vals }, 0, 2, 52, null);
  assert.equal(geo.readValue, (100 - 300 + 200) / 3);
  assert.equal(geo.readKind, "avg30");
});

test("buildWeatherLane: markiert heiße Tage (über hotThreshold) als 'bad'-Punkt", () => {
  const tempVals = [20, 26];
  const windVals = [10, 10];
  const rainVals = [0, 0];
  const geo = buildWeatherLane({ tempVals, windVals, rainVals }, 0, 1, 50, null, { hotThreshold: 24 });
  const hot = geo.dots.find((d) => d.kind === "hot");
  assert.ok(hot);
  assert.equal(hot.good, false);
});

test("buildWeatherLane: Ruhewert ohne Fadenkreuz zählt Tage über der Hitze-Schwelle", () => {
  const tempVals = [20, 26, 28];
  const windVals = [0, 0, 0];
  const rainVals = [0, 0, 0];
  const geo = buildWeatherLane({ tempVals, windVals, rainVals }, 0, 2, 50, null, { hotThreshold: 24 });
  assert.equal(geo.readValue, 2);
  assert.equal(geo.readKind, "hot-days");
});

test("buildLaneGeometry: Dispatcher leitet auf die passende kind-Funktion", () => {
  const fitness = buildLaneGeometry({ kind: "fitness", ctlVals: [1, 2], atlVals: [1, 1], todayIdx: 1 }, 0, 1, 80, null);
  assert.ok("lines" in fitness);
  const line = buildLaneGeometry({ kind: "line", vals: [1, 2] }, 0, 1, 50, null);
  assert.ok("lines" in line);
});
