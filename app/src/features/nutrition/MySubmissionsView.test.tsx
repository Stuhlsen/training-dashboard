/* Tests: MySubmissionsView (Fahrplan 25, S2b) — Zustände (Laden, Fehler, leer),
 * Status + Ablehnungsgrund, Bearbeiten/Zurückziehen nur bei `pending`,
 * Rückzug mit Bestätigung in der Karte und verständliche Fehler. Hooks gemockt. */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";

let mockState = { recipes: [] as Recipe[], isLoading: false, isError: false };
const refetchMock = vi.fn();
const withdrawMock = vi.fn();

vi.mock("../../api/hooks/useMySubmissions", () => ({
  useMySubmissions: () => ({ ...mockState, refetch: refetchMock }),
}));
vi.mock("../../api/hooks/useRecipeSubmission", () => ({
  useWithdrawRecipe: () => ({ withdraw: withdrawMock, isPending: false }),
}));

const { MySubmissionsView } = await import("./MySubmissionsView");

function recipe(id: string, title: string, status: Recipe["status"], extra: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title,
    status,
    rejectionReason: null,
    mealType: ["breakfast"],
    createdAt: "2026-10-17T10:00:00Z",
    nutrition: { kcal: 520, protein: 24, carbs: 70, fat: 12 },
    ...extra,
  } as unknown as Recipe;
}

const onEdit = vi.fn();

beforeEach(() => {
  mockState = { recipes: [], isLoading: false, isError: false };
  refetchMock.mockReset();
  withdrawMock.mockReset();
  withdrawMock.mockResolvedValue({ ok: true });
  onEdit.mockReset();
});
afterEach(cleanup);

describe("MySubmissionsView — Zustände", () => {
  it("zeigt beim Laden nur 'Lade …'", () => {
    mockState = { recipes: [], isLoading: true, isError: false };
    render(<MySubmissionsView onEdit={onEdit} />);
    expect(screen.getByText("Lade …")).toBeTruthy();
  });

  it("meldet einen Ladefehler und bietet 'Erneut versuchen' an", () => {
    mockState = { recipes: [], isLoading: false, isError: true };
    render(<MySubmissionsView onEdit={onEdit} />);
    expect(screen.getByRole("alert").textContent).toMatch(/konnten nicht geladen werden/);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("sagt, dass noch nichts eingereicht wurde", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    expect(screen.getByText(/noch kein Rezept eingereicht/)).toBeTruthy();
  });
});

describe("MySubmissionsView — Liste", () => {
  beforeEach(() => {
    mockState = {
      recipes: [
        recipe("a", "Haferbrei", "pending"),
        recipe("b", "Linsensuppe", "approved"),
        recipe("c", "Sandwich", "rejected", { rejectionReason: "Zutaten unklar" }),
        recipe("d", "Salat", "rejected"),
      ],
      isLoading: false,
      isError: false,
    };
  });

  it("zeigt Titel, Status als Text, Datum und Nährwerte je Rezept", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText("Wartet auf Prüfung")).toBeTruthy();
    expect(within(items[1]).getByText("Freigegeben")).toBeTruthy();
    expect(within(items[2]).getByText("Abgelehnt")).toBeTruthy();
    expect(within(items[0]).getByText(/Eingereicht am 17\.10\.2026/)).toBeTruthy();
    expect(within(items[0]).getByText(/520 kcal · 24 g Eiweiß pro Portion/)).toBeTruthy();
  });

  it("nennt bei Ablehnung den Grund, sonst 'Ohne Begründung abgelehnt.'", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    expect(screen.getByText("Grund: Zutaten unklar")).toBeTruthy();
    expect(screen.getByText("Ohne Begründung abgelehnt.")).toBeTruthy();
  });

  it("bietet Bearbeiten und Zurückziehen nur für offene Rezepte an", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    expect(screen.getAllByRole("button", { name: /bearbeiten$/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /zurückziehen$/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Haferbrei bearbeiten" })).toBeTruthy();
  });

  it("'Bearbeiten' reicht das Rezept an die Aufrufstelle", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei bearbeiten" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "a", title: "Haferbrei" }));
  });
});

describe("MySubmissionsView — Zurückziehen", () => {
  beforeEach(() => {
    mockState = { recipes: [recipe("a", "Haferbrei", "pending")], isLoading: false, isError: false };
  });

  it("fragt zuerst nach und zieht noch nichts zurück", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei zurückziehen" }));
    expect(screen.getByText(/Das lässt sich nicht rückgängig machen/)).toBeTruthy();
    expect(withdrawMock).not.toHaveBeenCalled();
  });

  it("'Abbrechen' schließt die Nachfrage ohne Rückzug", () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei zurückziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText(/Das lässt sich nicht rückgängig machen/)).toBeNull();
    expect(withdrawMock).not.toHaveBeenCalled();
  });

  it("'Ja, zurückziehen' ruft den Rückzug mit der Rezept-ID und meldet Erfolg", async () => {
    render(<MySubmissionsView onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei zurückziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurückziehen" }));
    await waitFor(() => expect(withdrawMock).toHaveBeenCalledWith("a"));
    expect(await screen.findByText("„Haferbrei“ wurde zurückgezogen.")).toBeTruthy();
    expect(screen.queryByText(/Das lässt sich nicht rückgängig machen/)).toBeNull();
  });

  it("erklärt, wenn das Rezept inzwischen entschieden wurde (409), und lädt neu", async () => {
    withdrawMock.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "nur offene Rezepte koennen zurueckgezogen werden" },
    });
    render(<MySubmissionsView onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei zurückziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurückziehen" }));
    expect(await screen.findByText(/inzwischen entschieden/)).toBeTruthy();
    expect(refetchMock).toHaveBeenCalled();
  });

  it("erklärt ein nicht mehr vorhandenes Rezept (404) und Netzwerkfehler", async () => {
    withdrawMock.mockResolvedValueOnce({ ok: false, error: { code: "NO_DATA", message: "x" } });
    render(<MySubmissionsView onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei zurückziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurückziehen" }));
    expect(await screen.findByText("Dieses Rezept gibt es nicht mehr.")).toBeTruthy();

    withdrawMock.mockResolvedValueOnce({ ok: false, error: { code: "NETWORK", message: "Failed to fetch" } });
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei zurückziehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, zurückziehen" }));
    expect(await screen.findByText(/Keine Verbindung zum Server/)).toBeTruthy();
  });
});
