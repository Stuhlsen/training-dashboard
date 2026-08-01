/* Tests: core/scenario.js — What-if-Parameter → synthetischer Kartensatz
   (Phase 5, Schritt 3). Pure Funktion, keine Mocks — Muster wie
   tests/projection.test.js. Testdaten liegen bewusst mindestens 7 Tage
   auseinander, wenn sie in unterschiedlichen ISO-Wochen liegen sollen
   (core/aggregate.js::isoWeekKey), bzw. innerhalb weniger Tage, wenn
   dieselbe Woche gebraucht wird — jeweils per assert.equal/notEqual auf
   isoWeekKey gegengeprüft statt stillschweigend angenommen. */

import test from "node:test";
import assert from "node:assert/strict";
import { buildScenario } from "../assets/js/core/scenario.js";
import { isoWeekKey } from "../assets/js/core/aggregate.js";

const TODAY = "2026-07-24";

/* ── Grenzfälle ──────────────────────────────────────────────── */

test("buildScenario: kein Parameter aktiv → Baseline unverändert übernommen, uncertain aus estimateTss", () => {
  const cards = [
    { id: "a", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle" },
    { id: "b", date: "2026-07-26", typ: "Z2 Lang" }, // Typ-Default 146, unsicher
  ];
  const { cards: out, uncertainCardIds } = buildScenario(cards, {}, { today: TODAY });
  const byId = Object.fromEntries(out.map((c) => [c.id, c.tssPlanned]));
  assert.equal(byId.a, 100);
  assert.equal(byId.b, 146);
  assert.deepEqual([...uncertainCardIds], ["b"]);
});

test("buildScenario: Workout-Schätzung landet ebenfalls in uncertainCardIds", () => {
  const cards = [
    {
      id: "w",
      date: "2026-07-25",
      typ: "Schwelle",
      workout: { warmup: 15, intervals: 4, duration: 8, rest: 4, cooldown: 10, pct: [88, 94] },
    },
  ];
  const { uncertainCardIds } = buildScenario(cards, {}, { today: TODAY, ftp: 200 });
  assert.ok(uncertainCardIds.has("w"));
});

test("buildScenario: leerer Kartensatz → leeres Ergebnis, kein Crash", () => {
  const { cards: out, uncertainCardIds } = buildScenario([], {}, { today: TODAY });
  assert.deepEqual(out, []);
  assert.equal(uncertainCardIds.size, 0);
});

test("buildScenario: nur vergangene Karten → leeres Ergebnis (kein Horizont-Bezug)", () => {
  const cards = [{ id: "past", date: "2026-07-01", tssPlanned: 300, typ: "Etappe" }];
  const { cards: out } = buildScenario(cards, { weekTssPct: 20 }, { today: TODAY });
  assert.deepEqual(out, []);
});

test("buildScenario: ausgefallene Karten fließen nicht ein", () => {
  const cards = [{ id: "off", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle", cancelled: true }];
  const { cards: out } = buildScenario(cards, {}, { today: TODAY });
  assert.deepEqual(out, []);
});

/* ── Wochen-TSS ± % ──────────────────────────────────────────── */

test("buildScenario: Wochen-TSS +20% skaliert alle Karten im Horizont", () => {
  const cards = [
    { id: "a", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle" },
    { id: "b", date: "2026-07-26", tssPlanned: 50, typ: "Z2 Dauer" },
  ];
  const { cards: out } = buildScenario(cards, { weekTssPct: 20 }, { today: TODAY });
  const byId = Object.fromEntries(out.map((c) => [c.id, c.tssPlanned]));
  assert.equal(byId.a, 120);
  assert.equal(byId.b, 60);
});

test("buildScenario: stark negative Wochen-TSS-% wird bei 0 geklemmt (keine negative TSS)", () => {
  const cards = [{ id: "a", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle" }];
  const { cards: out } = buildScenario(cards, { weekTssPct: -150 }, { today: TODAY });
  assert.equal(out[0].tssPlanned, 0);
});

/* ── N zusätzliche Ruhetage ──────────────────────────────────── */

test("buildScenario: N Ruhetage entfernt pro Woche die höchsten TSS-Karten", () => {
  const cards = [
    { id: "a", date: "2026-07-27", tssPlanned: 100, typ: "Schwelle" },
    { id: "b", date: "2026-07-28", tssPlanned: 50, typ: "Z2 Dauer" },
    { id: "c", date: "2026-07-29", tssPlanned: 150, typ: "VO2max" },
  ];
  const weeks = new Set(cards.map((c) => isoWeekKey(c.date)));
  assert.equal(weeks.size, 1, "Testdaten müssen in derselben ISO-Woche liegen");

  const { cards: out } = buildScenario(cards, { restDays: 1 }, { today: TODAY });
  assert.equal(out.length, 2);
  assert.ok(!out.some((c) => c.id === "c"), "höchste TSS-Karte der Woche entfernt");
  assert.ok(out.some((c) => c.id === "a") && out.some((c) => c.id === "b"));
});

test("buildScenario: N Ruhetage größer als Kartenzahl entfernt alle Karten der Woche", () => {
  const cards = [{ id: "a", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle" }];
  const { cards: out } = buildScenario(cards, { restDays: 5 }, { today: TODAY });
  assert.deepEqual(out, []);
});

/* ── Rampenrate ──────────────────────────────────────────────── */

test("buildScenario: Rampenrate skaliert die Folgewoche relativ zur Vorwoche, Woche 0 bleibt Referenz", () => {
  const week1Date = "2026-07-25";
  const week2Date = "2026-08-01";
  assert.notEqual(isoWeekKey(week1Date), isoWeekKey(week2Date), "Testdaten müssen in unterschiedlichen ISO-Wochen liegen");

  const cards = [
    { id: "a", date: week1Date, tssPlanned: 100, typ: "Schwelle" },
    { id: "b", date: week2Date, tssPlanned: 80, typ: "Sweet Spot" },
  ];
  const { cards: out } = buildScenario(cards, { rampRatePct: 10 }, { today: TODAY });
  const byId = Object.fromEntries(out.map((c) => [c.id, c.tssPlanned]));
  assert.equal(byId.a, 100, "erste Woche bleibt Referenz, unverändert");
  assert.equal(byId.b, 110, "zweite Woche = Woche1 * 1.10");
});

test("buildScenario: Rampenrate verkettet sich über zwei Folgewochen", () => {
  const cards = [
    { id: "a", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle" },
    { id: "b", date: "2026-08-01", tssPlanned: 999, typ: "Sweet Spot" },
    { id: "c", date: "2026-08-08", tssPlanned: 999, typ: "VO2max" },
  ];
  const { cards: out } = buildScenario(cards, { rampRatePct: 10 }, { today: TODAY });
  const byId = Object.fromEntries(out.map((c) => [c.id, c.tssPlanned]));
  assert.equal(byId.a, 100);
  assert.equal(byId.b, 110, "Woche 2 = Woche1 * 1.10");
  assert.equal(byId.c, 121, "Woche 3 = Woche2(bereits geramped) * 1.10");
});

test("buildScenario: bricht eine Woche auf Summe 0 zusammen, läuft die Kette mit 0 als Referenz weiter", () => {
  // "z" ist eine explizite 0-TSS-Karte (z.B. Deload) allein in ihrer Woche —
  // die Kette hat ab hier keine sinnvolle Referenz mehr und setzt mit 0 fort
  // (dokumentierte v1-Vereinfachung, s. Kopfkommentar core/scenario.js).
  const cards = [
    { id: "a", date: "2026-07-25", tssPlanned: 100, typ: "Schwelle" },
    { id: "z", date: "2026-08-01", tssPlanned: 0, typ: "Ausrollen" },
    { id: "c", date: "2026-08-08", tssPlanned: 50, typ: "VO2max" },
  ];
  assert.doesNotThrow(() => buildScenario(cards, { rampRatePct: 10 }, { today: TODAY }));
  const { cards: out } = buildScenario(cards, { rampRatePct: 10 }, { today: TODAY });
  const byId = Object.fromEntries(out.map((c) => [c.id, c.tssPlanned]));
  assert.equal(byId.a, 100);
  assert.equal(byId.z, 0);
  assert.equal(byId.c, 0, "Referenz war 0, keine Basis für einen Zuwachs");
});

/* ── Kombination zweier Parameter ────────────────────────────── */

test("buildScenario: Wochen-TSS % und N Ruhetage zusammen — Skalierung vor Entfernung", () => {
  const cards = [
    { id: "a", date: "2026-07-27", tssPlanned: 100, typ: "Schwelle" },
    { id: "b", date: "2026-07-28", tssPlanned: 50, typ: "Z2 Dauer" },
    { id: "c", date: "2026-07-29", tssPlanned: 60, typ: "VO2max" },
  ];
  const weeks = new Set(cards.map((c) => isoWeekKey(c.date)));
  assert.equal(weeks.size, 1, "Testdaten müssen in derselben ISO-Woche liegen");

  const { cards: out } = buildScenario(cards, { weekTssPct: 50, restDays: 1 }, { today: TODAY });
  // Skaliert (×1.5): a=150, b=75, c=90 → höchste (a) wird entfernt
  assert.equal(out.length, 2);
  assert.ok(!out.some((c) => c.id === "a"), "nach Skalierung höchste Karte entfernt");
  const byId = Object.fromEntries(out.map((c) => [c.id, c.tssPlanned]));
  assert.equal(byId.b, 75);
  assert.equal(byId.c, 90);
});
