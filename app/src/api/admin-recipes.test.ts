/* Tests: admin-recipes — Wrapper für POST /admin/recipes/:id/(approve|reject) (Fahrplan 30 B4):
 * Pfad, Methode, Bearer-Token, Grund im Body, Durchreichen der Server-Antwort, Fehlerpfade.
 * fetch und Supabase sind gemockt. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockToken: string | null = "tok";
const fetchMock = vi.fn();

vi.mock("./supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }) } },
}));
vi.mock("./supabase/config", () => ({ getConfig: () => ({ projectUrl: "https://example.test" }) }));

const { approveRecipe, rejectRecipe } = await import("./admin-recipes");

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

describe("approveRecipe", () => {
  it("gibt per POST auf den approve-Pfad frei, mit Bearer-Token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, status: "approved" }));
    const result = await approveRecipe(ID);
    expect(result).toEqual({ ok: true, status: "approved" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.test/admin/recipes/${ID}/approve`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("reicht einen Server-Fehler (z. B. nicht mehr in Prüfung) unverändert durch", async () => {
    const conflict = { code: "HTTP", message: "Das Rezept ist nicht mehr in Prüfung" };
    fetchMock.mockResolvedValue(jsonResponse(409, { ok: false, error: conflict }));
    expect(await approveRecipe(ID)).toEqual({ ok: false, error: conflict });
  });
});

describe("rejectRecipe", () => {
  it("lehnt per POST auf den reject-Pfad ab und schickt den Grund im Body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, status: "rejected" }));
    const result = await rejectRecipe(ID, "Zutaten unklar");
    expect(result).toEqual({ ok: true, status: "rejected" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://example.test/admin/recipes/${ID}/reject`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "Zutaten unklar" });
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("maskiert die ID im Pfad (keine Pfad-Einschleusung)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { ok: false, error: { code: "NO_DATA", message: "x" } }));
    await rejectRecipe("a/b?c", "grund");
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/admin/recipes/a%2Fb%3Fc/reject");
  });
});

describe("Fehlerpfade", () => {
  it("ohne Anmeldung TOKEN_INVALID, ohne Netzaufruf", async () => {
    mockToken = null;
    expect(await approveRecipe(ID)).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(await rejectRecipe(ID, "x")).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Netzwerkfehler -> NETWORK, Nicht-JSON -> UNKNOWN", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await approveRecipe(ID)).toMatchObject({ ok: false, error: { code: "NETWORK", message: "offline" } });
    fetchMock.mockResolvedValueOnce({
      status: 502,
      json: async () => {
        throw new Error("kein JSON");
      },
    } as unknown as Response);
    expect(await approveRecipe(ID)).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });
});
