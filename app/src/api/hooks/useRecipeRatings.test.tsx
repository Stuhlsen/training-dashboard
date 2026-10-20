/* Tests: useRecipeRatings — Statistik, eigene Sterne, Setzen/Zurücknehmen (Adapter gemockt). */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listRatingStatsMock = vi.fn();
const listMyRatingsMock = vi.fn();
const setMyRatingMock = vi.fn();
const deleteMyRatingMock = vi.fn();

vi.mock("../supabase/recipe-ratings", () => ({
  listRatingStats: (...a: unknown[]) => listRatingStatsMock(...a),
  listMyRatings: (...a: unknown[]) => listMyRatingsMock(...a),
  setMyRating: (...a: unknown[]) => setMyRatingMock(...a),
  deleteMyRating: (...a: unknown[]) => deleteMyRatingMock(...a),
}));

const { createHarness } = await import("../../test/harness");
const { useRecipeRatingStats, useMyRatings, useRateRecipe } = await import("./useRecipeRatings");

beforeEach(() => {
  for (const m of [listRatingStatsMock, listMyRatingsMock, setMyRatingMock, deleteMyRatingMock]) m.mockReset();
  listRatingStatsMock.mockResolvedValue({ ok: true, stats: [{ recipeId: "r1", avg: 4.5, count: 2 }] });
  listMyRatingsMock.mockResolvedValue({ ok: true, ratings: [{ recipeId: "r1", stars: 4 }] });
  setMyRatingMock.mockResolvedValue({ ok: true });
  deleteMyRatingMock.mockResolvedValue({ ok: true });
});

describe("useRecipeRatingStats", () => {
  it("liefert Schnitt und Anzahl des Adapters", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRecipeRatingStats(), { wrapper });
    await waitFor(() => expect(result.current.stats).toHaveLength(1));
    expect(result.current.stats[0]).toEqual({ recipeId: "r1", avg: 4.5, count: 2 });
  });

  it("bleibt bei einem Fehler leer (stabile Referenz) und meldet isError", async () => {
    listRatingStatsMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRecipeRatingStats(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.stats).toEqual([]);
  });
});

describe("useMyRatings", () => {
  it("liefert die eigenen Sterne als Map Rezept-ID → Sterne", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useMyRatings(), { wrapper });
    await waitFor(() => expect(result.current.mine.get("r1")).toBe(4));
    expect(listMyRatingsMock).toHaveBeenCalledWith("u1");
  });

  it("fragt ohne Anmeldung nichts ab", () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useMyRatings(), { wrapper });
    expect(result.current.mine.size).toBe(0);
    expect(listMyRatingsMock).not.toHaveBeenCalled();
  });
});

describe("useRateRecipe", () => {
  it("setzt die eigene Bewertung und lädt ['recipes'] neu", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "u1" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRateRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.rate("r1", 5);
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(setMyRatingMock).toHaveBeenCalledWith("r1", "u1", 5);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("nimmt die Bewertung zurück", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRateRecipe(), { wrapper });
    await act(async () => {
      await result.current.unrate("r1");
    });
    expect(deleteMyRatingMock).toHaveBeenCalledWith("r1", "u1");
    expect(setMyRatingMock).not.toHaveBeenCalled();
  });

  it("lehnt Sterne außerhalb von 1–5 ab, ohne den Adapter zu rufen", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRateRecipe(), { wrapper });
    for (const bad of [0, 6, 2.5]) {
      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.rate("r1", bad);
      });
      expect(outcome).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    }
    expect(setMyRatingMock).not.toHaveBeenCalled();
  });

  it("lehnt ohne Anmeldung ab", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useRateRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.rate("r1", 3);
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(setMyRatingMock).not.toHaveBeenCalled();
  });

  it("gibt einen Adapter-Fehler als Result zurück (Datenbank lehnt ab)", async () => {
    setMyRatingMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "own recipe" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useRateRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.rate("r1", 3);
    });
    expect(outcome).toMatchObject({ ok: false, error: { message: "own recipe" } });
  });
});
