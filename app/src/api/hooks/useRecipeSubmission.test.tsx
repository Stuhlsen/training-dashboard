/* Tests: useRecipeSubmission (Fahrplan 25, S2a/S2b) — Einreichen vs. Ändern, Foto-Upload
 * (Wiederverwendung beim zweiten Versuch), Zurückziehen, Wunsch, Einheiten nachladen.
 * Alles ab api/recipe-submission und api/supabase/* ist gestubbt. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitRecipeMock = vi.fn();
const updateRecipeMock = vi.fn();
const withdrawRecipeMock = vi.fn();
const previewRecipeMock = vi.fn();
const searchIngredientsMock = vi.fn();
const createIngredientRequestMock = vi.fn();
const uploadMock = vi.fn();

vi.mock("../recipe-submission", () => ({
  submitRecipe: (...a: unknown[]) => submitRecipeMock(...a),
  updateRecipe: (...a: unknown[]) => updateRecipeMock(...a),
  withdrawRecipe: (...a: unknown[]) => withdrawRecipeMock(...a),
  previewRecipe: (...a: unknown[]) => previewRecipeMock(...a),
  searchIngredients: (...a: unknown[]) => searchIngredientsMock(...a),
  createIngredientRequest: (...a: unknown[]) => createIngredientRequestMock(...a),
}));
vi.mock("../supabase/recipe-images", () => ({ uploadRecipePhoto: (...a: unknown[]) => uploadMock(...a) }));

const { createHarness } = await import("../../test/harness");
const { useIngredientRequest, useIngredientUnits, useSubmitRecipe, useWithdrawRecipe } = await import("./useRecipeSubmission");

const BODY = {
  title: "Haferbrei",
  meal_type: ["breakfast"],
  servings: 2,
  ingredients: [{ name: "Haferflocken", amount: 80, unit: "g" }],
  instructions: [{ text: "Kochen" }],
};
const SAVED = { ok: true, recipe: { id: "r1", status: "pending", title: "Haferbrei" } };

beforeEach(() => {
  for (const m of [submitRecipeMock, updateRecipeMock, withdrawRecipeMock, previewRecipeMock, searchIngredientsMock, createIngredientRequestMock, uploadMock]) {
    m.mockReset();
  }
  submitRecipeMock.mockResolvedValue(SAVED);
  updateRecipeMock.mockResolvedValue(SAVED);
  withdrawRecipeMock.mockResolvedValue({ ok: true });
  uploadMock.mockResolvedValue({ ok: true, path: "u1/neu.webp" });
});

describe("useSubmitRecipe", () => {
  it("reicht ohne Foto und ohne Optionen neu ein (POST), nicht per Update", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.submit(BODY, null);
    });
    expect(res).toMatchObject({ ok: true, recipe: { id: "r1" } });
    expect(submitRecipeMock).toHaveBeenCalledWith(BODY);
    expect(updateRecipeMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("ändert mit recipeId (PUT) und schickt den behaltenen Foto-Pfad mit", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    await act(async () => {
      await result.current.submit(BODY, null, { recipeId: "r1", keepImagePath: "u1/alt.webp" });
    });
    expect(updateRecipeMock).toHaveBeenCalledWith("r1", { ...BODY, image_url: "u1/alt.webp" });
    expect(submitRecipeMock).not.toHaveBeenCalled();
  });

  it("ändert ohne Foto-Pfad, wenn das Foto entfernt werden soll", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    await act(async () => {
      await result.current.submit(BODY, null, { recipeId: "r1", keepImagePath: null });
    });
    expect(updateRecipeMock).toHaveBeenCalledWith("r1", BODY);
  });

  it("lädt ein neues Foto hoch; es ersetzt den behaltenen Pfad", async () => {
    const photo = new Blob(["x"], { type: "image/webp" });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    await act(async () => {
      await result.current.submit(BODY, photo, { recipeId: "r1", keepImagePath: "u1/alt.webp" });
    });
    expect(uploadMock).toHaveBeenCalledWith(photo);
    expect(updateRecipeMock).toHaveBeenCalledWith("r1", { ...BODY, image_url: "u1/neu.webp" });
  });

  it("bricht ab und sendet nichts, wenn der Upload scheitert", async () => {
    uploadMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "Upload kaputt" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.submit(BODY, new Blob(["x"]));
    });
    expect(res).toMatchObject({ ok: false, error: { message: "Upload kaputt" } });
    expect(submitRecipeMock).not.toHaveBeenCalled();
  });

  it("lädt das Foto beim zweiten Versuch nach einem Formularfehler nicht noch einmal hoch", async () => {
    submitRecipeMock.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION", message: "x", details: { title: ["fehlt"] } } });
    const photo = new Blob(["x"], { type: "image/webp" });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    let first: unknown;
    await act(async () => {
      first = await result.current.submit(BODY, photo);
    });
    expect(first).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    await act(async () => {
      await result.current.submit(BODY, photo);
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(submitRecipeMock).toHaveBeenLastCalledWith({ ...BODY, image_url: "u1/neu.webp" });
  });

  it("reicht Server-Fehler samt details unverändert durch", async () => {
    const error = { code: "VALIDATION", message: "Rezept ungueltig", details: { open_recipes: ["zu viele"] } };
    submitRecipeMock.mockResolvedValue({ ok: false, error });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.submit(BODY, null);
    });
    expect(res).toEqual({ ok: false, error });
  });

  it("meldet TOKEN_INVALID, ohne zu senden, wenn niemand eingeloggt ist", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.submit(BODY, null);
    });
    expect(res).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(submitRecipeMock).not.toHaveBeenCalled();
  });

  it("invalidiert die Rezept-Caches nach Erfolg", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "u1" });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });
    await act(async () => {
      await result.current.submit(BODY, null);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });
});

describe("useWithdrawRecipe", () => {
  it("zieht zurück und invalidiert die Caches", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "u1" });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useWithdrawRecipe(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.withdraw("r1");
    });
    expect(res).toMatchObject({ ok: true });
    expect(withdrawRecipeMock).toHaveBeenCalledWith("r1");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("gibt den Fehler als Result zurück und lässt die Caches in Ruhe", async () => {
    withdrawRecipeMock.mockResolvedValue({ ok: false, error: { code: "VALIDATION", message: "nicht mehr offen" } });
    const { wrapper, queryClient } = createHarness({ userId: "u1" });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useWithdrawRecipe(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.withdraw("r1");
    });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", message: "nicht mehr offen" } });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useIngredientRequest", () => {
  it("schickt den Wunsch an den Server und gibt dessen Antwort zurück", async () => {
    createIngredientRequestMock.mockResolvedValue({ ok: true, request: { id: "q1", name: "Quinoa" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useIngredientRequest(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.request({ name: "Quinoa", note: "Bio" });
    });
    expect(createIngredientRequestMock).toHaveBeenCalledWith({ name: "Quinoa", note: "Bio" });
    expect(res).toMatchObject({ ok: true, request: { id: "q1" } });
  });

  it("reicht das Limit (409) mit details durch", async () => {
    const error = { code: "VALIDATION", message: "x", details: { requests: ["hoechstens 20 Wuensche je Athlet"] } };
    createIngredientRequestMock.mockResolvedValue({ ok: false, error });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useIngredientRequest(), { wrapper });
    let res: unknown;
    await act(async () => {
      res = await result.current.request({ name: "Quinoa" });
    });
    expect(res).toEqual({ ok: false, error });
  });
});

describe("useIngredientUnits", () => {
  it("liefert die Einheiten des Treffers mit genau diesem Namen", async () => {
    searchIngredientsMock.mockResolvedValue({
      ok: true,
      ingredients: [
        { name: "Haferdrink", category: "Getränke", units: ["g", "ml"] },
        { name: "Haferflocken", category: "Getreide", units: ["g", "ml", "EL"] },
      ],
    });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useIngredientUnits(["Haferflocken"]), { wrapper });
    await waitFor(() => expect(result.current.get("Haferflocken")).toEqual(["g", "ml", "EL"]));
    expect(searchIngredientsMock).toHaveBeenCalledWith("Haferflocken");
  });

  it("ist leer und fragt nichts ab, wenn keine Namen gegeben sind", () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useIngredientUnits([]), { wrapper });
    expect(result.current.size).toBe(0);
    expect(searchIngredientsMock).not.toHaveBeenCalled();
  });

  it("lässt Namen ohne exakten Treffer weg", async () => {
    searchIngredientsMock.mockResolvedValue({ ok: true, ingredients: [{ name: "Haferdrink", category: "x", units: ["g"] }] });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useIngredientUnits(["Haferflocken"]), { wrapper });
    await waitFor(() => expect(searchIngredientsMock).toHaveBeenCalled());
    expect(result.current.has("Haferflocken")).toBe(false);
  });
});
