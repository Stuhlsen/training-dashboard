/* Tests: api/supabase/auth.ts::updatePassword() — Re-Authentifizierung vor
 * dem eigentlichen Passwort-Update (Konzept C5.2). Portiert aus
 * tests/auth-password.test.js (Vanilla), Aufbau unverändert: client.ts wird
 * durch einen minimalen Fake-Client ersetzt (nur `auth.*`, kein `.from()`
 * nötig, da auth.ts keine Tabellen anfasst) — der Adapter selbst wird
 * geprüft, nicht die Hooks darüber (die mocken updatePassword bereits weg,
 * s. useProfile.test.tsx). */

import { beforeEach, describe, expect, it, vi } from "vitest";

const EMAIL = "athlete@training-dashboard.dev";

let sessionEmail: string | null = EMAIL;
let reauthShouldFail = false;
let updateUserError: { message: string } | null = null;
let reauthCalls: Array<{ email: string; password: string }> = [];
let updateUserCalls: Array<{ password: string }> = [];

const fakeClient = {
  auth: {
    getSession: async () => ({ data: { session: sessionEmail ? { user: { email: sessionEmail } } : null } } as never),
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      reauthCalls.push({ email, password });
      return { error: reauthShouldFail ? { message: "Invalid login credentials" } : null } as never;
    },
    updateUser: async ({ password }: { password: string }) => {
      updateUserCalls.push({ password });
      return { error: updateUserError } as never;
    },
  },
};

vi.mock("./client", () => ({ supabase: fakeClient }));

const { updatePassword } = await import("./auth");

beforeEach(() => {
  sessionEmail = EMAIL;
  reauthShouldFail = false;
  updateUserError = null;
  reauthCalls = [];
  updateUserCalls = [];
});

describe("updatePassword", () => {
  it("falsches aktuelles Passwort → Fehler, updateUser wird nicht aufgerufen", async () => {
    reauthShouldFail = true;
    const result = await updatePassword("falsches-pw", "neues-passwort-123");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/Aktuelles Passwort ist falsch/);
    expect(updateUserCalls.length).toBe(0);
  });

  it("Re-Auth ok, aber updateUser scheitert (z. B. zu schwaches neues Passwort) → Fehler", async () => {
    updateUserError = { message: "Password should be at least 6 characters." };
    const result = await updatePassword("richtiges-pw", "123");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/6 characters/);
  });

  it("Erfolg — Re-Auth mit aktuellem Passwort, dann updateUser mit neuem", async () => {
    const result = await updatePassword("richtiges-pw", "neues-passwort-123");
    expect(result.ok).toBe(true);
    expect(reauthCalls).toEqual([{ email: EMAIL, password: "richtiges-pw" }]);
    expect(updateUserCalls).toEqual([{ password: "neues-passwort-123" }]);
  });

  it("keine Session → Fehler, kein Re-Auth-Versuch", async () => {
    sessionEmail = null;
    const result = await updatePassword("irgendein-pw", "neues-passwort-123");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/Nicht eingeloggt/);
    expect(reauthCalls.length).toBe(0);
  });
});
