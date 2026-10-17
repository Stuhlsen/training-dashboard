/* ============================================================
   FEATURES/NUTRITION/RECIPESVIEW.TSX — Untertab "Rezepte"
   (Fahrplan 25, R2; Entscheidungen Q5, E19)

   Raster aller genehmigten Rezepte mit Suche (Titel), Filter (Mahlzeit,
   Ernährungsform) und hartem Ausblenden der eigenen Unverträglichkeiten
   (core/recipe-browse.js, dieselbe Filterfunktion wie der Vorschlagspool).
   Klick öffnet die Details; von dort "Kochen" (ohne Plan-Eintrag, nichts
   wird gespeichert) und "In den Plan" (PlanPicker, bestehender Upsert-Weg).

   Platz für spätere Umschalter ("In Prüfung", "Meine Einreichungen" —
   S2/S3): die Kopfzeile der Liste ist ein eigener Block, nichts davon
   ist hier gebaut.
   ============================================================ */

import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import { useRecipes } from "../../api/hooks/useRecipes";
import { useProfileBasics } from "../../api/hooks/useProfile";
import { DIET_FILTER_OPTIONS, browseRecipes, hasActiveFilters } from "../../core/recipe-browse.js";
import type { MealSlot, Recipe } from "../../api/types";
import { SLOT_LABELS, SLOT_ORDER, weekdayShort } from "./nutrition-week-model";
import { RecipeCard } from "./RecipeCard";
import { RecipeDetailsDialog } from "./RecipeDetails";
import { PlanPicker } from "./PlanPicker";
import { CookingDialog } from "./CookingDialog";
import { FIELD_STYLE, GLASS, HEADING_STYLE, META_STYLE, PRIMARY_BUTTON_STYLE, TAP_BUTTON_STYLE, TAP_MIN, TEXT_STYLE } from "./nutrition-styles";
import { RecipeSubmissionForm } from "./RecipeSubmissionForm";
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
  const [details, setDetails] = useState<Recipe | null>(null);
  const [picking, setPicking] = useState(false);
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filters = useMemo(() => ({ query, mealType, dietTag }), [query, mealType, dietTag]);
  const result = useMemo(() => browseRecipes(recipes, { filters, intolerances }), [recipes, filters, intolerances]);
  const filtered = hasActiveFilters(filters);

  function resetFilters() {
    setQuery("");
    setMealType(null);
    setDietTag(null);
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

  // Einreichen braucht den Rezeptpool nicht — früh zurück, vor Lade-/Fehlerzuständen
  if (submitting) return <RecipeSubmissionForm onClose={() => setSubmitting(false)} />;

  // Einstieg ins Formular — in jedem Zustand erreichbar, auch wenn der Pool leer ist oder nicht lädt
  const submitButton = (
    <button type="button" style={PRIMARY_BUTTON_STYLE} onClick={() => setSubmitting(true)}>
      Rezept einreichen
    </button>
  );

  if (isLoading) return <p style={META_STYLE}>Lade …</p>;

  if (isError) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Rezepte</h2>
        <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)" }}>
          Die Rezepte konnten nicht geladen werden.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button type="button" style={TAP_BUTTON_STYLE} onClick={() => void refetch()}>
            Erneut versuchen
          </button>
          {submitButton}
        </div>
      </GlassCard>
    );
  }

  if (recipes.length === 0) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Rezepte</h2>
        <p style={TEXT_STYLE}>Noch keine Rezepte vorhanden.</p>
        {submitButton}
      </GlassCard>
    );
  }

  const everythingHidden = result.available === 0;

  return (
    <section aria-label="Rezepte">
      <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 12px" }}>{submitButton}</div>
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

      {cooking && <CookingDialog recipe={cooking} servings={cooking.servings} onClose={() => setCooking(null)} />}
    </section>
  );
}
