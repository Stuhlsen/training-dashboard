import test from "node:test";
import assert from "node:assert/strict";
import {
  isDropAllowed,
  resolveDrop,
  weekDays,
  daySlots,
  weekLabelForDate,
} from "../assets/js/core/plan-drag.js";

const TODAY = "2026-07-17"; // Freitag

/* ── isDropAllowed / resolveDrop — Konzept §6 + §7 ───────────── */

test("isDropAllowed: heute und Zukunft ja, Vergangenheit nein", () => {
  assert.equal(isDropAllowed("2026-07-16", TODAY), false);
  assert.equal(isDropAllowed(TODAY, TODAY), true, "heute ist ein gültiges Ziel");
  assert.equal(isDropAllowed("2026-07-18", TODAY), true);
});

test("resolveDrop: Drop auf vergangenen Tag wird abgewiesen", () => {
  const card = { id: "a", date: "2026-07-20" };
  const res = resolveDrop(card, "2026-07-16", TODAY);
  assert.equal(res.action, "rejected");
  assert.ok(res.reason);
});

test("resolveDrop: Drop auf denselben Tag ist ein No-Op (kein Schreibvorgang)", () => {
  const card = { id: "a", date: "2026-07-20" };
  assert.equal(resolveDrop(card, "2026-07-20", TODAY).action, "none");
});

test("resolveDrop: Drop auf zukünftigen Tag verschiebt", () => {
  const card = { id: "a", date: "2026-07-20" };
  assert.equal(resolveDrop(card, "2026-07-22", TODAY).action, "move");
});

test("resolveDrop: eine vergangene Karte darf auf heute gezogen werden", () => {
  // Abgewiesen wird das ZIEL, nicht die Herkunft — eine verpasste Karte
  // nach vorn zu holen ist genau der Sinn des Verschiebens.
  const card = { id: "a", date: "2026-07-10" };
  assert.equal(resolveDrop(card, TODAY, TODAY).action, "move");
});

test("resolveDrop: Drop ohne Ziel wird abgewiesen (Ghost neben dem Raster losgelassen)", () => {
  assert.equal(resolveDrop({ id: "a", date: "2026-07-20" }, null, TODAY).action, "rejected");
  assert.equal(resolveDrop(null, "2026-07-20", TODAY).action, "rejected");
});

/* ── weekDays / daySlots ─────────────────────────────────────── */

test("weekDays: Montag zuerst, 7 Tage, unabhängig vom Anker-Wochentag", () => {
  const fromFriday = weekDays("2026-07-17");
  assert.equal(fromFriday.length, 7);
  assert.equal(fromFriday[0], "2026-07-13", "Montag");
  assert.equal(fromFriday[6], "2026-07-19", "Sonntag");
  // Sonntag gehört zur VORHERIGEN Woche (ISO), nicht zur nächsten
  assert.deepEqual(weekDays("2026-07-19"), fromFriday);
  assert.deepEqual(weekDays("2026-07-13"), fromFriday);
});

test("weekDays: kein UTC-Tagesversatz (lokales Datum, nicht toISOString)", () => {
  // toISOString() würde östlich von Greenwich auf den Vortag kippen —
  // der Montag muss ein Montag bleiben.
  for (const iso of weekDays("2026-01-01")) {
    assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(weekDays("2026-01-01")[0], "2025-12-29", "Mo der Jahreswechselwoche");
});

test("daySlots: vergangene Tage der laufenden Woche sind nicht droppbar", () => {
  const slots = daySlots(TODAY, TODAY);
  assert.equal(slots.length, 7);
  assert.deepEqual(
    slots.map((s) => s.allowed),
    [false, false, false, false, true, true, true],
    "Mo–Do vergangen, Fr (heute) bis So erlaubt"
  );
});

test("daySlots: eine komplett zukünftige Woche ist durchgehend droppbar", () => {
  assert.ok(daySlots("2026-07-22", TODAY).every((s) => s.allowed));
});

/* ── weekLabelForDate ────────────────────────────────────────── */

const CARDS = [
  { id: "a", date: "2026-07-14", week: "P2-W3", phase: "Sweet Spot" },
  { id: "b", date: "2026-07-16", week: "P2-W3", phase: "Sweet Spot" },
  { id: "c", date: "2026-07-21", week: "P2-W4", phase: "Erholung" },
];

test("weekLabelForDate: übernimmt week/phase der Zielwoche", () => {
  assert.deepEqual(weekLabelForDate(CARDS, "2026-07-23", "a"), {
    week: "P2-W4",
    phase: "Erholung",
  });
});

test("weekLabelForDate: schließt die gezogene Karte selbst aus", () => {
  // Karte "c" ist die EINZIGE in ihrer Woche. Zieht man sie innerhalb
  // dieser Woche um, darf sie nicht sich selbst als Beleg finden — sonst
  // sähe eine leere Zielwoche wie eine belegte aus.
  assert.equal(weekLabelForDate(CARDS, "2026-07-22", "c"), null);
  // ohne Ausschluss (anderer Zieher) liefert dieselbe Woche sehr wohl c's Label
  assert.deepEqual(weekLabelForDate(CARDS, "2026-07-22", "a"), {
    week: "P2-W4",
    phase: "Erholung",
  });
});

test("weekLabelForDate: leere Zielwoche → null (Aufrufer behält altes Label)", () => {
  assert.equal(weekLabelForDate(CARDS, "2026-08-19", "a"), null);
});

test("weekLabelForDate: Karten ohne week-Label taugen nicht als Beleg", () => {
  const cards = [{ id: "x", date: "2026-07-21", week: null, phase: null }];
  assert.equal(weekLabelForDate(cards, "2026-07-22", "a"), null);
});

test("weekLabelForDate: robust gegen leere/fehlende Eingaben", () => {
  assert.equal(weekLabelForDate([], "2026-07-22", "a"), null);
  assert.equal(weekLabelForDate(undefined, "2026-07-22", "a"), null);
  assert.equal(weekLabelForDate(CARDS, null, "a"), null);
});
