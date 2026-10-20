/* Tests: api/supabase/recipe-votes.ts — Zahlen, eigene Daumen, Setzen (Upsert). */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listVoteStats, listMyVotes, setMyVote } = await import("./recipe-votes");

describe("listVoteStats", () => {
  it("liest die View und mappt auf camelCase", async () => {
    let table = "";
    fakeClient.handlers.recipe_vote_stats = (calls) => {
      table = calls.table;
      return { data: [{ recipe_id: "r1", up_count: 3, down_count: 1 }], error: null };
    };
    const result = await listVoteStats();
    expect(table).toBe("recipe_vote_stats");
    expect(result).toEqual({ ok: true, stats: [{ recipeId: "r1", up: 3, down: 1 }] });
  });

  it("fragt nie nach einer Athlet-ID", async () => {
    let select = "";
    fakeClient.handlers.recipe_vote_stats = (calls) => {
      select = calls.select ?? "";
      return { data: [], error: null };
    };
    await listVoteStats();
    expect(select).not.toMatch(/athlete/);
  });

  it("meldet einen DB-Fehler als Result", async () => {
    fakeClient.handlers.recipe_vote_stats = () => ({ data: null, error: { message: "kaputt" } });
    expect(await listVoteStats()).toEqual({ ok: false, error: { code: "UNKNOWN", message: "kaputt" } });
  });
});

describe("listMyVotes", () => {
  it("filtert auf den Athleten und mappt Rezept-ID und Daumen", async () => {
    let filters: unknown[] = [];
    fakeClient.handlers.recipe_votes = (calls) => {
      filters = calls.filters;
      return { data: [{ recipe_id: "r1", vote: "down" }], error: null };
    };
    const result = await listMyVotes("u1");
    expect(filters).toEqual([{ op: "eq", col: "athlete_id", val: "u1" }]);
    expect(result).toEqual({ ok: true, votes: [{ recipeId: "r1", vote: "down" }] });
  });

  it("meldet einen DB-Fehler als Result", async () => {
    fakeClient.handlers.recipe_votes = () => ({ data: null, error: { message: "RLS" } });
    expect(await listMyVotes("u1")).toEqual({ ok: false, error: { code: "UNKNOWN", message: "RLS" } });
  });
});

describe("setMyVote", () => {
  it("schreibt per Upsert auf Rezept + Athlet (eine Zeile je Paar)", async () => {
    let calls: { method?: string; payload?: unknown; upsertOpts?: unknown } = {};
    fakeClient.handlers.recipe_votes = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    expect(await setMyVote("r1", "u1", "up")).toEqual({ ok: true });
    expect(calls.method).toBe("upsert");
    expect(calls.payload).toEqual({ recipe_id: "r1", athlete_id: "u1", vote: "up" });
    expect(calls.upsertOpts).toEqual({ onConflict: "recipe_id,athlete_id" });
  });

  it("schickt keinen Kommentar mit (das Feld bleibt ungenutzt)", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.recipe_votes = (c) => {
      payload = c.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    await setMyVote("r1", "u1", "down");
    expect(Object.keys(payload).sort()).toEqual(["athlete_id", "recipe_id", "vote"]);
  });

  it("meldet die Ablehnung der Datenbank (z. B. eigenes Rezept) als Result", async () => {
    fakeClient.handlers.recipe_votes = () => ({
      data: null,
      error: { message: "recipe_votes: you cannot vote on your own recipe" },
    });
    expect(await setMyVote("r1", "u1", "up")).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "recipe_votes: you cannot vote on your own recipe" },
    });
  });

  it("lehnt fehlende IDs ohne Anfrage ab", async () => {
    let called = false;
    fakeClient.handlers.recipe_votes = () => {
      called = true;
      return { data: null, error: null };
    };
    expect(await setMyVote("", "u1", "up")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(await setMyVote("r1", "", "up")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(called).toBe(false);
  });
});

describe("nicht konfiguriert", () => {
  it("alle Funktionen geben ok:false mit Konfigurationsmeldung zurück", async () => {
    vi.resetModules();
    vi.doMock("./client", () => ({ supabase: null, getAuthedClient: async () => null, isSupabaseConfigured: false }));
    const mod = await import("./recipe-votes");
    const expected = { ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } };
    expect(await mod.listVoteStats()).toEqual(expected);
    expect(await mod.listMyVotes("u1")).toEqual(expected);
    expect(await mod.setMyVote("r1", "u1", "up")).toEqual(expected);
  });
});
