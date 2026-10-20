/* Tests: CookingDialog (E7b)
   Nutzt CookTimerProvider + vi.useFakeTimers.
   Web Audio wird wie in CookTimerProvider.test.tsx gestubbt. */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { CookingDialog } from "./CookingDialog";
import { CookTimerProvider } from "../../components/CookTimerProvider";
import type { Recipe } from "../../api/types";
import { allergenLabel } from "../../core/nutrition-taxonomy.js";
import { ALLERGEN_NOTE } from "./allergen-text";

/* ── AudioContext stub ─────────────────────────────────── */
function stubAudio() {
  const ctx = {
    currentTime: 0,
    state: "running" as string,
    resume: vi.fn(() =>
      ctx.state === "closed"
        ? Promise.reject(new Error("InvalidStateError: closed"))
        : Promise.resolve(),
    ),
    close: vi.fn(() => {
      ctx.state = "closed";
      return Promise.resolve();
    }),
    createOscillator: vi.fn(() => {
      if (ctx.state === "closed") throw new Error("InvalidStateError: closed");
      return {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }),
    createGain: vi.fn(() => {
      if (ctx.state === "closed") throw new Error("InvalidStateError: closed");
      return {
        gain: { value: 0 },
        connect: vi.fn(),
      };
    }),
    destination: {},
  };
  return ctx;
}

let audioCtx: ReturnType<typeof stubAudio>;
let audioCtxConstructor: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  audioCtx = stubAudio();
  audioCtxConstructor = vi.fn().mockImplementation(function () {
    return audioCtx;
  });
  vi.stubGlobal("AudioContext", audioCtxConstructor);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/* ── Fixtures ──────────────────────────────────────────── */

const BASE_RECIPE: Recipe = {
  id: "r1",
  title: "Test-Rezept",
  source: "own",
  externalId: null,
  submittedBy: null,
  status: "approved",
  rejectionReason: null,
  mealType: ["lunch"],
  dietTags: null,
  containsTags: [],
  servings: 2,
  prepMinutes: 25,
  ingredients: [
    { name: "Mehl", amount: 500, unit: "g", category: "Getreide & Backwaren" },
    { name: "Eier", amount: 3, unit: "Stück", category: "Eier" },
  ],
  instructions: [
    { text: "Mehl und Eier vermengen", timerSeconds: 120 },
    { text: "Teig kneten", timerSeconds: undefined },
    { text: "Ruhen lassen", timerSeconds: 3600 },
  ],
  nutrition: { kcal: 600, protein: 20, carbs: 80, fat: 15 },
  imageUrl: null,
  createdAt: "",
  updatedAt: "",
};

const RECIPE_NO_CONTENT: Recipe = {
  ...BASE_RECIPE,
  id: "r2",
  title: "Ohne Inhalt",
  ingredients: null,
  instructions: null,
};

/* ── Wrapper mit Provider ──────────────────────────────── */
function renderDialog(recipe: Recipe, servings = 2, onClose = vi.fn()) {
  return render(
    <CookTimerProvider userId="user1">
      <CookingDialog recipe={recipe} servings={servings} onClose={onClose} />
    </CookTimerProvider>,
  );
}

/* ── Hilfsfunktion: Text über mehrere Nodes finden ────── */
function hasText(text: string) {
  return (_: string, el: Element | null) => el?.textContent?.includes(text) ?? false;
}

/* ── Tests ─────────────────────────────────────────────── */
describe("CookingDialog — Öffnen/Schließen", () => {
  test("role dialog, aria-modal, aria-label mit Rezepttitel", () => {
    renderDialog(BASE_RECIPE);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toContain("Test-Rezept");
  });

  test("Schliessen-Button ruft onClose auf", () => {
    const onClose = vi.fn();
    renderDialog(BASE_RECIPE, 2, onClose);
    fireEvent.click(screen.getByLabelText("Schließen"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape schließt", () => {
    const onClose = vi.fn();
    renderDialog(BASE_RECIPE, 2, onClose);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Rezept ohne Schritte und Zutaten zeigt Hinweis", () => {
    renderDialog(RECIPE_NO_CONTENT);
    expect(screen.getByText("Keine Schritte vorhanden")).toBeTruthy();
  });
});

describe("CookingDialog — Seiten-Navigation", () => {
  test("Startseite zeigt Zutaten bereitlegen und Zutaten", () => {
    renderDialog(BASE_RECIPE);
    expect(screen.getByText("Zutaten bereitlegen")).toBeTruthy();
    // Text spans multiple DOM nodes — use getAllByText with filter
    const mehlItems = screen.getAllByText(hasText("Mehl"));
    expect(mehlItems.length).toBeGreaterThanOrEqual(1);
    expect(mehlItems.some((el) => el.textContent?.includes("g") && el.textContent?.includes("Mehl"))).toBe(true);
  });

  test("Pfeiltasten navigieren und Escape schließt", () => {
    const onClose = vi.fn();
    renderDialog(BASE_RECIPE, 2, onClose);
    const dialog = screen.getByRole("dialog");

    // Page 1/4: Zutaten (1 page) + 3 steps = 4 total
    expect(screen.getByText("1 / 4")).toBeTruthy();

    // ArrowRight: Schritt 1 (Mehl und Eier vermengen)
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("2 / 4")).toBeTruthy();
    expect(screen.getByText("Mehl und Eier vermengen")).toBeTruthy();

    // ArrowLeft zurück
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 4")).toBeTruthy();

    // Escape
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Zurück/Weiter-Buttons navigieren", () => {
    renderDialog(BASE_RECIPE);
    expect(screen.getByText("1 / 4")).toBeTruthy();

    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.getByText("2 / 4")).toBeTruthy();

    fireEvent.click(screen.getByText("Zurück"));
    expect(screen.getByText("1 / 4")).toBeTruthy();
  });

  test("Fertig-Button auf letzter Seite schließt", () => {
    const onClose = vi.fn();
    renderDialog(BASE_RECIPE, 2, onClose);
    // Navigate to last page (page 4/4)
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText("Weiter"));
    }
    expect(screen.getByText("4 / 4")).toBeTruthy();
    fireEvent.click(screen.getByText("Fertig"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CookingDialog — Timer starten und zurücksetzen", () => {
  test("Start-Button zeigt Starten mit Dauer", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.getByText("Starten (02:00)")).toBeTruthy();
  });

  test("Start-Button startet Timer und zeigt verbleibende Zeit", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));

    act(() => {
      fireEvent.click(screen.getByText("Starten (02:00)"));
    });

    // Nach dem Start: "Starten" verschwindet, Restzeit "02:00" (noch 0s vergangen)
    expect(screen.queryByText("Starten (02:00)")).toBeNull();
    expect(screen.getByText("02:00")).toBeTruthy();
  });

  test("zwei Timer aus zwei Schritten — einer läuft ueber Seitenwechsel weiter", () => {
    renderDialog(BASE_RECIPE);

    // Schritt 1: Timer starten
    fireEvent.click(screen.getByText("Weiter"));
    act(() => {
      fireEvent.click(screen.getByText("Starten (02:00)"));
    });

    // Schritt 2: Teig kneten, kein Timer
    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.getByText("Teig kneten")).toBeTruthy();

    // Schritt 3: Ruhen lassen 3600s — Ruhezeit-Text, kein Start-Button
    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.getByText("ca. 1 Std.")).toBeTruthy();

    // Zurück zu Schritt 1 (2 Zurück-Klicks: page 4 -> page 3 -> page 2)
    fireEvent.click(screen.getByText("Zurück"));
    fireEvent.click(screen.getByText("Zurück"));

    // Timer läuft noch — Restzeit "02:00" sichtbar
    expect(screen.getByText("02:00")).toBeTruthy();
  });

  test("Zurücksetzen mit Bestätigung (zweiter Klick)", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));

    act(() => {
      fireEvent.click(screen.getByText("Starten (02:00)"));
    });

    // Erster Klick: Konfirmation anzeigen
    fireEvent.click(screen.getByText("Zurücksetzen"));
    expect(screen.getByText("Wirklich zurücksetzen?")).toBeTruthy();

    // Zweiter Klick: zurücksetzen
    fireEvent.click(screen.getByText("Wirklich zurücksetzen?"));
    expect(screen.getByText("Starten (02:00)")).toBeTruthy();
  });

  test("Konfirmation läuft nach 3s ab ohne zurückzusetzen", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));

    act(() => {
      fireEvent.click(screen.getByText("Starten (02:00)"));
    });

    // Erster Klick: Konfirmation
    fireEvent.click(screen.getByText("Zurücksetzen"));
    expect(screen.getByText("Wirklich zurücksetzen?")).toBeTruthy();

    // 3.1s warten — Konfirmation verfällt
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.getByText("Zurücksetzen")).toBeTruthy();
  });

  test("timerSeconds >= 3600 zeigt Ruhezeit-Text, keinen Start-Button", () => {
    renderDialog(BASE_RECIPE);
    // Navigate to step 3 (Ruhen lassen, timerSeconds=3600)
    fireEvent.click(screen.getByText("Weiter"));
    fireEvent.click(screen.getByText("Weiter"));
    fireEvent.click(screen.getByText("Weiter"));

    expect(screen.getByText("ca. 1 Std.")).toBeTruthy();
    expect(screen.queryByText("Starten")).toBeNull();
  });

  test("timerSeconds 3599 zeigt Start-Button (unter Schwelle)", () => {
    const recipeWith3599: Recipe = {
      ...BASE_RECIPE,
      instructions: [{ text: "Kurzes Ruehren", timerSeconds: 3599 }],
    };
    renderDialog(recipeWith3599);
    fireEvent.click(screen.getByText("Weiter"));

    expect(screen.getByText(/Starten/)).toBeTruthy();
    expect(screen.queryByText("ca.")).toBeNull();
  });
});

describe("CookingDialog — Fokus", () => {
  test("Fokus wird in den Dialog gesetzt (nach Timer-Flush)", () => {
    renderDialog(BASE_RECIPE);
    const dialog = screen.getByRole("dialog");
    // Fokus wird via setTimeout(0) gesetzt — Timer flushen
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(document.activeElement).toBe(dialog);
  });
});
describe("CookingDialog — Allergen-Zeile (E10)", () => {
  test("Zutaten-Seite nennt mehrere Allergene und den Orientierungs-Hinweis", () => {
    renderDialog({ ...BASE_RECIPE, containsTags: ["gluten", "eggs"] });
    expect(screen.getByText(`Enthält: ${allergenLabel("gluten")}, ${allergenLabel("eggs")}`)).toBeTruthy();
    expect(screen.getByText(ALLERGEN_NOTE)).toBeTruthy();
  });

  test("Rezept ohne Tags: 'Keine Allergene hinterlegt' statt Leere", () => {
    renderDialog({ ...BASE_RECIPE, containsTags: [] });
    expect(screen.getByText("Keine Allergene hinterlegt")).toBeTruthy();
  });

  test("Schritt-Seiten tragen die Allergen-Zeile nicht", () => {
    renderDialog({ ...BASE_RECIPE, containsTags: ["gluten"] });
    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.queryByText(/Enthält:/)).toBeNull();
  });
});

describe("CookingDialog — Neugestaltung (R3)", () => {
  test("Zutaten-Seite: großes Foto als Platzhalter, wenn es noch kein Bild gibt", () => {
    renderDialog(BASE_RECIPE);
    expect(screen.getByTestId("recipe-image-placeholder")).toBeTruthy();
  });

  test("Allergen-Zeile steht vor der Zutatenliste, nicht darunter", () => {
    renderDialog({ ...BASE_RECIPE, containsTags: ["gluten"] });
    const allergen = screen.getByTestId("allergen-line");
    const intro = screen.getByText("Zutaten bereitlegen");
    expect(allergen.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("Zutaten sind nach Kategorie gegliedert, Menge und Name getrennt", () => {
    renderDialog(BASE_RECIPE);
    expect(screen.getByRole("heading", { name: "Getreide & Backwaren" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Eier" })).toBeTruthy();
    expect(screen.getByText("500 g")).toBeTruthy();
    expect(screen.getByText("Mehl")).toBeTruthy();
  });

  test("nur eine Kategorie: keine Überschriften", () => {
    renderDialog({
      ...BASE_RECIPE,
      ingredients: [{ name: "Mehl", amount: 500, unit: "g", category: "Getreide & Backwaren" }],
    });
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  test("Portionen werden umgerechnet und genannt", () => {
    renderDialog(BASE_RECIPE, 4);
    expect(screen.getByText("für 4 Port.")).toBeTruthy();
    expect(screen.getByText("1000 g")).toBeTruthy();
  });

  test("Rezept ohne Zutaten: startet beim ersten Schritt, ohne Foto-Seite", () => {
    renderDialog({ ...BASE_RECIPE, ingredients: null });
    expect(screen.getByText("Mehl und Eier vermengen")).toBeTruthy();
    expect(screen.queryByText("Zutaten bereitlegen")).toBeNull();
    expect(screen.queryByTestId("recipe-image-placeholder")).toBeNull();
  });

  test("Rezept ohne Schritte, aber mit Zutaten: Zutaten-Seite, 'Fertig' schließt", () => {
    const onClose = vi.fn();
    renderDialog({ ...BASE_RECIPE, instructions: null }, 2, onClose);
    expect(screen.getByText("Zutaten bereitlegen")).toBeTruthy();
    fireEvent.click(screen.getByText("Fertig"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("sehr langer Titel: ganzer Titel im Tooltip, Kopfzeile bricht um", () => {
    const title = "Überbackene Vollkorn-Pasta mit geröstetem Wurzelgemüse, Feta und frischen Kräutern aus dem Ofen";
    renderDialog({ ...BASE_RECIPE, title });
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.getAttribute("title")).toBe(title);
    expect(heading.style.overflowWrap).toBe("anywhere");
  });

  test("Schritt ohne Timer: kein Timer-Feld, kein Start-Button", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));
    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.getByText("Teig kneten")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Starten|Zurücksetzen/ })).toBeNull();
  });

  test("Schritt-Seite nennt die Schrittnummer", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));
    expect(screen.getByText("Schritt 1")).toBeTruthy();
  });

  test("Timer abgelaufen: das Wort 'Abgelaufen' steht da, Zurücksetzen bleibt", () => {
    renderDialog(BASE_RECIPE);
    fireEvent.click(screen.getByText("Weiter"));
    act(() => {
      fireEvent.click(screen.getByText("Starten (02:00)"));
    });
    act(() => {
      vi.advanceTimersByTime(125_000);
    });
    expect(screen.getByText("Abgelaufen")).toBeTruthy();
    expect(screen.getByText("Zurücksetzen")).toBeTruthy();
  });
});
