/* Tests: api/supabase/waitlist.ts — Fahrplan 22 E6 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

/** Mutable Zustand der gemoockten `./client`-Exports. Der Factory-Getter
 *  für `supabase` wird bei jedem Zugriff neu ausgelesen, damit der
 *  „nicht konfiguriert"-Fall (supabase === null) pro Test umschaltbar ist,
 *  ohne die Module neu importieren zu müssen. */
const mockState = vi.hoisted(() => ({
  supabase: null as unknown,
  getAuthedClient: null as unknown,
}));

vi.mock("./client", () => ({
  get supabase() {
    return mockState.supabase;
  },
  get getAuthedClient() {
    return mockState.getAuthedClient;
  },
  isSupabaseConfigured: true,
}));

const fakeClient = createFakeSupabaseClient();

beforeEach(() => {
  mockState.supabase = fakeClient;
  mockState.getAuthedClient = async () => fakeClient;
});

const { addToWaitlist } = await import("./waitlist");

describe("addToWaitlist", () => {
  it("trimmt und kleinschreibt die E-Mail vor dem Insert", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.waitlist = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await addToWaitlist("  Max@Example.com  ");
    expect(result).toEqual({ ok: true });
    expect(payload).toEqual({ email: "max@example.com" });
  });

  it("behandelt eine schon eingetragene Adresse (23505) als Erfolg", async () => {
    fakeClient.handlers.waitlist = () => ({
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" } as unknown as {
        message: string;
      },
    });
    const result = await addToWaitlist("schon@da.de");
    expect(result).toEqual({ ok: true });
  });

  it("gibt einen Fehler zurück, wenn der Insert anderweitig scheitert", async () => {
    fakeClient.handlers.waitlist = () => ({ data: null, error: { message: "boom" } });
    const result = await addToWaitlist("fehler@test.de");
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
  });

  it("meldet, wenn Supabase nicht konfiguriert ist", async () => {
    mockState.supabase = null;
    const result = await addToWaitlist("nix@konfig.de");
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Supabase nicht konfiguriert" } });
  });
});
