/* Tests: RecipeReviewPanel — Freigeben, Ablehnen mit Grund, Fehlerfälle, Doppelklick.
 * Der Hook ist gemockt; Server-Regeln testen admin-api/recipe-review.test.js. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";

const approveMock = vi.fn();
const rejectMock = vi.fn();

vi.mock("../../api/hooks/useRecipeReview", () => ({
  useDecideRecipe: () => ({ approve: approveMock, reject: rejectMock, isPending: false }),
}));

const { RecipeReviewPanel } = await import("./RecipeReviewPanel");

const RECIPE = { id: "r1", title: "Haferbrei", status: "pending" } as unknown as Recipe;
const onDecided = vi.fn();

beforeEach(() => {
  approveMock.mockReset();
  rejectMock.mockReset();
  onDecided.mockReset();
  approveMock.mockResolvedValue({ ok: true });
  rejectMock.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("RecipeReviewPanel — Freigeben", () => {
  it("sagt, dass der Admin allein entscheidet", () => {
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    expect(screen.getByText(/Du entscheidest allein/)).toBeTruthy();
  });

  it("Freigeben ruft den Server und meldet die Entscheidung", async () => {
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("approved"));
    expect(approveMock).toHaveBeenCalledWith("r1");
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it("zeigt einen Server-Fehler im Klartext und meldet keine Entscheidung", async () => {
    approveMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "Das Rezept ist nicht mehr in Prüfung" } });
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Das Rezept ist nicht mehr in Prüfung");
    expect(onDecided).not.toHaveBeenCalled();
  });

  it("übersetzt Netzwerk- und Anmeldefehler", async () => {
    approveMock.mockResolvedValueOnce({ ok: false, error: { code: "NETWORK", message: "offline" } });
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Keine Verbindung/);
    approveMock.mockResolvedValueOnce({ ok: false, error: { code: "TOKEN_INVALID", message: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/nicht angemeldet/));
  });

  it("fängt Doppelklicks ab (nur ein Aufruf), sperrt den Knopf aber nie", async () => {
    let finish: (v: { ok: true }) => void = () => {};
    approveMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    const button = screen.getByRole("button", { name: "Freigeben" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(approveMock).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
  });
});

describe("RecipeReviewPanel — Ablehnen", () => {
  function openReject() {
    fireEvent.click(screen.getByRole("button", { name: "Ablehnen …" }));
  }

  it("verlangt einen Grund: ohne Text ist 'Ablehnen' gesperrt", () => {
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    openReject();
    expect(screen.getByLabelText("Grund der Ablehnung")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Grund der Ablehnung"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Ablehnen" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Bitte einen Grund angeben.")).toBeTruthy();
  });

  it("lehnt mit Grund ab und meldet die Entscheidung", async () => {
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    openReject();
    fireEvent.change(screen.getByLabelText("Grund der Ablehnung"), { target: { value: "Zutaten unklar" } });
    fireEvent.click(screen.getByRole("button", { name: "Ablehnen" }));
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("rejected"));
    expect(rejectMock).toHaveBeenCalledWith("r1", "Zutaten unklar");
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("begrenzt den Grund auf 500 Zeichen und zählt mit", () => {
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    openReject();
    const field = screen.getByLabelText("Grund der Ablehnung") as HTMLTextAreaElement;
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: "abc" } });
    expect(screen.getByText(/3 \/ 500 Zeichen/)).toBeTruthy();
  });

  it("Abbrechen schließt das Formular, leert den Grund und ruft nichts auf", () => {
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    openReject();
    fireEvent.change(screen.getByLabelText("Grund der Ablehnung"), { target: { value: "weg damit" } });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByLabelText("Grund der Ablehnung")).toBeNull();
    expect(screen.getByRole("button", { name: "Freigeben" })).toBeTruthy();
    openReject();
    expect((screen.getByLabelText("Grund der Ablehnung") as HTMLTextAreaElement).value).toBe("");
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it("zeigt einen Fehler beim Ablehnen und behält den getippten Grund", async () => {
    rejectMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "Das Rezept ist nicht mehr in Prüfung" } });
    render(<RecipeReviewPanel recipe={RECIPE} onDecided={onDecided} />);
    openReject();
    fireEvent.change(screen.getByLabelText("Grund der Ablehnung"), { target: { value: "Grund" } });
    fireEvent.click(screen.getByRole("button", { name: "Ablehnen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/nicht mehr in Prüfung/);
    expect((screen.getByLabelText("Grund der Ablehnung") as HTMLTextAreaElement).value).toBe("Grund");
    expect(onDecided).not.toHaveBeenCalled();
  });
});
