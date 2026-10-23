/* Tests: api/supabase/training-rides.ts — seitenweises Lesen, Reihenfolge,
 * Fehler im Result-Format. */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient, type FakeCall } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getTrainingRides } = await import("./training-rides");

const rows = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ data: { date: "2026-09-01", n: offset + i } }));

describe("getTrainingRides", () => {
  it("liefert nur die Payload-Form (data) der Fahrten", async () => {
    const seen: FakeCall[] = [];
    fakeClient.handlers.training_rides = (call) => {
      seen.push(call);
      return { data: rows(2), error: null };
    };
    const result = await getTrainingRides("profile-1");
    expect(result).toEqual({
      ok: true,
      rides: [
        { date: "2026-09-01", n: 0 },
        { date: "2026-09-01", n: 1 },
      ],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].filters).toContainEqual({ op: "eq", col: "profile_id", val: "profile-1" });
    expect(seen[0].select).toBe("data");
  });

  it("liest weiter, solange eine Seite voll ist (PostgREST kappt bei 1000)", async () => {
    const ranges: Array<{ from: number; to: number } | undefined> = [];
    fakeClient.handlers.training_rides = (call) => {
      ranges.push(call.range);
      return { data: call.range?.from === 0 ? rows(1000) : rows(5, 1000), error: null };
    };
    const result = await getTrainingRides("profile-1");
    expect(ranges).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
    expect(result.ok && result.rides).toHaveLength(1005);
  });

  it("Fehler → ok:false mit Meldung, kein Wurf und keine Teilliste", async () => {
    fakeClient.handlers.training_rides = () => ({ data: null, error: { message: "permission denied" } });
    expect(await getTrainingRides("profile-1")).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "permission denied" },
    });
  });
});
