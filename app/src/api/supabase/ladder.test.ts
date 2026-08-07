/* Tests: api/supabase/ladder.ts — Port von
 * data-access/supabase/ladder.js (Vanilla). */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getLadderHistory, recordLadderStep } = await import("./ladder");

describe("getLadderHistory", () => {
  it("mappt die Historie aus snake_case, älteste zuerst laut Order-Aufruf", async () => {
    let orderSeen: Record<string, unknown> | undefined;
    fakeClient.handlers.ladder_history = (calls) => {
      orderSeen = calls.order;
      return {
        data: [
          {
            id: "h1",
            format_id: "f1",
            step: 2,
            valid_from: "2026-07-01",
            reason: "manual",
            source_ride_id: null,
            locked_until: null,
          },
        ],
        error: null,
      };
    };
    const result = await getLadderHistory("profile-1");
    expect(orderSeen).toEqual({ col: "valid_from", ascending: true });
    expect(result).toEqual({
      ok: true,
      history: [
        {
          id: "h1",
          formatId: "f1",
          step: 2,
          validFrom: "2026-07-01",
          reason: "manual",
          sourceRideId: null,
          lockedUntil: null,
        },
      ],
    });
  });
});

describe("recordLadderStep", () => {
  it("schreibt einen neuen Eintrag und liefert die id zurück", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.ladder_history = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: { id: "h2" }, error: null };
    };
    const result = await recordLadderStep("profile-1", {
      formatId: "f1",
      step: 3,
      reason: "manual",
      validFrom: "2026-08-01",
    });
    expect(result).toEqual({ ok: true, id: "h2" });
    expect(seen).toEqual({
      profile_id: "profile-1",
      format_id: "f1",
      step: 3,
      valid_from: "2026-08-01",
      reason: "manual",
      source_ride_id: null,
      locked_until: null,
    });
  });
});
