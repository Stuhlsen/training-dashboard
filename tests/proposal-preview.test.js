/* Tests: core/proposal-preview.js — Vorschau-Anwendung eines Vorschlags auf
   die Kartenliste + Vorher/Nachher-Prognose (Phase 4, Vorschlags-Schema-
   Konzept §5). Reine Funktionen (projectLoad/detectConflicts darunter sind
   bereits in tests/projection.test.js/tests/conflicts.test.js abgedeckt) —
   hier nur die Vorschlags-spezifische Anwendung/den Diff prüfen. */

import test from "node:test";
import assert from "node:assert/strict";
import { applyProposalToCards, previewProposal } from "../assets/js/core/proposal-preview.js";

const CARDS = [
  { id: "card-A", date: "2026-07-25", typ: "Sweet Spot", tssPlanned: 70, cancelled: false },
  { id: "card-B", date: "2026-07-27", typ: "Schwelle", tssPlanned: 90, cancelled: false },
];

/* ── applyProposalToCards ────────────────────────────────────── */

test("applyProposalToCards: add hängt eine neue Karte an, Original bleibt unverändert", () => {
  const proposal = {
    id: "p1",
    op: "add",
    payload: { plan_date: "2026-07-30", title: "Neue Einheit", type: "Z2 Dauer", target_tss: 50 },
  };
  const result = applyProposalToCards(CARDS, proposal);
  assert.equal(result.length, 3);
  assert.equal(result[2].date, "2026-07-30");
  assert.equal(result[2].tssPlanned, 50);
  assert.equal(CARDS.length, 2, "Original-Array unverändert");
});

test("applyProposalToCards: replace ersetzt nur die Zielkarte", () => {
  const proposal = {
    id: "p2",
    op: "replace",
    targetCardId: "card-A",
    payload: { plan_date: "2026-07-25", title: "Entschärft", type: "Z2 Dauer", target_tss: 40 },
  };
  const result = applyProposalToCards(CARDS, proposal);
  const a = result.find((c) => c.id === "card-A");
  const b = result.find((c) => c.id === "card-B");
  assert.equal(a.tssPlanned, 40);
  assert.equal(a.typ, "Z2 Dauer");
  assert.equal(b.tssPlanned, 90, "unbeteiligte Karte unverändert");
});

test("applyProposalToCards: move ändert nur das Datum der Zielkarte", () => {
  const proposal = { id: "p3", op: "move", targetCardId: "card-B", payload: { plan_date: "2026-07-29" } };
  const result = applyProposalToCards(CARDS, proposal);
  const b = result.find((c) => c.id === "card-B");
  assert.equal(b.date, "2026-07-29");
  assert.equal(b.tssPlanned, 90, "TSS bleibt unangetastet");
});

test("applyProposalToCards: move reaktiviert eine ausgefallene Zielkarte (wie movePlanCard)", () => {
  const cancelledCards = [{ ...CARDS[0], cancelled: true }, CARDS[1]];
  const proposal = { id: "p3b", op: "move", targetCardId: "card-A", payload: { plan_date: "2026-07-29" } };
  const result = applyProposalToCards(cancelledCards, proposal);
  assert.equal(result.find((c) => c.id === "card-A").cancelled, false);
});

test("applyProposalToCards: cancel markiert die Zielkarte als ausgefallen", () => {
  const proposal = { id: "p4", op: "cancel", targetCardId: "card-A", payload: { reason: "Krank" } };
  const result = applyProposalToCards(CARDS, proposal);
  assert.equal(result.find((c) => c.id === "card-A").cancelled, true);
  assert.equal(result.find((c) => c.id === "card-B").cancelled, false);
});

test("applyProposalToCards: unbekannte op liefert die Liste unverändert", () => {
  const result = applyProposalToCards(CARDS, { id: "p5", op: "delete", payload: {} });
  assert.deepEqual(result, CARDS);
});

/* ── previewProposal ─────────────────────────────────────────── */

test("previewProposal: liefert before/after-Projektion + Konfliktlisten", () => {
  const proposal = { id: "p6", op: "cancel", targetCardId: "card-A", payload: { reason: "Krank" } };
  const preview = previewProposal(proposal, {
    cards: CARDS,
    actuals: [],
    events: [],
    ftp: 200,
    today: "2026-07-24",
  });
  assert.ok(preview.before.days.length > 0);
  assert.ok(preview.after.days.length > 0);
  assert.ok(Array.isArray(preview.beforeConflicts));
  assert.ok(Array.isArray(preview.afterConflicts));
});

test("previewProposal: cancel reduziert die Tages-TSS im Vergleich zu vorher", () => {
  const proposal = { id: "p7", op: "cancel", targetCardId: "card-A", payload: { reason: "Krank" } };
  const preview = previewProposal(proposal, {
    cards: CARDS,
    actuals: [],
    events: [],
    ftp: 200,
    today: "2026-07-24",
  });
  const beforeDay = preview.before.days.find((d) => d.date === "2026-07-25");
  const afterDay = preview.after.days.find((d) => d.date === "2026-07-25");
  assert.equal(beforeDay.tss, 70);
  assert.equal(afterDay.tss, 0, "ausgefallene Karte trägt keine Last mehr");
});
