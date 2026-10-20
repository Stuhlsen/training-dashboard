/* Tests: admin-athletes — Wrapper für POST /admin/users/:id/(un)verify-author
 * (Fahrplan 29 V3): Pfad, Methode, Bearer-Token, Durchreichen der Server-Antwort, Fehlerpfade.
 * fetch und Supabase sind gemockt. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockToken: string | null = "tok";
const fetchMock = vi.fn();

vi.mock("./supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }) } },
}));
vi.mock("./supabase/config", () => ({ getConfig: () => ({ projectUrl: "https://example.test" }) }));

const { unverifyAuthor, verifyAuthor } = await import("./admin-athletes");

const ID = "33333333-3333-4333-8333-333333333333";

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  mockToken = "tok";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("verifyAuthor / unverifyAuthor", () => {
  it("verifiziert per POST auf den verify-author-Pfad mit Bearer-Token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, isVerifiedAuthor: true }));
    const result = await verifyAuthor(ID);
    expect(result).toEqual({ ok: true, isVerifiedAuthor: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.test/admin/users/${ID}/verify-author`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("entzieht per POST auf den unverify-author-Pfad", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, isVerifiedAuthor: false }));
    expect(await unverifyAuthor(ID)).toEqual({ ok: true, isVerifiedAuthor: false });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://example.test/admin/users/${ID}/unverify-author`);
  });

  it("reicht Serverfehler unverändert durch (403 kein Admin, 502 Audit-Log)", async () => {
    const forbidden = { code: "UNKNOWN", message: "kein Admin" };
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, error: forbidden }));
    expect(await verifyAuthor(ID)).toEqual({ ok: false, error: forbidden });
    const audit = { code: "NETWORK", message: "Audit-Log nicht schreibbar" };
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { ok: false, error: audit }));
    expect(await unverifyAuthor(ID)).toEqual({ ok: false, error: audit });
  });

  it("meldet TOKEN_INVALID ohne Session, ohne zu senden", async () => {
    mockToken = null;
    expect(await verifyAuthor(ID)).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("meldet NETWORK, wenn fetch wirft, und UNKNOWN bei Antwort ohne JSON oder in fremdem Format", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await verifyAuthor(ID)).toMatchObject({ ok: false, error: { code: "NETWORK", message: "offline" } });
    fetchMock.mockResolvedValueOnce({ status: 502, json: async () => Promise.reject(new Error("x")) } as unknown as Response);
    expect(await verifyAuthor(ID)).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hallo: 1 }));
    expect(await verifyAuthor(ID)).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });
});
