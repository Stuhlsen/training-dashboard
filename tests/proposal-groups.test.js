/* Tests: core/proposal-groups.js — offene Vorschläge gruppieren
   (Phase 4, Umsetzung Trainer-Dashboard). Reine Funktion, keine Mocks nötig. */

import test from "node:test";
import assert from "node:assert/strict";
import { groupOpenProposals } from "../assets/js/core/proposal-groups.js";

test("groupOpenProposals: filtert auf status=open", () => {
  const proposals = [
    { id: "1", groupId: null, status: "open", createdAt: "2026-07-20" },
    { id: "2", groupId: null, status: "accepted", createdAt: "2026-07-21" },
    { id: "3", groupId: null, status: "rejected", createdAt: "2026-07-22" },
  ];
  const groups = groupOpenProposals(proposals);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].id, "1");
});

test("groupOpenProposals: ungruppierte Vorschläge bilden je eine Einzel-Gruppe", () => {
  const proposals = [
    { id: "1", groupId: null, status: "open", createdAt: "2026-07-20" },
    { id: "2", groupId: null, status: "open", createdAt: "2026-07-21" },
  ];
  const groups = groupOpenProposals(proposals);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.groupId),
    [null, null]
  );
  assert.equal(groups[0].items.length, 1);
});

test("groupOpenProposals: gemeinsame group_id fasst Elemente zu einer Gruppe zusammen", () => {
  const proposals = [
    { id: "1", groupId: "g1", status: "open", createdAt: "2026-07-20" },
    { id: "2", groupId: "g1", status: "open", createdAt: "2026-07-21" },
    { id: "3", groupId: null, status: "open", createdAt: "2026-07-19" },
  ];
  const groups = groupOpenProposals(proposals);
  assert.equal(groups.length, 2);
  const g1 = groups.find((g) => g.groupId === "g1");
  assert.equal(g1.items.length, 2);
});

test("groupOpenProposals: Gruppen sortiert nach neuestem createdAt zuerst", () => {
  const proposals = [
    { id: "1", groupId: null, status: "open", createdAt: "2026-07-10" },
    { id: "2", groupId: "g1", status: "open", createdAt: "2026-07-25" },
    { id: "3", groupId: "g1", status: "open", createdAt: "2026-07-24" },
  ];
  const groups = groupOpenProposals(proposals);
  assert.equal(groups[0].groupId, "g1");
  assert.equal(groups[1].groupId, null);
});

test("groupOpenProposals: leere Liste liefert leere Gruppenliste", () => {
  assert.deepEqual(groupOpenProposals([]), []);
  assert.deepEqual(groupOpenProposals(undefined), []);
});
