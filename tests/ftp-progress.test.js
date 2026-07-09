/* Tests: Hero-Signaturen — Zonen-Band, FTP-Ring, nächste Einheit
   (core/ftp-progress.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zoneSegments,
  pinPercent,
  ringProgress,
  nextPlannedSession,
} from "../assets/js/core/ftp-progress.js";

test("zoneSegments: Segmente decken die Skala vollständig ab (Summe 100%)", () => {
  const segs = zoneSegments(193, 300);
  const total = segs.reduce((s, x) => s + x.pct, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
  assert.deepEqual(
    segs.map((s) => s.cls),
    ["z1", "z2", "ss", "thr", "vo2", "rest"]
  );
  // Z1-Grenze: 0.55 × 193 = 106.15 W → 35.38 % der 300er-Skala
  assert.ok(Math.abs(segs[0].pct - ((193 * 0.55) / 300) * 100) < 1e-9);
});

test("zoneSegments: hohe FTP kappt am Skalenende, kein rest-Segment", () => {
  // 1.20 × 265 = 318 > 300 → VO2-Segment endet an der Skala
  const segs = zoneSegments(265, 300);
  assert.equal(segs[segs.length - 1].cls, "vo2");
  const total = segs.reduce((s, x) => s + x.pct, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test("zoneSegments: ungültige Eingaben → leer", () => {
  assert.deepEqual(zoneSegments(null, 300), []);
  assert.deepEqual(zoneSegments(193, 0), []);
});

test("pinPercent klemmt auf 0–100", () => {
  assert.equal(pinPercent(150, 300), 50);
  assert.equal(pinPercent(400, 300), 100);
  assert.equal(pinPercent(-5, 300), 0);
  assert.equal(pinPercent(null, 300), null);
});

test("ringProgress: Anteil zwischen Basis und Ziel, geklemmt", () => {
  assert.equal(ringProgress(199, 166, 210), (199 - 166) / (210 - 166));
  assert.equal(ringProgress(166, 166, 210), 0);
  assert.equal(ringProgress(230, 166, 210), 1);
  assert.equal(ringProgress(null, 166, 210), 0);
  assert.equal(ringProgress(100, 200, 200), 1); // goal <= base → voll
});

const SESSIONS = [
  { date: "2026-07-02", name: "Sweet Spot 3×12", typ: "Sweet Spot" },
  { date: "2026-07-04", name: "Z2 Lang", typ: "Z2 Lang", km: 85 },
  { date: "2026-07-07", name: "Gruppenfahrt", typ: "Gruppenfahrt" },
];

test("nextPlannedSession: heute fällige Einheit gewinnt und ist isToday", () => {
  const next = nextPlannedSession(SESSIONS, {}, new Set(["2026-07-02"]), "2026-07-04");
  assert.equal(next.name, "Z2 Lang");
  assert.equal(next.isToday, true);
});

test("nextPlannedSession: erledigte und vergangene Termine werden übersprungen", () => {
  const next = nextPlannedSession(SESSIONS, {}, new Set(["2026-07-04"]), "2026-07-04");
  assert.equal(next.name, "Gruppenfahrt");
  assert.equal(next.isToday, false);
});

test("nextPlannedSession: adjustments — ausgefallen übersprungen, verschoben zählt am neuen Datum", () => {
  const adj = {
    "2026-07-04": { cancelled: true },
    "2026-07-07": { movedTo: "2026-07-05" },
  };
  const next = nextPlannedSession(SESSIONS, adj, new Set(), "2026-07-04");
  assert.equal(next.name, "Gruppenfahrt");
  assert.equal(next.date, "2026-07-05");
});

test("nextPlannedSession: nichts mehr offen → null", () => {
  assert.equal(nextPlannedSession(SESSIONS, {}, new Set(), "2026-09-30"), null);
  assert.equal(nextPlannedSession([], {}, new Set(), "2026-07-04"), null);
});
