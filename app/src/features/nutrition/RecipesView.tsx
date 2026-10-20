/* ============================================================
   FEATURES/NUTRITION/RECIPESVIEW.TSX — Untertab "Rezepte"
   (Fahrplan 25, R2; Entscheidungen Q5, E19)

   Raster aller genehmigten Rezepte mit Suche (Titel), Filter (Mahlzeit,
   Ernährungsform) und hartem Ausblenden der eigenen Unverträglichkeiten
   (core/recipe-browse.js, dieselbe Filterfunktion wie der Vorschlagspool).
   Klick öffnet die Details; von dort "Kochen" (ohne Plan-Eintrag, nichts
   wird gespeichert) und "In den Plan" (PlanPicker, bestehender Upsert-Weg).

   Kopfzeile (in jedem Zustand): Umschalter "Alle Rezepte | Meine Einreichungen"
   (S2b) und der Einstieg ins Einreichformular. "Meine Einreichungen" und das
   Formular (Neu und Bearbeiten) brauchen den Rezeptpool nicht. "In Prüfung"
   folgt in S3.
   ============================================================ */

import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import { useRecipes } from "../../api/hooks/useRecipes";
import { useMealPlan } from "../../api/hooks/useMealPlan";
import { useProfileBasics } from "../../api/hooks/useProfile";
import {
  DIET_FILTER_OPTIONS,
  PREP_FILTER_OPTIONS,
  RECIPE_SORT_OPTIONS,
  browseRecipes,
  hasActiveFilters,
  type RecipeSort,
} from "../../core/recipe-browse.js";
import type { MealSlot, Recipe } from "../../api/types";
import { findPlanEntryForRecipe, totalPortions } from "../../core/portions.js";
import { SLOT_LABELS, SLOT_ORDER, weekDates, weekdayShort } from "./nutrition-week-model";
import { RecipeCard } from "./RecipeCard";
import { RecipeDetailsDialog } from "./RecipeDetails";
import { RecipeRating } from "./RecipeRating";
import { PlanPicker } from "./PlanPicker";
import { CookingDialog } from "./CookingDialog";
import { FIELD_STYLE, GLASS, HEADING_STYLE, META_STYLE, PRIMARY_BUTTON_STYLE, TAP_BUTTON_STYLE, TAP_MIN, TEXT_STYLE } from "./nutrition-styles";
import { RecipeSubmissionForm } from "./RecipeSubmissionForm";
import { MySubmissionsView } from "./MySubmissionsView";
import "./nutrition.css";

const NO_INTOLERANCES: readonly string[] = [];

const CARD_STYLE: CSSProperties = { padding: "24px 28px", marginBottom: 16 };

function chipStyle(active: boolean): CSSProperties {
  return active
    ? { ...TAP_BUTTON_STYLE, border: "1px solid var(--accent)", background: "var(--accent)", color: "#17110a" }
    : { ...TAP_BUTTON_STYLE, ...GLASS };
}

const plural = (n: number, one: string, many: string) =>
  `${String(n).replace(".", ",")} ${n === 1 ? one : many}`;

/** "Mi 14.10." */
const shortDate = (dateISO: string) => `${weekdayShort(dateISO)} ${dateISO.slice(8, 10)}.${dateISO.slice(5, 7)}.`;

export function RecipesView({ todayISO }: { todayISO: string }) {
  const { recipes, isLoading, isError, refetch } = useRecipes();
  const { data: basics } = useProfileBasics();
  const intolerances = (basics?.intolerances ?? NO_INTOLERANCES) as string[];

  const [query, setQuery] = useState("");
  const [mealType, setMealType] = useState<MealSlot | null>(null);
  const [dietTag, setDietTag] = useState<string | null>(null);
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [sort, setSort] = useState<RecipeSort>("title");
  const [details, setDetails] = useState<Recipe | null>(null);
  const [picking, setPicking] = useState(false);
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Formular offen? `{}` = neues Rezept, `{ recipe }` = ein offenes Rezept bearbeiten
  const [form, setForm] = useState<{ recipe?: Recipe } | null>(null);
  const [view, setView] = useState<"all" | "mine">("all");

  const filters = useMemo(() => ({ query, mealType, dietTag, maxMinutes }), [query, mealType, dietTag, maxMinutes]);
  const result = useMemo(
    () => browseRecipes(recipes, { filters, intolerances, sort }),
    [recipes, filters, intolerances, sort],
  );
  const filtered = hasActiveFilters(filters);

  // Kochmodus aus der Liste: gehört das Rezept zum Plan (diese Woche)? Dann passt der Dialog den Eintrag an
  const weekISO = useMemo(() => weekDates(todayISO), [todayISO]);
  const { entries: planEntries, isLoading: planLoading } = useMealPlan(weekISO[0], weekISO[weekISO.length - 1]);
  const cookingEntry = cooking ? findPlanEntryForRecipe(planEntries, cooking.id, todayISO) : null;

  function resetFilters() {
    setQuery("");
    setMealType(null);
    setDietTag(null);
    setMaxMinutes(null);
  }

  function openDetails(recipe: Recipe, withPicker: boolean) {
    setNotice(null);
    setPicking(withPicker);
    setDetails(recipe);
  }

  function closeDetails() {
    setDetails(null);
    setPicking(false);
  }

  function startCooking(recipe: Recipe) {
    closeDetails();
    setCooking(recipe);
  }

  // Einreichen/Bearbeiten braucht den Rezeptpool nicht — früh zurück, vor Lade-/Fehlerzuständen
  if (form) {
    return <RecipeSubmissionForm key={form.recipe?.id ?? "new"} recipe={form.recipe} onClose={() => setForm(null)} />;
  }

  // Kopfzeile in jedem Zustand erreichbar: Umschalter + Einstieg ins Formular
  const header = (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 0 12px" }}>
      <div role="group" aria-label="Rezeptbereich" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" aria-pressed={view === "all"} style={chipStyle(view === "all")} onClick={() => setView("all")}>
          Alle Rezepte
        </button>
        <button type="button" aria-pressed={view === "mine"} style={chipStyle(view === "mine")} onClick={() => setView("mine")}>
          Meine Einreichungen
        </button>
      </div>
      <button type="button" style={PRIMARY_BUTTON_STYLE} onClick={() => setForm({})}>
        Rezept einreichen
      </button>
    </div>
  );

  if (view === "mine") {
    return (
      <section aria-label="Rezepte">
        {header}
        <MySubmissionsView onEdit={(recipe) => setForm({ recipe })} />
      </section>
    );
  }

  if (isLoading) return <p style={META_STYLE}>Lade …</p>;

  if (isError) {
    return (
      <section aria-label="Rezepte">
        {header}
        <GlassCard style={CARD_STYLE}>
          <h2 style={HEADING_STYLE}>Rezepte</h2>
          <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)" }}>
            Die Rezepte konnten nicht geladen werden.
          </p>
          <button type="button" style={TAP_BUTTON_STYLE} onClick={() => void refetch()}>
            Erneut versuchen
          </button>
        </GlassCard>
      </section>
    );
  }

  if (recipes.length === 0) {
    return (
      <section aria-label="Rezepte">
        {header}
        <GlassCard style={CARD_STYLE}>
          <h2 style={HEADING_STYLE}>Rezepte</h2>
          <p style={TEXT_STYLE}>Noch keine Rezepte vorhanden.</p>
        </GlassCard>
      </section>
    );
  }

  const everythingHidden = result.available === 0;

  return (
    <section aria-label="Rezepte">
      {header}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "0 0 12px" }}>
        <input
          type="search"
          aria-label="Rezept suchen"
          placeholder="Rezept suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...FIELD_STYLE, flex: "1 1 220px", minWidth: 0 }}
        />
        <select
          aria-label="Ernährungsform"
          value={dietTag ?? ""}
          onChange={(e) => setDietTag(e.target.value || null)}
          style={{ ...FIELD_STYLE, flex: "0 1 240px" }}
        >
          <option value="">Alle Ernährungsformen</option>
          {DIET_FILTER_OPTIONS.map((o: { value: string; label: string }) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sortierung"
          value={sort}
          onChange={(e) => setSort(e.target.value as RecipeSort)}
          style={{ ...FIELD_STYLE, flex: "0 1 180px" }}
        >
          {RECIPE_SORT_OPTIONS.map((o: { value: string; label: string }) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label="Mahlzeit" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 12px" }}>
        <button type="button" aria-pressed={mealType === null} style={chipStyle(mealType === null)} onClick={() => setMealType(null)}>
          Alle
        </button>
        {SLOT_ORDER.map((slot) => (
          <button
            key={slot}
            type="button"
            aria-pressed={mealType === slot}
            style={chipStyle(mealType === slot)}
            onClick={() => setMealType(mealType === slot ? null : slot)}
          >
            {SLOT_LABELS[slot]}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Dauer" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 12px" }}>
        <button type="button" aria-pressed={maxMinutes === null} style={chipStyle(maxMinutes === null)} onClick={() => setMaxMinutes(null)}>
          Jede Dauer
        </button>
        {PREP_FILTER_OPTIONS.map((o: { value: number; label: string }) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={maxMinutes === o.value}
            style={chipStyle(maxMinutes === o.value)}
            onClick={() => setMaxMinutes(maxMinutes === o.value ? null : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, margin: "0 0 12px", minHeight: TAP_MIN }}>
        <p role="status" style={{ ...META_STYLE, margin: 0 }}>
          {plural(result.visible.length, "Rezept", "Rezepte")}
          {result.hiddenByIntolerance > 0 &&
            ` · ${result.hiddenByIntolerance} wegen deiner Unverträglichkeiten ausgeblendet`}
        </p>
        {filtered && (
          <button type="button" style={{ ...TAP_BUTTON_STYLE, ...GLASS }} onClick={resetFilters}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {notice && (
        <p role="status" style={{ ...TEXT_STYLE, color: "var(--ink)", margin: "0 0 12px" }}>
          {notice}
        </p>
      )}

      {everythingHidden ? (
        <GlassCard style={CARD_STYLE}>
          <p style={TEXT_STYLE}>
            Deine Unverträglichkeiten blenden alle {plural(result.hiddenByIntolerance, "Rezept", "Rezepte")} aus. Du kannst sie in
            den{" "}
            <Link to="/app/settings" style={{ color: "var(--accent)", fontWeight: 600 }}>
              Einstellungen
            </Link>{" "}
            prüfen.
          </p>
        </GlassCard>
      ) : result.visible.length === 0 ? (
        <GlassCard style={CARD_STYLE}>
          <h2 style={HEADING_STYLE}>Kein Rezept passt</h2>
          <p style={TEXT_STYLE}>Zu deiner Suche und den Filtern gibt es kein Rezept.</p>
          <button type="button" style={TAP_BUTTON_STYLE} onClick={resetFilters}>
            Filter zurücksetzen
          </button>
        </GlassCard>
      ) : (
        <ul className="nut-recipes" aria-label="Rezepte">
          {(result.visible as Recipe[]).map((recipe) => (
            <li key={recipe.id} style={{ minWidth: 0 }}>
              <RecipeCard
                recipe={recipe}
                onDetails={() => openDetails(recipe, false)}
                onCook={() => startCooking(recipe)}
                onAddToPlan={() => openDetails(recipe, true)}
              />
            </li>
          ))}
        </ul>
      )}

      {details && (
        <RecipeDetailsDialog
          recipe={details}
          servings={details.servings}
          servingsText={`Rezept für ${plural(details.servings, "Portion", "Portionen")}`}
          onClose={closeDetails}
          onCook={() => startCooking(details)}
          onAddToPlan={() => setPicking(true)}
          addToPlanDisabledHint={details.nutrition ? null : "Ohne Nährwerte lässt sich das Rezept nicht planen."}
          ratingSlot={<RecipeRating recipe={details} />}
          planPicker={
            picking && details.nutrition ? (
              <PlanPicker
                recipe={details}
                recipes={recipes}
                todayISO={todayISO}
                onCancel={() => setPicking(false)}
                onDone={({ dateISO, slot, servings }) => {
                  setNotice(
                    `„${details.title}“ liegt jetzt im Plan: ${shortDate(dateISO)}, ${SLOT_LABELS[slot]}, ${plural(servings, "Portion", "Portionen")}.`,
                  );
                  closeDetails();
                }}
              />
            ) : null
          }
        />
      )}

      {cooking && (
        <CookingDialog
          recipe={cooking}
          servings={cookingEntry ? totalPortions(cookingEntry) : cooking.servings}
          plan={planLoading ? undefined : { entry: cookingEntry, todayISO, recipes }}
          onClose={() => setCooking(null)}
        />
      )}
    </section>
  );
}
