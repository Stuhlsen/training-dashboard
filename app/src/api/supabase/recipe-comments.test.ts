/* Tests: api/supabase/recipe-comments.ts — Feed lesen (ohne Athlet-ID), Kommentar anlegen,
 * eigenen löschen, Daumen per Upsert. */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listRecipeComments, addRecipeComment, deleteOwnRecipeComment, setCommentVote } = await import(
  "./recipe-comments"
);

describe("listRecipeComments", () => {
  it("liest die View, filtert auf das Rezept und mappt auf camelCase", async () => {
    let calls: { table?: string; filters?: unknown[]; order?: unknown } = {};
    fakeClient.handlers.recipe_comment_feed = (c) => {
      calls = c;
      return {
        data: [
          {
            id: "c1",
            recipe_id: "r1",
            author_name: "RadFuchs",
            is_mine: true,
            body: "Zu wenig Salz",
            created_at: "2026-10-20T10:00:00Z",
            up_count: 2,
            down_count: 1,
            my_vote: null,
          },
        ],
        error: null,
      };
    };
    const result = await listRecipeComments("r1");
    expect(calls.table).toBe("recipe_comment_feed");
    expect(calls.filters).toEqual([{ op: "eq", col: "recipe_id", val: "r1" }]);
    expect(calls.order).toEqual({ col: "created_at", ascending: true });
    expect(result).toEqual({
      ok: true,
      comments: [
        {
          id: "c1",
          recipeId: "r1",
          authorName: "RadFuchs",
          isMine: true,
          body: "Zu wenig Salz",
          createdAt: "2026-10-20T10:00:00Z",
          up: 2,
          down: 1,
          myVote: null,
        },
      ],
    });
  });

  it("fragt nie nach einer Athlet-ID", async () => {
    let select = "";
    fakeClient.handlers.recipe_comment_feed = (c) => {
      select = c.select ?? "";
      return { data: [], error: null };
    };
    await listRecipeComments("r1");
    expect(select).not.toMatch(/athlete/);
  });

  it("meldet einen DB-Fehler als Result und lehnt eine fehlende Rezept-ID ohne Anfrage ab", async () => {
    fakeClient.handlers.recipe_comment_feed = () => ({ data: null, error: { message: "kaputt" } });
    expect(await listRecipeComments("r1")).toEqual({ ok: false, error: { code: "UNKNOWN", message: "kaputt" } });
    let called = false;
    fakeClient.handlers.recipe_comment_feed = () => {
      called = true;
      return { data: [], error: null };
    };
    expect(await listRecipeComments("")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(called).toBe(false);
  });
});

describe("addRecipeComment", () => {
  it("legt per Insert an: Rezept, Athlet, Text", async () => {
    let calls: { table?: string; method?: string; payload?: unknown } = {};
    fakeClient.handlers.recipe_comments = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    expect(await addRecipeComment("r1", "u1", "Schmeckt gut")).toEqual({ ok: true });
    expect(calls.table).toBe("recipe_comments");
    expect(calls.method).toBe("insert");
    expect(calls.payload).toEqual({ recipe_id: "r1", athlete_id: "u1", body: "Schmeckt gut" });
  });

  it("reicht HTML unverändert durch (kein Umbau, nur Text-Anzeige)", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.recipe_comments = (c) => {
      payload = c.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    await addRecipeComment("r1", "u1", "<b>x</b>");
    expect(payload.body).toBe("<b>x</b>");
  });

  it("meldet die Ablehnung der Datenbank (z. B. kein Pseudonym) als Result", async () => {
    fakeClient.handlers.recipe_comments = () => ({
      data: null,
      error: { message: "recipe_comments: set a display name (pseudonym) in the settings first" },
    });
    expect(await addRecipeComment("r1", "u1", "x")).toEqual({
      ok: false,
      error: { code: "UNKNOWN", message: "recipe_comments: set a display name (pseudonym) in the settings first" },
    });
  });

  it("lehnt fehlende IDs ohne Anfrage ab", async () => {
    let called = false;
    fakeClient.handlers.recipe_comments = () => {
      called = true;
      return { data: null, error: null };
    };
    expect(await addRecipeComment("", "u1", "x")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(await addRecipeComment("r1", "", "x")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(called).toBe(false);
  });
});

describe("deleteOwnRecipeComment", () => {
  it("löscht per Delete auf die Kommentar-ID", async () => {
    let calls: { method?: string; filters?: unknown[] } = {};
    fakeClient.handlers.recipe_comments = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    expect(await deleteOwnRecipeComment("c1")).toEqual({ ok: true });
    expect(calls.method).toBe("delete");
    expect(calls.filters).toEqual([{ op: "eq", col: "id", val: "c1" }]);
  });

  it("meldet einen DB-Fehler als Result und lehnt eine leere ID ab", async () => {
    fakeClient.handlers.recipe_comments = () => ({ data: null, error: { message: "RLS" } });
    expect(await deleteOwnRecipeComment("c1")).toEqual({ ok: false, error: { code: "UNKNOWN", message: "RLS" } });
    expect(await deleteOwnRecipeComment("")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
  });
});

describe("setCommentVote", () => {
  it("schreibt per Upsert auf Kommentar + Athlet (eine Zeile je Paar)", async () => {
    let calls: { table?: string; method?: string; payload?: unknown; upsertOpts?: unknown } = {};
    fakeClient.handlers.recipe_comment_votes = (c) => {
      calls = c;
      return { data: null, error: null };
    };
    expect(await setCommentVote("c1", "u1", "down")).toEqual({ ok: true });
    expect(calls.table).toBe("recipe_comment_votes");
    expect(calls.method).toBe("upsert");
    expect(calls.payload).toEqual({ comment_id: "c1", athlete_id: "u1", vote: "down" });
    expect(calls.upsertOpts).toEqual({ onConflict: "comment_id,athlete_id" });
  });

  it("meldet die Ablehnung der Datenbank (eigener Kommentar) als Result", async () => {
    fakeClient.handlers.recipe_comment_votes = () => ({
      data: null,
      error: { message: "recipe_comment_votes: you cannot vote on your own comment" },
    });
    expect(await setCommentVote("c1", "u1", "up")).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });

  it("lehnt fehlende IDs ohne Anfrage ab", async () => {
    let called = false;
    fakeClient.handlers.recipe_comment_votes = () => {
      called = true;
      return { data: null, error: null };
    };
    expect(await setCommentVote("", "u1", "up")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(await setCommentVote("c1", "", "up")).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(called).toBe(false);
  });
});

describe("nicht konfiguriert", () => {
  it("alle Funktionen geben ok:false mit Konfigurationsmeldung zurück", async () => {
    vi.resetModules();
    vi.doMock("./client", () => ({ supabase: null, getAuthedClient: async () => null, isSupabaseConfigured: false }));
    const mod = await import("./recipe-comments");
    const expected = { ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } };
    expect(await mod.listRecipeComments("r1")).toEqual(expected);
    expect(await mod.addRecipeComment("r1", "u1", "x")).toEqual(expected);
    expect(await mod.deleteOwnRecipeComment("c1")).toEqual(expected);
    expect(await mod.setCommentVote("c1", "u1", "up")).toEqual(expected);
  });
});
