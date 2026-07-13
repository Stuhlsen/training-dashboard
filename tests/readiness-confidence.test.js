/* Tests: Konfidenz je Metrik (vorhanden/ausstehend/veraltet) in
   core/readiness.js — ergänzt die bestehenden assessReadiness-Tests in
   tests/loadguard-readiness-zones.test.js um die Sync-Lücken-Fälle. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  READINESS_CONFIG,
  BASELINE_DAYS,
  RECENT_DAYS,
  metricConfidence,
  assessReadiness,
} from "../assets/js/core/readiness.js";
import { readinessSignal } from "../assets/js/core/briefing.js";

/* ── Config ──────────────────────────────────────────────────── */

test("READINESS_CONFIG: BASELINE_DAYS/RECENT_DAYS sind Aliase, keine Doppel-Konstanten", () => {
  assert.equal(BASELINE_DAYS, READINESS_CONFIG.baselineDays);
  assert.equal(RECENT_DAYS, READINESS_CONFIG.recentDays);
  assert.equal(typeof READINESS_CONFIG.zCaution, "number");
  assert.equal(typeof READINESS_CONFIG.zAlert, "number");
  assert.equal(typeof READINESS_CONFIG.freshMaxAgeDays, "number");
  assert.equal(typeof READINESS_CONFIG.staleMinAgeDays, "number");
});

test("metricConfidence: Grenzwerte anhand der Config, nicht als Magic Numbers", () => {
  assert.equal(metricConfidence(null), "veraltet"); // nie erfasst
  assert.equal(metricConfidence(0), "vorhanden");
  assert.equal(metricConfidence(READINESS_CONFIG.freshMaxAgeDays), "vorhanden");
  assert.equal(metricConfidence(READINESS_CONFIG.freshMaxAgeDays + 1), "ausstehend");
  assert.equal(metricConfidence(READINESS_CONFIG.staleMinAgeDays - 1), "ausstehend");
  assert.equal(metricConfidence(READINESS_CONFIG.staleMinAgeDays), "veraltet");
});

/* ── assessReadiness: Konfidenz-Fälle ────────────────────────── */

/** Lokales ISO-Datum (kein UTC-Versatz), gleiches Muster wie
 *  core/adherence.js::mondayOf / ui/analysis.js::todayISO. */
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** n Tage Historie ab todayISO rückwärts, mit optionalem Sync-Lücken-Cutoff
 *  je Metrik (letzte `gapDays` Tage vor todayISO fehlt der Wert komplett). */
function makeWellness(todayISO, n, values, gaps = {}) {
  const out = [];
  const anchor = new Date(`${todayISO}T00:00:00`);
  for (let i = 1; i <= n; i++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    const dateISO = localISO(d);
    const day = { date: dateISO };
    for (const [key, v] of Object.entries(values)) {
      const gap = gaps[key] || 0;
      day[key] = i <= gap ? null : v;
    }
    out.push(day);
  }
  return out;
}

/** Wie makeWellness, aber ein Feld hat einen abweichenden Wert im noch
 *  sichtbaren Teil des 7-Tage-Fensters (zwischen Lücke und Baseline) — damit
 *  sich Ausschluss aus der Ampel nachweisen lässt (Wert wäre für sich
 *  "alert"-würdig, obwohl er technisch noch im Fenster steht). */
function makeWellnessWithRecentSpike(todayISO, n, baseValues, key, gapDays, spikeValue) {
  const rows = makeWellness(todayISO, n, baseValues, { [key]: gapDays });
  // rows[i-1] entspricht Tag i (gleiche Reihenfolge/Index wie in makeWellness).
  for (let i = 1; i <= n; i++) {
    const row = rows[i - 1];
    // sd>0 in der Baseline, sonst bleibt z (und damit der Status) für jede
    // Metrik "nodata" statt "ok"/"alert" — realistischer Jitter für alle Felder,
    // VOR dem Spike-Override gesetzt (Spike gewinnt für die letzten sichtbaren
    // Tage der Ziel-Metrik).
    if (i > RECENT_DAYS) {
      for (const k of Object.keys(baseValues)) row[k] += (i % 3) - 1 ? 0.1 : -0.1;
    }
    if (i > gapDays && i <= RECENT_DAYS) row[key] = spikeValue;
  }
  return rows;
}

const TODAY = "2026-07-13";
const STABLE = { hrv: 62, restingHR: 52, sleepHours: 7.2 };

test("assessReadiness: alle drei Metriken frisch → vorhanden, Basis 3/3, keine Warnung", () => {
  const wellness = makeWellness(TODAY, 50, STABLE);
  const r = assessReadiness(wellness, TODAY);
  assert.ok(r);
  assert.ok(r.metrics.every((m) => m.confidence === "vorhanden"));
  assert.equal(r.basisNote, "Basiert auf 3/3 Metriken");
  assert.equal(r.staleWarning, null);
  assert.equal(r.level, "green");
});

test("assessReadiness: eine Metrik ausstehend (Sync-Lücke 3 Tage) → ausgeschlossen, Level aus den übrigen zwei", () => {
  // Schlaf fehlt seit 3 Tagen, die letzten sichtbaren Werte davor sind stark
  // verkürzt (wären für sich "alert"-würdig) — muss trotzdem komplett von der
  // Ampel-Kombination ausgeschlossen sein, weil die Metrik "ausstehend" ist.
  const wellness = makeWellnessWithRecentSpike(TODAY, 50, STABLE, "sleepHours", 3, 4);
  const r = assessReadiness(wellness, TODAY);
  assert.ok(r);
  const sleep = r.metrics.find((m) => m.key === "sleep");
  assert.equal(sleep.confidence, "ausstehend");
  assert.equal(sleep.status, "alert"); // wäre für sich eskaliert
  assert.equal(r.level, "green"); // trotzdem ausgeschlossen → HRV/Ruhepuls entscheiden
  assert.match(r.basisNote, /Basiert auf 2\/3 Metriken/);
  assert.match(r.basisNote, /Schlaf ausstehend/);
  assert.equal(r.staleWarning, null); // ausstehend bleibt stumm, keine Warnung
});

test("assessReadiness: eine Metrik veraltet (≥5 Tage) → ausgeschlossen UND eskaliert (≠ ausstehend)", () => {
  const wellness = makeWellness(TODAY, 50, STABLE, { restingHR: 5 });
  const r = assessReadiness(wellness, TODAY);
  assert.ok(r);
  const rhr = r.metrics.find((m) => m.key === "restingHR");
  assert.equal(rhr.confidence, "veraltet");
  assert.match(r.basisNote, /Basiert auf 2\/3 Metriken/);
  assert.match(r.basisNote, /Ruhepuls veraltet/);
  assert.ok(r.staleWarning);
  assert.match(r.staleWarning, /Ruhepuls/);
  assert.match(r.staleWarning, /seit 6 Tagen/);
  // Kernunterschied zu "ausstehend": HRV+Schlaf wären für sich grün, trotzdem
  // wird wegen der veralteten Metrik nicht auf "green" degradiert.
  assert.equal(r.level, "yellow");
});

test("assessReadiness: Werte deutlich außerhalb der 42-Tage-Baseline → weiter korrekte Eskalation (Regression)", () => {
  const base = makeWellness(TODAY, 49, STABLE).map((w, i) => ({
    ...w,
    hrv: 62 + (i % 3) - 1,
    restingHR: 52 + (i % 2),
  }));
  const stressedRecent = base.map((w) =>
    w.date >= "2026-07-06" ? { ...w, hrv: 45, restingHR: 60 } : w
  );
  const r = assessReadiness(stressedRecent, TODAY);
  assert.ok(r);
  assert.equal(r.level, "red");
  assert.equal(r.metrics.find((m) => m.key === "hrv").status, "alert");
  assert.equal(r.metrics.find((m) => m.key === "hrv").confidence, "vorhanden");
});

test("assessReadiness: alle drei Metriken ohne aktuelle Daten → Level erzwungen yellow, Basis 0/3", () => {
  const wellness = makeWellness(TODAY, 50, STABLE, {
    hrv: 6,
    restingHR: 6,
    sleepHours: 6,
  });
  const r = assessReadiness(wellness, TODAY);
  assert.ok(r);
  assert.ok(r.metrics.every((m) => m.confidence === "veraltet"));
  assert.equal(r.level, "yellow");
  assert.match(r.basisNote, /Basiert auf 0\/3 Metriken/);
  assert.ok(r.staleWarning);
});

test("assessReadiness: Historie-Guards bleiben unverändert (Regression)", () => {
  const wellness = makeWellness(TODAY, 8, STABLE);
  assert.equal(assessReadiness(wellness, TODAY), null);
  assert.equal(assessReadiness([], TODAY), null);
});

/* ── Konsistenz: briefing.js dupliziert keine Schwellenwerte ────── */

test("readinessSignal: liest ausschließlich .level, keine eigene Kopie der Readiness-Schwellen", () => {
  // Minimales Objekt ohne metrics/confidence/basisNote — muss trotzdem
  // funktionieren, da core/briefing.js keine eigene Readiness-Logik hält.
  assert.equal(readinessSignal({ level: "yellow" }).status, "caution");
  assert.equal(readinessSignal({ level: "red" }).status, "alert");
  assert.equal(readinessSignal({ level: "green" }).status, "ok");
});
