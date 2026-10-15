/* Tests: DayCard (aufgeklappte Woche) — Kopf, Zeilen, Menü, Schreib-Rückrufe.
 * Die Karte rechnet über useDayPlan, dieselbe Rechnung wie die Tagesbühne. */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MealPlanEntry, MealSlot, Recipe } from "../../api/types";
import type { NutritionDay } from "./nutrition-day-model";
import { DayCard } from "./DayCard";

afterEach(cleanup);

const TODAY = "2026-10-14";
const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

function recipe(id: string, slot: MealSlot, kcal: number): Recipe {
  return {
    id,
    status: "approved",
    title: `Rezept ${id}`,
    mealType: [slot],
    containsTags: [],
    servings: 1,
    imageUrl: null,
    nutrition: { kcal, protein: 30, carbs: 40, fat: 10 },
  } as unknown as Recipe;
}

const RECIPES: Recipe[] = SLOTS.flatMap((slot) =>
  [0, 1, 2].map((i) => recipe(`${slot}-${i}`, slot, (slot === "snack" ? 200 : 700) + i * 50)),
);

const DAY: Extract<NutritionDay, { ok: true }> = {
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

const entry = (slot: MealSlot): MealPlanEntry => ({
  id: `e-${slot}`,
  athleteId: "u1",
  date: TODAY,
  mealSlot: slot,
  recipeId: `${slot}-0`,
  servings: 1,
  createdAt: "",
  updatedAt: "",
});

function setup(over: Partial<Parameters<typeof DayCard>[0]> = {}) {
  const handlers = { onCompose: vi.fn(), onChoose: vi.fn(), onRemove: vi.fn() };
  render(
    <DayCard
      dateISO={TODAY}
      isToday
      day={DAY}
      entries={[]}
      recipes={RECIPES}
      recipesById={new Map(RECIPES.map((r) => [r.id, r]))}
      intolerances={[]}
      busy={false}
      error={null}
      {...handlers}
      {...over}
    />,
  );
  return handlers;
}

describe("DayCard", () => {
  it("Kopf: Datum + Heute, Ziel; ohne Plan weder 'geplant' noch Ampel", () => {
    setup();
    const region = within(screen.getByRole("region", { name: "Tag 14.10" }));
    expect(region.getByText("14.10 · Heute")).toBeTruthy();
    expect(region.getByText("Ziel 2300 kcal")).toBeTruthy();
    expect(region.queryByText(/ kcal geplant/)).toBeNull();
    expect(region.getByRole("button", { name: "Frühstück: Rezept wählen" })).toBeTruthy();
  });

  it("gefüllte Zeilen: Titel, Meta, geplant / Ziel", () => {
    setup({ entries: SLOTS.map(entry) });
    expect(screen.getByText("Rezept breakfast-0")).toBeTruthy();
    expect(screen.getAllByText(/1 Portion · 700 kcal · 30 g Eiweiß/)).toHaveLength(3); // Frühstück, Mittag, Abend
    expect(screen.getByText("2300 von 2300 kcal geplant")).toBeTruthy();
  });

  it("alle Aktionen liegen im Menü: Tauschen → Übernehmen schreibt über onChoose", () => {
    const { onChoose } = setup({ entries: SLOTS.map(entry) });
    fireEvent.click(screen.getByRole("button", { name: "Frühstück: Aktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Tauschen" }));
    const choose = screen.getAllByRole("button", { name: /für Frühstück wählen/ });
    expect(choose.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(choose[0]);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose.mock.calls[0][0]).toBe(TODAY);
    expect(onChoose.mock.calls[0][1]).toBe("breakfast");
    expect(onChoose.mock.calls[0][2].recipeId).not.toBe("breakfast-0");
  });

  it("Entfernen im Menü ruft onRemove mit der Eintrags-id", () => {
    const { onRemove } = setup({ entries: SLOTS.map(entry) });
    fireEvent.click(screen.getByRole("button", { name: "Snack: Aktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Entfernen" }));
    expect(onRemove).toHaveBeenCalledWith(TODAY, "e-snack");
  });

  it("'Tag zusammenstellen' ruft onCompose; ist hier KEINE Akzentfläche (die gehört der Bühne)", () => {
    const { onCompose } = setup();
    const button = screen.getByRole("button", { name: "Tag zusammenstellen" });
    expect(button.style.background).not.toContain("--accent");
    fireEvent.click(button);
    expect(onCompose).toHaveBeenCalledTimes(1);
    expect(onCompose.mock.calls[0][0]).toBe(TODAY);
  });

  it("Tippen auf die Zeile öffnet das Detailblatt", () => {
    setup({ entries: SLOTS.map(entry) });
    fireEvent.click(screen.getByText("Rezept lunch-0"));
    expect(screen.getByRole("dialog", { name: "Details: Rezept lunch-0" })).toBeTruthy();
  });

  it("zeigt den Fehler sichtbar und sperrt bei laufendem Schreiben", () => {
    setup({ busy: true, error: "Speichern fehlgeschlagen: offline" });
    expect(screen.getByRole("alert").textContent).toContain("offline");
    expect((screen.getByRole("button", { name: "Tag zusammenstellen" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
