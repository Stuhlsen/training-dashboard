/* Tests: RecipeSubmissionForm (Fahrplan 25, S2a) — Zutatensuche per Tastatur/Klick,
 * Vorschau vom Server (inkl. "veraltet" nach Änderung), Feldfehler (422), Limit (409),
 * Foto-Rechte-Haken, Erfolg. Hooks sind gemockt; die Umformung testet core/recipe-submission. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOT_LABELS } from "./nutrition-week-model";

const HIT = { name: "Haferflocken", category: "Getreide", units: ["g", "ml", "EL"] };
const PREVIEW = {
  ok: true as const,
  nutrition: { kcal: 520, protein: 24, carbs: 70, fat: 12 },
  contains_tags: ["gluten"],
  diet_tags: ["veg"],
  ingredients: [],
};

const previewMock = vi.fn();
const submitMock = vi.fn();
let mockHits = [HIT];

vi.mock("../../api/hooks/useRecipeSubmission", () => ({
  MIN_SEARCH_CHARS: 2,
  useIngredientSearch: (q: string) => {
    const on = q.trim().length >= 2;
    return { hits: on ? mockHits : [], isFetching: false, isError: false, searched: on };
  },
  useRecipePreview: () => ({ preview: previewMock, isPending: false }),
  useSubmitRecipe: () => ({ submit: submitMock, isPending: false }),
}));

class PhotoErrorMock extends Error {}
vi.mock("./recipe-photo", () => ({
  PhotoError: PhotoErrorMock,
  shrinkToWebp: vi.fn(async () => new Blob(["x"], { type: "image/webp" })),
}));

const { RecipeSubmissionForm } = await import("./RecipeSubmissionForm");

const onClose = vi.fn();

beforeEach(() => {
  previewMock.mockReset();
  submitMock.mockReset();
  onClose.mockReset();
  mockHits = [HIT];
  previewMock.mockResolvedValue(PREVIEW);
  submitMock.mockResolvedValue({ ok: true, recipe: { id: "r1", status: "pending", title: "Haferbrei" } });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Haferbrei" } });
  fireEvent.click(screen.getByRole("checkbox", { name: SLOT_LABELS.breakfast }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "hafer" } });
  fireEvent.click(await screen.findByRole("option", { name: /Haferflocken/ }));
  fireEvent.change(screen.getByLabelText("Menge Haferflocken"), { target: { value: "80" } });
  fireEvent.change(screen.getByLabelText("Schritt 1"), { target: { value: "Kochen" } });
}

describe("RecipeSubmissionForm", () => {
  it("wählt eine Zutat per Klick und setzt den Fokus auf die Menge", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    expect(screen.getByText("Noch keine Zutat gewählt.")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hafer" } });
    fireEvent.click(await screen.findByRole("option", { name: /Haferflocken/ }));
    const amount = screen.getByLabelText("Menge Haferflocken");
    expect(document.activeElement).toBe(amount);
    expect((screen.getByLabelText("Einheit Haferflocken") as HTMLSelectElement).value).toBe("g");
    expect(screen.getByRole("option", { name: "EL" })).toBeTruthy();
  });

  it("wählt per Tastatur (Pfeil + Enter) und sendet dabei nicht das Formular", async () => {
    mockHits = [HIT, { name: "Haferdrink", category: "Getränke", units: ["g", "ml"] }];
    render(<RecipeSubmissionForm onClose={onClose} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "hafer" } });
    await screen.findByRole("option", { name: /Haferdrink/ });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByLabelText("Menge Haferdrink")).toBeTruthy();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("meldet 'keine Zutat gefunden' statt einer leeren Liste", async () => {
    mockHits = [];
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
    expect(await screen.findByText(/Keine Zutat zu „zzz“ gefunden/)).toBeTruthy();
  });

  it("zeigt die Server-Vorschau und kennzeichnet sie nach einer Änderung als veraltet", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Vorschau berechnen" }));
    expect(await screen.findByText(/520 kcal/)).toBeTruthy();
    expect(screen.getByText(/Enthält: Gluten/)).toBeTruthy();
    expect(screen.getByText(/Ernährungsform: Vegetarisch/)).toBeTruthy();
    expect(previewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Haferbrei",
        meal_type: ["breakfast"],
        ingredients: [{ name: "Haferflocken", amount: 80, unit: "g" }],
        instructions: [{ text: "Kochen" }],
      }),
    );
    expect(screen.queryByText(/seit dieser Vorschau geändert/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Menge Haferflocken"), { target: { value: "90" } });
    expect(screen.getByText(/seit dieser Vorschau geändert/)).toBeTruthy();
  });

  it("zeigt Formularfehler (422) am Feld und setzt aria-invalid", async () => {
    submitMock.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "Rezept ungueltig", details: { title: ["Titel fehlt"], ingredients: ["mindestens eine Zutat"] } },
    });
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByText("Titel fehlt")).toBeTruthy();
    expect(screen.getByText("mindestens eine Zutat")).toBeTruthy();
    expect(screen.getByLabelText("Titel").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/markierten Felder/);
  });

  it("meldet das Limit offener Rezepte (409) verständlich", async () => {
    submitMock.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "Rezept ungueltig", details: { open_recipes: ["hoechstens 5 offene Rezepte gleichzeitig"] } },
    });
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByText(/Du hast schon 5 offene Rezepte/)).toBeTruthy();
  });

  it("meldet Netzwerkfehler in Klartext", async () => {
    submitMock.mockResolvedValue({ ok: false, error: { code: "NETWORK", message: "Failed to fetch" } });
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByText(/Keine Verbindung zum Server/)).toBeTruthy();
  });

  it("verlangt bei einem Foto den Rechte-Haken, bevor etwas gesendet wird", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    await fillValidForm();
    const file = new File(["x"], "essen.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Foto wählen"), { target: { files: [file] } });
    const rights = await screen.findByRole("checkbox", { name: /selbst gemacht oder darf es verwenden/ });

    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByText(/Foto verwenden darfst/)).toBeTruthy();
    expect(submitMock).not.toHaveBeenCalled();

    fireEvent.click(rights);
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][1]).toBeInstanceOf(Blob);
  });

  it("zeigt nach dem Einreichen die Bestätigung und kehrt zurück", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByText(/„Haferbrei“ wartet jetzt auf die Prüfung/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zurück zu den Rezepten" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("bricht ab, ohne etwas zu senden", () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(onClose).toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
  });
});
