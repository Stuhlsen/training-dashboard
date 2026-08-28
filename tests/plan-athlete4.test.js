/* Tests: Einsteiger-Vorlage Athlet 4 (scripts/lib/plan-athlete4.js)
   Prüft die strukturellen Invarianten der generierten 12-Wochen-Vorlage —
   nicht den Generator Zeile für Zeile, sondern das Ergebnis. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANNED_SESSIONS_ATHLETE4 } from "../scripts/lib/plan-athlete4.js";

const entries = Object.entries(PLANNED_SESSIONS_ATHLETE4);
const dates = Object.keys(PLANNED_SESSIONS_ATHLETE4).sort();

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

test("12 Wochen × 7 Tage = 84 Einträge, lückenlos ab 2026-08-31", () => {
  assert.equal(entries.length, 84);
  assert.equal(dates[0], "2026-08-31"); // Mo ISO-KW36
  assert.equal(dates[dates.length - 1], "2026-11-22"); // So ISO-KW47
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T00:00:00Z`);
    const cur = new Date(`${dates[i]}T00:00:00Z`);
    assert.equal((cur - prev) / 86400000, 1, `Lücke zwischen ${dates[i - 1]} und ${dates[i]}`);
  }
});

test("nur bekannte Typen; Woche/Name/Phase gesetzt", () => {
  const allowed = new Set(["Ruhetag", "Z2", "Z2 Dauer", "Tempo", "Sweet Spot", "FTP-Test"]);
  for (const [date, s] of entries) {
    assert.ok(allowed.has(s.typ), `${date}: unerwarteter Typ ${s.typ}`);
    assert.match(s.week, /^KW(3[6-9]|4[0-7])$/, `${date}: unerwartete Woche ${s.week}`);
    assert.ok(s.name && s.phase, `${date}: name/phase fehlt`);
  }
});

test("Ruhetage haben kein workout; jede Fahr-Einheit ist .zwo-exportfähig (nur %FTP, keine watts)", () => {
  for (const [date, s] of entries) {
    if (s.typ === "Ruhetag") {
      assert.equal("workout" in s, false, `${date}: Ruhetag soll kein workout tragen`);
      continue;
    }
    assert.ok(isZwoExportable(s.workout), `${date}: workout nicht .zwo-exportfähig`);
    assert.equal("watts" in s.workout, false, `${date}: workout soll keine watts tragen (keine echte FTP)`);
    assert.ok(s.workout.label, `${date}: workout.label fehlt`);
  }
});

test("Mo/Mi/Fr sind Ruhetage; Di/Sa/So sind aktive Einheiten", () => {
  for (const [date, s] of entries) {
    const wd = isoWeekday(date);
    if (wd === 1 || wd === 3 || wd === 5) {
      assert.equal(s.typ, "Ruhetag", `${date} (Wochentag ${wd}) sollte Ruhetag sein`);
    }
    if (wd === 2 || wd === 6 || wd === 7) {
      assert.notEqual(s.typ, "Ruhetag", `${date} (Wochentag ${wd}) sollte eine Einheit sein`);
    }
  }
});

test("Do ist aktiv außer in der Testwoche KW47 (dort frei)", () => {
  for (const [date, s] of entries) {
    if (isoWeekday(date) !== 4) continue;
    if (s.week === "KW47") assert.equal(s.typ, "Ruhetag", `${date}: Do in KW47 sollte frei sein`);
    else assert.notEqual(s.typ, "Ruhetag", `${date}: Do sollte eine Einheit sein`);
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
