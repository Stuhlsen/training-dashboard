/* Tests: core/analysis-narrative.js — Klartext-Urteile für den Analyse-Tab
   „Antworten & Spuren". Prüft die Verzweigungen (Ampelfarbe/Verdict-Label),
   nicht den exakten Wortlaut der Sätze. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { heroVerdict, wins, strongerVerdict, loadVerdict, recoveryVerdict, blockerVerdict } from "./analysis-narrative.js";

test("heroVerdict: ohne Datenbasis neutrales 'noch zu wenig'-Urteil", () => {
  const v = heroVerdict({ ctlTrendDirection: null, tsb: null, tsbBand: null, daysToEvent: 10 });
  assert.match(v.headline, /Datenbasis/);
});

test("heroVerdict: Überlast + steigender CTL-Trend warnt trotz Aufbau", () => {
  const v = heroVerdict({ ctlTrendDirection: "steigend", tsb: -30, tsbBand: "overload", daysToEvent: 5 });
  assert.match(v.text, /Erholung/);
});

test("heroVerdict: Aufbaukorridor + steigender Trend ist die positive Standard-Formulierung", () => {
  const v = heroVerdict({ ctlTrendDirection: "steigend", tsb: -12, tsbBand: "build", daysToEvent: 20 });
  assert.match(v.headline, /verkraftest es/);
});

test("heroVerdict: nennt die Tage bis zum Event, wenn vorhanden", () => {
  const v = heroVerdict({ ctlTrendDirection: "stabil", tsb: 0, tsbBand: "neutral", daysToEvent: 32 });
  assert.match(v.text, /32 Tage/);
});

test("wins: enthält nur tatsächlich positive Belege, keine erfundenen", () => {
  const w = wins({
    efDeltaPct: 7,
    hrvVsBaselinePct: -3, // negativ -> kein Win
    gaShareDeltaPct: 7,
    gaShare: 0.82,
    gaTarget: 0.8,
    bestEffort: null,
  });
  assert.equal(w.some((x) => x.label === "HRV über Basis"), false);
  assert.equal(w.some((x) => x.label === "Aerobe Effizienz"), true);
  assert.equal(w.some((x) => x.label === "Grundlagenanteil"), true);
});

test("wins: leer, wenn nichts Positives vorliegt", () => {
  const w = wins({ efDeltaPct: null, hrvVsBaselinePct: null, gaShareDeltaPct: null, gaShare: null, gaTarget: 0.8, bestEffort: null });
  assert.deepEqual(w, []);
});

test("strongerVerdict: negativer eFTP-Trend UND keine EF-Verbesserung -> 'rückläufig'/warn", () => {
  const v = strongerVerdict({ eftpSlopePerWeek: -1.2, efDeltaPct: -2, ftpGoalGapW: 20 });
  assert.equal(v.verdict, "rückläufig");
  assert.equal(v.color, "warn");
});

test("strongerVerdict: positiver Trend, Ziel noch nicht erreicht -> 'ja, langsam'/pos", () => {
  const v = strongerVerdict({ eftpSlopePerWeek: 1.4, efDeltaPct: 7, ftpGoalGapW: 14 });
  assert.equal(v.verdict, "ja, langsam");
  assert.equal(v.color, "pos");
});

test("strongerVerdict: ohne jede Trend-Info -> 'unklar'/neutral", () => {
  const v = strongerVerdict({ eftpSlopePerWeek: null, efDeltaPct: null, ftpGoalGapW: null });
  assert.equal(v.verdict, "unklar");
  assert.equal(v.color, "neutral");
});

test("loadVerdict: zwei Ramp-Wochen über Band -> 'grenzwertig'/warn", () => {
  const v = loadVerdict({ rampWeeksOverBand: 2, tsb: -12, tsbBand: "build", gaShare: 0.75, gaTarget: 0.8 });
  assert.equal(v.verdict, "grenzwertig");
  assert.equal(v.color, "warn");
});

test("loadVerdict: Text nennt das 4-Wochen-Fenster, nie 'in Folge' (Live-Fund)", () => {
  const one = loadVerdict({ rampWeeksOverBand: 1, tsb: 5, tsbBand: "fresh", gaShare: null, gaTarget: 0.8 });
  assert.match(one.answer, /^In den letzten 4 Wochen lag eine Woche über dem sicheren Ramp-Zielband\./);
  const two = loadVerdict({ rampWeeksOverBand: 2, tsb: 5, tsbBand: "fresh", gaShare: null, gaTarget: 0.8 });
  assert.match(two.answer, /In den letzten 4 Wochen lagen 2 Wochen über/);
  assert.doesNotMatch(two.answer, /in Folge/);
});

test("HRV bei gerundet 0 %: kein 'über'/'unter', keine '+0 %'-Karte (Live-Fund)", () => {
  for (const pct of [0, 0.3, -0.4]) {
    const v = recoveryVerdict({ hrvVsBaselinePct: pct, rhrDeltaBpm: 0, shortNightsCount: 0, sleepTargetH: 7 });
    assert.match(v.answer, /^Die HRV liegt auf Höhe der eigenen Basis\./);
    assert.equal(v.verdict, "gut");
    const w = wins({ efDeltaPct: null, hrvVsBaselinePct: pct, gaShareDeltaPct: null, gaShare: null, gaTarget: 0.8, bestEffort: null });
    assert.equal(w.length, 0);
  }
  const up = wins({ efDeltaPct: null, hrvVsBaselinePct: 4.6, gaShareDeltaPct: null, gaShare: null, gaTarget: 0.8, bestEffort: null });
  assert.equal(up[0].value, "+5 %");
});

test("recoveryVerdict mit Tagesform-Status: HRV -9 % aber Status ok -> nicht 'angeschlagen' (Live-Fund)", () => {
  const v = recoveryVerdict({
    hrvVsBaselinePct: -9, rhrDeltaBpm: 0, shortNightsCount: 0, sleepTargetH: 7,
    hrvStatus: "ok", rhrStatus: "ok",
  });
  assert.equal(v.verdict, "gut");
  assert.match(v.answer, /9 % unter der eigenen Basis — im Rahmen deiner üblichen Schwankung\./);
});

test("recoveryVerdict mit Tagesform-Status: alert -> angeschlagen, caution oder kurze Nächte -> durchwachsen", () => {
  const base = { hrvVsBaselinePct: -2, rhrDeltaBpm: 1, shortNightsCount: 0, sleepTargetH: 7 };
  assert.equal(recoveryVerdict({ ...base, hrvStatus: "alert", rhrStatus: "ok" }).verdict, "angeschlagen");
  assert.equal(recoveryVerdict({ ...base, hrvStatus: "ok", rhrStatus: "caution" }).verdict, "durchwachsen");
  assert.equal(
    recoveryVerdict({ ...base, shortNightsCount: 4, hrvStatus: "ok", rhrStatus: "ok" }).verdict,
    "durchwachsen"
  );
});

test("recoveryVerdict ohne Status (keine Basis) -> alte feste Grenzen", () => {
  const v = recoveryVerdict({
    hrvVsBaselinePct: -9, rhrDeltaBpm: 0, shortNightsCount: 0, sleepTargetH: 7,
    hrvStatus: "nodata", rhrStatus: null,
  });
  assert.equal(v.verdict, "angeschlagen");
  assert.doesNotMatch(v.answer, /üblichen Schwankung/);
});

test("loadVerdict: alles im Korridor -> 'im Korridor'/pos", () => {
  const v = loadVerdict({ rampWeeksOverBand: 0, tsb: -10, tsbBand: "build", gaShare: 0.85, gaTarget: 0.8 });
  assert.equal(v.verdict, "im Korridor");
  assert.equal(v.color, "pos");
});

test("recoveryVerdict: HRV deutlich unter Basis + erhöhter Ruhepuls -> 'angeschlagen'/warn", () => {
  const v = recoveryVerdict({ hrvVsBaselinePct: -12, rhrDeltaBpm: 5, shortNightsCount: 3, sleepTargetH: 7 });
  assert.equal(v.verdict, "angeschlagen");
  assert.equal(v.color, "warn");
});

test("recoveryVerdict: HRV über Basis, stabiler Ruhepuls, kaum kurze Nächte -> 'gut'/pos", () => {
  const v = recoveryVerdict({ hrvVsBaselinePct: 5, rhrDeltaBpm: -1, shortNightsCount: 0, sleepTargetH: 7 });
  assert.equal(v.verdict, "gut");
  assert.equal(v.color, "pos");
});

test("blockerVerdict: keine der vier Größen problematisch -> 'keine erkennbaren Bremser'/pos", () => {
  const v = blockerVerdict({
    decouplingStableSharePct: 95,
    cadenceSharePct: 60,
    cadenceAvg: 92,
    cadenceTarget: 90,
    energyDeficitAvgKcal: 50,
    hydrationBelowTargetShare: 0.1,
  });
  assert.equal(v.verdict, "keine erkennbaren Bremser");
  assert.equal(v.color, "pos");
});

test("blockerVerdict: mehrere Baustellen -> Anzahl im Verdict-Label, warn", () => {
  const v = blockerVerdict({
    decouplingStableSharePct: 60,
    cadenceSharePct: 40,
    cadenceAvg: 85,
    cadenceTarget: 90,
    energyDeficitAvgKcal: -230,
    hydrationBelowTargetShare: 0.5,
  });
  assert.match(v.verdict, /Baustellen/);
  assert.equal(v.color, "warn");
});

test("blockerVerdict: ohne jede Eingabe -> 'unklar'/neutral statt leerer Antwort", () => {
  const v = blockerVerdict({
    decouplingStableSharePct: null,
    cadenceSharePct: null,
    cadenceAvg: null,
    cadenceTarget: 90,
    energyDeficitAvgKcal: null,
    hydrationBelowTargetShare: null,
  });
  assert.equal(v.verdict, "unklar");
});
