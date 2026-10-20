/* Tests: api/supabase/recipe-ratings.ts — Schnitt/Anzahl, eigene Sterne, Setzen, Zurücknehmen. */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listRatingStats, listMyRatings, setMyRating, deleteMyRating } = await import("./recipe-ratings");

describe("listRatingStats", () => {
  it("liest die View und mappt auf camelCase, numeric als Zahl", async () => {
    let table = "";
    fakeClient.handlers.recipe_rating_stats = (calls) => {
      table = calls.table;
      return {
        data: [
          { recipe_id: "r1", avg_stars: "4.50", rating_count: 2 },
          { recipe_id: "r2", avg_stars: 3, rating_count: 1 },
        ],
        error: null,
      };
    };
    const result = await listRatingStats();
    expect(table).toBe("recipe_rating_stats");
    expect(result).toEqual({
      ok: true,
      stats: [
        { recipeId: "r1", avg: 4.5, count: 2 },
        { recipeId: "r2", avg: 3, count: 1 },
      ],
    });
  });

  it("fragt nie nach einer Athlet-ID", async () => {
    let select = "";
    fakeClient.handlers.recipe_rating_stats = (calls) => {
      select = calls.select ?? "";
      return { data: [], error: null };
    };
    await listRatingStats();
    expect(select).not.toMatch(/athlete/);
  });

  it("meldet einen DB-Fehler als Result", async () => {
    fakeClient.handlers.recipe_rating_stats = () => ({ data: null, error: { message: "kaputt" } });
    expect(await listRatingStats()).toEqual({ ok: false, error: { code: "UNKNOWN", message: "kaputt" } });
  });
});

describe("listMyRatings", () => {
  it("filtert auf den Athleten und mappt Rezept-ID und Sterne", async () => {
    let filters: unknown[] = [];
    fakeClient.handlers.recipe_ratings = (calls) => {
      filters = calls.filters;
      return { data: [{ recipe_id: "r1", stars: 4 }], error: null };
    };
    const result = await listMyRatings("u1");
    expect(filters).toEqual([{ op: "eq", col: "athlete_id", val: "u1" }]);
    expect(result).toEqual({ ok: true, ratings: [{ recipeId: "r1", stars: 4 }] });
  });

  it("meldet einen DB-Fehler als Result", async () => {
    fakeClient.handlers.recipe_ratings = () => ({ data: null, error: { message: "RLS" } });
    expect(await listMyRatings("u1")).toEqual({ ok: false, error: { code: "UNKNOWN", message: "RLS" } });
  });
});

describe("setMyRating", () => {
  it("schreibt per Upsert auf Rezept + Athlet (eine Zeile je Paar)", async () => {
    let calls: { method?: string; payload?: unknown; upsertOpts?: unknown } = {};
    fakeClient.handlers.recipe_ratings = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    const result = await setMyRating("r1", "u1", 5);
    expect(result).toEqual({ ok: true });
    expect(calls.method).toBe("upsert");
    expect(calls.payload).toEqual({ recipe_id: "r1", athlete_id: "u1", stars: 5 });
    expect(calls.upsertOpts).toEqual({ onConflict: "recipe_id,athlete_id" });
  });

  it("meldet die Ablehnung der Datenbank (z. B. eigenes Rezept) als Result", async () => {
    fakeClient.handlers.recipe_ratings = () => ({
      data: null,
      error: { message: "recipe_ratings: you cannot rate your own recipe" },
    });
    const result = await setMyRating("r1", "u1", 3);
    expect(result).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "recipe_ratings: you cannot rate your own recipe" },
    });
  });

  it("lehnt fehlende IDs ohne Anfrage ab", async () => {
    let called = false;
    fakeClient.handlers.recipe_ratings = () => {
      called = true;
      return { data: null, error: null };
    };
    expect(await setMyRating("", "u1", 3)).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(await setMyRating("r1", "", 3)).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(called).toBe(false);
  });
});

describe("deleteMyRating", () => {
  it("löscht genau die Zeile dieses Athleten für dieses Rezept", async () => {
    let calls: { method?: string; filters: unknown[] } = { filters: [] };
    fakeClient.handlers.recipe_ratings = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    expect(await deleteMyRating("r1", "u1")).toEqual({ ok: true });
    expect(calls.method).toBe("delete");
    expect(calls.filters).toEqual([
      { op: "eq", col: "recipe_id", val: "r1" },
      { op: "eq", col: "athlete_id", val: "u1" },
    ]);
  });

  it("meldet einen DB-Fehler als Result", async () => {
    fakeClient.handlers.recipe_ratings = () => ({ data: null, error: { message: "nope" } });
    expect(await deleteMyRating("r1", "u1")).toEqual({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
  });

  it("lehnt fehlende IDs ab", async () => {
    expect(await deleteMyRating("", "u1")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
  });
});

describe("nicht konfiguriert", () => {
  it("alle Funktionen geben ok:false mit Konfigurationsmeldung zurück", async () => {
    vi.resetModules();
    vi.doMock("./client", () => ({ supabase: null, getAuthedClient: async () => null, isSupabaseConfigured: false }));
    const mod = await import("./recipe-ratings");
    const expected = { ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } };
    expect(await mod.listRatingStats()).toEqual(expected);
    expect(await mod.listMyRatings("u1")).toEqual(expected);
    expect(await mod.setMyRating("r1", "u1", 3)).toEqual(expected);
    expect(await mod.deleteMyRating("r1", "u1")).toEqual(expected);
  });
});
