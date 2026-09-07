/* Tests: eingefrorene Plan-1-Historie (scripts/lib/plan1-history.json via
   loadPlan1History()).

   Warum: Seit Fahrplan 10 E3a ist Plan 1 (Athlet 1, 24.03.–20.06.2026, 57
   Fahrten) nicht mehr ein Live-Notion-Abruf, sondern eine committete Datei.
   Der Golden-Master (app/src/core/pmc-golden-master.test.js) rechnet gegen
   ein SEPARATES rides-1.json-Fixture, nie gegen plan1-history.json — ein
   versehentlicher Zahlendreher oder eine verschwundene Zeile hier würde
   Athlet 1s CTL/ATL/TSB-Historie still verschieben und trotzdem alle
   anderen Tests grün lassen. Dieser Test ist der Wächter: strukturelle
   Invarianten + ein Datenschutz-Riegel (die Ortsangaben, die vor dem
   Einfrieren neutralisiert wurden, dürfen nicht zurückkehren).

   Bricht der Test nach einer bewussten Änderung an plan1-history.json:
   Zahlen gegenprüfen, dann die Erwartungen hier anpassen. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPlan1History } from "../scripts/lib/plan1-history.js";

const ROWS = loadPlan1History();

// Feldmenge, die queryNotionPlan1() erzeugt hat (scripts/lib/notion.js,
// mit E3a entfernt) — jede Zeile trägt exakt diese Schlüssel.
const EXPECTED_KEYS = [
  "name", "date", "week", "phase", "typ", "dataSource", "sport", "km", "min",
  "kmh", "hf", "hfMax", "kad", "watt", "np", "ftpWatt", "maxWatt", "trimp",
  "ctl", "atl", "tsb", "tss", "vi", "ruhepuls", "hrv", "decoupling", "dtl",
  "hoehe", "feel", "heu", "wetter", "notionWetter", "notizen",
].sort();

test("loadPlan1History: 57 Fahrten, 24.03.–20.06.2026", () => {
  assert.ok(Array.isArray(ROWS));
  assert.equal(ROWS.length, 57);
  assert.equal(ROWS[0].date, "2026-03-24");
  assert.equal(ROWS[ROWS.length - 1].date, "2026-06-20");
});

test("loadPlan1History: liefert bei jedem Aufruf eine frische Kopie", () => {
  const again = loadPlan1History();
  assert.notEqual(again, ROWS); // kein geteiltes mutierbares Modul-Singleton
  assert.deepEqual(again, ROWS);
});

test("plan1-history: jede Zeile ist Radsport aus der Notion-Ära", () => {
  for (const r of ROWS) {
    assert.equal(r.dataSource, "notion", `${r.date}: dataSource`);
    assert.equal(r.sport, "ride", `${r.date}: sport`);
  }
});

test("plan1-history: Datumsformat + chronologisch (nicht fallend)", () => {
  for (let i = 0; i < ROWS.length; i++) {
    assert.match(ROWS[i].date, /^\d{4}-\d{2}-\d{2}$/, `Zeile ${i}: date-Format`);
    if (i > 0) {
      assert.ok(
        ROWS[i - 1].date <= ROWS[i].date,
        `Zeile ${i}: ${ROWS[i].date} liegt vor ${ROWS[i - 1].date}`
      );
    }
  }
});

test("plan1-history: jede Zeile trägt exakt die erwartete Feldmenge", () => {
  for (const r of ROWS) {
    assert.deepEqual(Object.keys(r).sort(), EXPECTED_KEYS, `${r.date}: Schlüssel`);
  }
});

test("plan1-history: genau ein FTP-Test (2026-06-12, 193 W)", () => {
  const withFtp = ROWS.filter((r) => r.ftpWatt != null);
  assert.equal(withFtp.length, 1);
  assert.equal(withFtp[0].date, "2026-06-12");
  assert.equal(withFtp[0].ftpWatt, 193);
  assert.equal(withFtp[0].typ, "FTP-Test");
});

test("plan1-history: Kennzahlen sind Zahl oder null", () => {
  const numericFields = ["km", "min", "kmh", "np", "watt", "tss", "trimp", "ctl", "atl", "tsb", "hf"];
  for (const r of ROWS) {
    for (const f of numericFields) {
      const v = r[f];
      assert.ok(
        v === null || typeof v === "number",
        `${r.date}: ${f} ist ${typeof v} (${v})`
      );
    }
  }
});

test("plan1-history: Datenschutz — keine neutralisierten Ortsangaben zurück", () => {
  // Vor dem Einfrieren (E3a) aus name/notizen entfernt, von Alex freigegeben.
  const forbidden = [/senftenberg/i, /dresden/i, /sfb\s*[→-]\s*dd/i, /dd\s*[→-]\s*sfb/i];
  for (const r of ROWS) {
    const blob = `${r.name || ""} ${r.notizen || ""} ${r.notionWetter || ""}`;
    for (const re of forbidden) {
      assert.ok(!re.test(blob), `${r.date}: "${re}" wieder im Freitext`);
    }
  }
});
