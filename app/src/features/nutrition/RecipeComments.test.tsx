/* Tests: RecipeComments — Anzeige (Pseudonym, Reihenfolge, HTML nur als Text), Schreiben mit
 * Längen- und Leerraumprüfung, Hinweis ohne Pseudonym, Daumen (nur fremde), Löschen mit Rückfrage
 * (Schreiber den eigenen, Admin jeden). Hooks gemockt; die Regeln selbst testet
 * core/recipe-comments.test.js. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe, RecipeComment } from "../../api/types";

let mockUserId: string | null = "u1";
let mockIsAdmin = false;
let mockComments: RecipeComment[] = [];
let mockLoading = false;
let mockError = false;
let mockCanComment = true;
let mockProfileLoaded = true;
const addMock = vi.fn();
const voteMock = vi.fn();
const removeMock = vi.fn();

vi.mock("../../api/hooks/useSession", () => ({
  useAuthUserId: () => mockUserId,
  useIsAdmin: () => mockIsAdmin,
}));
vi.mock("../../api/hooks/useRecipeComments", () => ({
  useRecipeComments: () => ({ comments: mockComments, isLoading: mockLoading, isError: mockError, refetch: vi.fn() }),
  useCanComment: () => ({ loaded: mockProfileLoaded, canComment: mockCanComment }),
  useAddComment: () => ({ add: addMock, isPending: false }),
  useVoteComment: () => ({ vote: voteMock, isPending: false }),
  useDeleteComment: () => ({ remove: removeMock, isPending: false }),
}));

const { RecipeComments } = await import("./RecipeComments");

function recipe(extra: Partial<Recipe> = {}): Recipe {
  return { id: "r1", title: "Haferbrei", status: "approved", submittedBy: "u-other", ...extra } as unknown as Recipe;
}

function comment(extra: Partial<RecipeComment> = {}): RecipeComment {
  return {
    id: "c1",
    recipeId: "r1",
    authorName: "RadFuchs",
    isMine: false,
    body: "Zu wenig Salz",
    createdAt: "2026-10-05T12:00:00Z",
    up: 0,
    down: 0,
    myVote: null,
    ...extra,
  };
}

function renderIt(r: Recipe = recipe()) {
  return render(
    <MemoryRouter>
      <RecipeComments recipe={r} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUserId = "u1";
  mockIsAdmin = false;
  mockComments = [];
  mockLoading = false;
  mockError = false;
  mockCanComment = true;
  mockProfileLoaded = true;
  addMock.mockReset();
  addMock.mockResolvedValue({ ok: true });
  voteMock.mockReset();
  voteMock.mockResolvedValue({ ok: true });
  removeMock.mockReset();
  removeMock.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("RecipeComments — Anzeige", () => {
  it("zeigt Pseudonym, Datum, Text und Daumen-Zahlen", () => {
    mockComments = [comment({ up: 3, down: 1 })];
    renderIt();
    expect(screen.getByText("RadFuchs")).toBeTruthy();
    expect(screen.getByText(/05\.10\.2026/)).toBeTruthy();
    expect(screen.getByText("Zu wenig Salz")).toBeTruthy();
    expect(screen.getByText("3 dafür · 1 dagegen")).toBeTruthy();
  });

  it("zeigt ohne Kommentare einen freundlichen Leerzustand", () => {
    renderIt();
    expect(screen.getByText(/Noch keine Kommentare/)).toBeTruthy();
  });

  it("zeigt HTML im Kommentar als Text, nicht als Markup", () => {
    const html = '<img src=x onerror="alert(1)"><b>fett</b> <script>boom()</script>';
    mockComments = [comment({ body: html })];
    const { container } = renderIt();
    // Der Text steht wörtlich da ...
    expect(screen.getByText(html)).toBeTruthy();
    // ... und es wurde kein Element daraus
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  it("zeigt HTML im Pseudonym ebenfalls nur als Text", () => {
    mockComments = [comment({ authorName: "<i>Fuchs</i>" })];
    const { container } = renderIt();
    expect(screen.getByText("<i>Fuchs</i>")).toBeTruthy();
    expect(container.querySelector("i")).toBeNull();
  });

  it("zeigt einen Ladefehler mit Neu-laden-Knopf", () => {
    mockError = true;
    renderIt();
    expect(screen.getByRole("alert").textContent).toMatch(/nicht geladen/);
    expect(screen.getByRole("button", { name: "Noch einmal laden" })).toBeTruthy();
  });

  it("zeigt bei abgelehnten Rezepten gar nichts", () => {
    mockComments = [comment()];
    const { container } = renderIt(recipe({ status: "rejected" }));
    expect(container.textContent).toBe("");
  });
});

describe("RecipeComments — Schreiben", () => {
  it("sendet den Text und leert das Feld bei Erfolg", async () => {
    renderIt();
    const field = screen.getByLabelText("Dein Kommentar") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Lecker, mit Zimt" } });
    fireEvent.click(screen.getByRole("button", { name: "Kommentar senden" }));
    await waitFor(() => expect(addMock).toHaveBeenCalledWith("Lecker, mit Zimt"));
    await waitFor(() => expect(field.value).toBe(""));
  });

  it("sperrt Senden bei leerem Text und nur Leerzeichen", () => {
    renderIt();
    const send = screen.getByRole("button", { name: "Kommentar senden" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Dein Kommentar"), { target: { value: "   \n " } });
    expect(send.disabled).toBe(true);
  });

  it("sperrt Senden über 500 Zeichen und sagt, wie viele zu viel sind", () => {
    renderIt();
    fireEvent.change(screen.getByLabelText("Dein Kommentar"), { target: { value: "a".repeat(503) } });
    expect((screen.getByRole("button", { name: "Kommentar senden" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/3 Zeichen zu viel/)).toBeTruthy();
  });

  it("erlaubt genau 500 Zeichen", () => {
    renderIt();
    fireEvent.change(screen.getByLabelText("Dein Kommentar"), { target: { value: "a".repeat(500) } });
    expect((screen.getByRole("button", { name: "Kommentar senden" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Noch 0 von 500/)).toBeTruthy();
  });

  it("zeigt einen Speicherfehler und behält den Text", async () => {
    addMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "RLS" } });
    renderIt();
    const field = screen.getByLabelText("Dein Kommentar") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Hallo" } });
    fireEvent.click(screen.getByRole("button", { name: "Kommentar senden" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/nicht gespeichert/);
    expect(field.value).toBe("Hallo");
  });

  it("zeigt ohne eigenes Pseudonym einen Hinweis mit Link zu den Einstellungen statt des Felds", () => {
    mockCanComment = false;
    renderIt();
    expect(screen.queryByLabelText("Dein Kommentar")).toBeNull();
    expect(screen.getByText(/Pseudonym, keinen echten Namen/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Einstellungen" }).getAttribute("href")).toBe("/app/settings");
  });

  it("zeigt weder Feld noch Hinweis, solange das Profil lädt", () => {
    mockProfileLoaded = false;
    renderIt();
    expect(screen.queryByLabelText("Dein Kommentar")).toBeNull();
    expect(screen.queryByText(/Pseudonym/)).toBeNull();
  });

  it("erlaubt dem Autor, unter dem eigenen Rezept zu schreiben", () => {
    renderIt(recipe({ submittedBy: "u1" }));
    expect(screen.getByLabelText("Dein Kommentar")).toBeTruthy();
  });
});

describe("RecipeComments — Daumen", () => {
  it("bietet bei fremden Kommentaren zwei Knöpfe und markiert die eigene Wahl per aria-pressed", () => {
    mockComments = [comment({ myVote: "down" })];
    renderIt();
    expect(screen.getByRole("button", { name: /Daumen runter/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Daumen hoch/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("ruft beim Klick den Daumen-Hook mit Kommentar und Wert auf", async () => {
    const c = comment();
    mockComments = [c];
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Daumen hoch/ }));
    await waitFor(() => expect(voteMock).toHaveBeenCalledWith(c, "up"));
  });

  it("bietet beim eigenen Kommentar keine Daumen an", () => {
    mockComments = [comment({ isMine: true })];
    renderIt();
    expect(screen.queryByRole("button", { name: /Daumen/ })).toBeNull();
  });

  it("zeigt eine Fehlermeldung, wenn der Daumen nicht gespeichert wird", async () => {
    voteMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mockComments = [comment()];
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Daumen hoch/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Daumen konnte nicht gespeichert/);
  });
});

describe("RecipeComments — Löschen", () => {
  it("lässt den Schreiber den eigenen Kommentar nach Rückfrage löschen", async () => {
    const c = comment({ isMine: true });
    mockComments = [c];
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /löschen/ }));
    expect(removeMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith(c));
  });

  it("bricht die Rückfrage ab, ohne zu löschen", () => {
    mockComments = [comment({ isMine: true })];
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /löschen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /löschen/ })).toBeTruthy();
  });

  it("zeigt fremde Kommentare ohne Löschen-Knopf, dem Admin mit", () => {
    mockComments = [comment()];
    const { unmount } = renderIt();
    expect(screen.queryByRole("button", { name: /löschen/ })).toBeNull();
    unmount();
    mockIsAdmin = true;
    renderIt();
    expect(screen.getByRole("button", { name: "Kommentar von RadFuchs löschen" })).toBeTruthy();
  });

  it("zeigt eine Fehlermeldung, wenn das Löschen scheitert", async () => {
    removeMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mockComments = [comment({ isMine: true })];
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /löschen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/nicht gelöscht/);
  });
});
