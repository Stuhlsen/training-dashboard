/* Tests: api/supabase/events.ts — is_test- und result_*-Mapping (Migration
 * 0027) und der Sonderfall type -> "other". Portiert aus
 * tests/events-is-test.test.js (Vanilla).
 *
 * Hintergrund des Sonderfalls: die Check-Constraints
 * events_priority_only_for_race (Migration 0012) und
 * events_result_only_for_race (0027) verbieten priority/ftp_goal bzw. die
 * result_*-Felder bei type='other'. Ein Formularwert, der nur ausgeblendet
 * aber nicht geleert wurde, würde sonst am Constraint scheitern — mit einer
 * generischen DB-Meldung, die niemandem sagt, was zu tun ist. */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listEvents, createEvent, updateEvent } = await import("./events");

const row = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  title: "Ramp Test",
  event_date: "2026-09-19",
  type: "race",
  priority: null,
  ftp_goal: null,
  is_test: true,
  note: null,
  result_time_s: null,
  result_avg_watts: null,
  result_place_ag: null,
  result_place_overall: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("listEvents", () => {
  it("mappt is_test aus der Zeile", async () => {
    fakeClient.handlers.events = () => ({
      data: [row({ id: "e1", is_test: true }), row({ id: "e2", title: "GFNY Bremen", is_test: false, priority: "main" })],
      error: null,
    });
    const result = await listEvents("athlete-uuid");
    expect(result.ok && result.events[0].isTest).toBe(true);
    expect(result.ok && result.events[1].isTest).toBe(false);
  });

  it("mappt die result_*-Felder (Migration 0027) camelCase", async () => {
    fakeClient.handlers.events = () => ({
      data: [
        row({
          id: "gfny",
          title: "GFNY Bremen",
          is_test: false,
          result_time_s: 11565,
          result_avg_watts: 245,
          result_place_ag: 42,
          result_place_overall: 312,
        }),
      ],
      error: null,
    });
    const result = await listEvents("athlete-uuid");
    expect(result.ok && result.events[0]).toMatchObject({
      resultTimeS: 11565,
      resultAvgWatts: 245,
      resultPlaceAg: 42,
      resultPlaceOverall: 312,
    });
  });
});

describe("createEvent", () => {
  it("setzt is_test aus dem Payload, Default false ohne Angabe", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.events = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: row({ is_test: seen.is_test }), error: null };
    };

    await createEvent("athlete-uuid", { title: "Ramp Test", eventDate: "2026-09-19", type: "race", isTest: true });
    expect(seen.is_test).toBe(true);

    await createEvent("athlete-uuid", { title: "GFNY Bremen", eventDate: "2026-08-30", type: "race" });
    expect(seen.is_test).toBe(false);
  });
});

describe("updateEvent", () => {
  it("nullt bei type -> 'other' priority/ftp_goal/is_test UND die result_*-Felder mit", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.events = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: row({ type: "other", is_test: false }), error: null };
    };
    await updateEvent("e1", { type: "other", isTest: true, priority: "main", ftpGoal: 210, resultPlaceAg: 1 });
    expect(seen).toEqual({
      type: "other",
      priority: null,
      ftp_goal: null,
      is_test: false,
      result_time_s: null,
      result_avg_watts: null,
      result_place_ag: null,
      result_place_overall: null,
    });
  });

  it("patcht is_test nur, wenn es im Patch steht", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.events = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: row(), error: null };
    };

    await updateEvent("e1", { isTest: true });
    expect(seen).toEqual({ is_test: true });

    await updateEvent("e1", { title: "Ramp Test (neu)" });
    expect("is_test" in seen).toBe(false);
  });

  it("patcht ein result_*-Feld nur, wenn es im Patch steht (snake_case)", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.events = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: row(), error: null };
    };

    await updateEvent("e1", { resultTimeS: 11565, resultPlaceAg: 42 });
    expect(seen).toEqual({ result_time_s: 11565, result_place_ag: 42 });

    await updateEvent("e1", { title: "x" });
    expect("result_time_s" in seen).toBe(false);
  });
});
