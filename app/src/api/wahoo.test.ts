/* Tests: admin-api-Wrapper für /api/wahoo/* — Token/URL/Methode, Durchreichen,
 * 503 als "nicht konfiguriert", Fehlerpfade. fetch und Supabase gemockt. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockToken: string | null = "tok";
const fetchMock = vi.fn();

vi.mock("./supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }) } },
}));
vi.mock("./supabase/config", () => ({ getConfig: () => ({ projectUrl: "https://example.test" }) }));

const { getWahooStatus, startWahooConnect, disconnectWahoo } = await import("./wahoo");

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  mockToken = "tok";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("wahoo API", () => {
  it("status: GET mit Bearer-Token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, connected: true, scope: "user_read", expiresAt: "2026-11-01T00:00:00Z" }));
    const result = await getWahooStatus();
    expect(result).toMatchObject({ ok: true, connected: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/api/wahoo/status");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("start: POST und liefert die URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, url: "https://api.wahooligan.com/oauth/authorize?x=1" }));
    const result = await startWahooConnect();
    expect(result).toMatchObject({ ok: true, url: "https://api.wahooligan.com/oauth/authorize?x=1" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/wahoo/start");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("disconnect: POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, revoked: false }));
    expect(await disconnectWahoo()).toMatchObject({ ok: true, revoked: false });
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/wahoo/disconnect");
  });

  it("503 wird zu NOT_CONFIGURED", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { ok: false, error: { code: "UNKNOWN", message: "nicht konfiguriert" } }));
    const result = await getWahooStatus();
    expect(result).toEqual({ ok: false, error: { code: "NOT_CONFIGURED", message: "nicht konfiguriert" } });
  });

  it("andere Server-Fehler werden durchgereicht", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { ok: false, error: { code: "TOKEN_INVALID", message: "x" } }));
    expect(await getWahooStatus()).toEqual({ ok: false, error: { code: "TOKEN_INVALID", message: "x" } });
  });

  it("ohne Login: TOKEN_INVALID, kein fetch", async () => {
    mockToken = null;
    const result = await getWahooStatus();
    expect(result).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Netzwerkfehler: NETWORK", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await getWahooStatus()).toEqual({ ok: false, error: { code: "NETWORK", message: "offline" } });
  });

  it("kein JSON: UNKNOWN", async () => {
    fetchMock.mockResolvedValue({ status: 502, json: async () => { throw new Error("x"); } } as unknown as Response);
    expect(await getWahooStatus()).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });

  it("unerwartetes Format: UNKNOWN", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, "hallo"));
    expect(await getWahooStatus()).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });
});
