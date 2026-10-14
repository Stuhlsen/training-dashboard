/* ============================================================
   FEATURES/NUTRITION/COOKINGDIALOG.TSX — Kochen-Dialog (E7b)
   Full-Screen-Overlay ohne Fullscreen API. Startet Timer aus
   einem Schritt und zeigt ihre Restzeit an.

   Layer-Regel: Nutzt useCookTimers (components/hooks), keine
   direkten api/-Aufrufe.
   Kein roher console.*-Aufruf.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useCookTimers } from "../../components/cook-timer-context";
import { useConfirmTap } from "../../components/useConfirmTap";
import { roundAmount, formatShoppingAmount } from "../../core/shopping-list.js";
import { remainingSeconds, formatRemaining, formatRestTime, isExpired } from "../../core/cook-timer.js";
import type { Recipe } from "../../api/types";

/* ── Schwellwert: Timer-Start-Button vs. Ruhezeit-Text ────
 *  EIGENES ERMESSEN (Issue #28): Bei 3600 s oder mehr zeigen
 *  wir "Ruhezeit: ca. X Std." statt eines Start-Buttons.
 *  Der Wert 3600 (1 Stunde) ist bewusst gewählt: Alles unter
 *  einer Stunde kann man sinnvoll im Dialog timen; längere
 *  Zeiten (Teig ruhen, über Nacht) sind keine aktiven Timer. */
const LONG_REST_THRESHOLD_S = 3600;

/* ── Inline-Stile (Projekt-Konvention) ──────────────────── */
const OVERLAY_STYLE: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  background: "var(--surface-page)",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  overflow: "auto",
};
const HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid var(--hair)",
};
const HEADER_TITLE_STYLE: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  margin: 0,
};
const BODY_STYLE: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  gap: 24,
};
const STEP_COUNTER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".85rem",
  color: "var(--ink-3)",
};
const STEP_TEXT_STYLE: React.CSSProperties = {
  fontSize: "1.4rem",
  lineHeight: 1.6,
  maxWidth: "600px",
  textAlign: "center",
  margin: 0,
};
const INGREDIENT_INTRO_STYLE: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 600,
  margin: 0,
};
const INGREDIENT_LINE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "1.1rem",
  margin: "4px 0",
  textAlign: "center",
};
const FOOTER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderTop: "1px solid var(--hair)",
  gap: 12,
};
const NAV_BUTTON_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".9rem",
  cursor: "pointer",
  padding: "12px 24px",
  borderRadius: 8,
  minHeight: 44,
  minWidth: 44,
};
const CLOSE_BUTTON_STYLE: React.CSSProperties = {
  ...NAV_BUTTON_STYLE,
  minWidth: 44,
  padding: "8px 16px",
};
const TIMER_BUTTON_STYLE: React.CSSProperties = {
  ...NAV_BUTTON_STYLE,
  minHeight: 48,
  padding: "12px 32px",
  background: "var(--glass-2)",
  borderColor: "var(--accent)",
  color: "var(--accent)",
  fontSize: "1rem",
};
const TIMER_CONFIRM_STYLE: React.CSSProperties = {
  ...TIMER_BUTTON_STYLE,
  color: "var(--warn)",
  borderColor: "var(--warn)",
};
const TIME_REMAINING_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "1.2rem",
  fontWeight: 600,
  color: "var(--accent)",
};

interface CookingDialogProps {
  recipe: Recipe;
  servings: number;
  onClose: () => void;
}

export function CookingDialog({ recipe, servings, onClose }: CookingDialogProps) {
  const { timers, start, reset, now } = useCookTimers();
  const [page, setPage] = useState(0);
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
      if (e.key === "ArrowLeft") {
        setPage((p) => Math.max(0, p - 1));
        return;
      }
      if (e.key === "ArrowRight") {
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
        <h2 style={HEADER_TITLE_STYLE}>{recipe.title}</h2>
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
          <p style={STEP_TEXT_STYLE}>Keine Schritte vorhanden</p>
        ) : page === 0 && hasIngredients ? (
          <IngredientsPage recipe={recipe} servings={servings} />
        ) : (
          <StepPage
            recipe={recipe}
            stepIndex={hasIngredients ? page - 1 : page}
            servings={servings}
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
            style={NAV_BUTTON_STYLE}
          >
            {page < totalPages - 1 ? "Weiter" : "Fertig"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Zutaten-Seite ─────────────────────────────────────── */
function IngredientsPage({ recipe, servings }: { recipe: Recipe; servings: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <p style={INGREDIENT_INTRO_STYLE}>Zutaten bereitlegen</p>
      {recipe.ingredients!.map((ing, i) => {
        const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
        const scaled = ing.amount * factor;
        const rounded = roundAmount(scaled, ing.unit);
        return (
          <p key={i} style={INGREDIENT_LINE_STYLE}>
            {formatShoppingAmount(rounded)} {ing.unit} {ing.name}
          </p>
        );
      })}
    </div>
  );
}

/* ── Einzelschritt-Seite ───────────────────────────────── */
interface StepPageProps {
  recipe: Recipe;
  stepIndex: number;
  servings: number;
  timers: import("../../types.js").CookTimer[];
  now: number;
  onStart: (id: string, label: string, durationSeconds: number) => void;
  onReset: (id: string) => void;
}

function StepPage({ recipe, stepIndex, timers, now, onStart, onReset }: StepPageProps) {
  const step = recipe.instructions?.[stepIndex];
  if (!step) return <p style={STEP_TEXT_STYLE}>Schritt nicht gefunden</p>;

  const timerSeconds = step.timerSeconds;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
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
    return <p style={STEP_COUNTER_STYLE}>{formatRestTime(timerSeconds)}</p>;
  }

  // Timer läuft bereits → show remaining time
  if (existingTimer) {
    const expired = isExpired(existingTimer, now);
    const remaining = remainingSeconds(existingTimer, now);

    if (expired) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <span style={TIME_REMAINING_STYLE}>Abgelaufen</span>
          <button
            type="button"
            style={pendingReset ? TIMER_CONFIRM_STYLE : TIMER_BUTTON_STYLE}
            onClick={handleReset}
          >
            {pendingReset ? "Wirklich zuruecksetzen?" : "Zuruecksetzen"}
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <span style={TIME_REMAINING_STYLE}>{formatRemaining(remaining)}</span>
        <button
          type="button"
          style={pendingReset ? TIMER_CONFIRM_STYLE : TIMER_BUTTON_STYLE}
          onClick={handleReset}
        >
          {pendingReset ? "Wirklich zuruecksetzen?" : "Zuruecksetzen"}
        </button>
      </div>
    );
  }

  // No timer running yet → show "Starten"

  return (
    <button type="button" style={TIMER_BUTTON_STYLE} onClick={handleStart}>
      Starten ({formatRemaining(timerSeconds)})
    </button>
  );
}