/* Tests: admin-api-Wrapper für die Rezept-Einreichung — Token/URL, Durchreichen
 * der Server-Antwort (inkl. details), Fehlerpfade. fetch und Supabase gemockt. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockToken: string | null = "tok";
const fetchMock = vi.fn();

vi.mock("./supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: mockToken ? { access_token: mockToken } : null } }) } },
}));
vi.mock("./supabase/config", () => ({ getConfig: () => ({ projectUrl: "https://example.test" }) }));

const { previewRecipe, searchIngredients, submitRecipe } = await import("./recipe-submission");

const BODY = {
  title: "Haferbrei",
  meal_type: ["breakfast"],
  servings: 2,
  ingredients: [{ name: "Haferflocken", amount: 80, unit: "g" }],
  instructions: [{ text: "Kochen" }],
};

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

beforeEach(() => {
  mockToken = "tok";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("recipe-submission API", () => {
  it("schickt Bearer-Token und JSON-Body an den richtigen Pfad", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, recipe: { id: "r1", status: "pending", title: "Haferbrei" } }));
    const result = await submitRecipe(BODY);
    expect(result).toMatchObject({ ok: true, recipe: { id: "r1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/api/recipes");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual(BODY);
  });

  it("nutzt für die Vorschau den preview-Pfad", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, nutrition: { kcal: 1, protein: 1, carbs: 1, fat: 1 }, contains_tags: [], diet_tags: [], ingredients: [] }),
    );
    await previewRecipe(BODY);
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/recipes/preview");
  });

  it("reicht Formularfehler (422) mit details unverändert durch", async () => {
    const error = { code: "VALIDATION", message: "Rezept ungueltig", details: { title: ["Titel fehlt"] } };
    fetchMock.mockResolvedValue(jsonResponse(422, { ok: false, error }));
    expect(await submitRecipe(BODY)).toEqual({ ok: false, error });
  });

  it("kodiert den Suchtext und lässt leere Suche ungefragt", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, ingredients: [] }));
    expect(await searchIngredients("   ")).toEqual({ ok: true, ingredients: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    await searchIngredients("Grünkohl & Co");
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/ingredients?q=Gr%C3%BCnkohl%20%26%20Co");
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it("meldet TOKEN_INVALID ohne Session, ohne zu senden", async () => {
    mockToken = null;
    const result = await submitRecipe(BODY);
    expect(result).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("meldet NETWORK, wenn fetch wirft", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await submitRecipe(BODY)).toMatchObject({ ok: false, error: { code: "NETWORK", message: "offline" } });
  });

  it("meldet UNKNOWN bei Antwort ohne JSON oder in fremdem Format", async () => {
    fetchMock.mockResolvedValueOnce({ status: 502, json: async () => Promise.reject(new Error("x")) } as unknown as Response);
    expect(await submitRecipe(BODY)).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hallo: 1 }));
    expect(await submitRecipe(BODY)).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
  });
});
