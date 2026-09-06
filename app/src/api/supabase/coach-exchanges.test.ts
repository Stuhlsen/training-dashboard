/* Tests: api/supabase/coach-exchanges.ts — Row-Mapping (snake_case ->
 * camelCase) + Result-Konvention für den KI-Coach-Verlauf
 * (Migration 0034, Fahrplan 9 Etappe A). Die RLS-Policies selbst prüft
 * tests/supabase-rls.test.js gegen das echte dashboard-dev-Projekt. */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listCoachExchanges, insertCoachExchange, deleteCoachExchange } = await import(
  "./coach-exchanges"
);

describe("listCoachExchanges", () => {
  it("mappt die Zeilen aus snake_case und fragt neueste zuerst ab", async () => {
    let seen: unknown;
    fakeClient.handlers.coach_exchanges = (calls) => {
      seen = calls;
      return {
        data: [
          {
            id: "x1",
            athlete_id: "a1",
            created_by: "a1",
            preset: "event",
            raw_response: "…Text + JSON-Block…",
            proposal_group_id: "g1",
            created_at: "2026-09-06T10:00:00Z",
          },
        ],
        error: null,
      };
    };
    const result = await listCoachExchanges("a1");
    expect(result).toEqual({
      ok: true,
      exchanges: [
        {
          id: "x1",
          athleteId: "a1",
          createdBy: "a1",
          preset: "event",
          rawResponse: "…Text + JSON-Block…",
          proposalGroupId: "g1",
          createdAt: "2026-09-06T10:00:00Z",
        },
      ],
    });
    expect(seen).toMatchObject({
      table: "coach_exchanges",
      filters: [{ op: "eq", col: "athlete_id", val: "a1" }],
      order: { col: "created_at", ascending: false },
    });
  });

  it("reicht einen DB-Fehler als Result.ok=false durch", async () => {
    fakeClient.handlers.coach_exchanges = () => ({ data: null, error: { message: "boom" } });
    const result = await listCoachExchanges("a1");
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  });
});

describe("insertCoachExchange", () => {
  it("schreibt snake_case inkl. proposal_group_id = null bei 0 Vorschlägen", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.coach_exchanges = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return {
        data: {
          id: "x2",
          athlete_id: "a1",
          created_by: "a1",
          preset: "general",
          raw_response: "nur Text, kein JSON-Block",
          proposal_group_id: null,
          created_at: "2026-09-06T11:00:00Z",
        },
        error: null,
      };
    };
    const result = await insertCoachExchange("a1", "a1", {
      preset: "general",
      rawResponse: "nur Text, kein JSON-Block",
      proposalGroupId: null,
    });
    expect(result).toEqual({
      ok: true,
      exchange: {
        id: "x2",
        athleteId: "a1",
        createdBy: "a1",
        preset: "general",
        rawResponse: "nur Text, kein JSON-Block",
        proposalGroupId: null,
        createdAt: "2026-09-06T11:00:00Z",
      },
    });
    expect(seen).toEqual({
      athlete_id: "a1",
      created_by: "a1",
      preset: "general",
      raw_response: "nur Text, kein JSON-Block",
      proposal_group_id: null,
    });
  });

  it("reicht die erzeugte proposal_group_id durch", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.coach_exchanges = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return {
        data: {
          id: "x3",
          athlete_id: "a1",
          created_by: "a1",
          preset: "reduce",
          raw_response: "…",
          proposal_group_id: "grp-9",
          created_at: "2026-09-06T12:00:00Z",
        },
        error: null,
      };
    };
    const result = await insertCoachExchange("a1", "a1", {
      preset: "reduce",
      rawResponse: "…",
      proposalGroupId: "grp-9",
    });
    expect(result.ok).toBe(true);
    expect(seen.proposal_group_id).toBe("grp-9");
  });
});

describe("deleteCoachExchange", () => {
  it("löscht per id und gibt ok zurück", async () => {
    let seen: unknown;
    fakeClient.handlers.coach_exchanges = (calls) => {
      seen = calls;
      return { data: null, error: null };
    };
    const result = await deleteCoachExchange("x4");
    expect(result).toEqual({ ok: true });
    expect(seen).toMatchObject({
      table: "coach_exchanges",
      method: "delete",
      filters: [{ op: "eq", col: "id", val: "x4" }],
    });
  });

  it("reicht einen DB-Fehler als Result.ok=false durch", async () => {
    fakeClient.handlers.coach_exchanges = () => ({ data: null, error: { message: "nope" } });
    const result = await deleteCoachExchange("x4");
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
  });
});
