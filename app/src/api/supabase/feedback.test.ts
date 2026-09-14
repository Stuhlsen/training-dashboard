/* Tests: api/supabase/feedback.ts — Fahrplan 15 E5 */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { submitFeedback } = await import("./feedback");

describe("submitFeedback", () => {
  it("fügt Feedback mit athlete_id des eingeloggten Users ein", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.feedback = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await submitFeedback("athlete-1", "Läuft super, danke!");
    expect(result).toEqual({ ok: true });
    expect(payload).toEqual({ athlete_id: "athlete-1", message: "Läuft super, danke!" });
  });

  it("gibt einen Fehler zurück, wenn der Insert scheitert", async () => {
    fakeClient.handlers.feedback = () => ({ data: null, error: { message: "boom" } });
    const result = await submitFeedback("athlete-1", "Fehler-Test");
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  });
});
