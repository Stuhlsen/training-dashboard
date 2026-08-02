/* Tests: core/conflicts.js — Regelset v1. Jede Regel mit Positiv- UND
   Negativ-Fall, überlappende Einheiten, zwei Regeln am selben Tag, und eine
   Änderung, die einen Konflikt auflöst. Reine core/-Funktion, keine Mocks.

   Projektionen werden hier direkt konstruiert (statt über projectLoad), damit
   jeder Regel-Trigger deterministisch und ohne PMC-Rechnung isoliert ist. */

import test from "node:test";
import assert from "node:assert/strict";
import { detectConflicts } from "../assets/js/core/conflicts.js";
import { projectLoad } from "../assets/js/core/projection.js";
import { addDaysISO } from "../assets/js/core/format.js";

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

// D6 (docs/konzept-progressionssteuerung.md): eine bewusst geplante
// Ruhetag-Karte ist keine Planungslücke — nur eine wirklich fehlende Karte
// löst K-LEER aus.
const rest = (id, date) => ({ id, date, typ: "Ruhetag", tssPlanned: 0 });

test("K-LEER feuert NICHT, wenn die 3 Tage davor Ruhetag-Karten tragen (bewusst geplant)", () => {
  const proj = mkProj([
    { date: "2026-07-20" },
    { date: "2026-07-21" },
    { date: "2026-07-22" },
    { date: "2026-07-23" },
    { date: "2026-07-24" },
  ]);
  const cards = [
    rest("r1", "2026-07-21"),
    rest("r2", "2026-07-22"),
    rest("r3", "2026-07-23"),
    hard("a", "2026-07-24"),
  ];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-LEER").length, 0);
});

test("K-LEER feuert weiterhin bei echten Lücken, auch wenn irgendwo eine Ruhetag-Karte dazwischenliegt", () => {
  // Ruhetag-Karte am 21.07. bricht die Zählung (wie ein aktiver Tag) — die
  // beiden Lücken am 22./23. reichen allein nicht für die Schwelle von 3.
  const proj = mkProj([
    { date: "2026-07-20" },
    { date: "2026-07-21" },
    { date: "2026-07-22" },
    { date: "2026-07-23" },
    { date: "2026-07-24" },
  ]);
  const cards = [rest("r1", "2026-07-21"), hard("a", "2026-07-24")];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-LEER").length, 0);
});

/* ── K-WOCHENSPRUNG (bis Fenster E1: K-RAMPE) — zwei volle ISO-Wochen:
   KW30 20.–26.07., KW31 27.07.–02.08. ── */

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

test("K-WOCHENSPRUNG: Wochenlast-Sprung > +20 % → Hinweis", () => {
  const c = byRule(detectConflicts(twoWeeks(100, 130), [], []), "K-WOCHENSPRUNG");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
  assert.match(c[0].message, /\+30 %/);
});

test("K-WOCHENSPRUNG feuert nicht bei +10 % Wochenlast", () => {
  assert.equal(byRule(detectConflicts(twoWeeks(100, 110), [], []), "K-WOCHENSPRUNG").length, 0);
});

/* ── K-WOCHENSPRUNG Ist-Seed (letzte gefahrene Woche als Vorwert für die
   erste volle Planwoche — ohne Seed hätte die Schleife oben für i=0 nie
   einen Vorwert, s. docs/offene-punkte.md) ── */

const ONE_WEEK_DATES = [
  "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26",
];
function oneWeek(weekTss) {
  return mkProj(ONE_WEEK_DATES.map((date, i) => ({ date, tss: i === 0 ? weekTss : 0 })));
}

test("K-WOCHENSPRUNG: Ist-Seed vergleicht die erste volle Planwoche gegen die letzte gefahrene Woche", () => {
  // Letzte gefahrene Woche (KW29, 13.–19.07.) hatte 100 TSS, die erste volle
  // Planwoche (KW30, ab heute 2026-07-20) plant 140 → +40 %.
  const actuals = [{ dateISO: "2026-07-15", tss: 40 }, { dateISO: "2026-07-17", tss: 60 }];
  const c = byRule(detectConflicts(oneWeek(140), [], [], actuals), "K-WOCHENSPRUNG");
  assert.equal(c.length, 1);
  assert.match(c[0].message, /\+40 %/);
  assert.deepEqual(c[0].dates, ["2026-07-20"]);
});

test("K-WOCHENSPRUNG: ohne Ist-Daten bleibt die erste Planwoche weiterhin unbewertet", () => {
  assert.equal(byRule(detectConflicts(oneWeek(140), [], [], []), "K-WOCHENSPRUNG").length, 0);
});

test("K-WOCHENSPRUNG: Ist-Seed ignoriert Fahrten ab heute (nur Vergangenheit zählt)", () => {
  // Eine "Ist"-Fahrt exakt am Planstart (heute) darf die Woche selbst nicht
  // mit sich vergleichen — der Seed muss strikt davor liegen.
  const actuals = [{ dateISO: "2026-07-20", tss: 140 }];
  assert.equal(byRule(detectConflicts(oneWeek(140), [], [], actuals), "K-WOCHENSPRUNG").length, 0);
});

/* ── K-RAMPE (neu, P2): projizierte CTL-Rampe — Info ab 6, Warnung ab 8 ──
   Ein-Wochen-Projektionen (ONE_WEEK_DATES, KW30) mit fixem ctl am letzten
   Tag; die Baseline ist `startCtl` (Woche beginnt am Projektionsstart, kein
   Tag 7 davor verfügbar). */
function mkProjCtl(lastDayCtl, startCtl) {
  return {
    days: ONE_WEEK_DATES.map((date, i) => ({
      tsb: 0,
      tss: 0,
      cardIds: [],
      ctl: i === ONE_WEEK_DATES.length - 1 ? lastDayCtl : 0,
    })),
    startCtl,
  };
}

test("K-RAMPE: projizierte Rampe > 8/Woche → Warnung", () => {
  const c = byRule(detectConflicts(mkProjCtl(59, 50), [], []), "K-RAMPE"); // +9
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.match(c[0].message, /\+9\/Woche/);
});

test("K-RAMPE: projizierte Rampe zwischen 6 und 8 → Hinweis", () => {
  const c = byRule(detectConflicts(mkProjCtl(57, 50), [], []), "K-RAMPE"); // +7
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
});

test("K-RAMPE feuert nicht bei Rampe ≤ 6/Woche", () => {
  assert.equal(byRule(detectConflicts(mkProjCtl(55, 50), [], []), "K-RAMPE").length, 0); // +5
});

test("K-RAMPE feuert nicht ohne startCtl (ältere Fixtures ohne Baseline)", () => {
  const proj = { days: mkProjCtl(59, 50).days }; // kein startCtl-Feld
  assert.equal(byRule(detectConflicts(proj, [], []), "K-RAMPE").length, 0);
});

/** 7 aufeinanderfolgende ISO-Daten ab `start` — addDaysISO() statt
 *  toISOString() (kein UTC-Tagesversatz, s. core/format.js-Kommentar). */
function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

// Alle bisherigen K-RAMPE-Tests bauen die Projektion per mkProjCtl direkt
// (feste ctl-Werte je Tag) und prüfen damit NUR die Schwellenlogik isoliert
// — nicht, ob eine über core/projection.js::projectLoad tatsächlich
// BERECHNETE (statt vorgegebene) steigende CTL-Kurve denselben Pfad
// auslöst. Ein Trockenlauf gegen den echten Plan (02.08.2026) hatte hier
// zufällig 0 Treffer, weil die reale Projektion im Testzeitraum durchgehend
// FÄLLT — das prüft den Feuer-Pfad selbst nicht. Diese drei Tests schließen
// die Lücke End-zu-Ende (projectLoad → weeklyCtlRamp → detectConflicts).
test("K-RAMPE über die echte projectLoad-Pipeline: steigende CTL knapp unter der Info-Schwelle bleibt still", () => {
  const actuals = [{ dateISO: "2026-08-03", ctl: 50, atl: 50 }];
  const cards = weekDates("2026-08-03").map((date, i) => ({ id: `c${i}`, date, tssPlanned: 83, typ: "Sweet Spot" }));
  const projection = projectLoad(cards, actuals, { today: "2026-08-03", ftp: 193 });
  const week1Ramp = projection.days[6].ctl - projection.startCtl;
  assert.ok(week1Ramp < 6, `Testannahme verletzt: Rampe ${week1Ramp} sollte < 6 sein`);
  assert.equal(byRule(detectConflicts(projection, cards, [], actuals), "K-RAMPE").length, 0);
});

test("K-RAMPE über die echte projectLoad-Pipeline: steigende CTL zwischen 6 und 8 → Hinweis", () => {
  const actuals = [{ dateISO: "2026-08-03", ctl: 50, atl: 50 }];
  const cards = weekDates("2026-08-03").map((date, i) => ({ id: `c${i}`, date, tssPlanned: 96, typ: "Sweet Spot" }));
  const projection = projectLoad(cards, actuals, { today: "2026-08-03", ftp: 193 });
  const week1Ramp = projection.days[6].ctl - projection.startCtl;
  assert.ok(week1Ramp > 6 && week1Ramp <= 8, `Testannahme verletzt: Rampe ${week1Ramp} sollte in (6,8] liegen`);
  const c = byRule(detectConflicts(projection, cards, [], actuals), "K-RAMPE");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
});

test("K-RAMPE über die echte projectLoad-Pipeline: steigende CTL über 8 → Warnung", () => {
  const actuals = [{ dateISO: "2026-08-03", ctl: 50, atl: 50 }];
  const cards = weekDates("2026-08-03").map((date, i) => ({ id: `c${i}`, date, tssPlanned: 130, typ: "Sweet Spot" }));
  const projection = projectLoad(cards, actuals, { today: "2026-08-03", ftp: 193 });
  const week1Ramp = projection.days[6].ctl - projection.startCtl;
  assert.ok(week1Ramp > 8, `Testannahme verletzt: Rampe ${week1Ramp} sollte > 8 sein`);
  const c = byRule(detectConflicts(projection, cards, [], actuals), "K-RAMPE");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
});

/* ── K-HARTFOLGE (neu, P2): zwei harte Tage ohne rest-/recovery- ────────
   Karte dazwischen (D6.2) ── */

const z1recovery = (id, date) => ({ id, date, typ: "Z1 Recovery" });

test("K-HARTFOLGE: harter Tag, dazwischen ein NICHT-Recovery-Tag, harter Tag → Warnung", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }, { date: "2026-07-26" }]);
  const cards = [hard("a", "2026-07-24"), easy("b", "2026-07-25"), hard("c", "2026-07-26")];
  const c = byRule(detectConflicts(proj, cards, []), "K-HARTFOLGE");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.deepEqual(c[0].dates, ["2026-07-24", "2026-07-26"]);
  assert.deepEqual(c[0].cardIds.sort(), ["a", "c"]);
});

test("K-HARTFOLGE feuert NICHT, wenn ein Z1-Recovery-Tag dazwischenliegt", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }, { date: "2026-07-26" }]);
  const cards = [hard("a", "2026-07-24"), z1recovery("b", "2026-07-25"), hard("c", "2026-07-26")];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-HARTFOLGE").length, 0);
});

test("K-HARTFOLGE feuert NICHT, wenn eine Ruhetag-Karte dazwischenliegt", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }, { date: "2026-07-26" }]);
  const cards = [hard("a", "2026-07-24"), rest("b", "2026-07-25"), hard("c", "2026-07-26")];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-HARTFOLGE").length, 0);
});

test("K-HARTFOLGE feuert NICHT bei unmittelbar aufeinanderfolgenden harten Tagen (Lücke 0, deckt K-HART ab)", () => {
  const proj = mkProj([{ date: "2026-07-24" }, { date: "2026-07-25" }]);
  const cards = [hard("a", "2026-07-24"), hard("b", "2026-07-25")];
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-HARTFOLGE").length, 0);
  assert.equal(byRule(detectConflicts(proj, cards, []), "K-HART").length, 1, "K-HART deckt den Lücke-0-Fall ab");
});

/* ── K-WOCHENTSS (neu, P2): Wochen-TSS > CTL(Wochenstart) × 8 ───────── */

function mkProjWeekTss(dailyTss, startCtl) {
  return {
    days: ONE_WEEK_DATES.map((date) => ({ tsb: 0, cardIds: [], tss: dailyTss, ctl: startCtl })),
    startCtl,
  };
}

test("K-WOCHENTSS: Wochen-TSS über CTL × 8 → Warnung", () => {
  const c = byRule(detectConflicts(mkProjWeekTss(70, 50), [], []), "K-WOCHENTSS"); // 490 > 400
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.match(c[0].message, /490 über Obergrenze 400/);
});

test("K-WOCHENTSS feuert nicht innerhalb der Obergrenze", () => {
  assert.equal(byRule(detectConflicts(mkProjWeekTss(50, 50), [], []), "K-WOCHENTSS").length, 0); // 350 < 400
});

/* ── K-TID (neu, P2): Anteil hoher Intensität außerhalb des Block- ──────
   korridors über die letzten 4 Ist-Wochen ── */

const sweetSpotCard = (id, date) => ({ id, date, typ: "Sweet Spot", phase: "Sweet Spot" });

test("K-TID: über 20% der letzten 4 Ist-Wochen oberhalb des Korridors → Hinweis", () => {
  const proj = mkProj([{ date: "2026-07-20" }]);
  const cards = [sweetSpotCard("a", "2026-07-20")];
  const actuals = [
    { dateISO: "2026-06-25", if: 0.85 },
    { dateISO: "2026-07-01", if: 0.99 }, // über ifMax 0.97
    { dateISO: "2026-07-10", if: 0.9 },
    { dateISO: "2026-07-15", if: 1.0 }, // über ifMax 0.97
  ];
  const c = byRule(detectConflicts(proj, cards, [], actuals), "K-TID");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "info");
  assert.match(c[0].message, /50 %/);
  assert.match(c[0].message, /Sweet Spot/);
});

test("K-TID feuert nicht, wenn alle Fahrten im Korridor liegen", () => {
  const proj = mkProj([{ date: "2026-07-20" }]);
  const cards = [sweetSpotCard("a", "2026-07-20")];
  const actuals = [
    { dateISO: "2026-06-25", if: 0.85 },
    { dateISO: "2026-07-10", if: 0.9 },
  ];
  assert.equal(byRule(detectConflicts(proj, cards, [], actuals), "K-TID").length, 0);
});

test("K-TID feuert nicht ohne Korridor für die aktuelle Blockphase (z.B. Taper)", () => {
  const proj = mkProj([{ date: "2026-07-20" }]);
  const cards = [{ id: "a", date: "2026-07-20", typ: "Ausrollen", phase: "Taper" }];
  const actuals = [{ dateISO: "2026-07-01", if: 1.2 }];
  assert.equal(byRule(detectConflicts(proj, cards, [], actuals), "K-TID").length, 0);
});

/* ── K-EVENT ─────────────────────────────────────────────────── */

const raceMain = { eventDate: "2026-07-26", title: "GFNY", type: "race", priority: "main" };

test("K-EVENT (main/Hauptziel): TSB außerhalb +5…+20 am Eventtag → Warnung", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 2 }]);
  const c = byRule(detectConflicts(proj, [], [raceMain]), "K-EVENT");
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "warning");
  assert.deepEqual(c[0].dates, ["2026-07-26"]);
});

test("K-EVENT (main/Hauptziel): TSB im Zielfenster → kein Befund", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 10 }]);
  assert.equal(byRule(detectConflicts(proj, [], [raceMain]), "K-EVENT").length, 0);
});

test("K-EVENT (secondary/Nebenziel): TSB außerhalb −5…+15 → nur Hinweis (info)", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 20 }]);
  const ev = { ...raceMain, priority: "secondary" };
  const c = byRule(detectConflicts(proj, [], [ev]), "K-EVENT");
  assert.equal(c[0].severity, "info");
});

test("K-EVENT ignoriert Nicht-Rennen und Events ohne Priorität", () => {
  const proj = mkProj([{ date: "2026-07-26", tsb: 2 }]);
  const other = { eventDate: "2026-07-26", type: "other" };
  const noPriority = { ...raceMain, priority: null };
  assert.equal(byRule(detectConflicts(proj, [], [other, noPriority]), "K-EVENT").length, 0);
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
