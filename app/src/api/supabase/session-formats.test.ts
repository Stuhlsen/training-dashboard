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

const { getSessionFormats } = await import("./session-formats");

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
