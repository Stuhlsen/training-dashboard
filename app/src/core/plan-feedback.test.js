/* Tests: core/plan-feedback.js — Nach-Drop-Feedback-Ableitungen
   (Phase 3, Schritt 5). Reine Funktionen, keine Mocks nötig. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  conflictsForCard,
  horizonRaceEvent,
  tsbOnDate,
  dayImpact,
  formatCardImpact,
  cardImpact,
  restDayRiddenSignal,
  plannedRecoveryWeeks,
  PLANNED_RECOVERY_WEEK_MIN_SHARE,
  summarizeCardHints,
  CARD_HINT_CHIP_MAX_VISIBLE,
} from "./plan-feedback.js";
import { projectLoad } from "./projection.js";

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

/* ── summarizeCardHints ──────────────────────────────────────── */

test("summarizeCardHints: leere Liste ergibt keinen Chip", () => {
  assert.equal(summarizeCardHints([]), null);
  assert.equal(summarizeCardHints(undefined), null);
});

test("summarizeCardHints: Singular bei genau einer Meldung", () => {
  const result = summarizeCardHints([{ severity: "info", text: "Eine Sache" }]);
  assert.equal(result.count, 1);
  assert.equal(result.label, "1 Hinweis");
  assert.equal(result.severity, "info");
  assert.equal(result.moreCount, 0);
});

test("summarizeCardHints: Plural ab zwei Meldungen", () => {
  const result = summarizeCardHints([
    { severity: "info", text: "A" },
    { severity: "info", text: "B" },
  ]);
  assert.equal(result.label, "2 Hinweise");
});

test("summarizeCardHints: höchster Schweregrad bei gemischten Meldungen", () => {
  const result = summarizeCardHints([
    { severity: "info", text: "A" },
    { severity: "warning", text: "B" },
    { severity: "info", text: "C" },
  ]);
  assert.equal(result.severity, "warning");
  assert.deepEqual(
    result.visible.map((i) => i.text),
    ["B", "A", "C"]
  );
});

test("summarizeCardHints: Kürzung ab vier Meldungen inkl. korrektem Restzähler", () => {
  const items = [
    { severity: "info", text: "1" },
    { severity: "info", text: "2" },
    { severity: "info", text: "3" },
    { severity: "info", text: "4" },
    { severity: "info", text: "5" },
  ];
  const result = summarizeCardHints(items);
  assert.equal(result.count, 5);
  assert.equal(result.visible.length, CARD_HINT_CHIP_MAX_VISIBLE);
  assert.deepEqual(
    result.visible.map((i) => i.text),
    ["1", "2", "3"]
  );
  assert.equal(result.moreCount, 2);
});

test("summarizeCardHints: genau drei Meldungen ohne Restzähler", () => {
  const items = [
    { severity: "warning", text: "1" },
    { severity: "info", text: "2" },
    { severity: "info", text: "3" },
  ];
  const result = summarizeCardHints(items);
  assert.equal(result.moreCount, 0);
  assert.equal(result.visible.length, 3);
});

test("summarizeCardHints: verändert das Original-Array nicht", () => {
  const items = [
    { severity: "info", text: "A" },
    { severity: "warning", text: "B" },
  ];
  const before = items.map((i) => i.text);
  summarizeCardHints(items);
  assert.deepEqual(
    items.map((i) => i.text),
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

/* ── dayImpact/formatCardImpact/cardImpact (W1, Schritt 3b/9C) ──
   Konzept-Beispiel: Start CTL 55 / ATL 60, ein Ruhetag (0 TSS) →
   CTL 53,7 / ATL 51,4 / TSB +2,3 (docs/konzept-progressionssteuerung.md §4). */

test("dayImpact: reproduziert das Konzept-Beispiel (CTL 55/ATL 60, ein Ruhetag)", () => {
  // Startpunkt über eine Ist-Fahrt exakt "heute" fixiert, wie in
  // tests/projection.test.js (ACTUALS-Fixierung, s. dortiger Kopfkommentar).
  const actuals = [{ dateISO: "2026-07-24", ctl: 55, atl: 60 }];
  const projection = projectLoad(
    [{ id: "rest", date: "2026-07-24", tssPlanned: 0, typ: "Ruhetag" }],
    actuals,
    { today: "2026-07-24" }
  );
  const impact = dayImpact(projection, "2026-07-24");
  // Konzept-Tabelle (§4): TSB −5,0 → +2,3, also ein Delta von ~7,3 (hier
  // 7.26 vor der 1-Nachkommastellen-Rundung der Anzeige, s. formatCardImpact).
  assert.deepEqual(impact, { deltaFitness: -1.31, deltaFatigue: -8.57, deltaForm: 7.26, uncertain: false });
});

test("dayImpact: zweiter Tag nutzt den Vortag als Vorher-Stand, nicht startCtl/startAtl", () => {
  const actuals = [{ dateISO: "2026-07-24", ctl: 55, atl: 60 }];
  const projection = projectLoad(
    [
      { id: "rest1", date: "2026-07-24", tssPlanned: 0, typ: "Ruhetag" },
      { id: "rest2", date: "2026-07-25", tssPlanned: 0, typ: "Ruhetag" },
    ],
    actuals,
    { today: "2026-07-24" }
  );
  const day2 = dayImpact(projection, "2026-07-25");
  // Vorher-Stand von Tag 2 = Nachher-Stand von Tag 1 (53.7/51.4 gerundet).
  // Math.round statt direktem Float-Vergleich — Differenz zweier bereits
  // gerundeter Werte kann Fließkomma-Rauschen im letzten Bit erzeugen.
  assert.equal(day2.deltaFitness, Math.round((projection.days[1].ctl - projection.days[0].ctl) * 100) / 100);
  assert.equal(day2.deltaFatigue, Math.round((projection.days[1].atl - projection.days[0].atl) * 100) / 100);
});

test("dayImpact: null außerhalb der Projektion (Datum nicht enthalten)", () => {
  assert.equal(dayImpact({ days: [{ date: "2026-07-24", ctl: 50, atl: 50, tsb: 0 }] }, "2026-08-01"), null);
  assert.equal(dayImpact(null, "2026-07-24"), null);
  assert.equal(dayImpact({ days: [] }, "2026-07-24"), null);
});

test("formatCardImpact: W1.1-Format, deutsches Vorzeichen/Komma, Qualifier je scale", () => {
  const impact = { deltaFitness: -1.3, deltaFatigue: -8.6, deltaForm: 7.3 };
  assert.equal(formatCardImpact(impact, "tss"), "Ermüdung −8,6 · Fitness −1,3 · Form +7,3 — modelliert");
  assert.equal(
    formatCardImpact(impact, "tss-approx"),
    "Ermüdung −8,6 · Fitness −1,3 · Form +7,3 — grob geschätzt"
  );
});

test("formatCardImpact: Null-Delta zeigt ±0 statt −0", () => {
  const impact = { deltaFitness: 0, deltaFatigue: -0.04, deltaForm: 0.04 };
  assert.match(formatCardImpact(impact, "tss"), /Fitness ±0/);
  assert.match(formatCardImpact(impact, "tss"), /Ermüdung ±0/);
});

test("cardImpact: kombiniert dayImpact + estimateTss-scale zu einer fertigen Beschriftung", () => {
  const actuals = [{ dateISO: "2026-07-24", ctl: 55, atl: 60 }];
  const card = { id: "a", date: "2026-07-24", typ: "Z2 Lang" }; // Typ-Default MIT echtem TSS-Beleg → scale "tss"
  const projection = projectLoad([card], actuals, { today: "2026-07-24" });
  const result = cardImpact(card, projection);
  assert.equal(result.scale, "tss");
  assert.match(result.label, /modelliert$/);
  assert.equal(result.deltaFitness, dayImpact(projection, "2026-07-24").deltaFitness);
});

test("cardImpact: Typ ohne echten TSS-Beleg → scale 'tss-approx', schwächere Formulierung", () => {
  const actuals = [{ dateISO: "2026-07-24", ctl: 55, atl: 60 }];
  const card = { id: "a", date: "2026-07-24", typ: "Etappe" }; // TYPE_DEFAULT_TSS_APPROX_TYPES
  const projection = projectLoad([card], actuals, { today: "2026-07-24" });
  const result = cardImpact(card, projection);
  assert.equal(result.scale, "tss-approx");
  assert.match(result.label, /grob geschätzt$/);
});

test("cardImpact: null ohne Kartendatum oder außerhalb der Projektion", () => {
  const projection = projectLoad([], [{ dateISO: "2026-07-24", ctl: 55, atl: 60 }], { today: "2026-07-24" });
  assert.equal(cardImpact({ typ: "Sweet Spot" }, projection), null);
  assert.equal(cardImpact({ date: "2020-01-01", typ: "Sweet Spot" }, projection), null);
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
