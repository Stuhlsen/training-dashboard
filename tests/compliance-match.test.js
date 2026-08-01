/* Tests: core/compliance-match.js (Progressionssteuerung C1/C2)
   Synthetische workout_structure + synthetische icu_intervals-Segmente
   (Feldform wie scripts/lib/interval-blocks.js-Cache: start_time/end_time/
   average_watts, Sekunden ab Fahrtbeginn). FTP durchgehend 200W, damit die
   Prozentwerte direkt als Watt lesbar bleiben (90% = 180W usw.). */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickPrimaryRide,
  shouldEvaluateCard,
  expandPlannedIntervals,
  mergeActiveSegments,
  matchWorkoutToSegments,
  computeCompliance,
} from "../assets/js/core/compliance-match.js";

const FTP = 200;

/** 3×10min Sweet Spot @ 90% FTP, 5min Pause @ 50% FTP, WU/CD @ 55%/50%. */
const SWEETSPOT_3X10 = {
  version: 1,
  steps: [
    { kind: "warmup", duration_s: 600, target_pct_ftp: 55 },
    {
      kind: "set",
      reps: 3,
      work: { duration_s: 600, target_pct_ftp: 90 },
      recovery: { duration_s: 300, target_pct_ftp: 50 },
    },
    { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
  ],
};

/** Segmente für drei saubere 600s-Arbeitsblöcke bei den übergebenen Watt-
 *  Werten, mit 300s-Pausen dazwischen (Warmup/Cooldown weggelassen, für
 *  das Matching irrelevant — der Merge-Threshold liegt klar darüber). */
function threeCleanBlocks([w1, w2, w3]) {
  return [
    { start_time: 0, end_time: 600, average_watts: w1, type: "WORK" },
    { start_time: 600, end_time: 900, average_watts: 100, type: "RECOVERY" },
    { start_time: 900, end_time: 1500, average_watts: w2, type: "WORK" },
    { start_time: 1500, end_time: 1800, average_watts: 100, type: "RECOVERY" },
    { start_time: 1800, end_time: 2400, average_watts: w3, type: "WORK" },
  ];
}

test("expandPlannedIntervals: set-Reps korrekt ausmultipliziert, warmup/cooldown nicht matchbar", () => {
  const units = expandPlannedIntervals(SWEETSPOT_3X10, FTP);
  assert.equal(units.length, 3);
  for (const u of units) {
    assert.equal(u.kind, "set");
    assert.equal(u.plannedDurationS, 600);
    assert.equal(u.targetWatts, 180);
  }
});

test("expandPlannedIntervals: accessory-Schritte sind nie matchbar (L6.1)", () => {
  const structure = {
    version: 1,
    steps: [
      { kind: "set", reps: 1, work: { duration_s: 600, target_pct_ftp: 90 }, recovery: { duration_s: 300, target_pct_ftp: 50 } },
      { kind: "accessory", subtype: "sprint", reps: 4, work: { duration_s: 15, target: "max" }, recovery: { duration_s: 285, target_pct_ftp: 50 } },
    ],
  };
  const units = expandPlannedIntervals(structure, FTP);
  assert.equal(units.length, 1);
  assert.equal(units[0].kind, "set");
});

test("mergeActiveSegments: liefert ALLE qualifizierenden Blöcke, nicht nur den längsten", () => {
  const segments = threeCleanBlocks([185, 183, 181]);
  const blocks = mergeActiveSegments(segments, 164, 90);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((b) => b.workDurationSec), [600, 600, 600]);
});

test("computeCompliance: alle drei Intervalle erfüllt, geringer Fade → grün", () => {
  const segments = threeCleanBlocks([185, 183, 181]); // Fade (181-185)/185 = -2.16%
  const result = computeCompliance(SWEETSPOT_3X10, segments, FTP, { cardId: "card-1" });
  assert.equal(result.intervalsPlanned, 3);
  assert.equal(result.intervalsCompleted, 3);
  assert.equal(result.rating, "green");
  assert.equal(result.rule, "alle-intervalle-erfuellt");
  assert.equal(result.matchedCardId, "card-1");
  assert.ok(result.fadePct > -3 && result.fadePct < 0, `Fade sollte gering negativ sein, war ${result.fadePct}`);
});

test("computeCompliance: drittes Intervall fehlt komplett → rot, 'intervall-abgebrochen'", () => {
  const segments = [
    { start_time: 0, end_time: 600, average_watts: 185, type: "WORK" },
    { start_time: 600, end_time: 900, average_watts: 100, type: "RECOVERY" },
    { start_time: 900, end_time: 1500, average_watts: 183, type: "WORK" },
    // kein drittes Arbeitsintervall — Fahrt endete vorzeitig
  ];
  const result = computeCompliance(SWEETSPOT_3X10, segments, FTP, { cardId: "card-2" });
  assert.equal(result.intervalsCompleted, 2);
  assert.equal(result.intervalsPlanned, 3);
  assert.equal(result.rating, "red");
  assert.equal(result.rule, "intervall-abgebrochen");
});

test("computeCompliance: starker Fade (< -8%) bei sonst vollständigen Intervallen → rot, 'fade-stark'", () => {
  const segments = threeCleanBlocks([200, 190, 180]); // Fade (180-200)/200 = -10%, 180 bleibt ≥ 174.6 (Zielwatt-3%)
  const result = computeCompliance(SWEETSPOT_3X10, segments, FTP, { cardId: "card-3" });
  assert.equal(result.intervalsCompleted, 3, "alle drei sollten einzeln noch erfüllt sein");
  assert.equal(result.rating, "red");
  assert.equal(result.rule, "fade-stark");
  assert.ok(result.fadePct < -8);
});

test("computeCompliance: alle Intervalle exakt an der 90%-Dauergrenze erfüllt → gelb, 'zeit-in-zone-mittel'", () => {
  // Jedes Intervall einzeln erfüllt (540s ≥ 90% von 600s) — die Summe kann
  // dadurch rechnerisch nie unter 90% fallen (gewichteter Durchschnitt aus
  // lauter ≥90%-Werten), "zeit-in-zone-niedrig" (rot, <85%) ist unter der
  // aktuellen Erfüllungsdefinition deshalb unerreichbar; die gelbe Bande
  // (85–95%) bleibt aber sehr wohl erreichbar, s. hier.
  const segments = [
    { start_time: 0, end_time: 540, average_watts: 185, type: "WORK" },
    { start_time: 540, end_time: 900, average_watts: 100, type: "RECOVERY" },
    { start_time: 900, end_time: 1440, average_watts: 185, type: "WORK" },
    { start_time: 1440, end_time: 1800, average_watts: 100, type: "RECOVERY" },
    { start_time: 1800, end_time: 2340, average_watts: 185, type: "WORK" },
  ];
  const result = computeCompliance(SWEETSPOT_3X10, segments, FTP, { cardId: "card-4" });
  assert.equal(result.intervalsCompleted, 3);
  assert.equal(result.actualZoneTime_s / result.plannedZoneTime_s, 0.9);
  assert.equal(result.rating, "yellow");
  assert.equal(result.rule, "zeit-in-zone-mittel");
});

test("computeCompliance: RPE ≥ 8 bei sonst grüner Einheit → gelb, nicht rot (C2.1)", () => {
  const segments = threeCleanBlocks([185, 184, 183]); // minimaler Fade
  const result = computeCompliance(SWEETSPOT_3X10, segments, FTP, { cardId: "card-5", rpe: 8 });
  assert.equal(result.intervalsCompleted, 3);
  assert.equal(result.rating, "yellow");
  assert.equal(result.rule, "rpe-hoch");
});

test("computeCompliance: RPE ≥ 8 wertet eine bereits rote Einheit nicht zusätzlich ab (Präzedenz bleibt rot)", () => {
  const segments = [
    { start_time: 0, end_time: 600, average_watts: 185, type: "WORK" },
    { start_time: 600, end_time: 900, average_watts: 100, type: "RECOVERY" },
    { start_time: 900, end_time: 1500, average_watts: 183, type: "WORK" },
  ];
  const result = computeCompliance(SWEETSPOT_3X10, segments, FTP, { cardId: "card-6", rpe: 9 });
  assert.equal(result.rating, "red");
  assert.equal(result.rule, "intervall-abgebrochen");
});

test("computeCompliance: alternating (Over/Under) wird gegen overTime_s bewertet, nicht gegen die Blockdauer", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 1,
        cycles: 3,
        duration_s: 720,
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 120, target_pct_ftp: 88 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
    ],
  };
  // Drei saubere Over/Under-Zyklen, exakt wie geplant (over@215W, under@180W).
  const segments = [
    { start_time: 0, end_time: 120, average_watts: 215, type: "WORK" },
    { start_time: 120, end_time: 240, average_watts: 180, type: "WORK" },
    { start_time: 240, end_time: 360, average_watts: 215, type: "WORK" },
    { start_time: 360, end_time: 480, average_watts: 180, type: "WORK" },
    { start_time: 480, end_time: 600, average_watts: 215, type: "WORK" },
    { start_time: 600, end_time: 720, average_watts: 180, type: "WORK" },
  ];
  const result = computeCompliance(structure, segments, FTP, { cardId: "card-7" });
  assert.equal(result.intervalsPlanned, 1);
  assert.equal(result.intervalsCompleted, 1);
  assert.equal(result.plannedZoneTime_s, 360); // 3 × 120s Over-Zeit, nicht 720s Blockdauer
  assert.equal(result.actualZoneTime_s, 360);
  assert.equal(result.rating, "green");
});

test("computeCompliance: workout_structure ohne matchbare Einheiten (nur warmup/cooldown) → null", () => {
  const structure = { version: 1, steps: [{ kind: "warmup", duration_s: 600, target_pct_ftp: 55 }] };
  const result = computeCompliance(structure, [], FTP, { cardId: "card-8" });
  assert.equal(result, null);
});

test("shouldEvaluateCard: Karte ohne workout_structure (Altbestand) → kein Compliance-Objekt", () => {
  assert.equal(shouldEvaluateCard({ workoutStructure: null, status: "geplant", typ: "Sweet Spot" }), false);
  assert.equal(shouldEvaluateCard({ status: "geplant", typ: "Sweet Spot" }), false);
});

test("shouldEvaluateCard: ausgefallene Karte → kein Compliance-Objekt", () => {
  assert.equal(
    shouldEvaluateCard({ workoutStructure: SWEETSPOT_3X10, status: "ausgefallen", typ: "Sweet Spot" }),
    false
  );
});

test("shouldEvaluateCard: rest-Karte → kein Compliance-Objekt (D6.1, eigenes Trainer-Signal statt Ampel)", () => {
  assert.equal(shouldEvaluateCard({ workoutStructure: SWEETSPOT_3X10, status: "geplant", typ: "rest" }), false);
});

test("shouldEvaluateCard: Karte mit gültiger Struktur → evaluierbar", () => {
  assert.equal(
    shouldEvaluateCard({ workoutStructure: SWEETSPOT_3X10, status: "geplant", typ: "Sweet Spot" }),
    true
  );
});

test("pickPrimaryRide: Ausrollen-Fahrten scheiden aus, höherer TSS gewinnt", () => {
  const rides = [
    { typ: "Sweet Spot", tss: 65, min: 90 },
    { typ: "Ausrollen", tss: 5, min: 10 },
    { typ: "Sweet Spot", tss: 40, min: 60 },
  ];
  const picked = pickPrimaryRide(rides);
  assert.equal(picked.tss, 65);
});

test("pickPrimaryRide: nur Ausrollen-Fahrten vorhanden → null", () => {
  assert.equal(pickPrimaryRide([{ typ: "Ausrollen", tss: 5, min: 10 }]), null);
});

test("pickPrimaryRide: leere Liste → null", () => {
  assert.equal(pickPrimaryRide([]), null);
});

test("matchWorkoutToSegments: fehlende Segmente (nie abgerufen) → alle Einheiten unerfüllt, kein Wurf", () => {
  const result = matchWorkoutToSegments(SWEETSPOT_3X10, null, FTP);
  assert.equal(result.intervalsPlanned, 3);
  assert.equal(result.intervalsCompleted, 0);
  assert.equal(result.actualZoneTime_s, 0);
});
