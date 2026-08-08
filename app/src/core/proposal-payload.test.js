/* Tests: core/proposal-payload.js — payload ↔ Karten-Shape-Abbildung
   (Phase 4). Reine Funktionen, keine Mocks nötig.

   moveProposalArgs/cancelProposalArgs sind der Bugfix zu "Direkt/Vorschlag-
   Toggle wird beim Verschieben/Ausfallen ignoriert" (ui/planned.js rief
   movePlanCard/cancelPlanCard bisher unabhängig vom Speichern-Modus direkt
   auf) — extrahiert aus ui/planned.js, damit die Argumentbildung ohne DOM
   testbar ist; die DOM-gebundene Verzweigung selbst bleibt Browser-verifiziert
   (AGENTS.md: ui/-Änderung → node -c + npx serve). */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  payloadToCardData,
  moveProposalArgs,
  cancelProposalArgs,
  addProposalArgs,
  replaceProposalArgs,
} from "./proposal-payload.js";

/* ── payloadToCardData ───────────────────────────────────────── */

test("payloadToCardData: mappt alle Schema-Felder auf die Session-Shape", () => {
  const result = payloadToCardData({
    title: "Sweet-Spot 2×15",
    type: "Sweet Spot",
    plan_date: "2026-07-28",
    target_tss: 65,
    km: 40,
    workout: { blocks: [{ type: "interval", text: "2×15" }] },
    note: "Entschärft wegen TSB",
  });
  assert.deepEqual(result, {
    date: "2026-07-28",
    name: "Sweet-Spot 2×15",
    typ: "Sweet Spot",
    tssPlanned: 65,
    km: 40,
    details: "Entschärft wegen TSB",
    workout: { blocks: [{ type: "interval", text: "2×15" }] },
    workoutStructure: null,
  });
});

test("payloadToCardData: workout_structure wird auf workoutStructure gemappt (D1)", () => {
  const structure = { version: 1, steps: [{ kind: "steady", duration_s: 60, target_pct_ftp: 50 }] };
  const result = payloadToCardData({ title: "X", plan_date: "2026-07-28", workout_structure: structure });
  assert.deepEqual(result.workoutStructure, structure);
});

test("payloadToCardData: fehlende optionale Felder werden null, nicht undefined", () => {
  const result = payloadToCardData({ title: "Neu", type: "Z2 Dauer", plan_date: "2026-08-01" });
  assert.equal(result.tssPlanned, null);
  assert.equal(result.km, null);
  assert.equal(result.details, null);
  assert.equal(result.workout, null);
});

test("payloadToCardData: leeres/fehlendes payload crasht nicht", () => {
  assert.doesNotThrow(() => payloadToCardData(undefined));
  assert.doesNotThrow(() => payloadToCardData({}));
});

/* ── moveProposalArgs ────────────────────────────────────────── */

test("moveProposalArgs: op=move, targetCardId/targetUpdatedAt aus der Karte, plan_date im payload", () => {
  const card = { id: "card-A", updatedAt: "2026-07-20T00:00:00Z" };
  const result = moveProposalArgs(card, "2026-07-29", "Hitze");
  assert.deepEqual(result, {
    op: "move",
    targetCardId: "card-A",
    targetUpdatedAt: "2026-07-20T00:00:00Z",
    payload: { plan_date: "2026-07-29" },
    reason: "Hitze",
  });
});

test("moveProposalArgs: leerer Grund wird null, kein leerer String", () => {
  const card = { id: "card-A", updatedAt: "2026-07-20T00:00:00Z" };
  const result = moveProposalArgs(card, "2026-07-29", "");
  assert.equal(result.reason, null);
});

test("moveProposalArgs: fehlende Karte liefert null-IDs statt zu crashen", () => {
  const result = moveProposalArgs(null, "2026-07-29", "");
  assert.equal(result.targetCardId, null);
  assert.equal(result.targetUpdatedAt, null);
});

/* ── cancelProposalArgs ──────────────────────────────────────── */

test("cancelProposalArgs: op=cancel, Grund sowohl im payload als auch auf Top-Level", () => {
  const card = { id: "card-B", updatedAt: "2026-07-21T00:00:00Z" };
  const result = cancelProposalArgs(card, "Krank");
  assert.deepEqual(result, {
    op: "cancel",
    targetCardId: "card-B",
    targetUpdatedAt: "2026-07-21T00:00:00Z",
    payload: { reason: "Krank" },
    reason: "Krank",
  });
});

test("cancelProposalArgs: kein Grund → null an beiden Stellen", () => {
  const card = { id: "card-B", updatedAt: "2026-07-21T00:00:00Z" };
  const result = cancelProposalArgs(card, "");
  assert.equal(result.payload.reason, null);
  assert.equal(result.reason, null);
});

/* ── addProposalArgs ─────────────────────────────────────────── */

test("addProposalArgs: op=add, targetCardId/targetUpdatedAt null, cardData → Schema-Payload", () => {
  const cardData = {
    date: "2026-08-10",
    name: "Sweet-Spot 2×15",
    typ: "Sweet Spot",
    tssPlanned: 65,
    km: 40,
    details: "Neu vorgeschlagen",
    workout: { blocks: [{ type: "interval", text: "2×15" }] },
  };
  const result = addProposalArgs(cardData, "Wochenumbau");
  assert.deepEqual(result, {
    op: "add",
    targetCardId: null,
    targetUpdatedAt: null,
    payload: {
      plan_date: "2026-08-10",
      title: "Sweet-Spot 2×15",
      type: "Sweet Spot",
      target_tss: 65,
      km: 40,
      note: "Neu vorgeschlagen",
      workout: { blocks: [{ type: "interval", text: "2×15" }] },
    },
    reason: "Wochenumbau",
  });
});

test("addProposalArgs: fehlende optionale Felder werden null, leerer Grund wird null", () => {
  const result = addProposalArgs({ date: "2026-08-10", name: "Neu", typ: "Z2 Dauer" }, "");
  assert.equal(result.payload.target_tss, null);
  assert.equal(result.payload.km, null);
  assert.equal(result.payload.note, null);
  assert.equal(result.payload.workout, null);
  assert.equal(result.reason, null);
});

test("addProposalArgs: ist die exakte Umkehrung von payloadToCardData (Rundreise)", () => {
  const cardData = { date: "2026-08-10", name: "X", typ: "Z2 Dauer", tssPlanned: 50, km: 30, details: "N", workout: null };
  const roundtrip = payloadToCardData(addProposalArgs(cardData, "R").payload);
  assert.deepEqual(roundtrip, { ...cardData, workoutStructure: null });
});

/* ── replaceProposalArgs ─────────────────────────────────────── */

test("replaceProposalArgs: op=replace, targetCardId/targetUpdatedAt aus der Karte", () => {
  const card = { id: "card-C", updatedAt: "2026-08-01T00:00:00Z" };
  const cardData = { date: "2026-08-10", name: "Bearbeitet", typ: "Schwelle", tssPlanned: 80, km: null, details: null, workout: null };
  const result = replaceProposalArgs(card, cardData, "Angepasst");
  assert.equal(result.op, "replace");
  assert.equal(result.targetCardId, "card-C");
  assert.equal(result.targetUpdatedAt, "2026-08-01T00:00:00Z");
  assert.deepEqual(result.payload, {
    plan_date: "2026-08-10",
    title: "Bearbeitet",
    type: "Schwelle",
    target_tss: 80,
    km: null,
    note: null,
    workout: null,
  });
});

test("replaceProposalArgs: fehlende Karte liefert null-IDs statt zu crashen", () => {
  const result = replaceProposalArgs(null, { date: "2026-08-10", name: "X", typ: "Z2 Dauer" }, "");
  assert.equal(result.targetCardId, null);
  assert.equal(result.targetUpdatedAt, null);
});
