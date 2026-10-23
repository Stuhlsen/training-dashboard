/* Tests: getTrainingDataPublic / setTrainingDataPublic (Migration 0078,
 * Fahrplan 26 E4) — Lesen über profiles_visible, Schreiben über die RPC. */

import { beforeEach, describe, expect, it, vi } from "vitest";

let selectResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let rpcResult: { error: { message: string } | null } = { error: null };
let seenTable = "";
let seenFilter: unknown[] = [];
let seenRpc: { name: string; args: unknown } | null = null;

const fakeClient = {
  from(table: string) {
    seenTable = table;
    const api = {
      select: () => api,
      eq: (...f: unknown[]) => {
        seenFilter = f;
        return api;
      },
      maybeSingle: async () => selectResult,
    };
    return api;
  },
  rpc: async (name: string, args: unknown) => {
    seenRpc = { name, args };
    return rpcResult;
  },
};

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getTrainingDataPublic, setTrainingDataPublic } = await import("./profiles");

beforeEach(() => {
  selectResult = { data: null, error: null };
  rpcResult = { error: null };
  seenRpc = null;
});

describe("getTrainingDataPublic", () => {
  it("liest die eigene Zeile über profiles_visible", async () => {
    selectResult = { data: { training_data_public: true }, error: null };
    const result = await getTrainingDataPublic("u1");
    expect(result).toEqual({ ok: true, value: true });
    expect(seenTable).toBe("profiles_visible");
    expect(seenFilter).toEqual(["id", "u1"]);
  });

  it("keine Zeile oder null → false", async () => {
    expect(await getTrainingDataPublic("u1")).toEqual({ ok: true, value: false });
    selectResult = { data: { training_data_public: null }, error: null };
    expect(await getTrainingDataPublic("u1")).toEqual({ ok: true, value: false });
  });

  it("Lesefehler → ok:false", async () => {
    selectResult = { data: null, error: { message: "boom" } };
    const result = await getTrainingDataPublic("u1");
    expect(result.ok).toBe(false);
  });
});

describe("setTrainingDataPublic", () => {
  it("ruft die RPC set_training_data_public mit aid/val", async () => {
    const result = await setTrainingDataPublic("u1", true);
    expect(result).toEqual({ ok: true });
    expect(seenRpc).toEqual({ name: "set_training_data_public", args: { aid: "u1", val: true } });
  });

  it("RPC-Fehler (z. B. 42501) → ok:false mit Meldung", async () => {
    rpcResult = { error: { message: "not allowed" } };
    const result = await setTrainingDataPublic("u2", false);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "not allowed" } });
  });
});
