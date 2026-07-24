/* Tests: core/projection.js — TSS-Prioritätskette (estimateTss) und die
   PMC-Fortschreibung (projectLoad). Reine core/-Funktionen, keine Mocks.
   Die CTL/ATL/TSB-Zahlen sind gegen eine handgerechnete Kurve fixiert
   (s. docs/phase-3-konzept-konfliktlogik-prognose.md §1 + Rechenbeispiel
   im Plan): Start CTL 48 / ATL 40 → TSB +8, dann Coggan /42 bzw. /7. */

import test from "node:test";
import assert from "node:assert/strict";
import { estimateTss, projectLoad } from "../assets/js/core/projection.js";

const TODAY = "2026-07-24";
/** Ist-Fahrt exakt auf heute mit bekanntem CTL/ATL → currentPmc liefert
 *  ohne Nach-Projektion Start CTL 48 / ATL 40. */
const ACTUALS = [{ dateISO: TODAY, ctl: 48, atl: 40 }];

/* ── estimateTss: Prioritätskette ────────────────────────────── */

test("estimateTss Stufe 1: expliziter tssPlanned gewinnt, sicher", () => {
  const r = estimateTss({ tssPlanned: 120, typ: "Sweet Spot" });
  assert.deepEqual(r, { tss: 120, uncertain: false, source: "target" });
});

test("estimateTss respektiert einen expliziten tssPlanned von 0", () => {
  const r = estimateTss({ tssPlanned: 0, typ: "Z1 Recovery" });
  assert.equal(r.tss, 0);
  assert.equal(r.source, "target");
  assert.equal(r.uncertain, false);
});

test("estimateTss Stufe 2: Schätzung aus workout-Blöcken, unsicher", () => {
  const r = estimateTss({
    workout: { warmup: 15, intervals: 4, duration: 8, rest: 4, cooldown: 10, pct: [88, 94] },
    typ: "Schwelle",
  });
  assert.equal(r.source, "workout");
  assert.equal(r.uncertain, true);
  assert.ok(r.tss > 0, "geschätzter TSS > 0");
});

test("estimateTss Stufe 3: Typ-Default (K3-Median), unsicher", () => {
  const r = estimateTss({ typ: "Z2 Lang" });
  assert.deepEqual(r, { tss: 221, uncertain: true, source: "type" });
});

test("estimateTss: unbekannter Typ → Fallback-TSS", () => {
  const r = estimateTss({ typ: "Gibt-es-nicht" });
  assert.equal(r.tss, 70);
  assert.equal(r.source, "type");
});

test("estimateTss: leeres workout ohne Segmente fällt auf den Typ-Default zurück", () => {
  const r = estimateTss({ workout: {}, typ: "Schwelle" });
  assert.deepEqual(r, { tss: 97, uncertain: true, source: "type" });
});

/* ── projectLoad: bekannte PMC-Kurve ─────────────────────────── */

test("projectLoad schreibt CTL/ATL/TSB gegen die handgerechnete Kurve fort", () => {
  const cards = [
    { id: "a", date: "2026-07-24", tssPlanned: 97, typ: "Schwelle" },
    { id: "b", date: "2026-07-26", tssPlanned: 99, typ: "Sweet Spot" },
  ];
  const { days, startCtl, startAtl, hasBaseline, horizonEnd } = projectLoad(cards, ACTUALS, {
    today: TODAY,
  });

  assert.equal(hasBaseline, true);
  assert.equal(startCtl, 48);
  assert.equal(startAtl, 40);
  assert.equal(horizonEnd, "2026-08-02", "letzter Kartentag 26.07. + 7 Tage Nachlauf");

  // Tag 24.07. — 97 TSS
  assert.deepEqual(
    { date: days[0].date, tsb: days[0].tsb, ctl: days[0].ctl, atl: days[0].atl, tss: days[0].tss },
    { date: "2026-07-24", tsb: 8, ctl: 49.17, atl: 48.14, tss: 97 }
  );
  // Tag 25.07. — Ruhetag (0 TSS)
  assert.deepEqual(
    { date: days[1].date, tsb: days[1].tsb, ctl: days[1].ctl, atl: days[1].atl, tss: days[1].tss },
    { date: "2026-07-25", tsb: 1.02, ctl: 48, atl: 41.27, tss: 0 }
  );
  // Tag 26.07. — 99 TSS
  assert.deepEqual(
    { date: days[2].date, tsb: days[2].tsb, ctl: days[2].ctl, atl: days[2].atl, tss: days[2].tss },
    { date: "2026-07-26", tsb: 6.73, ctl: 49.21, atl: 49.51, tss: 99 }
  );
});

test("projectLoad: Verschieben auf den Folgetag verdichtet die Last (Rechenbeispiel)", () => {
  // dieselben Karten, Sweet Spot aber auf den 25.07. (direkt nach Schwelle)
  const cards = [
    { id: "a", date: "2026-07-24", tssPlanned: 97, typ: "Schwelle" },
    { id: "b", date: "2026-07-25", tssPlanned: 99, typ: "Sweet Spot" },
  ];
  const { days } = projectLoad(cards, ACTUALS, { today: TODAY });
  assert.deepEqual(
    { tsb: days[1].tsb, ctl: days[1].ctl, atl: days[1].atl, tss: days[1].tss },
    { tsb: 1.02, ctl: 50.35, atl: 55.41, tss: 99 }
  );
  assert.equal(days[2].tsb, -5.05, "Ermüdungstal am Folgetag");
});

test("projectLoad summiert mehrere Karten am selben Tag und ODER-t uncertain", () => {
  const cards = [
    { id: "a", date: "2026-07-24", tssPlanned: 50, typ: "Z2 Dauer" }, // sicher
    { id: "b", date: "2026-07-24", typ: "Z2 Lang" }, // Typ-Default 221, unsicher
  ];
  const { days } = projectLoad(cards, ACTUALS, { today: TODAY });
  assert.equal(days[0].tss, 271);
  assert.equal(days[0].uncertain, true);
  assert.deepEqual(days[0].cardIds.sort(), ["a", "b"]);
});

/* ── Grenzfälle ──────────────────────────────────────────────── */

test("projectLoad: leerer Plan → nur der heutige Tag, kein Nachlauf", () => {
  const { days, horizonEnd } = projectLoad([], ACTUALS, { today: TODAY });
  assert.equal(days.length, 1);
  assert.equal(horizonEnd, TODAY);
  assert.equal(days[0].tss, 0);
  assert.equal(days[0].tsb, 8);
});

test("projectLoad: keine Ist-Fahrten → Baseline 0, hasBaseline false", () => {
  const cards = [{ id: "a", date: "2026-07-24", tssPlanned: 80, typ: "Sweet Spot" }];
  const { days, startCtl, startAtl, hasBaseline } = projectLoad(cards, [], { today: TODAY });
  assert.equal(hasBaseline, false);
  assert.equal(startCtl, 0);
  assert.equal(startAtl, 0);
  assert.equal(days[0].tsb, 0);
});

test("projectLoad: vergangene Karten fließen nicht in die Kurve ein", () => {
  const cards = [
    { id: "past", date: "2026-07-01", tssPlanned: 300, typ: "Etappe" },
    { id: "fut", date: "2026-07-24", tssPlanned: 80, typ: "Sweet Spot" },
  ];
  const { days } = projectLoad(cards, ACTUALS, { today: TODAY });
  assert.ok(!days.some((d) => d.date < TODAY), "kein Tag vor heute");
  assert.equal(days[0].tss, 80, "nur die zukünftige Karte zählt");
});

test("projectLoad: ausgefallene Karten zählen 0", () => {
  const cards = [
    { id: "off", date: "2026-07-24", tssPlanned: 200, typ: "VO2max", cancelled: true },
    { id: "on", date: "2026-07-24", tssPlanned: 60, typ: "Z2 Dauer" },
  ];
  const { days } = projectLoad(cards, ACTUALS, { today: TODAY });
  assert.equal(days[0].tss, 60);
  assert.deepEqual(days[0].cardIds, ["on"]);
});

test("projectLoad: Horizont reicht mindestens bis zum nächsten Event + 7 Tage", () => {
  const { days, horizonEnd } = projectLoad([], ACTUALS, {
    today: TODAY,
    events: [{ eventDate: "2026-09-01" }],
  });
  assert.equal(horizonEnd, "2026-09-08");
  assert.equal(days[days.length - 1].date, "2026-09-08");
  assert.ok(days.length > 40, "langer Horizont bis zum Event");
});
