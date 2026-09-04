/* Tests: api/supabase/session-formats.ts — Port von
 * data-access/supabase/formats.js (Vanilla, getSessionFormats-Teil). */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getSessionFormats, createSessionFormat, updateSessionFormat, deleteSessionFormat } = await import(
  "./session-formats"
);

const INPUT = {
  id: "my-format",
  label: "Mein Format",
  targetSystem: "schwelle",
  currency: "zone-time",
  evidenceGrade: "coaching-konsens",
  blockTargets: ["Schwelle"],
  axes: { explicitSteps: [{ id: "S1", structureLabel: "3×10", pctFtp: 88, zoneTimeMin: 30 }] },
};

describe("getSessionFormats", () => {
  it("mappt den Formatkatalog aus snake_case", async () => {
    fakeClient.handlers.session_formats = () => ({
      data: [
        {
          id: "f1",
          label: "Sweet Spot",
          target_system: "power",
          currency: "watt",
          evidence_grade: "A",
          block_targets: [1, 2],
          axes: { x: 1 },
        },
      ],
      error: null,
    });
    const result = await getSessionFormats();
    expect(result.ok && result.formats[0]).toEqual({
      id: "f1",
      label: "Sweet Spot",
      targetSystem: "power",
      currency: "watt",
      evidenceGrade: "A",
      blockTargets: [1, 2],
      axes: { x: 1 },
    });
  });

  it("block_targets null -> leeres Array", async () => {
    fakeClient.handlers.session_formats = () => ({
      data: [{ id: "f1", label: "X", target_system: "power", currency: "watt", evidence_grade: "B", block_targets: null, axes: null }],
      error: null,
    });
    const result = await getSessionFormats();
    expect(result.ok && result.formats[0].blockTargets).toEqual([]);
  });
});

describe("createSessionFormat", () => {
  it("schreibt die Zeile in snake_case und gibt die id zurück", async () => {
    let seen: unknown;
    fakeClient.handlers.session_formats = (calls) => {
      seen = calls.payload;
      return { data: null, error: null };
    };
    const result = await createSessionFormat(INPUT);
    expect(result.ok && result.id).toBe("my-format");
    expect(seen).toEqual({
      id: "my-format",
      label: "Mein Format",
      target_system: "schwelle",
      currency: "zone-time",
      evidence_grade: "coaching-konsens",
      block_targets: ["Schwelle"],
      axes: { explicitSteps: [{ id: "S1", structureLabel: "3×10", pctFtp: 88, zoneTimeMin: 30 }] },
    });
  });

  it("reicht einen RLS-/DB-Fehler als Result durch", async () => {
    fakeClient.handlers.session_formats = () => ({ data: null, error: { message: "permission denied" } });
    const result = await createSessionFormat(INPUT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toBe("permission denied");
  });
});

describe("updateSessionFormat", () => {
  it("schreibt den Patch ohne id und filtert auf die Zeile", async () => {
    let calls: { payload?: unknown; filters?: unknown };
    fakeClient.handlers.session_formats = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    const result = await updateSessionFormat("my-format", INPUT);
    expect(result.ok).toBe(true);
    expect(calls!.payload).not.toHaveProperty("id");
    expect(calls!.filters).toContainEqual({ op: "eq", col: "id", val: "my-format" });
  });
});

describe("deleteSessionFormat", () => {
  it("löscht die Zeile per id", async () => {
    let calls: { method?: string; filters?: unknown };
    fakeClient.handlers.session_formats = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    const result = await deleteSessionFormat("my-format");
    expect(result.ok).toBe(true);
    expect(calls!.method).toBe("delete");
    expect(calls!.filters).toContainEqual({ op: "eq", col: "id", val: "my-format" });
  });
});
