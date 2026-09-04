/* Tests: scripts/lib/training-plan-fetch.js
   - toPlanSummary() (rein, kein Netzwerk)
   - loadActiveTrainingPlan(): der Kurzschluss ohne Credentials/profileId
     (kein Netzwerk-Aufruf). Der echte Service-Role-Read wird — wie bei
     ftp-history.js / plan-cards-fetch.js — NICHT gemockt; das Verdrahten
     in den Sync-Lauf verifiziert `npm run sync` gegen dashboard-dev. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { toPlanSummary, loadActiveTrainingPlan } from "../scripts/lib/training-plan-fetch.js";

test("toPlanSummary: volle Zeile -> schlanke Shape", () => {
  const wm = [
    {
      week: "2026-KW27",
      phase: "Grundlage",
      start: "2026-06-29",
      end: "2026-07-05",
      trainingWeekdays: [2, 4, 6],
      targetTss: 300,
    },
  ];
  const r = toPlanSummary({
    id: "p1",
    is_active: true,
    start_date: "2026-06-29",
    end_date: "2026-09-20",
    week_model: wm,
  });
  assert.deepEqual(r, {
    id: "p1",
    startDate: "2026-06-29",
    endDate: "2026-09-20",
    weekModel: wm,
  });
});

test("toPlanSummary: week_model null / kein Array -> leeres Array", () => {
  assert.deepEqual(toPlanSummary({ id: "p1", week_model: null }).weekModel, []);
  assert.deepEqual(toPlanSummary({ id: "p1", week_model: "kaputt" }).weekModel, []);
  assert.deepEqual(toPlanSummary({ id: "p1" }).weekModel, []);
});

test("toPlanSummary: leere / id-lose Zeile -> null", () => {
  assert.equal(toPlanSummary(null), null);
  assert.equal(toPlanSummary(undefined), null);
  assert.equal(toPlanSummary({}), null);
  assert.equal(toPlanSummary({ start_date: "2026-01-01" }), null);
});

test("loadActiveTrainingPlan: ohne profileId -> null (kein Netzwerk)", async () => {
  assert.equal(await loadActiveTrainingPlan({ serviceRoleKey: "dummy" }), null);
});

test("loadActiveTrainingPlan: ohne serviceRoleKey -> null (kein Netzwerk)", async () => {
  assert.equal(await loadActiveTrainingPlan({ profileId: "p1" }), null);
});

test("loadActiveTrainingPlan: ohne Argument -> null", async () => {
  assert.equal(await loadActiveTrainingPlan(), null);
});
