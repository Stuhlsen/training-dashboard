/* ============================================================
   FEATURES/NUTRITION/COOKINGDIALOG.TSX — Kochen-Dialog (E7b)
   Full-Screen-Overlay ohne Fullscreen API. Startet Timer aus
   einem Schritt und zeigt ihre Restzeit an.

   Neugestaltung Fahrplan 25, R3 — NUR Darstellung: großes Foto
   (RecipeImage, Platzhalter bis F3) und die Allergen-Zeile oben auf
   der Zutaten-Seite, Zutaten nach Kategorie gegliedert, Schritt-Text
   groß, Timer in einem eigenen Feld. Timer-, Wake-Lock-, Fokus- und
   Tastatur-Logik sind unverändert.

   Portionen (Fahrplan 30, B2): Auf der Zutaten-Seite wählt ein Stepper die
   Gesamt-Portionen, die Mengen rechnen live um. Mit `plan` bietet der Dialog
   zusätzlich an, den Plan-Eintrag anzupassen bzw. das Rezept zum Plan
   hinzuzufügen (CookingPortions.tsx). Ohne `plan` bleibt es beim Umrechnen.

   Layer-Regel: Nutzt useCookTimers (components/hooks), keine
   direkten api/-Aufrufe (der Plan-Teil geht über api/hooks, s. CookingPortions).
   Kein roher console.*-Aufruf.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useCookTimers } from "../../components/cook-timer-context";
import { useConfirmTap } from "../../components/useConfirmTap";
import { PlateIcon, RecipeImage } from "../../components/RecipeImage";
import { roundAmount, formatShoppingAmount } from "../../core/shopping-list.js";
import { clampCookPortions } from "../../core/portions.js";
import { remainingSeconds, formatRemaining, formatRestTime, isExpired } from "../../core/cook-timer.js";
import type { Recipe } from "../../api/types";
import { AllergenLine } from "./AllergenLine";
import { PortionPlanAction, PortionStepper, type CookingPlanContext } from "./CookingPortions";

/* ── Schwellwert: Timer-Start-Button vs. Ruhezeit-Text ────
 *  EIGENES ERMESSEN (Issue #28): Bei 3600 s oder mehr zeigen
 *  wir "Ruhezeit: ca. X Std." statt eines Start-Buttons.
 *  Der Wert 3600 (1 Stunde) ist bewusst gewählt: Alles unter
 *  einer Stunde kann man sinnvoll im Dialog timen; längere
 *  Zeiten (Teig ruhen, über Nacht) sind keine aktiven Timer. */
const LONG_REST_THRESHOLD_S = 3600;

/* ── Inline-Stile (Projekt-Konvention) ──────────────────── */
/* Lesbar auf Armlänge (Küche, Handy): große Schrift, Tippziele ≥ 44 px.
   Der Overlay scrollt nicht selbst — nur der Body —, damit Kopf- und
   Fußleiste mit Zurück/Weiter immer sichtbar bleiben. */
const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  background: "var(--surface-page)",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  overflow: "hidden",
};
const HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 20px",
  borderBottom: "1px solid var(--hair)",
};
/* Sehr lange Titel: höchstens zwei Zeilen, nie breiter als der Bildschirm */
const HEADER_TITLE_STYLE: React.CSSProperties = {
  fontSize: "1.05rem",
  fontWeight: 600,
  lineHeight: 1.3,
  margin: 0,
  minWidth: 0,
  overflowWrap: "anywhere",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  padding: "20px",
};
const CONTENT_STYLE: React.CSSProperties = {
  width: "100%",
  maxWidth: 640,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};
/* Schritte stehen mittig im freien Raum, die Zutaten-Seite oben */
const CENTERED_CONTENT_STYLE: React.CSSProperties = { ...CONTENT_STYLE, marginBlock: "auto" };
const STEP_COUNTER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".85rem",
  color: "var(--ink-3)",
};
const STEP_LABEL_STYLE: React.CSSProperties = {
  ...STEP_COUNTER_STYLE,
  margin: 0,
  letterSpacing: ".04em",
};
const STEP_TEXT_STYLE: React.CSSProperties = {
  fontSize: "clamp(1.4rem, 5vw, 1.9rem)",
  lineHeight: 1.5,
  margin: 0,
  overflowWrap: "anywhere",
};
const EMPTY_TEXT_STYLE: React.CSSProperties = { ...STEP_TEXT_STYLE, textAlign: "center", color: "var(--ink-2)" };
const INGREDIENT_HEAD_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
};
const INGREDIENT_INTRO_STYLE: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 600,
  margin: 0,
};
const INGREDIENT_CATEGORY_STYLE: React.CSSProperties = {
  ...STEP_COUNTER_STYLE,
  margin: "0 0 4px",
  letterSpacing: ".04em",
};
const INGREDIENT_LINE_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(88px, max-content) minmax(0, 1fr)",
  alignItems: "baseline",
  columnGap: 16,
  minHeight: 48,
  margin: 0,
  padding: "8px 0",
  borderTop: "1px solid var(--hair)",
  fontSize: "1.2rem",
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};
const INGREDIENT_AMOUNT_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 600,
};
/* Die Allergen-Zeile steht direkt unter dem Foto — nie unter der Zutatenliste,
   damit sie ohne Scrollen im Blick bleibt (Entscheidung E10). */
const ALLERGEN_BOX_STYLE: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 14,
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
};
const ALLERGEN_LINE_STYLE: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  lineHeight: 1.4,
  margin: 0,
};
const ALLERGEN_NOTE_STYLE: React.CSSProperties = {
  fontSize: ".8rem",
  color: "var(--ink-3)",
  margin: "4px 0 0",
};
const FOOTER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 20px max(12px, env(safe-area-inset-bottom))",
  borderTop: "1px solid var(--hair)",
  gap: 12,
};
const NAV_BUTTON_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: "1rem",
  cursor: "pointer",
  padding: "12px 24px",
  borderRadius: 999,
  minHeight: 48,
  minWidth: 48,
};
/* Die eine Primäraktion der Ansicht: Weiter / Fertig */
const NAV_PRIMARY_STYLE: React.CSSProperties = {
  ...NAV_BUTTON_STYLE,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "#17110a",
  padding: "12px 32px",
};
const CLOSE_BUTTON_STYLE: React.CSSProperties = {
  ...NAV_BUTTON_STYLE,
  flexShrink: 0,
  padding: "8px 16px",
};
const TIMER_BUTTON_STYLE: React.CSSProperties = {
  ...NAV_BUTTON_STYLE,
  minHeight: 52,
  padding: "12px 32px",
  background: "var(--glass-2)",
  borderColor: "var(--accent)",
  color: "var(--accent)",
  fontSize: "1.05rem",
};
const TIMER_CONFIRM_STYLE: React.CSSProperties = {
  ...TIMER_BUTTON_STYLE,
  color: "var(--warn)",
  borderColor: "var(--warn)",
};
/* Eigenes Feld für den Timer — deutlich abgesetzt vom Schritt-Text */
const TIMER_PANEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  padding: "20px 16px",
  borderRadius: 18,
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
};
const TIME_REMAINING_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "2.6rem",
  lineHeight: 1.1,
  fontWeight: 600,
  color: "var(--accent)",
};
/* Abgelaufen = Zeitdruck → --warn, und das Wort steht im Text (nicht nur Farbe) */
const TIME_EXPIRED_STYLE: React.CSSProperties = { ...TIME_REMAINING_STYLE, color: "var(--warn)", fontSize: "2rem" };

interface CookingDialogProps {
  recipe: Recipe;
  /** Start-Portionen (gesamt, also eigene + Gäste) */
  servings: number;
  /** Plan-Bezug: ohne ihn rechnet der Dialog nur um und schreibt nichts */
  plan?: CookingPlanContext;
  onClose: () => void;
}

export function CookingDialog({ recipe, servings, plan, onClose }: CookingDialogProps) {
  const { timers, start, reset, now } = useCookTimers();
  const [page, setPage] = useState(0);
  const [portions, setPortions] = useState(() => clampCookPortions(servings));
  useWakeLock(true);

  // Focus Trap + Keyboard
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement;
    // Fokus in den Dialog
    const timer = setTimeout(() => {
      dialogRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
      prevFocusRef.current?.focus();
    };
  }, []);

  /* Pages — computed before handleKeyDown which uses totalPages */
  const hasIngredients = !!recipe.ingredients && recipe.ingredients.length > 0;
  const hasInstructions = !!recipe.instructions && recipe.instructions.length > 0;

  const pages = useMemo(() => {
    const result: Array<{ label: string }> = [];
    if (hasIngredients) {
      result.push({ label: "ingredients" });
    }
    if (hasInstructions) {
      for (let i = 0; i < recipe.instructions!.length; i++) {
        result.push({ label: `step:${i}` });
      }
    }
    return result;
  }, [hasIngredients, hasInstructions, recipe.instructions]);

  const totalPages = pages.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Pfeiltasten in Auswahlfeldern (PlanPicker) gehören dem Feld, nicht dem Seitenwechsel
      const inField = (e.target as HTMLElement).tagName === "SELECT" || (e.target as HTMLElement).tagName === "INPUT";
      if (e.key === "ArrowLeft" && !inField) {
        setPage((p) => Math.max(0, p - 1));
        return;
      }
      if (e.key === "ArrowRight" && !inField) {
        const maxPage = totalPages - 1;
        setPage((p) => Math.min(maxPage, p + 1));
        return;
      }
      // Focus trap: Tab/Shift+Tab zyklisch
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose, totalPages],
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Kochen: ${recipe.title}`}
      tabIndex={-1}
      style={OVERLAY_STYLE}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div style={HEADER_STYLE}>
        <h2 style={HEADER_TITLE_STYLE} title={recipe.title}>
          {recipe.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={CLOSE_BUTTON_STYLE}
          aria-label="Schließen"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={BODY_STYLE}>
        {totalPages === 0 ? (
          <div style={{ ...CENTERED_CONTENT_STYLE, alignItems: "center" }}>
            <PlateIcon size={48} />
            <p style={EMPTY_TEXT_STYLE}>Keine Schritte vorhanden</p>
          </div>
        ) : page === 0 && hasIngredients ? (
          <IngredientsPage recipe={recipe} portions={portions} onPortionsChange={setPortions} plan={plan} />
        ) : (
          <StepPage
            recipe={recipe}
            stepIndex={hasIngredients ? page - 1 : page}
            timers={timers}
            now={now}
            onStart={start}
            onReset={reset}
          />
        )}
      </div>

      {/* Footer: step counter + navigation */}
      <div style={FOOTER_STYLE}>
        <div>
          {totalPages > 0 && (
            <span style={STEP_COUNTER_STYLE}>
              {page + 1} / {totalPages}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ ...NAV_BUTTON_STYLE, opacity: page === 0 ? 0.4 : 1 }}
          >
            Zurück
          </button>
          <button
            type="button"
            onClick={() => {
              if (page < totalPages - 1) {
                setPage((p) => p + 1);
              } else {
                onClose();
              }
            }}
            style={NAV_PRIMARY_STYLE}
          >
            {page < totalPages - 1 ? "Weiter" : "Fertig"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Zutaten-Seite ─────────────────────────────────────── */
type RecipeIngredient = NonNullable<Recipe["ingredients"]>[number];

/** Zutaten nach Kategorie, in der Reihenfolge des Rezepts (keine Sortierung) */
function groupByCategory(ingredients: readonly RecipeIngredient[]) {
  const groups = new Map<string, RecipeIngredient[]>();
  for (const ing of ingredients) {
    const category = (ing.category ?? "").trim();
    const list = groups.get(category);
    if (list) list.push(ing);
    else groups.set(category, [ing]);
  }
  return [...groups.entries()];
}

function IngredientsPage({
  recipe,
  portions,
  onPortionsChange,
  plan,
}: {
  recipe: Recipe;
  portions: number;
  onPortionsChange: (next: number) => void;
  plan?: CookingPlanContext;
}) {
  const factor = recipe.servings > 0 ? portions / recipe.servings : 1;
  const groups = groupByCategory(recipe.ingredients!);
  // Kategorie-Überschriften nur, wenn es etwas zu gliedern gibt
  const showCategories = groups.length > 1;

  return (
    <div style={CONTENT_STYLE}>
      {/* Foto groß; ohne Bild derselbe Rahmen mit Platzhalter — kein Layoutsprung */}
      <RecipeImage recipe={recipe} ratio="16 / 9" alt="" style={{ borderRadius: 18, maxHeight: "34vh" }} />

      <div style={ALLERGEN_BOX_STYLE}>
        <AllergenLine tags={recipe.containsTags} lineStyle={ALLERGEN_LINE_STYLE} noteStyle={ALLERGEN_NOTE_STYLE} />
      </div>

      <div style={INGREDIENT_HEAD_STYLE}>
        <p style={INGREDIENT_INTRO_STYLE}>Zutaten bereitlegen</p>
        <PortionStepper value={portions} onChange={onPortionsChange} />
      </div>

      {groups.map(([category, items]) => (
        <section key={category} aria-label={category || "Zutaten"}>
          {showCategories && <h3 style={INGREDIENT_CATEGORY_STYLE}>{category || "Sonstiges"}</h3>}
          {items.map((ing, i) => {
            const rounded = roundAmount(ing.amount * factor, ing.unit);
            return (
              <p key={i} style={INGREDIENT_LINE_STYLE}>
                <span style={INGREDIENT_AMOUNT_STYLE}>
                  {formatShoppingAmount(rounded)} {ing.unit}
                </span>
                <span>{ing.name}</span>
              </p>
            );
          })}
        </section>
      ))}

      {plan && <PortionPlanAction recipe={recipe} portions={portions} plan={plan} />}
    </div>
  );
}

/* ── Einzelschritt-Seite ───────────────────────────────── */
interface StepPageProps {
  recipe: Recipe;
  stepIndex: number;
  timers: import("../../types.js").CookTimer[];
  now: number;
  onStart: (id: string, label: string, durationSeconds: number) => void;
  onReset: (id: string) => void;
}

function StepPage({ recipe, stepIndex, timers, now, onStart, onReset }: StepPageProps) {
  const step = recipe.instructions?.[stepIndex];
  if (!step) return <p style={EMPTY_TEXT_STYLE}>Schritt nicht gefunden</p>;

  const timerSeconds = step.timerSeconds;

  return (
    <div style={CENTERED_CONTENT_STYLE}>
      <p style={STEP_LABEL_STYLE}>Schritt {stepIndex + 1}</p>
      <p style={STEP_TEXT_STYLE}>{step.text}</p>

      {timerSeconds != null && timerSeconds > 0 && (
        <TimerInStep
          recipeId={recipe.id}
          stepIndex={stepIndex}
          recipeTitle={recipe.title}
          timerSeconds={timerSeconds}
          timers={timers}
          now={now}
          onStart={onStart}
          onReset={onReset}
        />
      )}
    </div>
  );
}

/* ── Timer in einem Schritt ────────────────────────────── */
interface TimerInStepProps {
  recipeId: string;
  stepIndex: number;
  recipeTitle: string;
  timerSeconds: number;
  timers: import("../../types.js").CookTimer[];
  now: number;
  onStart: (id: string, label: string, durationSeconds: number) => void;
  onReset: (id: string) => void;
}

function TimerInStep({
  recipeId,
  stepIndex,
  recipeTitle,
  timerSeconds,
  timers,
  now,
  onStart,
  onReset,
}: TimerInStepProps) {
  const timerId = `${recipeId}:${stepIndex}`;
  const existingTimer = useMemo(
    () => timers.find((t) => t.id === timerId && t.endAt != null),
    [timers, timerId],
  );

  const confirmReset = useCallback(() => onReset(timerId), [timerId, onReset]);
  const { pending: pendingReset, trigger: handleReset } = useConfirmTap(confirmReset);

  // Always declare all hooks before early returns
  const handleStart = useCallback(() => {
    const label = `${recipeTitle}, Schritt ${stepIndex + 1}`;
    onStart(timerId, label, timerSeconds);
  }, [timerId, timerSeconds, recipeTitle, stepIndex, onStart]);

  // Lange Timer (>= 3600 s) → no start button, show rest time text
  if (timerSeconds >= LONG_REST_THRESHOLD_S) {
    return (
      <div style={TIMER_PANEL_STYLE}>
        <p style={{ ...STEP_COUNTER_STYLE, fontSize: "1.05rem", margin: 0 }}>{formatRestTime(timerSeconds)}</p>
      </div>
    );
  }

  // Timer läuft bereits → show remaining time
  if (existingTimer) {
    const expired = isExpired(existingTimer, now);
    const remaining = remainingSeconds(existingTimer, now);

    return (
      <div style={TIMER_PANEL_STYLE}>
        {expired ? (
          <span style={TIME_EXPIRED_STYLE}>Abgelaufen</span>
        ) : (
          <span style={TIME_REMAINING_STYLE}>{formatRemaining(remaining)}</span>
        )}
        <button
          type="button"
          style={pendingReset ? TIMER_CONFIRM_STYLE : TIMER_BUTTON_STYLE}
          onClick={handleReset}
        >
          {pendingReset ? "Wirklich zurücksetzen?" : "Zurücksetzen"}
        </button>
      </div>
    );
  }

  // No timer running yet → show "Starten"

  return (
    <div style={TIMER_PANEL_STYLE}>
      <button type="button" style={TIMER_BUTTON_STYLE} onClick={handleStart}>
        Starten ({formatRemaining(timerSeconds)})
      </button>
    </div>
  );
}
