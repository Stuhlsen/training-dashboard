/* Tests: core/conflicts.js — Regelset v1. Jede Regel mit Positiv- UND
   Negativ-Fall, überlappende Einheiten, zwei Regeln am selben Tag, und eine
   Änderung, die einen Konflikt auflöst. Reine core/-Funktion, keine Mocks.

   Projektionen werden hier direkt konstruiert (statt über projectLoad), damit
   jeder Regel-Trigger deterministisch und ohne PMC-Rechnung isoliert ist. */

import test from "node:test";
import assert from "node:assert/strict";
import { detectConflicts } from "../assets/js/core/conflicts.js";

/** Projektion aus einer Tagesliste; tsb/tss/cardIds default 0/0/[]. */
const mkProj = (days) => ({
  days: days.map((d) => ({ tsb: 0, tss: 0, cardIds: [], ...d })),
});
const rules = (conflicts) => conflicts.map((c) => c.rule);
const byRule = (conflicts, rule) => conflicts.filter((c) => c.rule === rule);

/* ── K-TSB ───────────────────────────────────────────────────── */

test("K-TSB feuert bei TSB unter −30", () => {
  const proj = mkProj([
    { date: "2026-07-24", tsb: -10 },
    { date: "2026-07-25", tsb: -32, cardIds: ["x"] },
  ]);
  const c = byRule(detectConflicts(proj, [], []), "K-TSB");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.deepEqual(c[0].dates, ["2026-07-25"]);
  assert.deepEqual(c[0].cardIds, ["x"]);
});

test("K-TSB feuert nicht, solange TSB ≥ −30 bleibt", () => {
  const proj = mkProj([{ date: "2026-07-24", tsb: -28 }]);
  assert.equal(byRule(detectConflicts(proj, [], []), "K-TSB").length, 0);
});

/* ── K-TSB2 ──────────────────────────────────────────────────── */

test("K-TSB2 feuert bei TSB < −20 an 3 Folgetagen", () => {
  const proj = mkProj([
    { date: "2026-07-24", tsb: -21 },
    { date: "2026-07-25", tsb: -22 },
    { date: "2026-07-26", tsb: -25 },
  ]);
  const c = byRule(detectConflicts(proj, [], []), "K-TSB2");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.equal(c[0].dates.length, 3);
});

test("K-TSB2 feuert nicht bei nur 2 Folgetagen unter −20", () => {
  const proj = mkProj([
    { date: "2026-07-24", tsb: -21 },
    { date: "2026-07-25", tsb: -22 },
    { date: "2026-07-26", tsb: -10 },
  ]);
  assert.equal(byRule(detectConflicts(proj, [], []), "K-TSB2").length, 0);
});

/* ── K-HART ──────────────────────────────────────────────────── */

const hard = (id, date) => ({ id, date, typ: "Schwelle" });
const easy = (id, date) => ({ id, date, typ: "Z2 Dauer" });

test("K-HART: 2 harte Tage in Folge → Hinweis (info)", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }]);
  const cards = [hard("a", "2026-07-24"), hard("b", "2026-07-25")];
  const c = byRule(detectConflicts(proj, cards, []), "K-HART");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
  assert.deepEqual(c[0].cardIds.sort(), ["a", "b"]);
});

test("K-HART: 3 harte Tage in Folge → Warnung", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }, { date: "2026-07-26" }]);
  const cards = [hard("a", "2026-07-24"), hard("b", "2026-07-25"), hard("c", "2026-07-26")];
  const c = byRule(detectConflicts(proj, cards, []), "K-HART");
  assert.equal(c[0].severity, "warning");
});

test("K-HART feuert nicht, wenn ein lockerer Tag die harten trennt", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }, { date: "2026-07-26" }]);
  const cards = [hard("a", "2026-07-24"), easy("b", "2026-07-25"), hard("c", "2026-07-26")];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-HART").length, 0);
});

/* ── K-LEER ──────────────────────────────────────────────────── */

test("K-LEER: harte Einheit direkt nach ≥3 Ruhetagen → Hinweis", () => {
  const proj = mkProj([
    { date: "2026-07-20" },
    { date: "2026-07-21" },
    { date: "2026-07-22" },
    { date: "2026-07-23" },
    { date: "2026-07-24" },
  ]);
  const cards = [hard("a", "2026-07-24")]; // 20.–23. ohne Karte = Ruhe
  const c = byRule(detectConflicts(proj, cards, []), "K-LEER");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
  assert.deepEqual(c[0].dates, ["2026-07-24"]);
});

test("K-LEER feuert nicht bei nur 2 Ruhetagen davor", () => {
  const proj = mkProj([
    { date: "2026-07-22" },
    { date: "2026-07-23" },
    { date: "2026-07-24" },
  ]);
  const cards = [hard("a", "2026-07-24")];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-LEER").length, 0);
});

/* ── K-RAMPE (zwei volle ISO-Wochen: KW30 20.–26.07., KW31 27.07.–02.08.) ── */

// KW30 = 20.–26.07., KW31 = 27.07.–02.08. — beide volle 7-Tage-Wochen.
// Datumsliste explizit (kein toISOString → kein UTC-Tagesversatz).
const TWO_WEEK_DATES = [
  "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26",
  "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02",
];
function twoWeeks(week1Tss, week2Tss) {
  return mkProj(
    TWO_WEEK_DATES.map((date, i) => ({ date, tss: i === 0 ? week1Tss : i === 7 ? week2Tss : 0 }))
  );
}

test("K-RAMPE: Wochenlast-Sprung > +20 % → Hinweis", () => {
  const c = byRule(detectConflicts(twoWeeks(100, 130), [], []), "K-RAMPE");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
  assert.match(c[0].message, /\+30 %/);
});

test("K-RAMPE feuert nicht bei +10 % Wochenlast", () => {
  assert.equal(byRule(detectConflicts(twoWeeks(100, 110), [], []), "K-RAMPE").length, 0);
});

/* ── K-EVENT ─────────────────────────────────────────────────── */

const raceA = { eventDate: "2026-07-26", title: "GFNY", type: "race", priority: "A" };

test("K-EVENT (A): TSB außerhalb +5…+20 am Eventtag → Warnung", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 2 }]);
  const c = byRule(detectConflicts(proj, [], [raceA]), "K-EVENT");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.deepEqual(c[0].dates, ["2026-07-26"]);
});

test("K-EVENT (A): TSB im Zielfenster → kein Befund", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 10 }]);
  assert.equal(byRule(detectConflicts(proj, [], [raceA]), "K-EVENT").length, 0);
});

test("K-EVENT (B): TSB außerhalb −5…+15 → nur Hinweis (info)", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 20 }]);
  const ev = { ...raceA, priority: "B" };
  const c = byRule(detectConflicts(proj, [], [ev]), "K-EVENT");
  assert.equal(c[0].severity, "info");
});

test("K-EVENT ignoriert Nicht-Rennen und C-Events", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 2 }]);
  const other = { eventDate: "2026-07-26", type: "other" };
  const cEvent = { ...raceA, priority: "C" };
  assert.equal(byRule(detectConflicts(proj, [], [other, cEvent]), "K-EVENT").length, 0);
});

/* ── K-OVERLAP (Schritt-3-Edge-Case) ─────────────────────────── */

test("K-OVERLAP: zwei aktive Karten am selben Tag → Hinweis", () => {
  const proj = mkProj([{ date: "2026-07-24" }]);
  const cards = [hard("a", "2026-07-24"), easy("b", "2026-07-24")];
  const c = byRule(detectConflicts(proj, cards, []), "K-OVERLAP");
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].cardIds.sort(), ["a", "b"]);
});

test("K-OVERLAP zählt ausgefallene Karten nicht mit", () => {
  const proj = mkProj([{ date: "2026-07-24" }]);
  const cards = [hard("a", "2026-07-24"), { ...easy("b", "2026-07-24"), cancelled: true }];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-OVERLAP").length, 0);
});

/* ── Kombination + Auflösung ─────────────────────────────────── */

test("Zwei Regeln am selben Tag: tiefer TSB löst K-TSB UND K-TSB2 aus", () => {
  const proj = mkProj([
    { date: "2026-07-24", tsb: -21 },
    { date: "2026-07-25", tsb: -25 },
    { date: "2026-07-26", tsb: -32 },
  ]);
  const r = rules(detectConflicts(proj, [], []));
  assert.ok(r.includes("K-TSB"), "K-TSB (< −30)");
  assert.ok(r.includes("K-TSB2"), "K-TSB2 (3× < −20)");
});

test("Eine Änderung, die den TSB anhebt, löst den Konflikt auf", () => {
  const before = mkProj([{ date: "2026-07-24", tsb: -33 }]);
  const after = mkProj([{ date: "2026-07-24", tsb: -8 }]);
  assert.equal(detectConflicts(before, [], []).length, 1);
  assert.equal(detectConflicts(after, [], []).length, 0);
});

test("Leere Projektion → keine Konflikte", () => {
  assert.deepEqual(detectConflicts({ days: [] }, [], []), []);
});
