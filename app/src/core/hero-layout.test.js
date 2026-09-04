/* Tests: core/hero-layout.js — Hero-Kachel-Anordnung (2D-Raster). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { HERO_GRID_COLS, HERO_TILE_SIZE, resolveTileLayout } from "./hero-layout.js";

test("resolveTileLayout: keine gespeicherte Anordnung -> kollisionsfreie Platzierung in kanonischer Reihenfolge", () => {
  const available = ["session", "weather"];
  const result = resolveTileLayout(null, available);
  assert.equal(result.length, 2);
  const byId = Object.fromEntries(result.map((p) => [p.i, p]));
  // Beide sind w:1, cols:3 -> landen nebeneinander in Zeile 0, nicht übereinander
  assert.equal(byId.session.y, 0);
  assert.equal(byId.weather.y, 0);
  assert.notEqual(byId.session.x, byId.weather.x);
});

test("resolveTileLayout: gespeicherte Positionen bleiben exakt erhalten, auch gestapelt", () => {
  const saved = [
    { i: "session", x: 0, y: 0 },
    { i: "weather", x: 0, y: HERO_TILE_SIZE.session.h },
  ];
  const available = ["session", "weather"];
  const result = resolveTileLayout(saved, available);
  assert.deepEqual(result, saved);
});

test("resolveTileLayout: gespeicherte Position zu einer inzwischen ausgeblendeten Kachel wird übersprungen", () => {
  const saved = [
    { i: "ftpRings", x: 0, y: 0 },
    { i: "session", x: 1, y: 0 },
  ];
  const available = ["session"];
  const result = resolveTileLayout(saved, available);
  assert.deepEqual(result, [{ i: "session", x: 1, y: 0 }]);
});

test("resolveTileLayout: neu sichtbare Kachel ohne gespeicherte Position wird kollisionsfrei einsortiert", () => {
  const saved = [{ i: "session", x: 0, y: 0 }];
  const available = ["session", "weather"];
  const result = resolveTileLayout(saved, available);
  const weather = result.find((p) => p.i === "weather");
  const session = result.find((p) => p.i === "session");
  assert.ok(weather);
  // weather darf sich nicht mit session überlappen
  const overlapX = weather.x < session.x + HERO_TILE_SIZE.session.w && session.x < weather.x + HERO_TILE_SIZE.weather.w;
  const overlapY = weather.y < session.y + HERO_TILE_SIZE.session.h && session.y < weather.y + HERO_TILE_SIZE.weather.h;
  assert.ok(!(overlapX && overlapY), "weather überlappt session");
});

test("resolveTileLayout: eine wide-Kachel (volle Breite) belegt alle Spalten", () => {
  const available = ["session", "weather", "powerScale"];
  const result = resolveTileLayout(null, available);
  const powerScale = result.find((p) => p.i === "powerScale");
  assert.equal(HERO_TILE_SIZE.powerScale.w, HERO_GRID_COLS);
  assert.equal(powerScale.x, 0);
});

test("resolveTileLayout: Kennzahlen-Kacheln (schmal) passen mehrere pro Zeile neben eine große Kachel", () => {
  const available = ["session", "metric-distance", "metric-rides", "metric-time"];
  const result = resolveTileLayout(null, available);
  const byId = Object.fromEntries(result.map((p) => [p.i, p]));
  // session ist BIG (4 von 12 Spalten) und startet bei x=0 -> die drei
  // schmalen Kennzahlen-Kacheln (je 2 Spalten) finden ab x=4 Platz in
  // derselben Zeile, überlappen sich nicht untereinander.
  assert.equal(byId.session.x, 0);
  assert.equal(byId["metric-distance"].y, 0);
  assert.equal(byId["metric-rides"].y, 0);
  assert.equal(byId["metric-time"].y, 0);
  const xs = [byId["metric-distance"].x, byId["metric-rides"].x, byId["metric-time"].x];
  assert.equal(new Set(xs).size, 3, "Kennzahlen-Kacheln müssen unterschiedliche Spalten belegen");
});

test("resolveTileLayout: leere gespeicherte Anordnung verhält sich wie null", () => {
  const available = ["session", "weather"];
  assert.deepEqual(resolveTileLayout([], available), resolveTileLayout(null, available));
});
