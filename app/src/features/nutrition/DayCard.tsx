/* ============================================================
   FEATURES/NUTRITION/DAYCARD.TSX — Tageskarte der Wochenansicht
   (Fahrplan 23, E6 PR B; Entscheidungen L1, L2, L3, E19, E22, E31, E32)

   Zeigt je Tag: Datum, Tagesziel, Summe, Ampel und die vier Slots.
   Reine Darstellung + lokaler UI-Zustand (welcher Slot zeigt gerade
   Alternativen). Geschrieben wird nicht hier, sondern über die
   Rückruf-Funktionen der WeekView.

   Ampel (L3): --ok / --warn / --danger, NICHT die Zonenfarben — und nie
   nur Farbe: Text + Tooltip ("keine medizinische Schwelle").
   Rezeptbilder gibt es nicht (L2) — ein schlichtes Symbol steht dafür.
   ============================================================ */

import { useMemo, useState, type CSSProperties } from "react";
import { GlassCard } from "../../components/GlassCard";
import { fmtDate } from "../../core/format.js";
import { composeDay, swapCandidates } from "../../core/nutrition-plan.js";
import { SOURCE_BY_KEY } from "../../core/nutrition-sources.js";
import { roundAmount, formatShoppingAmount } from "../../core/shopping-list.js";
import type { MealPlanEntry, MealSlot, Recipe } from "../../api/types";
import type { NutritionDay } from "./nutrition-day-model";
import {
  AMPEL_TEXT,
  AMPEL_TOOLTIP,
  SLOT_LABELS,
  SLOT_ORDER,
  recentRecipeIds,
  summarizeDay,
  type Ampel,
  type SlotView,
} from "./nutrition-week-model";
import { SourceList } from "./SourceList";
import { CookingDialog } from "./CookingDialog";
import { BUTTON_DISABLED_STYLE, BUTTON_STYLE, HEADING_STYLE, META_STYLE, TEXT_STYLE } from "./nutrition-styles";

export interface Choice {
  recipeId: string;
  servings: number;
}

export interface DayCardProps {
  dateISO: string;
  isToday: boolean;
  day: Extract<NutritionDay, { ok: true }>;
  entries: readonly MealPlanEntry[];
  recipes: Recipe[];
  recipesById: ReadonlyMap<string, Recipe>;
  intolerances: string[];
  /** Ein Schreibvorgang für diesen Tag läuft */
  busy: boolean;
  /** Sichtbare Fehlermeldung des letzten Schreibvorgangs, sonst null */
  error: string | null;
  onCompose: (dateISO: string, choices: Partial<Record<MealSlot, Choice | null>>) => void;
  onChoose: (dateISO: string, slot: MealSlot, choice: Choice) => void;
  onRemove: (dateISO: string, entryId: string) => void;
}

const AMPEL_TOKEN: Record<Ampel, string> = { green: "--ok", yellow: "--warn", red: "--danger" };

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

function poolNote(count: number, hasIntolerances: boolean): string | null {
  if (count === 0) return hasIntolerances ? "Kein Rezept passt zu deinen Unverträglichkeiten" : "Kein Rezept verfügbar";
  if (count < 3) return `nur ${count} ${count === 1 ? "Vorschlag" : "Vorschläge"}`;
  return null;
}

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: "10px 0",
  borderTop: "1px solid var(--hair)",
};

export function AmpelBadge({ ampel }: { ampel: Ampel }) {
  return (
    <span
      title={AMPEL_TOOLTIP}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: ".78rem",
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 9, height: 9, borderRadius: "50%", background: `var(${AMPEL_TOKEN[ampel]})` }}
      />
      {AMPEL_TEXT[ampel]}
    </span>
  );
}

function PlateIcon() {
  // schlichtes Symbol statt Bild (L2)
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none", color: "var(--ink-3)" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ── Details-Ansicht (Zutaten + Nährwerte) ─────────────── */
const DETAILS_STYLE: CSSProperties = {
  flexBasis: "100%",
  paddingTop: 8,
};
const INGREDIENT_STYLE: CSSProperties = {
  ...META_STYLE,
  margin: "1px 0",
};
const NUTRITION_LABEL_STYLE: CSSProperties = {
  ...META_STYLE,
  fontWeight: 600,
  color: "var(--ink-2)",
  margin: "4px 0 2px",
};
const HINT_STYLE: CSSProperties = {
  ...META_STYLE,
  fontStyle: "italic",
};

/** Skaliert einen Zutatenwert auf die geplanten Portionen.
 *  Faktor = entryServings / recipeServings. */
function scaledIngredient(
  amount: number,
  unit: string,
  entryServings: number,
  recipeServings: number,
): string {
  // Fehlende/ungültige Rezept-Portionen: Menge unskaliert zeigen statt NaN
  const factor = recipeServings > 0 ? entryServings / recipeServings : 1;
  const scaled = amount * factor;
  const rounded = roundAmount(scaled, unit);
  return `${formatShoppingAmount(rounded)} ${unit}`;
}

function DetailsContent({ recipe, servings }: { recipe: Recipe; servings: number }) {
  if (!recipe.nutrition && !recipe.ingredients) {
    return (
      <div style={DETAILS_STYLE}>
        <p style={HINT_STYLE}>Keine Nährwertangaben und keine Zutaten hinterlegt</p>
      </div>
    );
  }

  return (
    <div style={DETAILS_STYLE}>
      {recipe.ingredients && recipe.ingredients.length > 0 ? (
        <div>
          <p style={NUTRITION_LABEL_STYLE}>Zutaten</p>
          {recipe.ingredients.map((ing, i) => (
            <p key={i} style={INGREDIENT_STYLE}>
              {scaledIngredient(ing.amount, ing.unit, servings, recipe.servings)} {ing.name}
            </p>
          ))}
        </div>
      ) : (
        <p style={HINT_STYLE}>Keine Zutaten hinterlegt</p>
      )}

      {recipe.nutrition && (
        <div style={{ marginTop: 4 }}>
          <p style={NUTRITION_LABEL_STYLE}>Nährwerte pro Portion</p>
          <p style={INGREDIENT_STYLE}>
            {Math.round(recipe.nutrition.kcal)} kcal · {Math.round(recipe.nutrition.protein)} g Eiweiß ·{" "}
            {Math.round(recipe.nutrition.carbs)} g Kohlenhydrate · {Math.round(recipe.nutrition.fat)} g Fett
          </p>
          {servings !== recipe.servings && (
            <p style={INGREDIENT_STYLE}>
              Geplant: {fmtNum(servings)} Portion{servings === 1 ? "" : "en"} = {Math.round(recipe.nutrition.kcal * servings / recipe.servings)} kcal ·{" "}
              {Math.round(recipe.nutrition.protein * servings / recipe.servings)} g Eiweiß
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function DayCard(props: DayCardProps) {
  const { dateISO, isToday, day, entries, recipes, recipesById, intolerances, busy, error } = props;
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<string | null>(null);
  const [cookingRecipe, setCookingRecipe] = useState<{ recipe: Recipe; servings: number } | null>(null);

  const summary = useMemo(
    () =>
      summarizeDay({
        dateISO,
        entries,
        recipesById,
        target: day.target,
        floor: day.floor,
        weightKg: day.weightKg,
      }),
    [dateISO, entries, recipesById, day.target, day.floor, day.weightKg],
  );

  const current = useMemo(() => {
    const out: Partial<Record<MealSlot, Choice>> = {};
    for (const s of summary.slots) {
      if (s.entry && s.recipe) out[s.slot] = { recipeId: s.entry.recipeId, servings: s.entry.servings };
    }
    return out;
  }, [summary]);

  const suggestion = useMemo(
    () =>
      composeDay({
        recipes,
        intolerances,
        target: day.target,
        floor: day.floor,
        weightKg: day.weightKg,
        dateISO,
        planned: recentRecipeIds(entries, dateISO),
      }),
    [recipes, intolerances, day.target, day.floor, day.weightKg, dateISO, entries],
  );

  const swaps = useMemo(
    () =>
      openSlot
        ? swapCandidates({
            recipes,
            intolerances,
            target: day.target,
            floor: day.floor,
            weightKg: day.weightKg,
            dateISO,
            planned: recentRecipeIds(entries, dateISO),
            slot: openSlot,
            current,
          })
        : [],
    [openSlot, recipes, intolerances, day.target, day.floor, day.weightKg, dateISO, entries, current],
  );

  const nothingFits = SLOT_ORDER.every((s) => suggestion.flags.poolSize[s] === 0);
  const showRedS = summary.ampel === "red" || day.capped;
  const sources = day.sourceKeys.map((k) => SOURCE_BY_KEY.get(k)).filter((s): s is NonNullable<typeof s> => !!s);

  function renderSlot(view: SlotView) {
    const { slot, entry, recipe } = view;
    const note = nothingFits ? null : poolNote(suggestion.flags.poolSize[slot], intolerances.length > 0);
    const isOpen = openSlot === slot;

    return (
      <div key={slot} style={ROW_STYLE}>
        <PlateIcon />
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <p style={META_STYLE}>{SLOT_LABELS[slot]}</p>
          {recipe && entry ? (
            <>
              <p style={{ ...TEXT_STYLE, margin: 0, color: "var(--ink)", fontWeight: 600 }}>{recipe.title}</p>
              <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                {fmtNum(entry.servings)} Portion{entry.servings === 1 ? "" : "en"} · {Math.round(view.kcal ?? 0)} kcal ·{" "}
                {Math.round(view.protein ?? 0)} g Eiweiß
              </p>
            </>
          ) : entry ? (
            <p style={{ ...TEXT_STYLE, margin: 0 }}>Dieses Rezept ist nicht mehr verfügbar</p>
          ) : (
            <p style={{ ...TEXT_STYLE, margin: 0 }}>Noch nichts geplant</p>
          )}
          {view.proteinLow && (
            <p style={{ ...META_STYLE, margin: "4px 0 0" }}>
              Eiweiß unter dem bevorzugten Bereich (ab {fmtNum(summary.proteinMin)} g je Hauptmahlzeit)
            </p>
          )}
          {note && <p style={{ ...META_STYLE, margin: "4px 0 0" }}>{note}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={busy ? BUTTON_DISABLED_STYLE : BUTTON_STYLE}
            disabled={busy}
            aria-expanded={isOpen}
            aria-label={`${SLOT_LABELS[slot]}: ${entry ? "tauschen" : "Rezept wählen"}`}
            onClick={() => setOpenSlot(isOpen ? null : slot)}
          >
            {entry ? "Tauschen" : "Wählen"}
          </button>
          {entry && recipe && (
            <>
              <button
                type="button"
                style={BUTTON_STYLE}
                aria-label={`${SLOT_LABELS[slot]}: Details`}
                onClick={() => setDetailsSlot(detailsSlot === slot ? null : slot)}
              >{detailsSlot === slot ? "Schließen" : "Details"}</button>
              <button
                type="button"
                style={BUTTON_STYLE}
                aria-label={`${SLOT_LABELS[slot]}: Kochen`}
                onClick={() => setCookingRecipe({ recipe, servings: entry.servings })}
              >Kochen</button>
            </>
          )}
          {entry && (
              <button
                type="button"
                style={busy ? BUTTON_DISABLED_STYLE : BUTTON_STYLE}
                disabled={busy}
                aria-label={`${SLOT_LABELS[slot]}: entfernen`}
                onClick={() => props.onRemove(dateISO, entry.id)}
              >
                Entfernen
              </button>
          )}
        </div>

        {detailsSlot === slot && recipe && entry && (
          <DetailsContent recipe={recipe} servings={entry.servings} />
        )}

        {isOpen && (
          <div style={{ flexBasis: "100%" }}>
            {swaps.length === 0 ? (
              <p style={META_STYLE}>Keine Alternativen</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {swaps.map((alt) => {
                  const r = recipesById.get(alt.recipeId);
                  const protein = (r?.nutrition?.protein ?? 0) * alt.servings;
                  const kcal = (r?.nutrition?.kcal ?? 0) * alt.servings;
                  return (
                    <li key={alt.recipeId} style={{ ...ROW_STYLE, borderTop: "1px dashed var(--hair)" }}>
                      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                        <p style={{ ...TEXT_STYLE, margin: 0, color: "var(--ink)" }}>{r?.title ?? alt.recipeId}</p>
                        <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                          {fmtNum(alt.servings)} Portion{alt.servings === 1 ? "" : "en"} · {Math.round(kcal)} kcal ·{" "}
                          {Math.round(protein)} g Eiweiß
                        </p>
                        <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                          Tagessumme dann {alt.totals.kcal} kcal · <AmpelBadge ampel={alt.ampel as Ampel} />
                        </p>
                      </div>
                      <button
                        type="button"
                        style={busy ? BUTTON_DISABLED_STYLE : BUTTON_STYLE}
                        disabled={busy}
                        aria-label={`${r?.title ?? "Rezept"} für ${SLOT_LABELS[slot]} wählen`}
                        onClick={() => {
                          setOpenSlot(null);
                          props.onChoose(dateISO, slot, { recipeId: alt.recipeId, servings: alt.servings });
                        }}
                      >
                        Übernehmen
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <GlassCard style={{ padding: "20px 24px", marginBottom: 16 }}>
      <section aria-label={`Tag ${fmtDate(dateISO)}`}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
          <h3 style={{ ...HEADING_STYLE, margin: 0 }}>
            {fmtDate(dateISO)}
            {isToday ? " · Heute" : ""}
          </h3>
          <span style={META_STYLE}>Ziel {day.target} kcal</span>
          {summary.filled > 0 && <span style={META_STYLE}>Summe {summary.totalKcal} kcal</span>}
          {summary.ampel && <AmpelBadge ampel={summary.ampel} />}
        </div>

        {day.trainingKcal > 0 && <p style={{ ...META_STYLE, margin: "6px 0 0" }}>Training: +{day.trainingKcal} kcal</p>}
        {day.trainingUnknown && (
          <p style={{ ...TEXT_STYLE, margin: "6px 0 0" }}>Einheit geplant, Energie nicht berechenbar</p>
        )}
        {showRedS && (
          <div style={{ marginTop: 6 }}>
            <p style={{ ...TEXT_STYLE, margin: 0 }}>
              {summary.ampel === "red"
                ? `Die Summe liegt unter der Mindestzufuhr von ${day.floor} kcal.`
                : `Das Ziel wurde auf die Mindestzufuhr (${day.floor} kcal) angehoben.`}
            </p>
            <details>
              <summary style={{ cursor: "pointer", color: "var(--ink-3)", fontSize: ".8rem" }}>ⓘ Quelle</summary>
              <SourceList sources={sources} />
            </details>
          </div>
        )}

        {nothingFits && (
          <p style={{ ...TEXT_STYLE, margin: "8px 0 0" }}>
            {intolerances.length > 0 ? "Kein Rezept passt zu deinen Unverträglichkeiten" : "Kein Rezept verfügbar"}
          </p>
        )}

        <div style={{ marginTop: 10 }}>{summary.slots.map(renderSlot)}</div>

        {error && (
          <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)", margin: "8px 0 0" }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            style={busy || nothingFits ? BUTTON_DISABLED_STYLE : BUTTON_STYLE}
            disabled={busy || nothingFits}
            onClick={() => props.onCompose(dateISO, suggestion.slots)}
          >
            Tag zusammenstellen
          </button>
        </div>
      </section>
    </GlassCard>
    {cookingRecipe && (
      <CookingDialog
        recipe={cookingRecipe.recipe}
        servings={cookingRecipe.servings}
        onClose={() => setCookingRecipe(null)}
      />
    )}
  </>);
}
