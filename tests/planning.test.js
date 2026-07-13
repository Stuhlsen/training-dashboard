/* Tests: Session + Adjustment → aktueller Zustand (core/planning.js)
   Zentrale Zusammenführung, von der Planungs-Tab-Anzeige, Workout-Push,
   Wochenrückblick, Adhärenz und Hero-Session-Pill gemeinsam abhängen. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAdjustment, effectiveSessions } from "../assets/js/core/planning.js";

test("applyAdjustment: ohne Adjustment unverändert", () => {
  const s = { date: "2026-07-10", name: "Sweet Spot" };
  assert.equal(applyAdjustment(s, {}), s);
  assert.equal(applyAdjustment(s, undefined), s);
});

test("applyAdjustment: ausgefallen wird markiert, nicht entfernt", () => {
  const s = { date: "2026-07-10", name: "Sweet Spot" };
  const adj = { "2026-07-10": { cancelled: true, reason: "Krank" } };
  const result = applyAdjustment(s, adj);
  assert.equal(result.cancelled, true);
  assert.equal(result.cancelReason, "Krank");
  assert.equal(result.date, "2026-07-10"); // Datum bleibt das ursprüngliche
});

test("applyAdjustment: verschoben ersetzt date, merkt originalDate", () => {
  const s = { date: "2026-07-10", name: "Sweet Spot" };
  const adj = { "2026-07-10": { movedTo: "2026-07-12", reason: "Regen" } };
  const result = applyAdjustment(s, adj);
  assert.equal(result.date, "2026-07-12");
  assert.equal(result.originalDate, "2026-07-10");
  assert.equal(result.movedReason, "Regen");
});

// Regressionstest Bug 2: Push von verschobenen Intervall-Workouts landete
// auf dem alten Datum, weil ui/planned.js::_handlePush die rohe
// plannedSessions-Liste statt des aufgelösten Adjustments nutzte.
// _handlePush baut die Push-Session jetzt über applyAdjustment() —
// dieser Test sichert die Grundlage dafür ab: das aufgelöste Datum
// MUSS das verschobene sein, nie das ursprüngliche.
test("applyAdjustment: verschobenes Intervall-Workout → Push-Datum == Adjustment-Datum", () => {
  const rawSession = {
    date: "2026-07-10",
    name: "Schwelle 4×8",
    workout: { warmup: 15, intervals: 4, duration: 8, rest: 4, cooldown: 10, pct: [95, 105], label: "4x8" },
  };
  const adjustments = { "2026-07-10": { movedTo: "2026-07-13", reason: "Hitze" } };

  const pushSession = applyAdjustment(rawSession, adjustments);

  assert.equal(pushSession.date, "2026-07-13");
  assert.notEqual(pushSession.date, rawSession.date);
  assert.equal(pushSession.workout.label, "4x8"); // Workout-Struktur bleibt erhalten
});

test("effectiveSessions: ausgefallene werden entfernt, verschobene aufgelöst", () => {
  const sessions = [
    { date: "2026-07-01", name: "A" },
    { date: "2026-07-02", name: "B" },
    { date: "2026-07-03", name: "C" },
  ];
  const adj = {
    "2026-07-02": { cancelled: true },
    "2026-07-03": { movedTo: "2026-07-05" },
  };
  const result = effectiveSessions(sessions, adj);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "A");
  assert.equal(result[1].name, "C");
  assert.equal(result[1].date, "2026-07-05");
});

test("effectiveSessions: leere/fehlende Eingaben → leeres Array", () => {
  assert.deepEqual(effectiveSessions([], {}), []);
  assert.deepEqual(effectiveSessions(undefined, undefined), []);
});
