/* Tests: WeekView — leerer/gefüllter Tag, Ampel-Stufen, Zusammenstellen,
 * Tauschen, Entfernen, wenige/keine Kandidaten, sichtbare Fehler, Banner
 * wegklicken. Die Hooks (Wochen-Daten, Essensplan) sind gemockt. */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlanEntry, MealSlot, Recipe } from "../../api/types";
import type { NutritionDay } from "./nutrition-day-model";
import { AMPEL_TOOLTIP } from "./nutrition-week-model";
import { allergenLabel } from "../../core/nutrition-taxonomy.js";
import { ALLERGEN_NOTE } from "./allergen-text";

const TODAY = "2026-10-14";
const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

let mockWeek: Record<string, unknown>;
const upsertMock = vi.fn();
const removeMock = vi.fn();

vi.mock("./useNutritionWeek", () => ({ useNutritionWeek: () => mockWeek }));
vi.mock("../../api/hooks/useMealPlan", () => ({
  useUpsertMealPlanEntry: () => ({ upsert: upsertMock, isPending: false }),
  useDeleteMealPlanEntry: () => ({ remove: removeMock, isPending: false }),
}));

const { WeekView } = await import("./WeekView");

/* ── Fixtures (synthetisch) ───────────────────────────────── */

function recipe(id: string, slot: MealSlot, kcal: number, protein: number, containsTags: string[] = []): Recipe {
  return {
    id,
    status: "approved",
    title: `Rezept ${id}`,
    mealType: [slot],
    containsTags,
    nutrition: { kcal, protein, carbs: 40, fat: 10 },
  } as unknown as Recipe;
}

/** 3 Rezepte je Slot: <slot>-0 (Basis), <slot>-1, <slot>-2 */
function pool(containsTags: string[] = []): Recipe[] {
  const base: Record<MealSlot, number> = { breakfast: 500, lunch: 800, dinner: 800, snack: 200 };
  return SLOTS.flatMap((slot) =>
    [0, 1, 2].map((i) => recipe(`${slot}-${i}`, slot, base[slot] + i * 60, slot === "snack" ? 8 : 25 + i, containsTags)),
  );
}

function entry(slot: MealSlot, recipeId = `${slot}-0`, servings = 1): MealPlanEntry {
  return {
    id: `e-${slot}`,
    athleteId: "u1",
    date: TODAY,
    mealSlot: slot,
    recipeId,
    servings,
    createdAt: "",
    updatedAt: "",
  };
}

const FULL_DAY = SLOTS.map((s) => entry(s)); // 500 + 800 + 800 + 200 = 2300 kcal

const OK_DAY: Extract<NutritionDay, { ok: true }> = {
  ok: true,
  dateISO: TODAY,
  target: 2300,
  floor: 1700,
  capped: false,
  bmr: 1900,
  formula: "ten-haaf-2014",
  hints: [],
  bodyFatDate: null,
  sexAssumed: false,
  trainingKcal: 0,
  trainingUnknown: false,
  weightKg: 80,
  weightSource: "profile",
  sourceKeys: ["ioc-reds-2023"],
};

function setWeek(over: Record<string, unknown> = {}) {
  const recipes = (over.recipes as Recipe[] | undefined) ?? pool();
  mockWeek = {
    dates: [TODAY],
    days: [OK_DAY],
    entries: [],
    recipes,
    recipesById: new Map(recipes.map((r) => [r.id, r])),
    intolerances: [],
    banners: [],
    isLoading: false,
    ...over,
  };
  if (over.recipes) mockWeek.recipesById = new Map(recipes.map((r) => [r.id, r]));
}

function renderView() {
  return render(<WeekView athleteId="athlete1" userId="u1" todayISO={TODAY} />);
}

const dayRegion = () => screen.getByRole("region", { name: "Tag 14.10" });

beforeEach(() => {
  localStorage.clear();
  upsertMock.mockReset().mockResolvedValue({ ok: true, entry: {} });
  removeMock.mockReset().mockResolvedValue({ ok: true });
  setWeek();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ── Zustände ─────────────────────────────────────────────── */

describe("WeekView — Tageskarten", () => {
  it("leerer Tag: Datum, Ziel, vier leere Slots, weder Summe noch Ampel", () => {
    renderView();
    const day = within(dayRegion());
    expect(day.getByText(/14\.10 · Heute/)).toBeTruthy();
    expect(day.getByText("Ziel 2300 kcal")).toBeTruthy();
    expect(day.getAllByText("Noch nichts geplant")).toHaveLength(4);
    expect(day.queryByText(/^Summe/)).toBeNull();
    expect(day.queryByTitle(AMPEL_TOOLTIP)).toBeNull();
  });

  it("gefüllter Tag: Titel, kcal × Portion und Eiweiß je Slot, Summe, Ampel", () => {
    setWeek({ entries: [entry("breakfast", "breakfast-0", 1.5), ...FULL_DAY.slice(1)] });
    renderView();
    const day = within(dayRegion());
    expect(day.getByText("Rezept breakfast-0")).toBeTruthy();
    expect(day.getByText(/1,5 Portionen · 750 kcal · 38 g Eiweiß/)).toBeTruthy();
    expect(day.getByText("Summe 2550 kcal")).toBeTruthy();
    expect(day.getByTitle(AMPEL_TOOLTIP)).toBeTruthy();
  });

  it("zeigt Laden, solange die Wochen-Daten laden", () => {
    setWeek({ isLoading: true });
    renderView();
    expect(screen.getByText("Lade …")).toBeTruthy();
  });
});

describe("WeekView — Ampel-Stufen (Text, nicht nur Farbe)", () => {
  it("grün: 'im Rahmen'", () => {
    setWeek({ entries: FULL_DAY });
    renderView();
    expect(within(dayRegion()).getByText("im Rahmen")).toBeTruthy();
  });

  it("gelb: 'abweichend'", () => {
    setWeek({ entries: FULL_DAY, days: [{ ...OK_DAY, target: 3000 }] });
    renderView();
    expect(within(dayRegion()).getByText("abweichend")).toBeTruthy();
  });

  it("rot: 'unter der Mindestzufuhr' samt Hinweis und Quelle", () => {
    setWeek({ entries: FULL_DAY, days: [{ ...OK_DAY, floor: 2500 }] });
    renderView();
    const day = within(dayRegion());
    expect(day.getByText("unter der Mindestzufuhr")).toBeTruthy();
    expect(day.getByText(/Die Summe liegt unter der Mindestzufuhr von 2500 kcal/)).toBeTruthy();
    expect(day.queryByText(/RED-S-Boden/)).toBeNull();
    expect(day.getByText("ⓘ Quelle")).toBeTruthy();
  });

  it("zeigt Hinweis, wenn eine Einheit geplant ist, ihre Energie aber nicht berechenbar", () => {
    setWeek({ days: [{ ...OK_DAY, trainingUnknown: true }] });
    renderView();
    expect(screen.getByText("Einheit geplant, Energie nicht berechenbar")).toBeTruthy();
  });

  it("dezenter Hinweis, wenn eine Hauptmahlzeit unter dem Eiweißbereich liegt", () => {
    setWeek({ recipes: [...pool(), recipe("b-low", "breakfast", 400, 8)], entries: [entry("breakfast", "b-low")] });
    renderView();
    expect(screen.getByText(/Eiweiß unter dem bevorzugten Bereich \(ab 20 g je Hauptmahlzeit\)/)).toBeTruthy();
  });
});

/* ── Schreiben ────────────────────────────────────────────── */

describe("WeekView — Tag zusammenstellen, Tauschen, Entfernen", () => {
  it("'Tag zusammenstellen' schreibt je Slot genau Rezept + Portion", async () => {
    renderView();
    fireEvent.click(screen.getByText("Tag zusammenstellen"));
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(4));
    const calls = upsertMock.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.mealSlot).sort()).toEqual([...SLOTS].sort());
    for (const c of calls) {
      expect(Object.keys(c).sort()).toEqual(["date", "mealSlot", "recipeId", "servings"]);
      expect(c.date).toBe(TODAY);
      expect(c.recipeId.startsWith(c.mealSlot)).toBe(true);
      expect([0.5, 1, 1.5, 2]).toContain(c.servings);
    }
  });

  it("Tauschen: zeigt 2 bis 3 Alternativen mit neuer Tagessumme und Ampel; Auswahl schreibt", async () => {
    setWeek({ entries: FULL_DAY });
    renderView();
    fireEvent.click(screen.getByLabelText("Frühstück: tauschen"));
    const choose = screen.getAllByText("Übernehmen");
    expect(choose.length).toBeGreaterThanOrEqual(2);
    expect(choose.length).toBeLessThanOrEqual(3);
    expect(screen.getAllByText(/Tagessumme dann \d+ kcal/).length).toBe(choose.length);

    fireEvent.click(choose[0]);
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1));
    const call = upsertMock.mock.calls[0][0];
    expect(call.mealSlot).toBe("breakfast");
    expect(call.date).toBe(TODAY);
    expect(call.recipeId).not.toBe("breakfast-0");
    expect(call.recipeId.startsWith("breakfast-")).toBe(true);
  });

  it("Entfernen: löscht den Eintrag über dessen id", async () => {
    setWeek({ entries: FULL_DAY });
    renderView();
    fireEvent.click(screen.getByLabelText("Mittagessen: entfernen"));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith("e-lunch"));
  });

  it("zeigt einen Fehler aus dem Hook sichtbar an, statt still zu scheitern", async () => {
    upsertMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "RLS verweigert" } });
    renderView();
    fireEvent.click(screen.getByText("Tag zusammenstellen"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Speichern fehlgeschlagen: RLS verweigert");
  });

  it("zeigt auch einen Löschfehler sichtbar an", async () => {
    removeMock.mockResolvedValue({ ok: false, error: { code: "NETWORK", message: "offline" } });
    setWeek({ entries: FULL_DAY });
    renderView();
    fireEvent.click(screen.getByLabelText("Snack: entfernen"));
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
  });
});

/* ── Randzustände (E19) ───────────────────────────────────── */

describe("WeekView — wenige oder keine Kandidaten", () => {
  it("weniger als 3 Kandidaten: 'nur N Vorschläge' (Singular bei 1)", () => {
    const two = [...pool().filter((r) => !r.id.startsWith("snack")), recipe("s-a", "snack", 200, 8), recipe("s-b", "snack", 220, 8)];
    setWeek({ recipes: two });
    renderView();
    expect(screen.getByText("nur 2 Vorschläge")).toBeTruthy();
    cleanup();

    setWeek({ recipes: [...pool().filter((r) => !r.id.startsWith("snack")), recipe("s-a", "snack", 200, 8)] });
    renderView();
    expect(screen.getByText("nur 1 Vorschlag")).toBeTruthy();
  });

  it("kein Rezept passt zu den Unverträglichkeiten: Hinweis, Knopf gesperrt, kein Absturz", () => {
    setWeek({ recipes: pool(["gluten"]), intolerances: ["gluten"] });
    renderView();
    expect(screen.getByText("Kein Rezept passt zu deinen Unverträglichkeiten")).toBeTruthy();
    expect((screen.getByText("Tag zusammenstellen") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Frühstück: Rezept wählen"));
    expect(screen.getByText("Keine Alternativen")).toBeTruthy();
  });
});

/* ── Banner (E12) ─────────────────────────────────────────── */

describe("WeekView — Banner", () => {
  const BANNER = { key: "weight", text: "Letzter Gewichtseintrag am 2026-10-01 (vor 13 Tagen) — bitte wieder wiegen." };

  it("lässt sich wegklicken und bleibt für diesen Tag weg", () => {
    setWeek({ banners: [BANNER] });
    const first = renderView();
    expect(screen.getByText(/bitte wieder wiegen/)).toBeTruthy();

    fireEvent.click(screen.getByText("Schließen"));
    expect(screen.queryByText(/bitte wieder wiegen/)).toBeNull();
    expect(localStorage.getItem(`nutrition-banner-dismissed:u1:weight:${TODAY}`)).toBe("1");

    first.unmount();
    renderView();
    expect(screen.queryByText(/bitte wieder wiegen/)).toBeNull();
  });

  it("gilt je Nutzer und je Hinweisart", () => {
    setWeek({ banners: [BANNER, { key: "training", text: "Morgen: ca. 800 kcal Verbrauch" }] });
    localStorage.setItem(`nutrition-banner-dismissed:u2:weight:${TODAY}`, "1");
    renderView();
    expect(screen.getByText(/bitte wieder wiegen/)).toBeTruthy();
    fireEvent.click(screen.getAllByText("Schließen")[0]);
    expect(screen.getByText(/Morgen: ca\. 800 kcal/)).toBeTruthy();
  });

  it("bleibt bedienbar, wenn localStorage nicht verfügbar ist", () => {
    setWeek({ banners: [BANNER] });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderView();
    fireEvent.click(screen.getByText("Schließen"));
    expect(screen.queryByText(/bitte wieder wiegen/)).toBeNull();
  });
});

/* ── Details/Kochen in DayCard (E7b) ───────────────────── */

describe("WeekView — Rezept-Details", () => {
  function recipeWithDetails(
    id: string,
    slot: MealSlot,
    _kcal: number,
    _protein: number,
    ingredients: Recipe["ingredients"] = null,
    instructions: Recipe["instructions"] = null,
    nutrition: Recipe["nutrition"] = { kcal: 600, protein: 20, carbs: 80, fat: 15 },
  ): Recipe {
    return {
      id,
      status: "approved",
      servings: 2,
      title: `Rezept ${id}`,
      mealType: [slot],
      containsTags: [],
      ingredients,
      instructions,
      nutrition,
    } as unknown as Recipe;
  }

  function poolWithDetails(): Recipe[] {
    const base = [
      recipeWithDetails(
        "breakfast-0",
        "breakfast",
        500,
        25,
        [{ name: "Haferflocken", amount: 80, unit: "g", category: "Getreide" }],
        [{ text: "Haferflocken mit Wasser mischen" }],
        { kcal: 500, protein: 25, carbs: 60, fat: 10 },
      ),
    ];
    // Add 2 more breakfast options and all other slots
    return [
      ...base,
      recipeWithDetails("breakfast-1", "breakfast", 550, 20),
      recipeWithDetails("breakfast-2", "breakfast", 450, 30),
      recipeWithDetails("lunch-0", "lunch", 800, 35),
      recipeWithDetails("lunch-1", "lunch", 750, 40),
      recipeWithDetails("lunch-2", "lunch", 850, 30),
      recipeWithDetails("dinner-0", "dinner", 800, 35),
      recipeWithDetails("dinner-1", "dinner", 750, 40),
      recipeWithDetails("dinner-2", "dinner", 850, 30),
      recipeWithDetails("snack-0", "snack", 200, 8),
      recipeWithDetails("snack-1", "snack", 220, 10),
      recipeWithDetails("snack-2", "snack", 180, 6),
    ];
  }

  it("Details-Button zeigt Zutaten und Nährwerte", () => {
    setWeek({ recipes: poolWithDetails(), entries: [entry("breakfast", "breakfast-0")] });
    renderView();

    // Details-Button click (use screen, not within, to avoid scoping issues)
    fireEvent.click(screen.getByLabelText("Frühstück: Details"));

    // Wait for re-render — the DetailsContent should now be in the DOM
    expect(screen.getByText("Zutaten")).toBeTruthy();
    // Use getAllByText with a function matcher for text spanning nodes
    const matching = screen.getAllByText((_content: string, el: Element | null) => {
      return (el?.textContent?.includes("g") || false) && (el?.textContent?.includes("Haferflocken") || false);
    });
    expect(matching.length).toBeGreaterThanOrEqual(1);
    expect(matching.some((el) => el.textContent?.includes("40"))).toBe(true);
    expect(screen.getByText(/Nährwerte pro Portion/)).toBeTruthy();
    expect(screen.getAllByText(/25 g Eiweiß/).length).toBeGreaterThanOrEqual(2); // Zeile + Details
  });

  it("Details-Button toggle: zweiter Klick schließt", () => {
    setWeek({ recipes: poolWithDetails(), entries: [entry("breakfast", "breakfast-0")] });
    renderView();
    const day = within(dayRegion());

    fireEvent.click(day.getByLabelText("Frühstück: Details"));
    expect(day.getByText("Zutaten")).toBeTruthy();

    fireEvent.click(day.getByText("Schließen"));
    expect(day.queryByText("Zutaten")).toBeNull();
  });

  it("Rezept ohne Zutaten zeigt dezenter Hinweis", () => {
    setWeek({ recipes: poolWithDetails(), entries: [entry("lunch", "lunch-0")] });
    renderView();
    const day = within(dayRegion());
    fireEvent.click(day.getByLabelText("Mittagessen: Details"));
    expect(day.getByText("Keine Zutaten hinterlegt")).toBeTruthy();
  });
});

/* ── Allergen-Zeile in den Details (E10) ───────────────── */

describe("WeekView — Allergen-Zeile", () => {
  function tagged(containsTags: string[]): Recipe[] {
    return pool().map((r) => ({ ...r, containsTags }) as Recipe);
  }

  it("Details zeigen 'Enthält: …' mit mehreren Allergenen und den Orientierungs-Hinweis", () => {
    setWeek({ recipes: tagged(["gluten", "milk"]), entries: [entry("lunch", "lunch-0")] });
    renderView();
    const day = within(dayRegion());
    fireEvent.click(day.getByLabelText("Mittagessen: Details"));
    expect(day.getByText(`Enthält: ${allergenLabel("gluten")}, ${allergenLabel("milk")}`)).toBeTruthy();
    expect(day.getByText(ALLERGEN_NOTE)).toBeTruthy();
  });

  it("Rezept ohne Tags: 'Keine Allergene hinterlegt'", () => {
    setWeek({ recipes: tagged([]), entries: [entry("lunch", "lunch-0")] });
    renderView();
    const day = within(dayRegion());
    fireEvent.click(day.getByLabelText("Mittagessen: Details"));
    expect(day.getByText("Keine Allergene hinterlegt")).toBeTruthy();
  });

  it("Listenzeilen tragen keine Allergen-Sätze (nur geöffnete Details)", () => {
    setWeek({ recipes: tagged(["gluten"]), entries: [entry("lunch", "lunch-0")] });
    renderView();
    const day = within(dayRegion());
    expect(day.queryByText(/Enthält:/)).toBeNull();
    expect(day.queryByText(/Keine Allergene hinterlegt/)).toBeNull();
    expect(day.queryByText(ALLERGEN_NOTE)).toBeNull();
  });
});
