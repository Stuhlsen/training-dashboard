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
  SUBJECTIVE_READINESS_CONFIG,
  getSubjectiveReadiness,
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

/* ── getSubjectiveReadiness: subjektiver Kanal (Morgen-Check-in) ─
   Konzept docs/phase-2-konzept-morgen-checkin.md Abschnitt 5.1/5.4.
   Score ist der gewichtete Mittelwert dreier 1..5-Ganzzahlen (v1 gleich-
   gewichtet) — bei drei gleichgewichteten Ganzzahlen sind nur Vielfache
   von 1/3 erreichbar (1.00, 1.33, …, 5.00). 2.75 (yellowMin) liegt
   NICHT auf diesem Raster und ist mit echten Eingaben nicht exakt
   erreichbar — die Grenzfall-Tests prüfen deshalb den Konstantenwert
   direkt (wie READINESS_CONFIG oben) plus die beiden nächstgelegenen
   erreichbaren Werte, die die Schwelle einschließen (2.67 knapp
   darunter, 3.00 darüber). 4.00 (greenMin) ist dagegen exakt erreichbar
   (12/3) und wird direkt an der Grenze getestet. */

const TODAY_SUBJ = "2026-07-13";
const YESTERDAY_SUBJ = "2026-07-12";
const OLDER_SUBJ = "2026-07-10"; // 3 Tage alt — fachlich wie "kein Eintrag"

test("SUBJECTIVE_READINESS_CONFIG: Schwellen/Gewichte wie im Konzept (5.1/D6)", () => {
  assert.equal(SUBJECTIVE_READINESS_CONFIG.greenMin, 4.0);
  assert.equal(SUBJECTIVE_READINESS_CONFIG.yellowMin, 2.75);
  assert.deepEqual(SUBJECTIVE_READINESS_CONFIG.weights, { energy: 1, muscleFeel: 1, mood: 1 });
});

test("getSubjectiveReadiness: kein Eintrag → ausstehend, score/level/components null", () => {
  const r = getSubjectiveReadiness([], TODAY_SUBJ);
  assert.equal(r.freshness, "ausstehend");
  assert.equal(r.score, null);
  assert.equal(r.level, null);
  assert.deepEqual(r.components, { energy: null, muscleFeel: null, mood: null });
});

test("getSubjectiveReadiness: nur ein Eintrag älter als gestern → gleichwertig zu 'kein Eintrag'", () => {
  const r = getSubjectiveReadiness(
    [{ date: OLDER_SUBJ, energy: 5, muscleFeel: 5, mood: 5 }],
    TODAY_SUBJ
  );
  assert.equal(r.freshness, "ausstehend");
  assert.equal(r.score, null);
  assert.equal(r.level, null);
});

test("getSubjectiveReadiness: heutiger Eintrag → vorhanden, Score/Components aus heute", () => {
  const r = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: 4, muscleFeel: 4, mood: 4 }],
    TODAY_SUBJ
  );
  assert.equal(r.freshness, "vorhanden");
  assert.equal(r.score, 4.0);
  assert.equal(r.level, "green");
  assert.deepEqual(r.components, { energy: 4, muscleFeel: 4, mood: 4 });
});

test("getSubjectiveReadiness: nur gestriger Eintrag (exakt 1 Tag) → veraltet, Score trotzdem berechnet", () => {
  const r = getSubjectiveReadiness(
    [{ date: YESTERDAY_SUBJ, energy: 2, muscleFeel: 2, mood: 2 }],
    TODAY_SUBJ
  );
  assert.equal(r.freshness, "veraltet");
  assert.equal(r.score, 2.0);
  assert.equal(r.level, "red");
});

test("getSubjectiveReadiness: heutiger Eintrag hat Vorrang vor gestrigem, auch wenn beide vorhanden sind", () => {
  const r = getSubjectiveReadiness(
    [
      { date: YESTERDAY_SUBJ, energy: 1, muscleFeel: 1, mood: 1 },
      { date: TODAY_SUBJ, energy: 5, muscleFeel: 5, mood: 5 },
    ],
    TODAY_SUBJ
  );
  assert.equal(r.freshness, "vorhanden");
  assert.equal(r.score, 5.0);
});

test("getSubjectiveReadiness: Grenzfall greenMin (4.0) exakt erreichbar → green ab 4.0, darunter yellow", () => {
  const atGreen = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: 3, muscleFeel: 4, mood: 5 }], // (3+4+5)/3 = 4.00
    TODAY_SUBJ
  );
  assert.equal(atGreen.score, 4.0);
  assert.equal(atGreen.level, "green");

  const belowGreen = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: 3, muscleFeel: 4, mood: 4 }], // (3+4+4)/3 = 3.67
    TODAY_SUBJ
  );
  assert.equal(belowGreen.score, 3.67);
  assert.equal(belowGreen.level, "yellow");
});

test("getSubjectiveReadiness: Grenzfall yellowMin (2.75) — nächstgelegene erreichbare Werte beidseits der Schwelle", () => {
  const aboveYellow = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: 3, muscleFeel: 3, mood: 3 }], // 3.00 ≥ 2.75
    TODAY_SUBJ
  );
  assert.equal(aboveYellow.score, 3.0);
  assert.equal(aboveYellow.level, "yellow");

  const belowYellow = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: 3, muscleFeel: 3, mood: 2 }], // 2.67 < 2.75
    TODAY_SUBJ
  );
  assert.equal(belowYellow.score, 2.67);
  assert.equal(belowYellow.level, "red");
});

test("getSubjectiveReadiness: fehlende Components werden aus dem gewichteten Mittel ausgeschlossen, nicht als 0 gewertet", () => {
  const r = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: 5, muscleFeel: null, mood: 5 }],
    TODAY_SUBJ
  );
  assert.equal(r.score, 5.0); // Mittel aus energy+mood allein, nicht (5+0+5)/3
  assert.equal(r.level, "green");
  assert.deepEqual(r.components, { energy: 5, muscleFeel: null, mood: 5 });
});

test("getSubjectiveReadiness: Eintrag ganz ohne Werte (alle Components null) → score/level null trotz 'vorhanden'", () => {
  const r = getSubjectiveReadiness(
    [{ date: TODAY_SUBJ, energy: null, muscleFeel: null, mood: null }],
    TODAY_SUBJ
  );
  assert.equal(r.freshness, "vorhanden"); // Zeile existiert für heute
  assert.equal(r.score, null);
  assert.equal(r.level, null);
});
