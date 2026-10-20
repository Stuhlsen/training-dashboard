/* ============================================================
   FEATURES/NUTRITION/PENDINGRECIPESVIEW.TSX — "In Prüfung"
   (Fahrplan 30, B4; Entscheidungen R-1, R-2)

   Rezepte, die auf die Entscheidung des Admins warten. Alle Angemeldeten sehen
   sie, lesen Zutaten, Schritte und Nährwerte und geben einen Daumen (nur eine
   Meinung). Der Admin sieht im selben Blatt zusätzlich die Prüfung: Freigeben
   oder mit Grund ablehnen. Verifizierte Autoren veröffentlichen sofort und
   kommen hier nicht vor.

   Kochen und Plan gibt es für diese Rezepte noch nicht — das Blatt zeigt nur
   Inhalt und Meinung. Wer wie abgestimmt hat, zeigt diese Ansicht nie.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { GlassCard } from "../../components/GlassCard";
import { useAuthUserId, useIsAdmin } from "../../api/hooks/useSession";
import { usePendingRecipes } from "../../api/hooks/useRecipeVotes";
import type { Recipe } from "../../api/types";
import { formatVoteCounts } from "../../core/recipe-votes.js";
import { SLOT_LABELS } from "./nutrition-week-model";
import { RecipeDetailsDialog } from "./RecipeDetails";
import { RecipeReviewPanel, type Decision } from "./RecipeReviewPanel";
import { RecipeVotes } from "./RecipeVotes";
import { RecipeComments } from "./RecipeComments";
import { HEADING_STYLE, META_STYLE, TAP_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

const CARD_STYLE: CSSProperties = { padding: "24px 28px", marginBottom: 16 };
const ITEM_STYLE: CSSProperties = {
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
  boxShadow: "var(--e2)",
  padding: "16px 18px",
  minWidth: 0,
};
const SECTION_LABEL_STYLE: CSSProperties = {
  margin: "14px 0 6px",
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  fontWeight: 600,
  color: "var(--ink-2)",
};
const STEPS_STYLE: CSSProperties = { margin: 0, paddingLeft: 20, fontSize: ".9rem", lineHeight: 1.5, color: "var(--ink)" };

const plural = (n: number, one: string, many: string) => `${String(n).replace(".", ",")} ${n === 1 ? one : many}`;

/** Schritte des Rezepts — der Inhalt, über den entschieden wird (das Detailblatt zeigt sie sonst nicht). */
function RecipeSteps({ recipe }: { recipe: Recipe }) {
  const steps = recipe.instructions ?? [];
  return (
    <div>
      <p style={SECTION_LABEL_STYLE}>Zubereitung</p>
      {steps.length === 0 ? (
        <p style={META_STYLE}>Keine Schritte hinterlegt</p>
      ) : (
        <ol style={STEPS_STYLE}>
          {steps.map((step, i) => (
            <li key={i} style={{ padding: "2px 0" }}>
              {step.text}
              {step.timerSeconds ? ` (${Math.max(1, Math.round(step.timerSeconds / 60))} min)` : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PendingRecipesView() {
  const { recipes, isLoading, isError, statsFailed, refetch } = usePendingRecipes();
  const userId = useAuthUserId();
  const isAdmin = useIsAdmin();
  const [details, setDetails] = useState<Recipe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Das Blatt zeigt immer den frischen Stand aus der Liste (Zahlen ändern sich nach einem Daumen)
  const detailsLive = details ? (recipes.find((r) => r.id === details.id) ?? details) : null;

  function onDecided(recipe: Recipe, decision: Decision) {
    setDetails(null);
    setNotice(
      decision === "approved"
        ? `„${recipe.title}“ ist jetzt für alle freigegeben.`
        : `„${recipe.title}“ wurde abgelehnt. Der Autor sieht den Grund in „Meine Einreichungen“.`,
    );
  }

  if (isLoading) return <p style={META_STYLE}>Lade …</p>;

  if (isError) {
    return (
      <GlassCard style={CARD_STYLE}>
        <h2 style={HEADING_STYLE}>Rezepte in Prüfung</h2>
        <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)" }}>
          Die Rezepte in Prüfung konnten nicht geladen werden.
        </p>
        <button type="button" style={TAP_BUTTON_STYLE} onClick={() => void refetch()}>
          Erneut versuchen
        </button>
      </GlassCard>
    );
  }

  return (
    <section aria-label="Rezepte in Prüfung">
      {notice && (
        <p role="status" style={{ ...TEXT_STYLE, color: "var(--ink)", margin: "0 0 12px" }}>
          {notice}
        </p>
      )}

      {recipes.length === 0 ? (
        <GlassCard style={CARD_STYLE}>
          <h2 style={HEADING_STYLE}>Rezepte in Prüfung</h2>
          <p style={TEXT_STYLE}>Zurzeit wartet kein Rezept auf die Prüfung.</p>
        </GlassCard>
      ) : (
        <>
          <p style={{ ...META_STYLE, margin: "0 0 12px" }}>
            Diese Rezepte warten auf die Entscheidung des Admins. Dein Daumen ist nur eine Meinung.
          </p>
          {statsFailed && (
            <p role="status" style={{ ...META_STYLE, margin: "0 0 12px" }}>
              Die Daumen-Zahlen konnten nicht geladen werden.
            </p>
          )}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {recipes.map((recipe) => {
              const n = recipe.nutrition;
              const isOwn = !!userId && recipe.submittedBy === userId;
              return (
                <li key={recipe.id} style={ITEM_STYLE}>
                  <h3 style={{ ...HEADING_STYLE, margin: 0, fontSize: "1rem", overflowWrap: "anywhere" }}>{recipe.title}</h3>
                  <p style={{ ...META_STYLE, margin: "6px 0 0" }}>
                    {(recipe.mealType ?? []).map((m) => SLOT_LABELS[m] ?? m).join(", ")}
                    {n ? ` · ${Math.round(n.kcal)} kcal · ${Math.round(n.protein)} g Eiweiß pro Portion` : ""}
                  </p>
                  <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                    {formatVoteCounts(recipe.voteUp, recipe.voteDown)}
                    {isOwn ? " · Dein Rezept" : ""}
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      aria-label={`${recipe.title} ${isAdmin ? "prüfen" : "ansehen"}`}
                      aria-haspopup="dialog"
                      style={TAP_BUTTON_STYLE}
                      onClick={() => {
                        setNotice(null);
                        setDetails(recipe);
                      }}
                    >
                      {isAdmin ? "Prüfen" : "Ansehen"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {details && detailsLive && (
        <RecipeDetailsDialog
          recipe={detailsLive}
          servings={detailsLive.servings}
          servingsText={`Rezept für ${plural(detailsLive.servings, "Portion", "Portionen")}`}
          onClose={() => setDetails(null)}
          ratingSlot={
            <>
              <RecipeSteps recipe={detailsLive} />
              <RecipeVotes recipe={detailsLive} />
              <RecipeComments recipe={detailsLive} />
              {isAdmin && <RecipeReviewPanel recipe={detailsLive} onDecided={(d) => onDecided(detailsLive, d)} />}
            </>
          }
        />
      )}
    </section>
  );
}
