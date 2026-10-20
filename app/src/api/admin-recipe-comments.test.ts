/* Tests: admin-recipe-comments — Wrapper für DELETE /admin/recipe-comments/:id (Fahrplan 30 B5):
 * Pfad, Methode, Bearer-Token, Durchreichen der Server-Antwort, Fehlerpfade.
 * fetch und Supabase sind gemockt. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockToken: string | null = "tok";
const fetchMock = vi.fn();

vi.mock("./supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }) } },
}));
vi.mock("./supabase/config", () => ({ getConfig: () => ({ projectUrl: "https://example.test" }) }));

const { deleteRecipeCommentAsAdmin } = await import("./admin-recipe-comments");

const ID = "44444444-4444-4444-8444-444444444444";

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  mockToken = "tok";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("deleteRecipeCommentAsAdmin", () => {
  it("löscht per DELETE auf den Kommentar-Pfad, mit Bearer-Token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await deleteRecipeCommentAsAdmin(ID);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.test/admin/recipe-comments/${ID}`);
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("reicht einen Server-Fehler (kein Admin, schon weg) unverändert durch", async () => {
    const gone = { code: "NO_DATA", message: "Kommentar nicht gefunden" };
    fetchMock.mockResolvedValue(jsonResponse(404, { ok: false, error: gone }));
    expect(await deleteRecipeCommentAsAdmin(ID)).toEqual({ ok: false, error: gone });
  });

  it("maskiert die ID im Pfad (keine Pfad-Einschleusung)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { ok: false, error: { code: "NO_DATA", message: "x" } }));
    await deleteRecipeCommentAsAdmin("a/b?c");
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/admin/recipe-comments/a%2Fb%3Fc");
  });

  it("ohne Anmeldung TOKEN_INVALID, ohne Netzaufruf", async () => {
    mockToken = null;
    expect(await deleteRecipeCommentAsAdmin(ID)).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Netzwerkfehler -> NETWORK", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await deleteRecipeCommentAsAdmin(ID)).toMatchObject({
      ok: false,
      error: { code: "NETWORK", message: "offline" },
    });
  });
});
