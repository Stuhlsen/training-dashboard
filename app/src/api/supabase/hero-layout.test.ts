/* Tests: api/supabase/hero-layout.ts — nach Vorlage export-prefs.test.ts. */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getHeroLayout, setHeroLayout } = await import("./hero-layout");

describe("getHeroLayout", () => {
  it("mappt layout aus der Zeile", async () => {
    const layout = [
      { i: "weather", x: 0, y: 0 },
      { i: "session", x: 1, y: 0 },
    ];
    fakeClient.handlers.hero_tile_order = () => ({ data: { layout }, error: null });
    const result = await getHeroLayout("profile-1");
    expect(result).toEqual({ ok: true, layout });
  });

  it("keine Zeile -> layout null, kein Fehler", async () => {
    fakeClient.handlers.hero_tile_order = () => ({ data: null, error: null });
    const result = await getHeroLayout("profile-1");
    expect(result).toEqual({ ok: true, layout: null });
  });

  it("leeres Array -> layout null (wie 'noch nie gespeichert')", async () => {
    fakeClient.handlers.hero_tile_order = () => ({ data: { layout: [] }, error: null });
    const result = await getHeroLayout("profile-1");
    expect(result).toEqual({ ok: true, layout: null });
  });
});

describe("setHeroLayout", () => {
  it("upsertet über profile_id als Konfliktschlüssel", async () => {
    let seen: Record<string, unknown> = {};
    let opts: Record<string, unknown> | undefined;
    fakeClient.handlers.hero_tile_order = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      opts = calls.upsertOpts;
      return { data: null, error: null };
    };
    const layout = [{ i: "records", x: 0, y: 1 }];
    const result = await setHeroLayout("profile-1", layout);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ profile_id: "profile-1", layout });
    expect(opts).toEqual({ onConflict: "profile_id" });
  });
});
