/* Tests: useRecipeReview — Freigeben und Ablehnen (Admin-Wrapper gemockt). */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approveMock = vi.fn();
const rejectMock = vi.fn();

vi.mock("../admin-recipes", () => ({
  approveRecipe: (...a: unknown[]) => approveMock(...a),
  rejectRecipe: (...a: unknown[]) => rejectMock(...a),
  REJECTION_REASON_MAX: 500,
}));

const { createHarness } = await import("../../test/harness");
const { useDecideRecipe } = await import("./useRecipeReview");

beforeEach(() => {
  approveMock.mockReset();
  rejectMock.mockReset();
  approveMock.mockResolvedValue({ ok: true, status: "approved" });
  rejectMock.mockResolvedValue({ ok: true, status: "rejected" });
});

describe("useDecideRecipe", () => {
  it("gibt frei und lädt ['recipes'] neu", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "admin" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDecideRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.approve("r1");
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(approveMock).toHaveBeenCalledWith("r1");
    expect(rejectMock).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });

  it("lehnt mit getrimmtem Grund ab", async () => {
    const { wrapper } = createHarness({ userId: "admin" });
    const { result } = renderHook(() => useDecideRecipe(), { wrapper });
    await act(async () => {
      await result.current.reject("r1", "  Zutaten unklar  ");
    });
    expect(rejectMock).toHaveBeenCalledWith("r1", "Zutaten unklar");
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("verlangt einen Grund und begrenzt ihn auf 500 Zeichen, ohne den Server zu rufen", async () => {
    const { wrapper } = createHarness({ userId: "admin" });
    const { result } = renderHook(() => useDecideRecipe(), { wrapper });
    for (const bad of ["", "   ", "x".repeat(501)]) {
      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.reject("r1", bad);
      });
      expect(outcome).toMatchObject({ ok: false, error: { code: "SCHEMA" } });
    }
    expect(rejectMock).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.reject("r1", "x".repeat(500));
    });
    expect(rejectMock).toHaveBeenCalledTimes(1);
  });

  it("gibt einen Server-Fehler (z. B. nicht mehr in Prüfung) als Result zurück und lädt nicht neu", async () => {
    approveMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "nicht mehr in Prüfung" } });
    const { wrapper, queryClient } = createHarness({ userId: "admin" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDecideRecipe(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.approve("r1");
    });
    expect(outcome).toMatchObject({ ok: false, error: { message: "nicht mehr in Prüfung" } });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });
});
