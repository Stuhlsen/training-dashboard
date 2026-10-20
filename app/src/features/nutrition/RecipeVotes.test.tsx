/* Tests: RecipeVotes — Anzeige, Bedienung per Daumenknöpfe, Ändern, Sperren (eigenes /
 * entschiedenes Rezept), Fehlermeldung. Hooks gemockt; die Regeln selbst testet
 * core/recipe-votes.test.js. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";

let mockUserId: string | null = "u1";
let mockMine = new Map<string, string>();
let mockMineFailed = false;
const voteMock = vi.fn();

vi.mock("../../api/hooks/useSession", () => ({ useAuthUserId: () => mockUserId }));
vi.mock("../../api/hooks/useRecipeVotes", () => ({
  useMyVotes: () => ({ mine: mockMine, isLoading: false, isError: mockMineFailed }),
  useVoteRecipe: () => ({ vote: voteMock, isPending: false }),
}));

const { RecipeVotes } = await import("./RecipeVotes");

function recipe(extra: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Haferbrei",
    status: "pending",
    submittedBy: "u-other",
    voteUp: 3,
    voteDown: 1,
    ...extra,
  } as unknown as Recipe;
}

beforeEach(() => {
  mockUserId = "u1";
  mockMine = new Map();
  mockMineFailed = false;
  voteMock.mockReset();
  voteMock.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("RecipeVotes — Anzeige", () => {
  it("zeigt die Zahlen als Text", () => {
    render(<RecipeVotes recipe={recipe()} />);
    expect(screen.getByText("3 dafür · 1 dagegen")).toBeTruthy();
  });

  it("zeigt ohne Daumen keinen Nullstand", () => {
    render(<RecipeVotes recipe={recipe({ voteUp: 0, voteDown: 0 })} />);
    expect(screen.getByText("noch keine Daumen")).toBeTruthy();
  });

  it("bietet zwei Knöpfe mit Klartext-Namen in einer benannten Gruppe an", () => {
    render(<RecipeVotes recipe={recipe()} />);
    expect(screen.getByRole("group", { name: "Dein Daumen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Daumen hoch/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Daumen runter/ })).toBeTruthy();
  });

  it("sagt, dass der Daumen nur eine Meinung ist", () => {
    render(<RecipeVotes recipe={recipe()} />);
    expect(screen.getByText(/nur eine Meinung für den Admin/)).toBeTruthy();
  });

  it("markiert die eigene Wahl per aria-pressed und nennt sie im Text", () => {
    mockMine = new Map([["r1", "down"]]);
    render(<RecipeVotes recipe={recipe()} />);
    expect(screen.getByRole("button", { name: /Daumen runter/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Daumen hoch/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/Dein Daumen: runter/)).toBeTruthy();
  });

  it("zeigt nie, wer wie abgestimmt hat (nur Zahlen)", () => {
    const { container } = render(<RecipeVotes recipe={recipe({ submittedBy: "u-author" })} />);
    expect(container.textContent).not.toMatch(/u-author|u-other/);
  });
});

describe("RecipeVotes — Bedienung", () => {
  it("ein Klick gibt den Daumen", async () => {
    render(<RecipeVotes recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: /Daumen hoch/ }));
    await waitFor(() => expect(voteMock).toHaveBeenCalledWith("r1", "up"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ein bestehender Daumen lässt sich ändern", async () => {
    mockMine = new Map([["r1", "up"]]);
    render(<RecipeVotes recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: /Daumen runter/ }));
    await waitFor(() => expect(voteMock).toHaveBeenCalledWith("r1", "down"));
  });

  it("es gibt kein Zurücknehmen (ein Daumen wird geändert, nicht entfernt)", () => {
    mockMine = new Map([["r1", "up"]]);
    render(<RecipeVotes recipe={recipe()} />);
    expect(screen.queryByRole("button", { name: /zurücknehmen|entfernen|löschen/i })).toBeNull();
  });

  it("die Knöpfe sind echte Knöpfe (Tastatur: Tab, Enter, Leertaste)", () => {
    render(<RecipeVotes recipe={recipe()} />);
    const up = screen.getByRole("button", { name: /Daumen hoch/ });
    expect(up.tagName).toBe("BUTTON");
    expect(up.getAttribute("type")).toBe("button");
    expect(up.hasAttribute("disabled")).toBe(false);
  });

  it("zeigt eine Fehlermeldung, wenn das Speichern scheitert, und räumt sie beim nächsten Versuch ab", async () => {
    voteMock.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    render(<RecipeVotes recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: /Daumen hoch/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/konnte nicht gespeichert werden/);
    fireEvent.click(screen.getByRole("button", { name: /Daumen hoch/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("sperrt die Knöpfe nie (ein gesperrter Knopf verliert den Fokus), fängt aber Doppelklicks ab", async () => {
    let finish: (v: { ok: true }) => void = () => {};
    voteMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<RecipeVotes recipe={recipe()} />);
    const up = screen.getByRole("button", { name: /Daumen hoch/ });
    up.focus();
    fireEvent.click(up);
    fireEvent.click(up);
    expect(up.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(up);
    expect(voteMock).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => {
      fireEvent.click(up);
      expect(voteMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("sagt Bescheid, wenn der eigene Daumen nicht geladen werden konnte, und bietet die Knöpfe weiter an", () => {
    mockMineFailed = true;
    render(<RecipeVotes recipe={recipe()} />);
    expect(screen.getByRole("status").textContent).toMatch(/nicht geladen werden/);
    expect(screen.getByRole("button", { name: /Daumen runter/ })).toBeTruthy();
  });
});

describe("RecipeVotes — Sperren", () => {
  it("das eigene Rezept: Zahlen sichtbar, keine Knöpfe, klarer Hinweis", () => {
    render(<RecipeVotes recipe={recipe({ submittedBy: "u1" })} />);
    expect(screen.getByText("3 dafür · 1 dagegen")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Dein Daumen" })).toBeNull();
    expect(screen.getByText("Auf dein eigenes Rezept kannst du keinen Daumen geben.")).toBeTruthy();
  });

  it("ein entschiedenes Rezept: keine Daumen", () => {
    for (const status of ["approved", "rejected"] as const) {
      cleanup();
      render(<RecipeVotes recipe={recipe({ status })} />);
      expect(screen.queryByRole("group", { name: "Dein Daumen" })).toBeNull();
    }
  });

  it("ohne Anmeldung: keine Knöpfe, kein Eigen-Hinweis", () => {
    mockUserId = null;
    render(<RecipeVotes recipe={recipe({ submittedBy: null })} />);
    expect(screen.queryByRole("group", { name: "Dein Daumen" })).toBeNull();
    expect(screen.queryByText(/eigenes Rezept/)).toBeNull();
  });
});
