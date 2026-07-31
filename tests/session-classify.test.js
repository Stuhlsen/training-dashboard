/* Tests: core/session-classify.js — datenbasierte Ist-Typerkennung v1.
   Regressionsfälle nutzen echte Werte aus data/rides.json (Athlet 1,
   Juli 2026) — die vier Fahrten aus dem Diagnosebericht vom 30.07.2026
   (Fall A: Ist-Typ folgt heute fast immer dem Plan, nicht den Daten). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySession } from "../assets/js/core/session-classify.js";

/* ── Regressionsfälle (echte Werte, Athlet 1, FTP 193 im Zeitraum) ──── */

test("classifySession: 10.07.2026 — geplant Recovery, Daten zeigen Z2 Dauer", () => {
  const r = classifySession({
    np: 155,
    ftp: 193,
    min: 168,
    zoneTimes: [
      { id: "Z1", secs: 2237 },
      { id: "Z2", secs: 3151 },
      { id: "Z3", secs: 2537 },
      { id: "Z4", secs: 999 },
      { id: "Z5", secs: 489 },
      { id: "Z6", secs: 448 },
      { id: "Z7", secs: 199 },
      { id: "SS", secs: 1430 },
    ],
  });
  assert.equal(r.type, "Z2 Dauer");
  assert.equal(r.confidence, "hoch");
});

test("classifySession: 21.07.2026 — Sweet Spot oder härter, nicht Recovery", () => {
  const r = classifySession({
    np: 180,
    ftp: 193,
    min: 172,
    zoneTimes: [
      { id: "Z1", secs: 2334 },
      { id: "Z2", secs: 1448 },
      { id: "Z3", secs: 1791 },
      { id: "Z4", secs: 1839 },
      { id: "Z5", secs: 1600 },
      { id: "Z6", secs: 1115 },
      { id: "Z7", secs: 190 },
      { id: "SS", secs: 1711 },
    ],
  });
  assert.equal(r.type, "Sweet Spot");
  assert.notEqual(r.type, "Z1 Recovery");
  assert.equal(r.confidence, "hoch");
});

test("classifySession: 24.07.2026 — Sweet Spot trotz kurzer geplanter Recovery-Karte", () => {
  const r = classifySession({
    np: 178,
    ftp: 193,
    min: 75,
    zoneTimes: [
      { id: "Z1", secs: 1096 },
      { id: "Z2", secs: 569 },
      { id: "Z3", secs: 805 },
      { id: "Z4", secs: 976 },
      { id: "Z5", secs: 511 },
      { id: "Z6", secs: 361 },
      { id: "Z7", secs: 176 },
      { id: "SS", secs: 882 },
    ],
  });
  assert.equal(r.type, "Sweet Spot");
  assert.equal(r.confidence, "hoch");
});

test("classifySession: 25.07.2026 — langer Ritt im Z2-Dauer-IF-Band wird Z2 Lang", () => {
  const r = classifySession({
    np: 159,
    ftp: 193,
    min: 244,
    zoneTimes: [
      { id: "Z1", secs: 3578 },
      { id: "Z2", secs: 3151 },
      { id: "Z3", secs: 3609 },
      { id: "Z4", secs: 2613 },
      { id: "Z5", secs: 965 },
      { id: "Z6", secs: 533 },
      { id: "Z7", secs: 211 },
      { id: "SS", secs: 3074 },
    ],
  });
  assert.equal(r.type, "Z2 Lang");
  assert.equal(r.rule, "if-z2dauer-lang-override");
  assert.equal(r.confidence, "hoch");
});

/* ── Fehlende Daten ──────────────────────────────────────────────── */

test("classifySession: keine NP → type null, confidence niedrig", () => {
  const r = classifySession({ np: null, ftp: 193, min: 60 });
  assert.equal(r.type, null);
  assert.equal(r.confidence, "niedrig");
  assert.equal(r.rule, "keine-leistungsdaten");
});

test("classifySession: keine FTP → type null, confidence niedrig", () => {
  const r = classifySession({ np: 150, ftp: null, min: 60 });
  assert.equal(r.type, null);
  assert.equal(r.confidence, "niedrig");
});

test("classifySession: keine Argumente → type null, kein Crash", () => {
  const r = classifySession();
  assert.equal(r.type, null);
  assert.equal(r.confidence, "niedrig");
});

/* ── Sehr kurze Einheiten ────────────────────────────────────────── */

test("classifySession: sehr kurze Fahrt (< 20 min) senkt Konfidenz auf niedrig", () => {
  const r = classifySession({ np: 160, ftp: 193, min: 15 });
  assert.equal(r.confidence, "niedrig");
});

test("classifySession: kurze Fahrt mit hohem IF bleibt FTP-Test (keine Abwertung)", () => {
  const r = classifySession({ np: 250, ftp: 200, min: 12 });
  assert.equal(r.type, "FTP-Test");
  // FTP-Test ist bewusst von der Kurz-Dauer-Abwertung ausgenommen.
  assert.notEqual(r.confidence, "niedrig");
});

/* ── Grenzfälle je Schwelle (Werte identisch zu inferTypFromIF) ────── */

test("classifySession: IF genau an der ifLowMax-Grenze (0.75) fällt ins Z2-Dauer-Band", () => {
  const r = classifySession({ np: 150, ftp: 200, min: 90 }); // IF = 0.75 exakt
  assert.equal(r.type, "Z2 Dauer");
});

test("classifySession: IF knapp unter ifLowMax, lange Dauer → Z2 Lang", () => {
  const r = classifySession({ np: 149, ftp: 200, min: 130 }); // IF = 0.745
  assert.equal(r.type, "Z2 Lang");
});

test("classifySession: IF knapp unter ifLowMax, mittlere Dauer → Z2 Dauer", () => {
  const r = classifySession({ np: 149, ftp: 200, min: 90 });
  assert.equal(r.type, "Z2 Dauer");
});

test("classifySession: IF knapp unter ifLowMax, kurze Dauer → Z1 Recovery", () => {
  const r = classifySession({ np: 149, ftp: 200, min: 40 });
  assert.equal(r.type, "Z1 Recovery");
});

test("classifySession: IF an der ifSchwelleMax-Grenze (1.05) kippt auf VO2max", () => {
  const r = classifySession({ np: 210, ftp: 200, min: 45 }); // IF = 1.05 exakt
  assert.equal(r.type, "VO2max");
});

test("classifySession: IF knapp unter ifSchwelleMax bleibt Schwelle", () => {
  const r = classifySession({ np: 209, ftp: 200, min: 45 }); // IF = 1.045
  assert.equal(r.type, "Schwelle");
});

/* ── Zonenverteilung ─────────────────────────────────────────────── */

test("classifySession: ohne zoneTimes höchstens Konfidenz mittel", () => {
  const r = classifySession({ np: 180, ftp: 193, min: 90 });
  assert.equal(r.confidence, "mittel");
});

test("classifySession: Zonenverteilung widerspricht IF-Einstufung → Konfidenz mittel statt hoch", () => {
  // Sweet-Spot-IF, aber fast alles in Z1/Z2 gefahren (unplausibel, aber
  // prüft die Abwertung isoliert).
  const r = classifySession({
    np: 180,
    ftp: 193,
    min: 60,
    zoneTimes: [
      { id: "Z1", secs: 2000 },
      { id: "Z2", secs: 1000 },
      { id: "Z3", secs: 100 },
      { id: "Z4", secs: 100 },
      { id: "Z5", secs: 0 },
      { id: "Z6", secs: 0 },
      { id: "Z7", secs: 0 },
    ],
  });
  assert.equal(r.type, "Sweet Spot");
  assert.equal(r.confidence, "mittel");
});

test("classifySession: numerisches zoneTimes-Format (ohne id) wird ebenfalls ausgewertet", () => {
  const r = classifySession({
    np: 150,
    ftp: 193,
    min: 90,
    zoneTimes: [2000, 1500, 300, 200, 50, 20, 10],
  });
  assert.equal(r.type, "Z2 Dauer");
  assert.equal(r.confidence, "hoch");
});

test("classifySession: SS-Overlay-Eintrag wird nicht doppelt gezählt", () => {
  // Gleiche Fahrt einmal mit, einmal ohne SS-Eintrag — Konfidenz/Bänder-
  // Anteile müssen identisch sein, wenn SS korrekt herausgefiltert wird.
  const zonesWithout = [
    { id: "Z1", secs: 3578 },
    { id: "Z2", secs: 3151 },
    { id: "Z3", secs: 3609 },
    { id: "Z4", secs: 2613 },
    { id: "Z5", secs: 965 },
    { id: "Z6", secs: 533 },
    { id: "Z7", secs: 211 },
  ];
  const zonesWith = [...zonesWithout, { id: "SS", secs: 3074 }];
  const a = classifySession({ np: 159, ftp: 193, min: 244, zoneTimes: zonesWithout });
  const b = classifySession({ np: 159, ftp: 193, min: 244, zoneTimes: zonesWith });
  const bandSignal = (r) => r.signals.find((s) => s.label === "Zonenverteilung").value;
  assert.equal(bandSignal(a), bandSignal(b));
  assert.equal(a.confidence, b.confidence);
});

/* ── signals-Struktur ────────────────────────────────────────────── */

test("classifySession: signals sind menschenlesbar (label/value/note)", () => {
  const r = classifySession({ np: 180, ftp: 193, min: 172 });
  const ifSignal = r.signals.find((s) => s.label === "IF");
  assert.equal(ifSignal.value, 0.933);
  assert.match(ifSignal.note, /Sweet-Spot-Band/);
  const durSignal = r.signals.find((s) => s.label === "Dauer");
  assert.equal(durSignal.value, "172 min");
});

/* ── Blockerkennung (v2, 30.07.2026) ────────────────────────────────
   longestBlock kommt aus scripts/lib/interval-blocks.js::
   longestBlockAboveThreshold() — hier als bereits fertiges Objekt
   übergeben (classifySession prüft nicht, wie es entstanden ist). */

test("classifySession: 10.07.2026 — echter Block (53s) bleibt unter der Mindestdauer, kein Upgrade", () => {
  const r = classifySession({
    np: 155,
    ftp: 193,
    min: 168,
    longestBlock: { startSec: 8848, endSec: 8901, totalDurationSec: 53, workDurationSec: 53, avgWatts: 226 },
  });
  assert.equal(r.type, "Z2 Dauer");
  assert.equal(r.rule, "if-z2dauer");
});

test("classifySession: 21.07.2026 — echter Block (629s), aber nur 6,1% der 172-min-Fahrt → Anteilsschwelle greift, kein Block-Signal nötig", () => {
  // Anteil = 629s / (172*60s) = 6,1% < blockMinSharePct (8%) — der Block
  // beeinflusst die Einstufung hier nicht (war ohnehin schon über den
  // IF-Durchschnitt korrekt "Sweet Spot", braucht die Blockerkennung nicht).
  const r = classifySession({
    np: 180,
    ftp: 193,
    min: 172,
    longestBlock: { startSec: 3154, endSec: 3868, totalDurationSec: 714, workDurationSec: 629, avgWatts: 204 },
  });
  assert.equal(r.type, "Sweet Spot");
  assert.equal(r.signals.some((s) => s.label === "Zusammenhängender Block"), false);
});

test("classifySession: 25.07.2026 — 5-min-Block auf einer 244-min-Fahrt (2,1%) hebt NICHT an", () => {
  // Regressionstest für den zweiten kalibrierten Fund (30.07.2026): eine
  // rein absolute Mindestdauer hätte diese lange Fahrt fälschlich auf
  // "Sweet Spot" gehoben. 5 min sind bei 244 min Fahrzeit kein
  // charakterisierender Anteil.
  const r = classifySession({
    np: 159,
    ftp: 193,
    min: 244,
    longestBlock: { startSec: 0, endSec: 300, totalDurationSec: 300, workDurationSec: 300, avgWatts: 185 },
  });
  assert.equal(r.type, "Z2 Lang");
  assert.equal(r.signals.some((s) => s.label === "Zusammenhängender Block"), false);
});

test("classifySession: Block erfüllt absolute Dauer, aber nicht den Anteil → keine Anhebung", () => {
  // 6 min Block (> blockMinDurationSec) auf einer 150-min-Fahrt = 4% (< 8%).
  const r = classifySession({
    np: 160, // Z2 Dauer über den Durchschnitt
    ftp: 193,
    min: 150,
    longestBlock: { startSec: 0, endSec: 360, totalDurationSec: 360, workDurationSec: 360, avgWatts: 185 },
  });
  assert.equal(r.type, "Z2 Dauer");
  assert.equal(r.signals.some((s) => s.label === "Zusammenhängender Block"), false);
});

test("classifySession: Block erfüllt Anteil, aber nicht die absolute Mindestdauer → keine Anhebung", () => {
  // 4 min Block (< blockMinDurationSec 300s) auf einer 20-min-Fahrt = 20%
  // Anteil, aber die absolute Schwelle greift trotzdem zuerst.
  const r = classifySession({
    np: 160,
    ftp: 193,
    min: 20,
    longestBlock: { startSec: 0, endSec: 240, totalDurationSec: 240, workDurationSec: 240, avgWatts: 185 },
  });
  assert.equal(r.signals.some((s) => s.label === "Zusammenhängender Block"), false);
});

test("classifySession: hoher Block-IF wird nie zu VO2max, auch wenn beide Schwellen erfüllt sind", () => {
  // Regressionstest für den Bug im ersten Entwurf (s. Kommentar in
  // session-classify.js): 204W/193W FTP = IF 1,057, würde bei einer feinen
  // Block-IF-Leiter "VO2max" ergeben — bleibt bei "Sweet Spot".
  const r = classifySession({
    np: 140, // Fahrt-Durchschnitt allein: Z2 Dauer
    ftp: 193,
    min: 60, // Block macht > 8% der Fahrzeit aus (629/3600 = 17.5%)
    longestBlock: { startSec: 0, endSec: 629, totalDurationSec: 629, workDurationSec: 629, avgWatts: 204 },
  });
  assert.equal(r.type, "Sweet Spot");
  assert.notEqual(r.type, "VO2max");
});

test("classifySession: langer Block hebt Z2 Dauer auf Sweet Spot an (der eigentliche Zweck)", () => {
  const r = classifySession({
    np: 160, // allein IF 0.829 -> Z2 Dauer
    ftp: 193,
    min: 90,
    longestBlock: { startSec: 0, endSec: 600, totalDurationSec: 600, workDurationSec: 600, avgWatts: 185 },
  });
  assert.equal(r.type, "Sweet Spot");
  assert.equal(r.rule, "block-upgrade-sweet-spot");
  assert.equal(r.confidence, "hoch");
  const blockSignal = r.signals.find((s) => s.label === "Zusammenhängender Block");
  assert.match(blockSignal.note, /hebt Einstufung von Z2 Dauer auf Sweet Spot an/);
});

test("classifySession: Block unter der Mindestdauer (< 300s) hebt nicht an", () => {
  const r = classifySession({
    np: 160,
    ftp: 193,
    min: 90,
    longestBlock: { startSec: 0, endSec: 299, totalDurationSec: 299, workDurationSec: 299, avgWatts: 185 },
  });
  assert.equal(r.type, "Z2 Dauer");
  assert.equal(r.signals.some((s) => s.label === "Zusammenhängender Block"), false);
});

test("classifySession: Block wertet nie ab — bereits Schwelle bleibt Schwelle", () => {
  const r = classifySession({
    np: 200, // IF 1.036 -> Schwelle
    ftp: 193,
    min: 60,
    longestBlock: { startSec: 0, endSec: 400, totalDurationSec: 400, workDurationSec: 400, avgWatts: 185 },
  });
  assert.equal(r.type, "Schwelle");
  const blockSignal = r.signals.find((s) => s.label === "Zusammenhängender Block");
  assert.match(blockSignal.note, /bestätigt Schwelle/);
});

test("classifySession: FTP-Test wird nie durch einen Block überschrieben", () => {
  const r = classifySession({
    np: 210,
    ftp: 193,
    min: 12, // < ftpTestMaxMin, IF > ftpTestMinIF -> FTP-Test
    longestBlock: { startSec: 0, endSec: 400, totalDurationSec: 400, workDurationSec: 400, avgWatts: 200 },
  });
  assert.equal(r.type, "FTP-Test");
  assert.equal(r.signals.some((s) => s.label === "Zusammenhängender Block"), false);
});

test("classifySession: Block-Upgrade + widersprechende Zonenverteilung → Konfidenz 'mittel', nicht 'hoch'", () => {
  // Korrektur 30.07.2026 (auf Hinweis): ein Block-Upgrade darf einen
  // echten Signal-Widerspruch nicht verdecken — Block sagt "Sweet Spot",
  // die Zonenverteilung (fast nur Z1/Z2) widerspricht dem. "mittel" ist
  // hier die ehrlichere Konfidenz als eine erzwungene "hoch".
  const r = classifySession({
    np: 160,
    ftp: 193,
    min: 90,
    longestBlock: { startSec: 0, endSec: 600, totalDurationSec: 600, workDurationSec: 600, avgWatts: 185 },
    // Fast nur Z1/Z2 — bestätigt "Sweet Spot" (mid-Band) NICHT.
    zoneTimes: [
      { id: "Z1", secs: 3000 },
      { id: "Z2", secs: 2000 },
      { id: "Z3", secs: 200 },
      { id: "Z4", secs: 100 },
    ],
  });
  assert.equal(r.type, "Sweet Spot");
  assert.equal(r.confidence, "mittel");
});

test("classifySession: Block-Upgrade + bestätigende Zonenverteilung → Konfidenz bleibt 'hoch'", () => {
  const r = classifySession({
    np: 160,
    ftp: 193,
    min: 90,
    longestBlock: { startSec: 0, endSec: 600, totalDurationSec: 600, workDurationSec: 600, avgWatts: 185 },
    // Überwiegend Z3/Z4 — bestätigt "Sweet Spot" (mid-Band).
    zoneTimes: [
      { id: "Z1", secs: 500 },
      { id: "Z2", secs: 500 },
      { id: "Z3", secs: 2500 },
      { id: "Z4", secs: 1800 },
    ],
  });
  assert.equal(r.type, "Sweet Spot");
  assert.equal(r.confidence, "hoch");
});

test("classifySession: kein longestBlock -> Verhalten unverändert (Rückwärtskompatibilität)", () => {
  const withNull = classifySession({ np: 160, ftp: 193, min: 90, longestBlock: null });
  const withoutField = classifySession({ np: 160, ftp: 193, min: 90 });
  assert.deepEqual(withNull, withoutField);
  assert.equal(withNull.type, "Z2 Dauer");
});
