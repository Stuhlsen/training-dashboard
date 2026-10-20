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
const requestMock = vi.fn();
let mockHits = [HIT];
let mockUnits = new Map<string, string[]>();
let mockProfile: { isVerifiedAuthor: boolean } | null = { isVerifiedAuthor: false };

vi.mock("../../api/hooks/useSession", () => ({
  useSessionProfile: () => mockProfile,
  useAuthUserId: () => "u1",
}));

vi.mock("../../api/hooks/useRecipeSubmission", () => ({
  MIN_SEARCH_CHARS: 2,
  useIngredientSearch: (q: string) => {
    const on = q.trim().length >= 2;
    return { hits: on ? mockHits : [], isFetching: false, isError: false, searched: on };
  },
  useRecipePreview: () => ({ preview: previewMock, isPending: false }),
  useSubmitRecipe: () => ({ submit: submitMock, isPending: false }),
  useIngredientRequest: () => ({ request: requestMock, isPending: false }),
  useIngredientUnits: () => mockUnits,
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
  requestMock.mockReset();
  onClose.mockReset();
  mockHits = [HIT];
  mockUnits = new Map();
  mockProfile = { isVerifiedAuthor: false };
  localStorage.clear();
  requestMock.mockResolvedValue({ ok: true, request: { id: "q1", name: "Quinoa" } });
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

describe("RecipeSubmissionForm — Zutaten-Wunsch (S2b)", () => {
  async function searchNothing() {
    mockHits = [];
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "quinoa" } });
    fireEvent.click(await screen.findByRole("button", { name: "Diese Zutat wünschen" }));
  }

  it("bietet bei 'keine Zutat gefunden' den Wunsch an, vorbelegt mit dem Suchtext", async () => {
    await searchNothing();
    expect((screen.getByLabelText("Name der Zutat") as HTMLInputElement).value).toBe("quinoa");
  });

  it("zeigt den Wunsch-Knopf nicht, solange es Treffer gibt", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hafer" } });
    await screen.findByRole("option", { name: /Haferflocken/ });
    expect(screen.queryByRole("button", { name: "Diese Zutat wünschen" })).toBeNull();
  });

  it("sendet Name und Hinweis, bestätigt und schließt", async () => {
    await searchNothing();
    fireEvent.change(screen.getByLabelText("Name der Zutat"), { target: { value: " Quinoa " } });
    fireEvent.change(screen.getByLabelText("Hinweis (optional)"), { target: { value: "  Bio  " } });
    fireEvent.click(screen.getByRole("button", { name: "Wunsch senden" }));
    expect(await screen.findByText(/„Quinoa“ ist als Wunsch angekommen/)).toBeTruthy();
    expect(requestMock).toHaveBeenCalledWith({ name: "Quinoa", note: "Bio" });
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByLabelText("Name der Zutat")).toBeNull();
  });

  it("lässt den Hinweis weg, wenn er leer ist, und sendet mit Enter nur den Wunsch (nicht das Rezept)", async () => {
    await searchNothing();
    fireEvent.keyDown(screen.getByLabelText("Name der Zutat"), { key: "Enter" });
    await waitFor(() => expect(requestMock).toHaveBeenCalledWith({ name: "quinoa" }));
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("meldet das Limit von 20 Wünschen verständlich", async () => {
    requestMock.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "x", details: { requests: ["hoechstens 20 Wuensche je Athlet"] } },
    });
    await searchNothing();
    fireEvent.click(screen.getByRole("button", { name: "Wunsch senden" }));
    expect(await screen.findByText(/schon 20 Wünsche offen/)).toBeTruthy();
  });

  it("zeigt Feldfehler am Namen und Netzwerkfehler in Klartext", async () => {
    requestMock.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION", message: "x", details: { name: ["Name fehlt"] } },
    });
    await searchNothing();
    fireEvent.click(screen.getByRole("button", { name: "Wunsch senden" }));
    expect(await screen.findByText("Name fehlt")).toBeTruthy();
    expect(screen.getByLabelText("Name der Zutat").getAttribute("aria-invalid")).toBe("true");

    requestMock.mockResolvedValueOnce({ ok: false, error: { code: "NETWORK", message: "Failed to fetch" } });
    fireEvent.click(screen.getByRole("button", { name: "Wunsch senden" }));
    expect(await screen.findByText(/Keine Verbindung zum Server/)).toBeTruthy();
  });
});

describe("RecipeSubmissionForm — Verifizierte Autoren (Fahrplan 29 V3)", () => {
  const SEEN_KEY = "recipe-decisions-seen:u1";
  const APPROVED = { id: "r9", status: "approved", title: "Haferbrei" };

  it("verifiziert: der Text sagt, dass das Rezept sofort sichtbar ist, und die 5er-Grenze entfällt", () => {
    mockProfile = { isVerifiedAuthor: true };
    render(<RecipeSubmissionForm onClose={onClose} />);
    expect(screen.getByText(/als verifizierter Autor ist dein Rezept sofort für alle sichtbar/)).toBeTruthy();
    expect(screen.queryByText(/ein Admin prüft dein Rezept/)).toBeNull();
    expect(screen.queryByText(/Bis zu 5 Rezepte/)).toBeNull();
  });

  it("nicht verifiziert: Admin-Prüfung und 5er-Grenze stehen wie bisher da", () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    expect(screen.getByText(/ein Admin prüft dein Rezept/)).toBeTruthy();
    expect(screen.getByText(/Bis zu 5 Rezepte/)).toBeTruthy();
  });

  it("Sofort-Freigabe (Antwort approved): 'veröffentlicht' und das Banner wird nicht ausgelöst", async () => {
    mockProfile = { isVerifiedAuthor: true };
    submitMock.mockResolvedValue({ ok: true, recipe: APPROVED });
    render(<RecipeSubmissionForm onClose={onClose} />);
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByRole("heading", { name: "Rezept veröffentlicht" })).toBeTruthy();
    expect(screen.getByText(/„Haferbrei“ ist jetzt für alle sichtbar/)).toBeTruthy();
    expect(screen.queryByText(/wartet jetzt auf die Prüfung/)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ r9: "approved" });
  });

  it("die Texte richten sich nach der ANTWORT: kommt trotz Verifizierung pending zurück, steht 'wartet auf die Prüfung'", async () => {
    mockProfile = { isVerifiedAuthor: true };
    render(<RecipeSubmissionForm onClose={onClose} />);
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(await screen.findByText(/„Haferbrei“ wartet jetzt auf die Prüfung/)).toBeTruthy();
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
  });

  it("ein offenes Rezept (pending) markiert nichts als gesehen", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    await screen.findByText(/wartet jetzt auf die Prüfung/);
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();
  });

  it("ein freigegebenes Rezept bearbeiten: Hinweis 'sofort für alle sichtbar', keine Admin-Prüfung, keine 5er-Grenze", () => {
    mockProfile = { isVerifiedAuthor: true };
    const recipe = {
      id: "r9",
      title: "Haferbrei",
      status: "approved",
      mealType: ["breakfast"],
      servings: 2,
      ingredients: [{ name: "Haferflocken", amount: 80, unit: "g", category: "Getreide" }],
      instructions: [{ text: "Kochen" }],
      imageUrl: null,
    } as unknown as import("../../api/types").Recipe;
    render(<RecipeSubmissionForm recipe={recipe} onClose={onClose} />);
    expect(screen.getByText(/Du bearbeitest ein freigegebenes Rezept. Änderungen sind sofort für alle sichtbar/)).toBeTruthy();
    expect(screen.queryByText(/noch auf die Prüfung wartet/)).toBeNull();
    expect(screen.queryByText(/ein Admin prüft dein Rezept/)).toBeNull();
    expect(screen.queryByText(/Bis zu 5 Rezepte/)).toBeNull();
  });

  it("ein freigegebenes Rezept speichern: 'weiter für alle sichtbar', Stimmen-Hinweis, gesehen markiert", async () => {
    mockProfile = { isVerifiedAuthor: true };
    submitMock.mockResolvedValue({ ok: true, recipe: APPROVED });
    const recipe = {
      id: "r9",
      title: "Haferbrei",
      status: "approved",
      mealType: ["breakfast"],
      servings: 2,
      ingredients: [{ name: "Haferflocken", amount: 80, unit: "g", category: "Getreide" }],
      instructions: [{ text: "Kochen" }],
      imageUrl: null,
    } as unknown as import("../../api/types").Recipe;
    render(<RecipeSubmissionForm recipe={recipe} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(await screen.findByRole("heading", { name: "Änderungen gespeichert" })).toBeTruthy();
    expect(screen.getByText(/wurde aktualisiert und ist weiter für alle sichtbar/)).toBeTruthy();
    expect(screen.getByText(/Bisherige Stimmen zu diesem Rezept wurden gelöscht/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)!)).toEqual({ r9: "approved" });
  });
});

describe("RecipeSubmissionForm — Bearbeiten (S2b)", () => {
  const RECIPE = {
    id: "r1",
    title: "Haferbrei",
    status: "pending",
    mealType: ["breakfast"],
    servings: 2,
    ingredients: [{ name: "Haferflocken", amount: 80.5, unit: "ml", category: "Getreide" }],
    instructions: [{ text: "Kochen", timerSeconds: 300 }],
    imageUrl: "u1/foto.webp",
  } as unknown as import("../../api/types").Recipe;

  it("belegt das Formular aus dem gespeicherten Rezept vor", () => {
    mockUnits = new Map([["Haferflocken", ["g", "ml", "EL"]]]);
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: "Rezept bearbeiten" })).toBeTruthy();
    expect((screen.getByLabelText("Titel") as HTMLInputElement).value).toBe("Haferbrei");
    expect((screen.getByLabelText("Menge Haferflocken") as HTMLInputElement).value).toBe("80,5");
    const unit = screen.getByLabelText("Einheit Haferflocken") as HTMLSelectElement;
    expect(unit.value).toBe("ml");
    expect([...unit.options].map((o) => o.value)).toEqual(["g", "ml", "EL"]);
    expect((screen.getByLabelText("Schritt 1") as HTMLTextAreaElement).value).toBe("Kochen");
    expect((screen.getByLabelText("Timer (Minuten, optional)") as HTMLInputElement).value).toBe("5");
    expect((screen.getByRole("checkbox", { name: SLOT_LABELS.breakfast }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/bisherige Stimmen dazu gelöscht/)).toBeTruthy();
  });

  it("behält die gewählte Einheit, auch wenn die Einheitenliste noch nicht geladen ist", () => {
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    expect((screen.getByLabelText("Einheit Haferflocken") as HTMLSelectElement).value).toBe("ml");
  });

  it("speichert per Update mit Rezept-ID und behält das bisherige Foto", async () => {
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    expect(screen.getByText(/bisheriges Foto bleibt erhalten/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const [body, photo, options] = submitMock.mock.calls[0];
    expect(body).toMatchObject({ title: "Haferbrei", servings: 2, ingredients: [{ name: "Haferflocken", amount: 80.5, unit: "ml" }] });
    expect(photo).toBeNull();
    expect(options).toEqual({ recipeId: "r1", keepImagePath: "u1/foto.webp" });
  });

  it("entfernt das bisherige Foto auf Wunsch (kein Pfad wird mitgeschickt)", async () => {
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Bisheriges Foto entfernen" }));
    expect(screen.getByText(/Foto wird beim Speichern entfernt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][2]).toEqual({ recipeId: "r1", keepImagePath: null });
  });

  it("weist nach dem Speichern darauf hin, dass bisherige Stimmen gelöscht wurden", async () => {
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(await screen.findByText(/Bisherige Stimmen zu diesem Rezept wurden gelöscht/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Änderungen gespeichert" })).toBeTruthy();
  });

  it("zeigt den Server-Fehler, wenn das Rezept inzwischen entschieden wurde (409)", async () => {
    submitMock.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "nur offene Rezepte koennen geaendert werden" },
    });
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(await screen.findByText(/inzwischen entschieden und lässt sich nicht mehr ändern/)).toBeTruthy();
    expect(screen.queryByText(/markierten Felder/)).toBeNull();
  });

  it("erklärt, wenn das Rezept inzwischen gelöscht wurde (404)", async () => {
    submitMock.mockResolvedValue({ ok: false, error: { code: "NO_DATA", message: "Rezept nicht gefunden" } });
    render(<RecipeSubmissionForm recipe={RECIPE} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(await screen.findByText(/gibt es nicht mehr/)).toBeTruthy();
  });

  it("neues Rezept: keine Update-Optionen", async () => {
    render(<RecipeSubmissionForm onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0][2]).toEqual({});
  });
});
