/* Tests: core/plan-feedback.js — Nach-Drop-Feedback-Ableitungen
   (Phase 3, Schritt 5). Reine Funktionen, keine Mocks nötig. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  conflictsForCard,
  horizonRaceEvent,
  tsbOnDate,
  restDayRiddenSignal,
  plannedRecoveryWeeks,
  PLANNED_RECOVERY_WEEK_MIN_SHARE,
} from "../assets/js/core/plan-feedback.js";

/* ── conflictsForCard ────────────────────────────────────────── */

test("conflictsForCard: filtert nach cardIds und sortiert warning vor info", () => {
  const conflicts = [
    { rule: "K-RAMPE", severity: "info", cardIds: ["a"] },
    { rule: "K-TSB", severity: "warning", cardIds: ["b"] },
    { rule: "K-HART", severity: "info", cardIds: ["a", "b"] },
    { rule: "K-EVENT", severity: "warning", cardIds: ["a"] },
  ];
  const result = conflictsForCard(conflicts, "a");
  assert.deepEqual(
    result.map((c) => c.rule),
    ["K-EVENT", "K-RAMPE", "K-HART"]
  );
  assert.equal(result[0].severity, "warning");
});

test("conflictsForCard: leere Liste ohne Treffer", () => {
  const conflicts = [{ rule: "K-TSB", severity: "warning", cardIds: ["b"] }];
  assert.deepEqual(conflictsForCard(conflicts, "a"), []);
});

test("conflictsForCard: verändert das Original-Array nicht", () => {
  const conflicts = [
    { rule: "K-A", severity: "info", cardIds: ["x"] },
    { rule: "K-B", severity: "warning", cardIds: ["x"] },
  ];
  const before = conflicts.map((c) => c.rule);
  conflictsForCard(conflicts, "x");
  assert.deepEqual(
    conflicts.map((c) => c.rule),
    before
  );
});

/* ── horizonRaceEvent ────────────────────────────────────────── */

const mkProjection = (horizonEnd, dates) => ({
  horizonEnd,
  days: dates.map((date) => ({ date, tsb: 0, tss: 0, cardIds: [] })),
});

test("horizonRaceEvent: wählt das nächste Rennen im Horizont", () => {
  const projection = mkProjection("2026-08-10", ["2026-07-24", "2026-08-10"]);
  const events = [
    { type: "race", eventDate: "2026-09-01" }, // außerhalb Horizont
    { type: "race", eventDate: "2026-08-05" },
    { type: "other", eventDate: "2026-07-25" }, // kein Rennen
    { type: "race", eventDate: "2026-07-20" }, // in der Vergangenheit
  ];
  const event = horizonRaceEvent(events, projection, "2026-07-24");
  assert.equal(event.eventDate, "2026-08-05");
});

test("horizonRaceEvent: null ohne passendes Event", () => {
  const projection = mkProjection("2026-08-10", ["2026-07-24"]);
  assert.equal(horizonRaceEvent([], projection, "2026-07-24"), null);
  assert.equal(
    horizonRaceEvent([{ type: "other", eventDate: "2026-07-25" }], projection, "2026-07-24"),
    null
  );
});

test("horizonRaceEvent: null ohne Projektionstage", () => {
  assert.equal(horizonRaceEvent([{ type: "race", eventDate: "2026-08-01" }], null, "2026-07-24"), null);
  assert.equal(
    horizonRaceEvent([{ type: "race", eventDate: "2026-08-01" }], { days: [] }, "2026-07-24"),
    null
  );
});

/* ── tsbOnDate ───────────────────────────────────────────────── */

test("tsbOnDate: liefert den TSB-Wert am Datum", () => {
  const projection = { days: [{ date: "2026-07-24", tsb: 12 }, { date: "2026-07-25", tsb: -6 }] };
  assert.equal(tsbOnDate(projection, "2026-07-25"), -6);
});

test("tsbOnDate: null wenn das Datum nicht in der Projektion liegt", () => {
  const projection = { days: [{ date: "2026-07-24", tsb: 12 }] };
  assert.equal(tsbOnDate(projection, "2026-08-01"), null);
});

test("tsbOnDate: null bei fehlender Projektion", () => {
  assert.equal(tsbOnDate(null, "2026-07-24"), null);
});

/* ── restDayRiddenSignal (D6) ────────────────────────────────── */

test("restDayRiddenSignal: Ruhetag-Karte + gefahren → Info-Signal", () => {
  const signal = restDayRiddenSignal({ typ: "Ruhetag" }, true);
  assert.deepEqual(signal, {
    severity: "info",
    message: "Ruhetag gefahren — bewusst freier Tag wurde trotzdem trainiert.",
  });
});

test("restDayRiddenSignal: Ruhetag-Karte, aber nicht gefahren → null", () => {
  assert.equal(restDayRiddenSignal({ typ: "Ruhetag" }, false), null);
});

test("restDayRiddenSignal: andere Kartentypen lösen nie aus, auch wenn gefahren", () => {
  assert.equal(restDayRiddenSignal({ typ: "Z1 Recovery" }, true), null);
  assert.equal(restDayRiddenSignal(null, true), null);
});

/* ── plannedRecoveryWeeks (D6) ───────────────────────────────── */

test("plannedRecoveryWeeks: Woche mit Mehrheit Ruhetag/Z1-Recovery-Karten wird erkannt", () => {
  const cards = [
    { date: "2026-07-20", typ: "Ruhetag" }, // Mo, KW30
    { date: "2026-07-21", typ: "Z1 Recovery" },
    { date: "2026-07-22", typ: "Sweet Spot" },
  ];
  const weeks = plannedRecoveryWeeks(cards);
  assert.equal(weeks.size, 1);
  assert.ok(PLANNED_RECOVERY_WEEK_MIN_SHARE <= 2 / 3);
});

test("plannedRecoveryWeeks: normale Blockwoche (Minderheit Ruhetag) wird NICHT erkannt", () => {
  const cards = [
    { date: "2026-07-20", typ: "Sweet Spot" },
    { date: "2026-07-21", typ: "Schwelle" },
    { date: "2026-07-22", typ: "Ruhetag" },
  ];
  assert.equal(plannedRecoveryWeeks(cards).size, 0);
});

test("plannedRecoveryWeeks: ausgefallene Karten zählen nicht mit", () => {
  const cards = [
    { date: "2026-07-20", typ: "Sweet Spot", cancelled: true },
    { date: "2026-07-21", typ: "Ruhetag" },
  ];
  // Ohne die ausgefallene Karte bleibt nur die Ruhetag-Karte → 100% Anteil.
  assert.equal(plannedRecoveryWeeks(cards).size, 1);
});

test("plannedRecoveryWeeks: leere Eingabe → leeres Set", () => {
  assert.equal(plannedRecoveryWeeks([]).size, 0);
  assert.equal(plannedRecoveryWeeks(undefined).size, 0);
});
