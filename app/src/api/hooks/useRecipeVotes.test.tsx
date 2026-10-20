/* Tests: useRecipeVotes — Rezepte in Prüfung mit Zahlen, eigene Daumen, Setzen (Adapter gemockt). */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listRecipesMock = vi.fn();
const listVoteStatsMock = vi.fn();
const listMyVotesMock = vi.fn();
const setMyVoteMock = vi.fn();

vi.mock("../supabase/recipes", () => ({ listRecipes: (...a: unknown[]) => listRecipesMock(...a) }));
vi.mock("../supabase/recipe-votes", () => ({
  listVoteStats: (...a: unknown[]) => listVoteStatsMock(...a),
  listMyVotes: (...a: unknown[]) => listMyVotesMock(...a),
  setMyVote: (...a: unknown[]) => setMyVoteMock(...a),
}));

const { createHarness } = await import("../../test/harness");
const { usePendingRecipes, useMyVotes, useVoteRecipe } = await import("./useRecipeVotes");

beforeEach(() => {
  for (const m of [listRecipesMock, listVoteStatsMock, listMyVotesMock, setMyVoteMock]) m.mockReset();
  listRecipesMock.mockResolvedValue({
    ok: true,
    recipes: [
      { id: "r1", title: "Haferbrei", status: "pending" },
      { id: "r2", title: "Salat", status: "pending" },
    ],
  });
  listVoteStatsMock.mockResolvedValue({ ok: true, stats: [{ recipeId: "r1", up: 3, down: 1 }] });
  listMyVotesMock.mockResolvedValue({ ok: true, votes: [{ recipeId: "r1", vote: "down" }] });
  setMyVoteMock.mockResolvedValue({ ok: true });
});

describe("usePendingRecipes", () => {
  it("lädt nur Rezepte in Prüfung und hängt die Zahlen an (0 ohne Eintrag)", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => usePendingRecipes(), { wrapper });
    await waitFor(() => expect(result.current.recipes).toHaveLength(2));
    await waitFor(() => expect(result.current.recipes[0]).toMatchObject({ voteUp: 3, voteDown: 1 }));
    expect(listRecipesMock).toHaveBeenCalledWith({ status: "pending" });
    expect(result.current.recipes[1]).toMatchObject({ id: "r2", voteUp: 0, voteDown: 0 });
  });

  it("zeigt die Rezepte auch dann, wenn die Zahlen nicht laden, und meldet es", async () => {
    listVoteStatsMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => usePendingRecipes(), { wrapper });
    await waitFor(() => expect(result.current.recipes).toHaveLength(2));
    await waitFor(() => expect(result.current.statsFailed).toBe(true));
    expect(result.current.recipes[0]).toMatchObject({ voteUp: 0, voteDown: 0 });
  });

  it("meldet einen Ladefehler der Rezepte und bleibt leer", async () => {
    listRecipesMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => usePendingRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.recipes).toEqual([]);
  });
});

describe("useMyVotes", () => {
  it("liefert die eigenen Daumen als Map Rezept-ID → Daumen", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useMyVotes(), { wrapper });
    await waitFor(() => expect(result.current.mine.get("r1")).toBe("down"));
    expect(listMyVotesMock).toHaveBeenCalledWith("u1");
  });

  it("fragt ohne Anmeldung nichts ab", () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useMyVotes(), { wrapper });
    expect(result.current.mine.size).toBe(0);
    expect(listMyVotesMock).not.toHaveBeenCalled();
  });
});

describe("useVoteRecipe", () => {
  it("setzt den Daumen und lädt ['recipes'] neu", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "u1" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useVoteRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.vote("r1", "up");
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(setMyVoteMock).toHaveBeenCalledWith("r1", "u1", "up");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("lehnt unbekannte Werte ab, ohne den Adapter zu rufen", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useVoteRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.vote("r1", "neutral" as never);
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    expect(setMyVoteMock).not.toHaveBeenCalled();
  });

  it("lehnt ohne Anmeldung ab", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useVoteRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.vote("r1", "up");
    });
    expect(outcome).toMatchObject({ ok: false, error: { code: "TOKEN_INVALID" } });
    expect(setMyVoteMock).not.toHaveBeenCalled();
  });

  it("gibt die Ablehnung der Datenbank als Result zurück", async () => {
    setMyVoteMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "own recipe" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useVoteRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.vote("r1", "down");
    });
    expect(outcome).toMatchObject({ ok: false, error: { message: "own recipe" } });
  });
});
