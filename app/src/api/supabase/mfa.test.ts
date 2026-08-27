/* Tests: api/supabase/mfa.ts — handgerollter Fake-Client (nur `auth.mfa.*`,
 * kein `.from()` nötig), Aufbau wie auth.test.ts. */

import { beforeEach, describe, expect, it, vi } from "vitest";

let listFactorsResult: { data: unknown; error: { message: string } | null } = {
  data: { all: [] },
  error: null,
};
let enrollResult: { data: unknown; error: { message: string } | null } = {
  data: { id: "factor-1", type: "totp", totp: { qr_code: "<svg/>", secret: "SECRET123", uri: "otpauth://x" } },
  error: null,
};
let verifyResult: { data: unknown; error: { message: string } | null } = { data: {}, error: null };
let unenrollResult: { data: unknown; error: { message: string } | null } = { data: { id: "factor-1" }, error: null };
let verifyCalls: Array<{ factorId: string; code: string }> = [];
let unenrollCalls: Array<{ factorId: string }> = [];

const fakeClient = {
  auth: {
    mfa: {
      listFactors: async () => listFactorsResult,
      enroll: async () => enrollResult,
      challengeAndVerify: async (params: { factorId: string; code: string }) => {
        verifyCalls.push(params);
        return verifyResult;
      },
      unenroll: async (params: { factorId: string }) => {
        unenrollCalls.push(params);
        return unenrollResult;
      },
    },
  },
};

vi.mock("./client", () => ({ supabase: fakeClient }));

const { listMfaFactors, enrollTotpFactor, verifyTotpFactor, unenrollTotpFactor } = await import("./mfa");

beforeEach(() => {
  listFactorsResult = { data: { all: [] }, error: null };
  enrollResult = {
    data: { id: "factor-1", type: "totp", totp: { qr_code: "<svg/>", secret: "SECRET123", uri: "otpauth://x" } },
    error: null,
  };
  verifyResult = { data: {}, error: null };
  unenrollResult = { data: { id: "factor-1" }, error: null };
  verifyCalls = [];
  unenrollCalls = [];
});

describe("listMfaFactors", () => {
  it("kein Faktor -> status 'none'", async () => {
    const result = await listMfaFactors();
    expect(result).toEqual({ ok: true, status: "none", factorId: null });
  });

  it("unverifizierter TOTP-Faktor -> status 'unverified'", async () => {
    listFactorsResult = {
      data: { all: [{ id: "f1", factor_type: "totp", status: "unverified" }] },
      error: null,
    };
    const result = await listMfaFactors();
    expect(result).toEqual({ ok: true, status: "unverified", factorId: "f1" });
  });

  it("verifizierter TOTP-Faktor -> status 'verified'", async () => {
    listFactorsResult = {
      data: { all: [{ id: "f1", factor_type: "totp", status: "verified" }] },
      error: null,
    };
    const result = await listMfaFactors();
    expect(result).toEqual({ ok: true, status: "verified", factorId: "f1" });
  });
});

describe("enrollTotpFactor", () => {
  it("mappt QR-Code/Secret aus der Antwort", async () => {
    const result = await enrollTotpFactor();
    expect(result).toEqual({ ok: true, factorId: "factor-1", qrCodeSvg: "<svg/>", secret: "SECRET123" });
  });
});

describe("verifyTotpFactor", () => {
  it("ruft challengeAndVerify mit factorId+code auf", async () => {
    const result = await verifyTotpFactor("factor-1", "123456");
    expect(result).toEqual({ ok: true });
    expect(verifyCalls).toEqual([{ factorId: "factor-1", code: "123456" }]);
  });

  it("falscher Code -> Fehler", async () => {
    verifyResult = { data: null, error: { message: "Invalid TOTP code entered" } };
    const result = await verifyTotpFactor("factor-1", "000000");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/Invalid TOTP code/);
  });
});

describe("unenrollTotpFactor", () => {
  it("ruft unenroll mit factorId auf", async () => {
    const result = await unenrollTotpFactor("factor-1");
    expect(result).toEqual({ ok: true });
    expect(unenrollCalls).toEqual([{ factorId: "factor-1" }]);
  });
});
