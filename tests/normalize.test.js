/* Tests: Normalisierung (core/normalize.js) und Formatierung (core/format.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeel, normalizeRide, normalizeWellness } from "../assets/js/core/normalize.js";
import {
  fmt,
  fmtInt,
  fmtDate,
  fmtDateFull,
  fmtDuration,
  wrapText,
  windDir,
  addDaysISO,
} from "../assets/js/core/format.js";
import { parseFtpFromNotes } from "../scripts/lib/notion.js";

test("normalizeFeel: Kurzformen werden auf Labels + CSS-Klassen gemappt", () => {
  assert.deepEqual(normalizeFeel("Ischwer"), { label: "Irgendwie schwer", cls: "ischwer" });
  assert.deepEqual(normalizeFeel("Hart"), { label: "Hart", cls: "hart" });
  assert.deepEqual(normalizeFeel(null), { label: "–", cls: "" });
  assert.deepEqual(normalizeFeel("Unbekannt"), { label: "Unbekannt", cls: "" });
});

test("normalizeRide: dateISO/dateShort/efficiency werden ergänzt", () => {
  const r = normalizeRide({ date: "2026-06-12", watt: 190, hf: 160, feel: "Sleicht" });
  assert.equal(r.dateISO, "2026-06-12");
  assert.equal(r.dateShort, "12.06");
  assert.equal(r.efficiency, 1.19); // 190/160 auf 2 Nachkommastellen
  assert.equal(r.feel, "Sehr leicht");
  assert.equal(r.feelCls, "sleicht");
});

test("normalizeRide: keine Effizienz ohne Watt oder HF", () => {
  assert.equal(normalizeRide({ date: "2026-06-12", watt: 190 }).efficiency, null);
  assert.equal(normalizeRide({ date: "2026-06-12", hf: 150 }).efficiency, null);
});

test("normalizeWellness ergänzt Anzeige-Datum", () => {
  const w = normalizeWellness({ date: "2026-07-01", sleepHours: 7.5 });
  assert.equal(w.dateISO, "2026-07-01");
  assert.equal(w.dateShort, "01.07");
});

test("fmt/fmtInt/fmtDate/fmtDuration: deutsche Formate + null-Handling", () => {
  assert.equal(fmt(12.345), "12,3");
  assert.equal(fmt(null), "–");
  assert.equal(fmtInt(12.7), "13");
  assert.equal(fmtInt(undefined), "–");
  assert.equal(fmtDate("2026-03-24"), "24.03");
  assert.equal(fmtDuration(125), "2:05h");
  assert.equal(fmtDuration(null), "–");
});

test("fmtDateFull: volles DD.MM.JJJJ-Format für Tooltips, konsistent zu fmtDate ohne Jahr", () => {
  assert.equal(fmtDateFull("2026-03-24"), "24.03.2026");
  assert.equal(fmtDateFull(null), "–");
  // Achsenbeschriftung (fmtDate) und Tooltip (fmtDateFull) müssen densel-
  // ben Tag/Monat liefern — nur das Jahr ist der Unterschied (Punkt 4:
  // ein Datumsformat statt abweichender Ad-hoc-Implementierungen je Chart).
  assert.equal(fmtDateFull("2026-03-24").slice(0, 5), fmtDate("2026-03-24"));
});

test("wrapText bricht an Wortgrenzen um", () => {
  const lines = wrapText("eins zwei drei vier", 9);
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((l) => l.length <= 9));
});

test("windDir: Grad → Himmelsrichtung", () => {
  assert.equal(windDir(0), "N");
  assert.equal(windDir(90), "O");
  assert.equal(windDir(225), "SW");
  assert.equal(windDir(null), "");
});

test("addDaysISO: einfache Verschiebung sowie Monats-/Jahreswechsel", () => {
  assert.equal(addDaysISO("2026-07-15", -1), "2026-07-14");
  assert.equal(addDaysISO("2026-07-15", 1), "2026-07-16");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28"); // Monatswechsel
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31"); // Jahreswechsel
  assert.equal(addDaysISO("2024-03-01", -1), "2024-02-29"); // Schaltjahr
});

test("parseFtpFromNotes extrahiert den FTP-Wert aus Freitext", () => {
  assert.equal(parseFtpFromNotes("Ramp Test — Neues FTP: 193 W bestätigt"), 193);
  assert.equal(parseFtpFromNotes("FTP 210W nach Retest"), 210);
  assert.equal(parseFtpFromNotes("Lockere Runde ohne Test"), null);
  assert.equal(parseFtpFromNotes(""), null);
});
