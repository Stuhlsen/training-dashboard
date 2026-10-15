/* ============================================================
   FEATURES/NUTRITION/PLANPICKER.TSX — "In den Plan": Tag + Mahlzeit wählen
   (Fahrplan 25, R2; Entscheidung 3)

   Sitzt im Detailblatt der Rezeptliste. Schreibt über den bestehenden
   Upsert-Weg (useUpsertMealPlanEntry): gespeichert wird nur Rezept +
   Portion je Slot. Liegt im gewählten Slot schon ein Rezept, steht das
   VOR dem Speichern da — der Upsert ersetzt es. Fehler bleiben sichtbar
   im Wähler stehen (nie still verschluckt), der Wähler bleibt offen.
   ============================================================ */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMealPlan, useUpsertMealPlanEntry } from "../../api/hooks/useMealPlan";
import { PORTION_STEPS } from "../../core/nutrition-plan.js";
import type { MealSlot, Recipe } from "../../api/types";
import { SLOT_LABELS, SLOT_ORDER, weekDates, weekdayShort } from "./nutrition-week-model";
import {
  META_STYLE,
  PRIMARY_BUTTON_DISABLED_STYLE,
  PRIMARY_BUTTON_STYLE,
  TAP_BUTTON_STYLE,
  TAP_MIN,
  TEXT_STYLE,
} from "./nutrition-styles";

const WRAP_STYLE: CSSProperties = { marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--hair)" };
const FIELD_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, flex: "1 1 140px", minWidth: 0 };
const LABEL_STYLE: CSSProperties = { ...META_STYLE, margin: 0 };
const SELECT_STYLE: CSSProperties = {
  minHeight: TAP_MIN,
  padding: "8px 12px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--hair)",
  background: "var(--surface-page)",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontSize: ".9rem",
};

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** "Mi 14.10." bzw. "Heute 14.10." */
function dayLabel(dateISO: string, todayISO: string): string {
  const lead = dateISO === todayISO ? "Heute" : weekdayShort(dateISO);
  return `${lead} ${dateISO.slice(8, 10)}.${dateISO.slice(5, 7)}.`;
}

/** Vorbelegung: die erste Mahlzeit, zu der das Rezept gehört */
function defaultSlot(recipe: Recipe): MealSlot {
  return SLOT_ORDER.find((s) => recipe.mealType?.includes(s)) ?? "breakfast";
}

export function PlanPicker({
  recipe,
  recipes,
  todayISO,
  onCancel,
  onDone,
}: {
  recipe: Recipe;
  /** Pool zum Auflösen des Titels eines Rezepts, das ersetzt würde */
  recipes: readonly Recipe[];
  todayISO: string;
  onCancel: () => void;
  onDone: (result: { dateISO: string; slot: MealSlot; servings: number }) => void;
}) {
  const dates = weekDates(todayISO);
  const plan = useMealPlan(dates[0], dates[dates.length - 1]);
  const { upsert } = useUpsertMealPlanEntry();
  const [dateISO, setDateISO] = useState(todayISO);
  const [slot, setSlot] = useState<MealSlot>(() => defaultSlot(recipe));
  const [servings, setServings] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const existing = plan.entries.find((e) => e.date === dateISO && e.mealSlot === slot);
  const existingTitle = existing ? (recipes.find((r) => r.id === existing.recipeId)?.title ?? "ein anderes Rezept") : null;
  const replacesSame = !!existing && existing.recipeId === recipe.id && existing.servings === servings;
  const blocked = saving || plan.isLoading;

  async function submit() {
    setSaving(true);
    setError(null);
    const result = await upsert({ date: dateISO, mealSlot: slot, recipeId: recipe.id, servings });
    setSaving(false);
    if (!result.ok) {
      setError(`Speichern fehlgeschlagen: ${result.error.message}`);
      return;
    }
    onDone({ dateISO, slot, servings });
  }

  return (
    <section aria-label="In den Plan legen" style={WRAP_STYLE}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={FIELD_STYLE}>
          <span style={LABEL_STYLE}>Tag</span>
          <select ref={firstRef} style={SELECT_STYLE} value={dateISO} onChange={(e) => setDateISO(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d, todayISO)}
              </option>
            ))}
          </select>
        </label>
        <label style={FIELD_STYLE}>
          <span style={LABEL_STYLE}>Mahlzeit</span>
          <select style={SELECT_STYLE} value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
            {SLOT_ORDER.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={FIELD_STYLE}>
          <span style={LABEL_STYLE}>Portionen</span>
          <select style={SELECT_STYLE} value={servings} onChange={(e) => setServings(Number(e.target.value))}>
            {PORTION_STEPS.map((p: number) => (
              <option key={p} value={p}>
                {fmtNum(p)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {existingTitle && !replacesSame && (
        <p style={{ ...TEXT_STYLE, margin: "10px 0 0" }}>
          Dort liegt schon „{existingTitle}“. Das Rezept wird ersetzt.
        </p>
      )}
      {replacesSame && <p style={{ ...TEXT_STYLE, margin: "10px 0 0" }}>Dieses Rezept liegt dort schon genau so im Plan.</p>}

      {error && (
        <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)", margin: "10px 0 0" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          style={blocked ? PRIMARY_BUTTON_DISABLED_STYLE : PRIMARY_BUTTON_STYLE}
          disabled={blocked}
          onClick={() => void submit()}
        >
          {saving ? "Speichere …" : "In den Plan legen"}
        </button>
        <button type="button" style={TAP_BUTTON_STYLE} disabled={saving} onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </section>
  );
}
