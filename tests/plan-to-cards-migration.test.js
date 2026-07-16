/* Tests: Basisplan + Adjustments → plan_cards-Zeilen (scripts/lib/plan-to-cards.js)
   Reine Mapping-Funktion für die Einmal-Migration nach Supabase. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanCardRows } from "../scripts/lib/plan-to-cards.js";

test("buildPlanCardRows: unveränderte Session → geplant, keine Verschiebung", () => {
  const sessions = {
    "2026-07-10": { name: "Sweet Spot", typ: "Sweet Spot", week: "P2-W3", phase: "Sweet Spot", km: 55 },
  };
  const rows = buildPlanCardRows(sessions, {});
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.planned_date, "2026-07-10");
  assert.equal(r.title, "Sweet Spot");
  assert.equal(r.workout_type, "Sweet Spot");
  assert.equal(r.km, 55);
  assert.equal(r.status, "geplant");
  assert.equal(r.moved_from_date, null);
  assert.equal(r.cancel_reason, null);
  assert.equal(r.sort_order, 0);
});

test("buildPlanCardRows: verschobene Session trägt moved_from_date/move_reason", () => {
  const sessions = {
    "2026-07-10": { name: "Schwelle", typ: "Schwelle" },
  };
  const adjustments = { "2026-07-10": { movedTo: "2026-07-12", reason: "Regen" } };
  const rows = buildPlanCardRows(sessions, adjustments);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.planned_date, "2026-07-12");
  assert.equal(r.moved_from_date, "2026-07-10");
  assert.equal(r.move_reason, "Regen");
  assert.equal(r.status, "geplant");
});

test("buildPlanCardRows: ausgefallene Session → status ausgefallen, Datum unverändert", () => {
  const sessions = {
    "2026-07-13": { name: "Sweet Spot", typ: "Sweet Spot" },
  };
  const adjustments = { "2026-07-13": { cancelled: true, reason: "Erholung" } };
  const rows = buildPlanCardRows(sessions, adjustments);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.planned_date, "2026-07-13");
  assert.equal(r.status, "ausgefallen");
  assert.equal(r.cancel_reason, "Erholung");
  assert.equal(r.moved_from_date, null);
});

test("buildPlanCardRows: zwei Sessions kollidieren nach Verschiebung auf denselben Tag → stabiler sort_order", () => {
  const sessions = {
    "2026-07-10": { name: "Gruppenfahrt", typ: "Gruppenfahrt" },
    "2026-07-11": { name: "Sweet Spot 2x20", typ: "Sweet Spot" },
  };
  // Beide Sessions ziehen auf denselben (ansonsten freien) Tag 07-15.
  const adjustments = {
    "2026-07-10": { movedTo: "2026-07-15", reason: "Hitze" },
    "2026-07-11": { movedTo: "2026-07-15", reason: "Regen" },
  };
  const rows = buildPlanCardRows(sessions, adjustments);
  assert.equal(rows.length, 2);

  const onJul15 = rows.filter((r) => r.planned_date === "2026-07-15").sort((a, b) => a.sort_order - b.sort_order);
  assert.equal(onJul15.length, 2);
  // Sortiert nach ursprünglichem Datum: 07-10 (Gruppenfahrt) vor 07-11 (Sweet Spot)
  assert.equal(onJul15[0].title, "Gruppenfahrt");
  assert.equal(onJul15[0].moved_from_date, "2026-07-10");
  assert.equal(onJul15[0].sort_order, 0);
  assert.equal(onJul15[1].title, "Sweet Spot 2x20");
  assert.equal(onJul15[1].moved_from_date, "2026-07-11");
  assert.equal(onJul15[1].sort_order, 1);
});

test("buildPlanCardRows: duration_min aus strukturiertem Workout berechnet, sonst null", () => {
  const sessions = {
    "2026-07-02": {
      name: "Sweet Spot 3×10 min",
      typ: "Sweet Spot",
      workout: { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, pct: [84, 97] },
    },
    "2026-07-03": { name: "Z2 Kurz", typ: "Z2 Dauer", km: 25 },
  };
  const rows = buildPlanCardRows(sessions, {});
  const structured = rows.find((r) => r.planned_date === "2026-07-02");
  const free = rows.find((r) => r.planned_date === "2026-07-03");
  // 10 (WU) + 3x10 (Intervalle) + 2x3 (Pausen zwischen 3 Intervallen) + 8 (CD) = 54
  assert.equal(structured.duration_min, 54);
  assert.equal(free.duration_min, null);
});

test("buildPlanCardRows: leere/fehlende Eingaben → leeres Array", () => {
  assert.deepEqual(buildPlanCardRows({}, {}), []);
  assert.deepEqual(buildPlanCardRows(undefined, undefined), []);
});
