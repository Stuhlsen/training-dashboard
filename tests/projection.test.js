/* Tests: core/projection.js — TSS-Prioritätskette (estimateTss) und die
   PMC-Fortschreibung (projectLoad). Reine core/-Funktionen, keine Mocks.
   Die CTL/ATL/TSB-Zahlen sind gegen eine handgerechnete Kurve fixiert
   (s. docs/phase-3-konzept-konfliktlogik-prognose.md §1 + Rechenbeispiel
   im Plan): Start CTL 48 / ATL 40 → TSB +8, dann Coggan /42 bzw. /7. */

import test from "node:test";
import assert from "node:assert/strict";
import { estimateTss, projectLoad, weeklyCtlRamp } from "../assets/js/core/projection.js";

const TODAY = "2026-07-24";
/** Ist-Fahrt exakt auf heute mit bekanntem CTL/ATL → currentPmc liefert
 *  ohne Nach-Projektion Start CTL 48 / ATL 40. */
const ACTUALS = [{ dateISO: TODAY, ctl: 48, atl: 40 }];

/* ── estimateTss: Prioritätskette ────────────────────────────── */

test("estimateTss Stufe 0: workout_structure schlägt sogar einen expliziten tssPlanned (Schritt 3, D1)", () => {
  const structure = {
    version: 1,
    steps: [{ kind: "steady", duration_s: 3600, target_pct_ftp: 100 }], // IF=1 → 3600×1/36 = 100
  };
  const r = estimateTss({ tssPlanned: 999, workoutStructure: structure, typ: "Schwelle" });
  assert.deepEqual(r, { tss: 100, uncertain: false, source: "structure", scale: "tss" });
});

test("estimateTss: workoutStructure vorhanden, aber ohne verwertbaren Inhalt → fällt auf die nächste Stufe zurück", () => {
  const r = estimateTss({ tssPlanned: 55, workoutStructure: { version: 1, steps: [] }, typ: "Schwelle" });
  assert.deepEqual(r, { tss: 55, uncertain: false, source: "target", scale: "tss" });
});

test("estimateTss Regression: Karten OHNE workoutStructure verhalten sich exakt wie vor Schritt 3 (B2)", () => {
  const cardsOhneStruktur = [
    { tssPlanned: 120, typ: "Sweet Spot" },
    { workout: { warmup: 15, intervals: 4, duration: 8, rest: 4, cooldown: 10, pct: [88, 94] }, typ: "Schwelle" },
    { typ: "Z2 Lang" },
    { typ: "Etappe" },
    { typ: "Gibt-es-nicht" },
    { workout: {}, typ: "Schwelle" },
  ];
  for (const card of cardsOhneStruktur) {
    const withoutField = estimateTss(card);
    const withNullField = estimateTss({ ...card, workoutStructure: null });
    assert.deepEqual(withNullField, withoutField, `unverändert für ${JSON.stringify(card)}`);
    assert.notEqual(withoutField.source, "structure");
  }
});

test("estimateTss Stufe 1: expliziter tssPlanned gewinnt, sicher", () => {
  const r = estimateTss({ tssPlanned: 120, typ: "Sweet Spot" });
  assert.deepEqual(r, { tss: 120, uncertain: false, source: "target", scale: "tss" });
});

test("estimateTss respektiert einen expliziten tssPlanned von 0", () => {
  const r = estimateTss({ tssPlanned: 0, typ: "Z1 Recovery" });
  assert.equal(r.tss, 0);
  assert.equal(r.source, "target");
  assert.equal(r.uncertain, false);
  assert.equal(r.scale, "tss");
});

test("estimateTss Stufe 2: Schätzung aus workout-Blöcken, unsicher, Skala 'tss'", () => {
  const r = estimateTss({
    workout: { warmup: 15, intervals: 4, duration: 8, rest: 4, cooldown: 10, pct: [88, 94] },
    typ: "Schwelle",
  });
  assert.equal(r.source, "workout");
  assert.equal(r.uncertain, true);
  assert.equal(r.scale, "tss");
  assert.ok(r.tss > 0, "geschätzter TSS > 0");
});

test("estimateTss Stufe 3: Typ-Default (K3-Median, echter TSS-Beleg), unsicher", () => {
  const r = estimateTss({ typ: "Z2 Lang" });
  assert.deepEqual(r, { tss: 146, uncertain: true, source: "type", scale: "tss" });
});

test("estimateTss Stufe 3: Typ-Default ohne eigene TSS-Belege → scale 'tss-approx'", () => {
  const r = estimateTss({ typ: "Etappe" });
  assert.deepEqual(r, { tss: 155, uncertain: true, source: "type", scale: "tss-approx" });
});

test("estimateTss: unbekannter Typ → Fallback-TSS, Skala 'tss'", () => {
  const r = estimateTss({ typ: "Gibt-es-nicht" });
  assert.equal(r.tss, 70);
  assert.equal(r.source, "type");
  assert.equal(r.scale, "tss");
});

test("estimateTss: leeres workout ohne Segmente fällt auf den Typ-Default zurück", () => {
  const r = estimateTss({ workout: {}, typ: "Schwelle" });
  assert.deepEqual(r, { tss: 57, uncertain: true, source: "type", scale: "tss" });
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
    { id: "b", date: "2026-07-24", typ: "Z2 Lang" }, // Typ-Default 146, unsicher
  ];
  const { days } = projectLoad(cards, ACTUALS, { today: TODAY });
  assert.equal(days[0].tss, 196);
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

/* ── weeklyCtlRamp (P1/K-RAMPE, Fenster E1) ──────────────────────
   2026-07-27 ist ein Montag (KW31) — 21 Tage ab dort ergeben genau
   3 volle ISO-Wochen. ctl steigt linear um 1/Tag, also +7 CTL/Woche
   bei jeder der drei Wochen (konstante Rampe, leicht nachrechenbar). */
function buildDays(count, startDate, ctlStart) {
  const days = [];
  let d = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, ctl: ctlStart + i });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

test("weeklyCtlRamp: konstante +1/Tag-Steigung ergibt +7 CTL/Woche in jeder vollen Woche", () => {
  const days = buildDays(21, "2026-07-27", 50); // ctl[0]=50 … ctl[20]=70
  const weeks = weeklyCtlRamp(days, 49); // startCtl passt zur Fortsetzung rückwärts (ctl[-1]=49)
  assert.equal(weeks.length, 3);
  assert.deepEqual(
    weeks.map((w) => w.ramp),
    [7, 7, 7]
  );
  assert.equal(weeks[0].firstDate, "2026-07-27");
});

test("weeklyCtlRamp: partielle Rand-Wochen werden nicht mitgezählt", () => {
  const days = buildDays(24, "2026-07-27", 50); // 3 volle Wochen + 3 Tage Rest
  const weeks = weeklyCtlRamp(days, 49);
  assert.equal(weeks.length, 3, "die angehängten 3 Tage bilden keine volle Woche");
});

test("weeklyCtlRamp: leere Eingabe liefert leere Liste", () => {
  assert.deepEqual(weeklyCtlRamp([], 50), []);
  assert.deepEqual(weeklyCtlRamp(null, 50), []);
});

test("weeklyCtlRamp: erste volle Woche beginnt nicht am Projektionsstart (partielle Startwoche davor)", () => {
  // Projektion beginnt an einem Mittwoch (2026-07-22) — die erste ISO-Woche
  // ist dadurch nur 5 Tage lang und fällt raus, erst die zweite ist voll.
  const days = buildDays(12, "2026-07-22", 50); // Mi 22.07. … So 02.08.
  const weeks = weeklyCtlRamp(days, 49);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].firstDate, "2026-07-27");
});
