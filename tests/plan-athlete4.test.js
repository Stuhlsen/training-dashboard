/* Tests: Einsteiger-Vorlage Athlet 4 (scripts/lib/plan-athlete4.js)
   Prüft die strukturellen Invarianten der generierten 12-Wochen-Vorlage —
   nicht den Generator Zeile für Zeile, sondern das Ergebnis.

   Seit Fahrplan 6 (RUH2) enthält die Vorlage NUR Trainingseinheiten
   (Di/Do/Sa/So, Do außer Testwoche KW47). Ruhetage (Mo/Mi/Fr + Do in KW47)
   sind abgeleitete Ruhe-Slots (core/plan-week-model.js), keine Einträge. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANNED_SESSIONS_ATHLETE4 } from "../scripts/lib/plan-athlete4.js";

const entries = Object.entries(PLANNED_SESSIONS_ATHLETE4);
const dates = Object.keys(PLANNED_SESSIONS_ATHLETE4).sort();
const dateSet = new Set(dates);

const START_MONDAY = "2026-08-31"; // Mo ISO-KW36
const WEEKS = 12;

/** ISO-Datum + n Tage (UTC). */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** UTC-Wochentag (1 = Mo … 7 = So) eines ISO-Datums. */
function isoWeekday(iso) {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Spiegelt core/zwo-export.js::canExportZwo — vollständiger numerischer
 *  Hauptsatz mit %FTP, damit der .zwo-Export nie NO_DATA liefert. */
function isZwoExportable(w) {
  return (
    !!w &&
    typeof w === "object" &&
    !Array.isArray(w.blocks) &&
    Number.isFinite(w.warmup) &&
    Number.isFinite(w.cooldown) &&
    Number.isInteger(w.intervals) &&
    w.intervals > 0 &&
    Number.isFinite(w.duration) &&
    Array.isArray(w.pct) &&
    w.pct.length === 2 &&
    Number.isFinite(w.pct[0]) &&
    Number.isFinite(w.pct[1])
  );
}

test("47 Trainingseinträge (Di/Do/Sa/So × 12 Wochen, minus Do in der Testwoche KW47)", () => {
  assert.equal(entries.length, 47);
  assert.equal(dates[0], "2026-09-01"); // erster Dienstag (KW36)
  assert.equal(dates[dates.length - 1], "2026-11-22"); // So ISO-KW47
});

test("jeder Eintrag liegt auf Di/Do/Sa/So", () => {
  for (const [date] of entries) {
    assert.ok([2, 4, 6, 7].includes(isoWeekday(date)), `${date}: unerwarteter Wochentag ${isoWeekday(date)}`);
  }
});

test("nur bekannte Typen; Woche/Name/Phase gesetzt", () => {
  const allowed = new Set(["Z2", "Z2 Dauer", "Tempo", "Sweet Spot", "FTP-Test"]);
  for (const [date, s] of entries) {
    assert.ok(allowed.has(s.typ), `${date}: unerwarteter Typ ${s.typ}`);
    assert.match(s.week, /^KW(3[6-9]|4[0-7])$/, `${date}: unerwartete Woche ${s.week}`);
    assert.ok(s.name && s.phase, `${date}: name/phase fehlt`);
  }
});

test("jede Einheit ist .zwo-exportfähig (nur %FTP, keine watts)", () => {
  for (const [date, s] of entries) {
    assert.ok(isZwoExportable(s.workout), `${date}: workout nicht .zwo-exportfähig`);
    assert.equal("watts" in s.workout, false, `${date}: workout soll keine watts tragen (keine echte FTP)`);
    assert.ok(s.workout.label, `${date}: workout.label fehlt`);
  }
});

test("Mo/Mi/Fr sind KEINE Einträge (abgeleitete Ruhe-Slots); Di/Sa/So sind Einträge", () => {
  for (let i = 0; i < WEEKS; i++) {
    const monday = addDays(START_MONDAY, i * 7);
    for (const off of [0, 2, 4]) {
      assert.equal(dateSet.has(addDays(monday, off)), false, `${addDays(monday, off)}: Ruhe-Slot soll kein Eintrag sein`);
    }
    for (const off of [1, 5, 6]) {
      assert.equal(dateSet.has(addDays(monday, off)), true, `${addDays(monday, off)}: Di/Sa/So soll ein Eintrag sein`);
    }
  }
});

test("Do hat einen Eintrag außer in der Testwoche KW47 (dort abgeleiteter Ruhe-Slot)", () => {
  for (let i = 0; i < WEEKS; i++) {
    const thursday = addDays(addDays(START_MONDAY, i * 7), 3);
    const isTestWeek = i === WEEKS - 1; // KW47
    assert.equal(dateSet.has(thursday), !isTestWeek, `${thursday}: Do-Eintrag ${isTestWeek ? "erwartet: keiner" : "erwartet: einer"}`);
  }
});

test("Sa-Qualitätstag je Phase; KW47-Sa ist der FTP-Test", () => {
  const byWeek = new Map();
  for (const [date, s] of entries) {
    if (isoWeekday(date) !== 6) continue;
    byWeek.set(s.week, { date, ...s });
  }
  assert.equal(byWeek.size, 12);
  assert.equal(byWeek.get("KW47").typ, "FTP-Test");
  assert.equal(byWeek.get("KW40").typ, "Tempo");
  assert.equal(byWeek.get("KW44").typ, "Sweet Spot");
  // Tempo-Samstag hat 3 Intervalle, Sweet-Spot-Samstag 2.
  assert.equal(byWeek.get("KW40").workout.intervals, 3);
  assert.equal(byWeek.get("KW44").workout.intervals, 2);
});

test("Erholungswochen KW39 und KW43 tragen die Phase 'Erholung'", () => {
  for (const [date, s] of entries) {
    if (s.week === "KW39" || s.week === "KW43") {
      assert.equal(s.phase, "Erholung", `${date}: sollte Erholungsphase sein`);
    }
  }
});
