/* Tests: useWahoo — Status, NOT_CONFIGURED, Verbinden (URL), Trennen (Cache). Adapter gestubbt. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const statusMock = vi.fn();
const startMock = vi.fn();
const disconnectMock = vi.fn();
const envMock = vi.fn((): string => "dev");

vi.mock("../supabase/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase/config")>()),
  getEnvironment: () => envMock(),
}));

vi.mock("../wahoo", () => ({
  getWahooStatus: (...a: unknown[]) => statusMock(...a),
  startWahooConnect: (...a: unknown[]) => startMock(...a),
  disconnectWahoo: (...a: unknown[]) => disconnectMock(...a),
}));

const { createHarness } = await import("../../test/harness");
const { useWahooStatus, useWahooConnect, useWahooDisconnect, isWahooAvailable } = await import("./useWahoo");

beforeEach(() => {
  for (const m of [statusMock, startMock, disconnectMock]) m.mockReset();
});

describe("useWahooStatus", () => {
  it("liefert den Status", async () => {
    statusMock.mockResolvedValue({ ok: true, connected: true, scope: "user_read", expiresAt: null });
    const h = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useWahooStatus(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.status).toEqual({ connected: true, scope: "user_read", expiresAt: null }));
    expect(result.current.notConfigured).toBe(false);
  });

  it("meldet notConfigured bei NOT_CONFIGURED", async () => {
    statusMock.mockResolvedValue({ ok: false, error: { code: "NOT_CONFIGURED", message: "x" } });
    const h = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useWahooStatus(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.notConfigured).toBe(true));
  });

  it("fragt nicht, wenn deaktiviert", () => {
    const h = createHarness({ userId: "u1" });
    renderHook(() => useWahooStatus(false), { wrapper: h.wrapper });
    expect(statusMock).not.toHaveBeenCalled();
  });
});

describe("useWahooConnect", () => {
  it("liefert die URL", async () => {
    startMock.mockResolvedValue({ ok: true, url: "https://x.test/auth" });
    const h = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useWahooConnect(), { wrapper: h.wrapper });
    let r;
    await act(async () => {
      r = await result.current.start();
    });
    expect(r).toMatchObject({ ok: true, url: "https://x.test/auth" });
  });

  it("gibt Fehler als Result zurück", async () => {
    startMock.mockResolvedValue({ ok: false, error: { code: "NOT_CONFIGURED", message: "x" } });
    const h = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useWahooConnect(), { wrapper: h.wrapper });
    let r;
    await act(async () => {
      r = await result.current.start();
    });
    expect(r).toEqual({ ok: false, error: { code: "NOT_CONFIGURED", message: "x" } });
  });
});

describe("useWahooDisconnect", () => {
  it("setzt den Status auf getrennt", async () => {
    statusMock.mockResolvedValue({ ok: true, connected: true, scope: "user_read", expiresAt: null });
    disconnectMock.mockResolvedValue({ ok: true, revoked: true });
    const h = createHarness({ userId: "u1" });
    const { result } = renderHook(() => ({ s: useWahooStatus(), d: useWahooDisconnect() }), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.s.status?.connected).toBe(true));
    await act(async () => {
      await result.current.d.disconnect();
    });
    await waitFor(() => expect(result.current.s.status?.connected).toBe(false));
  });

  it("ohne Login: Fehler, kein Aufruf", async () => {
    const h = createHarness({ userId: null });
    const { result } = renderHook(() => useWahooDisconnect(), { wrapper: h.wrapper });
    let r;
    await act(async () => {
      r = await result.current.disconnect();
    });
    expect(r).toMatchObject({ ok: false });
    expect(disconnectMock).not.toHaveBeenCalled();
  });
});

describe("isWahooAvailable", () => {
  it("ist im Demo-Stack aus", () => {
    envMock.mockReturnValue("demo");
    expect(isWahooAvailable()).toBe(false);
  });

  it("ist in dev und prod an", () => {
    for (const env of ["dev", "prod"]) {
      envMock.mockReturnValue(env);
      expect(isWahooAvailable()).toBe(true);
    }
  });
});
