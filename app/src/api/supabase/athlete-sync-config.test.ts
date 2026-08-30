/* Tests: api/supabase/athlete-sync-config.ts — Standort-Spalten der
 * Tabelle athlete_sync_config (Migration 0023, Fahrplan 7 CRED2). */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getSyncLocation, updateSyncLocation, roundCoord } = await import("./athlete-sync-config");

describe("roundCoord", () => {
  it("rundet auf 2 Nachkommastellen", () => {
    expect(roundCoord(52.51234)).toBe(52.51);
    expect(roundCoord(13.40891)).toBe(13.41);
    expect(roundCoord(-33.87654)).toBe(-33.88);
    expect(roundCoord(9.001)).toBe(9);
    expect(roundCoord(48)).toBe(48);
  });
  it("null / nicht-endliche Werte -> null", () => {
    expect(roundCoord(null)).toBeNull();
    expect(roundCoord(Number.NaN)).toBeNull();
    expect(roundCoord(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("getSyncLocation", () => {
  it("mappt weather_lat/weather_lon aus der Zeile (auch als String geliefert)", async () => {
    fakeClient.handlers.athlete_sync_config = () => ({
      data: { weather_lat: "52.52", weather_lon: 13.41 },
      error: null,
    });
    const result = await getSyncLocation("profile-1");
    expect(result).toEqual({ ok: true, location: { lat: 52.52, lon: 13.41 } });
  });

  it("keine Zeile -> lat/lon null, kein Fehler", async () => {
    fakeClient.handlers.athlete_sync_config = () => ({ data: null, error: null });
    const result = await getSyncLocation("profile-1");
    expect(result).toEqual({ ok: true, location: { lat: null, lon: null } });
  });

  it("filtert auf die eigene profile_id", async () => {
    let seen: unknown;
    fakeClient.handlers.athlete_sync_config = (calls) => {
      seen = calls.filters;
      return { data: null, error: null };
    };
    await getSyncLocation("profile-42");
    expect(seen).toEqual([{ op: "eq", col: "profile_id", val: "profile-42" }]);
  });

  it("DB-Fehler -> Result ok:false", async () => {
    fakeClient.handlers.athlete_sync_config = () => ({ data: null, error: { message: "boom" } });
    const result = await getSyncLocation("profile-1");
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  });
});

describe("updateSyncLocation", () => {
  it("upsertet über profile_id, rundet die Koordinaten vor dem Senden", async () => {
    let seen: Record<string, unknown> = {};
    let opts: Record<string, unknown> | undefined;
    fakeClient.handlers.athlete_sync_config = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      opts = calls.upsertOpts;
      return { data: null, error: null };
    };
    const result = await updateSyncLocation("profile-1", { lat: 52.51234, lon: 13.40891 });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ profile_id: "profile-1", weather_lat: 52.51, weather_lon: 13.41 });
    expect(opts).toEqual({ onConflict: "profile_id" });
  });

  it("null/null schreibt null (Standort entfernen)", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.athlete_sync_config = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await updateSyncLocation("profile-1", { lat: null, lon: null });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ profile_id: "profile-1", weather_lat: null, weather_lon: null });
  });

  it("DB-Fehler -> Result ok:false", async () => {
    fakeClient.handlers.athlete_sync_config = () => ({ data: null, error: { message: "nope" } });
    const result = await updateSyncLocation("profile-1", { lat: 1, lon: 2 });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
  });
});
