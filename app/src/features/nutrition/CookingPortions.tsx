/* ============================================================
   FEATURES/NUTRITION/COOKINGPORTIONS.TSX — Portionen im Kochmodus
   (Fahrplan 30, B2; P-1, P-2)

   PortionStepper   Gesamt-Portionen wählen (Halbschritte, 0,5 … 12);
                    die Mengen im Kochmodus rechnen live um.
   PortionPlanAction  Verbindung zum Plan:
     - Rezept im Plan, Portionen weichen ab → "Im Plan auf N Portionen
       ändern?" → Upsert des Plan-Eintrags (eigener Anteil bleibt,
       der Rest sind Gäste-Portionen). Die Einkaufsliste leitet sich
       aus dem Plan ab und folgt von selbst.
     - Rezept nicht im Plan → PlanPicker mit vorbelegten Portionen.
   Fehler bleiben sichtbar stehen, nichts wird still verschluckt.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { useUpsertMealPlanEntry } from "../../api/hooks/useMealPlan";
import {
  COOK_PORTION_MAX,
  COOK_PORTION_MIN,
  splitPortions,
  stepCookPortions,
  totalPortions,
} from "../../core/portions.js";
import type { MealPlanEntry, Recipe } from "../../api/types";
import { SLOT_LABELS, weekdayShort } from "./nutrition-week-model";
import { PlanPicker } from "./PlanPicker";
import { META_STYLE, PRIMARY_BUTTON_DISABLED_STYLE, PRIMARY_BUTTON_STYLE, TAP_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

/** Plan-Bezug des Kochmodus: Eintrag (null = nicht im Plan) und was der PlanPicker braucht */
export interface CookingPlanContext {
  entry: MealPlanEntry | null;
  /** Ohne todayISO lässt sich nichts neu zum Plan hinzufügen */
  todayISO?: string;
  /** Pool zum Auflösen von Titeln im PlanPicker */
  recipes?: readonly Recipe[];
}

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const portionsText = (n: number) => `${fmtNum(n)} ${n === 1 ? "Portion" : "Portionen"}`;
/** "Mi 14.10." */
const shortDate = (dateISO: string) => `${weekdayShort(dateISO)} ${dateISO.slice(8, 10)}.${dateISO.slice(5, 7)}.`;

const STEPPER_STYLE: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 };
const STEP_BUTTON_STYLE: CSSProperties = {
  ...TAP_BUTTON_STYLE,
  minWidth: 48,
  minHeight: 48,
  padding: "0 12px",
  fontSize: "1.4rem",
  lineHeight: 1,
};
const STEP_BUTTON_DISABLED_STYLE: CSSProperties = { ...STEP_BUTTON_STYLE, opacity: 0.4, cursor: "not-allowed" };
const STEP_VALUE_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "1.1rem",
  color: "var(--ink)",
  whiteSpace: "nowrap",
  minWidth: "5.5em",
  textAlign: "center",
};
const ACTION_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
};
const BUTTON_ROW_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 };

export function PortionStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div role="group" aria-label="Portionen" style={STEPPER_STYLE}>
      <button
        type="button"
        aria-label="Eine halbe Portion weniger"
        disabled={value <= COOK_PORTION_MIN}
        style={value <= COOK_PORTION_MIN ? STEP_BUTTON_DISABLED_STYLE : STEP_BUTTON_STYLE}
        onClick={() => onChange(stepCookPortions(value, -1))}
      >
        −
      </button>
      <span role="status" aria-live="polite" style={STEP_VALUE_STYLE}>
        für {fmtNum(value)} Port.
      </span>
      <button
        type="button"
        aria-label="Eine halbe Portion mehr"
        disabled={value >= COOK_PORTION_MAX}
        style={value >= COOK_PORTION_MAX ? STEP_BUTTON_DISABLED_STYLE : STEP_BUTTON_STYLE}
        onClick={() => onChange(stepCookPortions(value, 1))}
      >
        +
      </button>
    </div>
  );
}

export function PortionPlanAction({
  recipe,
  portions,
  plan,
}: {
  recipe: Recipe;
  /** Im Kochmodus gewählte Gesamt-Portionen */
  portions: number;
  plan: CookingPlanContext;
}) {
  const { upsert } = useUpsertMealPlanEntry();
  const [planned, setPlanned] = useState<MealPlanEntry | null>(plan.entry);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hinweis gilt nur für die Portionszahl, bei der er entstand — sonst veraltet er beim Weiterklicken
  const [notice, setNotice] = useState<{ text: string; portions: number } | null>(null);

  const noticeNode =
    notice && notice.portions === portions ? (
      <p role="status" style={{ ...TEXT_STYLE, color: "var(--ink)", margin: 0 }}>
        {notice.text}
      </p>
    ) : null;
  const errorNode = error ? (
    <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)", margin: 0 }}>
      {error}
    </p>
  ) : null;

  async function applyToPlan(entry: MealPlanEntry) {
    setSaving(true);
    setError(null);
    const split = splitPortions(portions, entry.servings);
    const result = await upsert({
      date: entry.date,
      mealSlot: entry.mealSlot,
      recipeId: entry.recipeId,
      servings: split.servings,
      extraServings: split.extraServings,
    });
    setSaving(false);
    setConfirming(false);
    if (!result.ok) {
      setError(`Speichern fehlgeschlagen: ${result.error.message}`);
      return;
    }
    setPlanned(result.entry);
    setNotice({ text: `Im Plan auf ${portionsText(portions)} geändert. Die Einkaufsliste passt sich an.`, portions });
  }

  /* ── Rezept liegt im Plan ── */
  if (planned) {
    const where = `${shortDate(planned.date)}, ${SLOT_LABELS[planned.mealSlot]}`;
    const inSync = totalPortions(planned) === portions;

    if (confirming) {
      const split = splitPortions(portions, planned.servings);
      return (
        <div style={ACTION_STYLE}>
          <p style={{ ...TEXT_STYLE, color: "var(--ink)", margin: 0, fontWeight: 600 }}>
            Im Plan auf {portionsText(portions)} ändern?
          </p>
          <p style={{ ...META_STYLE, margin: 0 }}>
            {where}: {fmtNum(split.servings)} für dich
            {split.extraServings > 0 ? `, ${fmtNum(split.extraServings)} für Gäste (zählen nicht für deine Tageswerte)` : ""}.
          </p>
          {errorNode}
          <div style={BUTTON_ROW_STYLE}>
            <button
              type="button"
              style={saving ? PRIMARY_BUTTON_DISABLED_STYLE : PRIMARY_BUTTON_STYLE}
              disabled={saving}
              onClick={() => void applyToPlan(planned)}
            >
              {saving ? "Speichere …" : "Ja, ändern"}
            </button>
            <button type="button" style={TAP_BUTTON_STYLE} disabled={saving} onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={ACTION_STYLE}>
        <p style={{ ...META_STYLE, margin: 0 }}>
          Im Plan: {where} · {portionsText(totalPortions(planned))}
          {planned.extraServings > 0 ? ` (davon ${fmtNum(planned.extraServings)} Gäste)` : ""}
        </p>
        {noticeNode}
        {errorNode}
        {!inSync && (
          <div style={BUTTON_ROW_STYLE}>
            <button
              type="button"
              style={TAP_BUTTON_STYLE}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Im Plan ändern
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── Rezept liegt nicht im Plan ── */
  if (!plan.todayISO) return null;

  if (!recipe.nutrition) {
    return (
      <div style={ACTION_STYLE}>
        <p style={{ ...META_STYLE, margin: 0 }}>Ohne Nährwerte lässt sich das Rezept nicht planen.</p>
      </div>
    );
  }

  if (picking) {
    const split = splitPortions(portions);
    return (
      <div style={ACTION_STYLE}>
        <PlanPicker
          recipe={recipe}
          recipes={plan.recipes ?? [recipe]}
          todayISO={plan.todayISO}
          initialServings={split.servings}
          initialExtraServings={split.extraServings}
          onCancel={() => setPicking(false)}
          onDone={({ dateISO, slot, servings, extraServings, entry }) => {
            setPicking(false);
            setPlanned(entry);
            setNotice({
              text: `Liegt jetzt im Plan: ${shortDate(dateISO)}, ${SLOT_LABELS[slot]}, ${portionsText(servings + extraServings)}.`,
              portions: servings + extraServings,
            });
          }}
        />
      </div>
    );
  }

  return (
    <div style={ACTION_STYLE}>
      <p style={{ ...META_STYLE, margin: 0 }}>Nicht im Plan.</p>
      <div style={BUTTON_ROW_STYLE}>
        <button type="button" style={TAP_BUTTON_STYLE} onClick={() => setPicking(true)}>
          Zum Plan hinzufügen
        </button>
      </div>
    </div>
  );
}
