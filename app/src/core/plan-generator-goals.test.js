/* Tests: core/plan-generator.js — optionales `goalProfile` (Fahrplan 43 E5).
   Wirkt nur über vorhandene Stellschrauben (flache Rampe, Startumfang, harte
   Tage). Ohne das Feld bleibt die Ausgabe identisch (Golden Master). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { generatePlan, emptyHistory, LOW_START_VOLUME_FACTOR } from "./plan-generator.js";
import { goalPlanProfile } from "./goals.js";

function eventInput(over = {}) {
  return {
    startDate: "2026-09-07",
    mode: "event",
    eventDate: "2026-11-29",
    trainingWeekdays: [1, 2, 4, 6],
    weeklyHours: 8,
    currentFtp: 250,
    ftpMeasuredDate: "2026-08-20",
    ftpTarget: null,
    focus: "allgemein",
    level: "fortgeschritten",
    model: "pyramidal",
    history: {
      weeklyActualTss: [420, 440, 455, 460],
      currentCtl: 62,
      currentEftp: 255,
      planAdherence: 0.85,
      ageYears: 34,
      powerCurveWeakness: null,
    },
    ...over,
  };
}

function openInput(over = {}) {
  return {
    startDate: "2026-09-07",
    mode: "open",
    weeks: 10,
    trainingWeekdays: [2, 4, 6, 7],
    weeklyHours: 6,
    currentFtp: null,
    ftpMeasuredDate: null,
    ftpTarget: null,
    focus: "allgemein",
    level: "einsteiger",
    model: "linear",
    history: emptyHistory(),
    ...over,
  };
}

const peak = (p) =>
  Math.max(...p.weeks.filter((w) => !w.isRecovery && w.phase !== "Taper").map((w) => w.targetTss));

test("ohne goalProfile und mit leerem Profil: identische Ausgabe", () => {
  const base = generatePlan(eventInput());
  assert.deepEqual(generatePlan(eventInput({ goalProfile: undefined })), base);
  assert.deepEqual(generatePlan(eventInput({ goalProfile: goalPlanProfile(null, null) })), base);
  // Muskeln/Kraft und Sonstiges: bewusst kein Effekt auf den Plan
  assert.deepEqual(
    generatePlan(eventInput({ goalProfile: goalPlanProfile({ goalKey: "muskeln_kraft" }, { goalKey: "sonstiges" }) })),
    base,
  );
});

test("ramp flach: dieselbe flache Rampe wie bei schwacher Planerfüllung, kein Tag fällt weg", () => {
  const strong = generatePlan(eventInput());
  const flat = generatePlan(eventInput({ goalProfile: goalPlanProfile({ goalKey: "wiedereinstieg" }) }));
  const weak = generatePlan(
    eventInput({
      history: { ...eventInput().history, planAdherence: 0.5 },
      keepAllTrainingDays: true,
    }),
  );
  assert.ok(peak(flat) < peak(strong));
  assert.equal(peak(flat), peak(weak), "keine zweite Rampenlogik");
  assert.equal(flat.weekModel[0].trainingWeekdays.length, 4);
});

test("ramp sanft wirkt wie flach", () => {
  const soft = generatePlan(eventInput({ goalProfile: { ramp: "sanft" } }));
  const flat = generatePlan(eventInput({ goalProfile: { ramp: "flach" } }));
  assert.equal(peak(soft), peak(flat));
});

test("lowStartVolume senkt die Woche-0-TSS um den benannten Faktor", () => {
  const base = generatePlan(openInput());
  const low = generatePlan(openInput({ goalProfile: { lowStartVolume: true } }));
  assert.ok(LOW_START_VOLUME_FACTOR < 1 && LOW_START_VOLUME_FACTOR > 0);
  assert.ok(low.weeks[0].targetTss < base.weeks[0].targetTss);
});

test("lowStartVolume ohne ramp: Rampe bleibt normal", () => {
  const withRamp = generatePlan(openInput({ goalProfile: { lowStartVolume: true, ramp: "sanft" } }));
  const noRamp = generatePlan(openInput({ goalProfile: { lowStartVolume: true } }));
  assert.ok(peak(withRamp) <= peak(noRamp));
});

test("keepHardStimuli: schwache Planerfüllung streicht keinen Trainingstag", () => {
  const history = { ...eventInput().history, planAdherence: 0.5 };
  const dropped = generatePlan(eventInput({ history }));
  const kept = generatePlan(eventInput({ history, goalProfile: { keepHardStimuli: true } }));
  assert.equal(dropped.weekModel[0].trainingWeekdays.length, 3);
  assert.equal(kept.weekModel[0].trainingWeekdays.length, 4);
});

test("keepHardStimuli allein ändert bei guter Planerfüllung nichts", () => {
  assert.deepEqual(
    generatePlan(eventInput({ goalProfile: { keepHardStimuli: true } })),
    generatePlan(eventInput()),
  );
});

test("moreEasyVolume, intensityFocus, sweetSpot, focus, level, eventMode wirken im Generator nicht", () => {
  const base = generatePlan(eventInput());
  const profile = {
    moreEasyVolume: true,
    intensityFocus: "schwelle-vo2max",
    sweetSpot: "ergaenzung",
    focus: "berg",
    level: "einsteiger",
    eventMode: true,
  };
  assert.deepEqual(generatePlan(eventInput({ goalProfile: profile })), base);
});
