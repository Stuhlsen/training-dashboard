/* Tests: core/proposal-validator.js — Struktur- + Semantikprüfung
   (Phase 4, Vorschlags-Schema-Konzept §4). Reine Funktionen, keine Mocks. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validateEnvelope,
  validateProposal,
  validateImport,
  SCHEMA_VERSION,
} from "../assets/js/core/proposal-validator.js";

const TODAY = "2026-07-24";
const KNOWN_CARDS = new Set(["card-1"]);

/* ── validateEnvelope ────────────────────────────────────────── */

test("validateEnvelope: gültige Hülle ✓", () => {
  const data = { schema_version: SCHEMA_VERSION, athlete: "athlete-A", source: "claude", proposals: [] };
  assert.deepEqual(validateEnvelope(data, { ownAthleteId: "athlete-A" }), { ok: true });
});

test("validateEnvelope: fremde athlete_id → harter Abbruch", () => {
  const data = { schema_version: SCHEMA_VERSION, athlete: "athlete-B", proposals: [] };
  const result = validateEnvelope(data, { ownAthleteId: "athlete-A" });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /anderen Account/);
});

test("validateEnvelope: unbekannte schema_version → harter Abbruch mit Neu-Export-Hinweis", () => {
  const data = { schema_version: 2, athlete: "athlete-A", proposals: [] };
  const result = validateEnvelope(data, { ownAthleteId: "athlete-A" });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /neu exportieren/);
});

test("validateEnvelope: fehlende schema_version → harter Abbruch", () => {
  const result = validateEnvelope({ athlete: "athlete-A", proposals: [] }, { ownAthleteId: "athlete-A" });
  assert.equal(result.ok, false);
});

test("validateEnvelope: proposals fehlt/keine Liste → Fehler", () => {
  const result = validateEnvelope({ schema_version: SCHEMA_VERSION, athlete: "athlete-A" }, { ownAthleteId: "athlete-A" });
  assert.equal(result.ok, false);
});

test("validateEnvelope: unbekanntes Top-Level-Feld → Fehler (kein stilles Ignorieren)", () => {
  const data = { schema_version: SCHEMA_VERSION, athlete: "athlete-A", proposals: [], extra: 1 };
  const result = validateEnvelope(data, { ownAthleteId: "athlete-A" });
  assert.equal(result.ok, false);
});

test("validateEnvelope: kein Objekt → Fehler statt Crash", () => {
  assert.equal(validateEnvelope(null).ok, false);
  assert.equal(validateEnvelope([1, 2]).ok, false);
  assert.equal(validateEnvelope("x").ok, false);
});

test("validateEnvelope: ohne ownAthleteId wird der Athlet-Abgleich übersprungen", () => {
  const data = { schema_version: SCHEMA_VERSION, athlete: "irgendwer", proposals: [] };
  assert.deepEqual(validateEnvelope(data), { ok: true });
});

/* ── validateProposal: add ──────────────────────────────────────── */

test("validateProposal: gültiger 'add'-Vorschlag ✓", () => {
  const p = {
    op: "add",
    payload: { title: "Sweet-Spot 2×15", type: "Sweet Spot", plan_date: "2026-08-01", target_tss: 65 },
    reason: "Aufbau",
  };
  const result = validateProposal(p, { today: TODAY, knownCardIds: KNOWN_CARDS });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateProposal: 'add' mit leerem payload → plan_date + title fehlen", () => {
  const result = validateProposal({ op: "add", payload: {} }, { today: TODAY });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("plan_date")));
  assert.ok(result.errors.some((e) => e.includes("title")));
});

test("validateProposal: 'add' mit target_card_id → nicht erlaubt", () => {
  const result = validateProposal(
    { op: "add", target_card_id: "card-1", payload: { title: "X", plan_date: "2026-08-01" } },
    { today: TODAY, knownCardIds: KNOWN_CARDS }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("target_card_id")));
});

test("validateProposal: unbekannter 'type' → Fehler", () => {
  const result = validateProposal(
    { op: "add", payload: { title: "X", plan_date: "2026-08-01", type: "Erfundener Typ" } },
    { today: TODAY }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Erfundener Typ")));
});

test("validateProposal: target_tss außerhalb 0–400 → Fehler", () => {
  const result = validateProposal(
    { op: "add", payload: { title: "X", plan_date: "2026-08-01", target_tss: 999 } },
    { today: TODAY }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("target_tss")));
});

test("validateProposal: plan_date in der Vergangenheit → Fehler", () => {
  const result = validateProposal({ op: "add", payload: { title: "X", plan_date: "2020-01-01" } }, { today: TODAY });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("Vergangenheit")));
});

/* ── validateProposal: replace/move/cancel ──────────────────────── */

test("validateProposal: gültiger 'replace'-Vorschlag ✓", () => {
  const p = {
    op: "replace",
    target_card_id: "card-1",
    target_updated_at: "2026-07-20T00:00:00Z",
    payload: { plan_date: "2026-08-01", title: "Neu", type: "Schwelle" },
  };
  const result = validateProposal(p, { today: TODAY, knownCardIds: KNOWN_CARDS });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateProposal: 'replace' ohne target_card_id → Fehler", () => {
  const result = validateProposal({ op: "replace", payload: { plan_date: "2026-08-01" } }, { today: TODAY });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("target_card_id fehlt")));
});

test("validateProposal: unbekannte target_card_id (fremde/erfundene Karte) → Fehler", () => {
  const result = validateProposal(
    { op: "replace", target_card_id: "card-ghost", target_updated_at: "x", payload: { plan_date: "2026-08-01" } },
    { today: TODAY, knownCardIds: KNOWN_CARDS }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("unbekannt")));
});

test("validateProposal: 'replace' ohne target_updated_at → Fehler", () => {
  const result = validateProposal(
    { op: "replace", target_card_id: "card-1", payload: { plan_date: "2026-08-01" } },
    { today: TODAY, knownCardIds: KNOWN_CARDS }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("target_updated_at")));
});

test("validateProposal: gültiger 'move'-Vorschlag ✓", () => {
  const p = { op: "move", target_card_id: "card-1", target_updated_at: "x", payload: { plan_date: "2026-08-01" } };
  const result = validateProposal(p, { today: TODAY, knownCardIds: KNOWN_CARDS });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateProposal: 'cancel' mit leerem payload → gültig (Konzept: keine Pflichtfelder)", () => {
  const p = { op: "cancel", target_card_id: "card-1", target_updated_at: "x", payload: {} };
  const result = validateProposal(p, { today: TODAY, knownCardIds: KNOWN_CARDS });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateProposal: 'cancel' mit reason im payload → gültig", () => {
  const p = { op: "cancel", target_card_id: "card-1", target_updated_at: "x", payload: { reason: "Krank" } };
  const result = validateProposal(p, { today: TODAY, knownCardIds: KNOWN_CARDS });
  assert.equal(result.valid, true);
});

/* ── Struktur: unbekannte Felder, unbekanntes op ────────────────── */

test("validateProposal: unbekanntes Top-Level-Feld → Fehler, kein stilles Ignorieren", () => {
  const result = validateProposal(
    { op: "add", extra_field: 1, payload: { title: "X", plan_date: "2026-08-01" } },
    { today: TODAY }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("extra_field")));
});

test("validateProposal: unbekanntes payload-Feld je op → Fehler", () => {
  const result = validateProposal(
    { op: "move", target_card_id: "card-1", target_updated_at: "x", payload: { plan_date: "2026-08-01", title: "sollte hier nicht stehen" } },
    { today: TODAY, knownCardIds: KNOWN_CARDS }
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("title")));
});

test("validateProposal: unbekanntes 'op' → eigener Fehler, keine weitere Prüfung", () => {
  const result = validateProposal({ op: "delete", payload: {} }, { today: TODAY });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Unbekannte Operation/);
});

test("validateProposal: kein Objekt → Fehler statt Crash", () => {
  assert.equal(validateProposal(null).valid, false);
  assert.equal(validateProposal("x").valid, false);
  assert.equal(validateProposal(undefined).valid, false);
});

test("validateProposal: sammelt ALLE Fehler, bricht nicht beim ersten ab", () => {
  const result = validateProposal({ op: "add", payload: { plan_date: "2020-01-01" } }, { today: TODAY });
  // plan_date in der Vergangenheit UND title fehlt — beide müssen auftauchen.
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2);
});

/* ── validateImport: Envelope + Teilerfolg ───────────────────────── */

test("validateImport: harter Abbruch bei ungültiger Hülle, keine proposals-Prüfung", () => {
  const result = validateImport({ schema_version: 99, athlete: "athlete-A", proposals: [] }, { ownAthleteId: "athlete-A" });
  assert.equal(result.ok, false);
});

test("validateImport: Teilerfolg — jeder Vorschlag bekommt sein eigenes Ergebnis", () => {
  const data = {
    schema_version: SCHEMA_VERSION,
    athlete: "athlete-A",
    source: "claude",
    proposals: [
      { op: "add", payload: { title: "Gültig", plan_date: "2026-08-01" } },
      { op: "add", payload: {} },
    ],
  };
  const result = validateImport(data, { ownAthleteId: "athlete-A", today: TODAY });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].valid, true);
  assert.equal(result.results[1].valid, false);
});
