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
