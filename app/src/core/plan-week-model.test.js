/* Tests: Plan-Wochen-Modell (core/plan-week-model.js) — card-unabhängige
   Woche/Phase/Slot-Quelle für alle Athleten (Fahrplan 6, RUH1).
   Muss für JEDES Datum ein Ergebnis liefern, auch für Tage ohne Ride/Karte
   (das ist der Sinn: Ruhetag = abgeleiteter Ruhe-Slot ohne Karte). */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  PLAN_WEEK_MODEL,
  planWeekFor,
  isDeliberateRestDay,
} from "./plan-week-model.js";

/** Lokale ISO-Wochentagshilfe für die Invarianten-Tests (1=Mo…7=So). */
function isoWeekday(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ((dow + 6) % 7) + 1;
}

const MISS = { week: null, phase: null, isTrainingSlot: false, isRestSlot: false };

/* ── Athlet 1 — Slot-Erkennung (RUH1-Abnahme) ─────────────────────── */

test("Athlet 1: bekannter Mi → Ruhe-Slot", () => {
  const r = planWeekFor("athlete1", "2026-08-26"); // Mittwoch, KW35
  assert.deepEqual(r, {
    week: "2026-KW35",
    phase: "VO2max",
    isTrainingSlot: false,
    isRestSlot: true,
  });
});

test("Athlet 1: bekannter So → Ruhe-Slot", () => {
  const r = planWeekFor("athlete1", "2026-08-30"); // Sonntag, KW35 (Ende)
  assert.equal(r.isRestSlot, true);
  assert.equal(r.isTrainingSlot, false);
  assert.equal(r.week, "2026-KW35");
});

test("Athlet 1: Do → Trainings-Slot", () => {
  const r = planWeekFor("athlete1", "2026-08-27"); // Donnerstag
  assert.equal(r.isTrainingSlot, true);
  assert.equal(r.isRestSlot, false);
});

test("Athlet 1: Sa → Trainings-Slot", () => {
  const r = planWeekFor("athlete1", "2026-08-29"); // Samstag
  assert.equal(r.isTrainingSlot, true);
});

test("Athlet 1: Taper-Woche KW38 — Fr und So sind Ruhe-Slots", () => {
  assert.equal(planWeekFor("athlete1", "2026-09-18").isRestSlot, true); // Freitag
  assert.equal(planWeekFor("athlete1", "2026-09-20").isRestSlot, true); // Sonntag (Ende KW38)
  assert.equal(planWeekFor("athlete1", "2026-09-17").isTrainingSlot, true); // Do bleibt Training
  assert.equal(planWeekFor("athlete1", "2026-09-20").phase, "Taper");
});

/* ── Wochengrenzen + Phasenzuordnung ─────────────────────────────── */

test("Athlet 1: exakter Start-Tag einer Woche zählt noch dazu", () => {
  const r = planWeekFor("athlete1", "2026-06-22"); // Mo, Start KW26
  assert.equal(r.week, "2026-KW26");
  assert.equal(r.phase, "Übergang");
});

test("Athlet 1: exakter End-Tag einer Woche zählt noch dazu", () => {
  const r = planWeekFor("athlete1", "2026-07-05"); // So, Ende KW27
  assert.equal(r.week, "2026-KW27");
  assert.equal(r.phase, "Sweet Spot");
});

test("Athlet 1: Wochenübergang lückenlos", () => {
  assert.equal(planWeekFor("athlete1", "2026-07-05").week, "2026-KW27");
  assert.equal(planWeekFor("athlete1", "2026-07-06").week, "2026-KW28");
});

/* ── Datum außerhalb aller Bereiche + Athlet ohne Modell ─────────── */

test("Athlet 1: Datum vor dem Plan → kompletter Miss, kein Wurf", () => {
  assert.deepEqual(planWeekFor("athlete1", "2026-06-21"), MISS);
  assert.deepEqual(planWeekFor("athlete1", "2026-01-01"), MISS);
});

test("Athlet 1: Datum nach dem Plan → kompletter Miss", () => {
  assert.deepEqual(planWeekFor("athlete1", "2026-09-21"), MISS);
});

test("unbekannte / reservierte Athleten-ID → Miss, kein Wurf", () => {
  assert.deepEqual(planWeekFor("athlete3", "2026-08-27"), MISS); // reserviert, nicht verdrahtet
  assert.deepEqual(planWeekFor("athlete99", "2026-08-27"), MISS);
  assert.deepEqual(planWeekFor(undefined, "2026-08-27"), MISS);
});

test("fehlendes Datum → Miss, kein Wurf", () => {
  assert.deepEqual(planWeekFor("athlete1", undefined), MISS);
  assert.deepEqual(planWeekFor("athlete1", ""), MISS);
});

/* ── Athlet 2 — GFNY Bremen (Sondermuster) ───────────────────────── */

test("Athlet 2: Standard-Ruhetage Mo + Fr", () => {
  assert.equal(planWeekFor("athlete2", "2026-06-08").isRestSlot, true); // Mo, KW24
  assert.equal(planWeekFor("athlete2", "2026-06-12").isRestSlot, true); // Fr, KW24
  assert.equal(planWeekFor("athlete2", "2026-06-10").isTrainingSlot, true); // Mi
});

test("Athlet 2: NLS6-Woche KW25 — Do–Sa Renn-Trip zählt als Trainings-Slot, So frei", () => {
  assert.equal(planWeekFor("athlete2", "2026-06-18").isTrainingSlot, true); // Do NLS6 Renntag
  assert.equal(planWeekFor("athlete2", "2026-06-19").isTrainingSlot, true); // Fr NLS6 + Heimfahrt
  assert.equal(planWeekFor("athlete2", "2026-06-21").isRestSlot, true); // So ohne Eintrag
  assert.equal(planWeekFor("athlete2", "2026-06-18").phase, "Basis");
});

test("Athlet 2: Taper-Woche KW35 — Sa 29.08. frei, So 30.08. Renntag", () => {
  assert.equal(planWeekFor("athlete2", "2026-08-29").isRestSlot, true); // Sa bewusst frei
  assert.equal(planWeekFor("athlete2", "2026-08-30").isTrainingSlot, true); // So Renntag
  assert.equal(planWeekFor("athlete2", "2026-08-28").isTrainingSlot, true); // Fr = Notiz-Karte (RUH2), kein Ruhe-Slot
  assert.equal(planWeekFor("athlete2", "2026-08-30").phase, "Taper");
});

/* ── Athlet 4 — Einsteigervorlage ────────────────────────────────── */

test("Athlet 4: Standard-Ruhetage Mo/Mi/Fr, aktive Tage Di/Sa/So", () => {
  assert.equal(planWeekFor("athlete4", "2026-08-31").isRestSlot, true); // Mo, KW36
  assert.equal(planWeekFor("athlete4", "2026-09-02").isRestSlot, true); // Mi
  assert.equal(planWeekFor("athlete4", "2026-09-04").isRestSlot, true); // Fr
  assert.equal(planWeekFor("athlete4", "2026-09-01").isTrainingSlot, true); // Di
  assert.equal(planWeekFor("athlete4", "2026-09-01").phase, "Einstieg");
});

test("Athlet 4: Testwoche KW47 — Do zusätzlich frei", () => {
  assert.equal(planWeekFor("athlete4", "2026-11-19").isRestSlot, true); // Do, Testwoche
  assert.equal(planWeekFor("athlete4", "2026-11-21").isTrainingSlot, true); // Sa 20-Min-Test
  assert.equal(planWeekFor("athlete4", "2026-11-19").phase, "Test");
});

/* ── isDeliberateRestDay ─────────────────────────────────────────── */

test("isDeliberateRestDay: Ruhe-Slot ohne Karte → true", () => {
  assert.equal(isDeliberateRestDay("athlete1", "2026-08-26", false), true);
});

test("isDeliberateRestDay: Ruhe-Slot MIT aktiver Karte → false", () => {
  assert.equal(isDeliberateRestDay("athlete1", "2026-08-26", true), false);
});

test("isDeliberateRestDay: Trainings-Slot ohne Karte → false (das ist eine Planungslücke, kein Ruhetag)", () => {
  assert.equal(isDeliberateRestDay("athlete1", "2026-08-27", false), false);
});

test("isDeliberateRestDay: Datum außerhalb des Plans → false (kein bewusster Ruhetag)", () => {
  assert.equal(isDeliberateRestDay("athlete1", "2026-06-21", false), false);
});

test("isDeliberateRestDay: Athlet ohne Modell → false", () => {
  assert.equal(isDeliberateRestDay("athlete99", "2026-08-26", false), false);
});

/* ── Modell-Invarianten ──────────────────────────────────────────── */

test("jede Woche: start ist ein Montag, end ist ein Sonntag", () => {
  for (const [athleteId, weeks] of Object.entries(PLAN_WEEK_MODEL)) {
    for (const w of weeks) {
      assert.equal(isoWeekday(w.start), 1, `${athleteId}/${w.week}: start ${w.start} ist kein Montag`);
      assert.equal(isoWeekday(w.end), 7, `${athleteId}/${w.week}: end ${w.end} ist kein Sonntag`);
    }
  }
});

test("jede Woche: trainingWeekdays nicht leer, Werte 1..7, unique", () => {
  for (const [athleteId, weeks] of Object.entries(PLAN_WEEK_MODEL)) {
    for (const w of weeks) {
      assert.ok(
        w.trainingWeekdays.length > 0,
        `${athleteId}/${w.week}: leere trainingWeekdays würden die ganze Woche als Ruhe werten`
      );
      assert.equal(new Set(w.trainingWeekdays).size, w.trainingWeekdays.length, `${athleteId}/${w.week}: Duplikat`);
      for (const d of w.trainingWeekdays) {
        assert.ok(Number.isInteger(d) && d >= 1 && d <= 7, `${athleteId}/${w.week}: ungültiger Wochentag ${d}`);
      }
    }
  }
});

test("jeder Athlet: lückenlose, chronologische Wochenkette ohne Überlappung", () => {
  for (const [athleteId, weeks] of Object.entries(PLAN_WEEK_MODEL)) {
    for (let i = 1; i < weeks.length; i++) {
      const prevEnd = Date.parse(weeks[i - 1].end + "T00:00:00Z");
      const curStart = Date.parse(weeks[i].start + "T00:00:00Z");
      assert.equal(
        curStart,
        prevEnd + 86400000,
        `${athleteId}: Lücke/Überlappung zwischen ${weeks[i - 1].week} und ${weeks[i].week}`
      );
    }
  }
});
