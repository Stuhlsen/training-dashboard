/* ============================================================
   FEATURES/NUTRITION/RECIPERATING.TSX — Sterne im Rezept-Detail
   (Fahrplan 30, B3; Entscheidungen R-1, R-3, R-4)

   Zeigt "4,3 ★ (7)" bzw. "noch nicht bewertet" und lässt freigegebene,
   fremde Rezepte mit 1–5 Sternen bewerten, ändern und zurücknehmen.
   Bedienung: fünf Knöpfe in einer Gruppe, jeder mit Klartext-Namen
   ("3 von 5 Sternen") und aria-pressed — per Tab und Leertaste/Enter erreichbar,
   ohne dass ein Screenreader nur "Stern" hört.

   Farbe = Bedeutung: gefüllt und im Akzent nur die eigene Wahl; der Schnitt
   der anderen ist Text in Grau, nicht eingefärbt. Das eigene Rezept und nicht
   freigegebene Rezepte bieten keine Sterne an (die Datenbank lehnt sie ohnehin ab).
   ============================================================ */

import { useRef, useState, type CSSProperties } from "react";
import { useAuthUserId } from "../../api/hooks/useSession";
import { useMyRatings, useRateRecipe } from "../../api/hooks/useRecipeRatings";
import type { Recipe } from "../../api/types";
import { RATING_MAX, RATING_VALUES, canRateRecipe, formatRating } from "../../core/recipe-rating.js";
import { META_STYLE, TAP_BUTTON_STYLE, TAP_MIN } from "./nutrition-styles";

const SECTION_LABEL_STYLE: CSSProperties = {
  margin: "14px 0 6px",
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  fontWeight: 600,
  color: "var(--ink-2)",
};
const SUMMARY_STYLE: CSSProperties = { margin: "0 0 6px", fontSize: ".9rem", lineHeight: 1.5, color: "var(--ink)" };
const GROUP_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2 };
const HINT_STYLE: CSSProperties = { ...META_STYLE, margin: "6px 0 0" };

function starStyle(filled: boolean): CSSProperties {
  return {
    minWidth: TAP_MIN,
    minHeight: TAP_MIN,
    padding: 0,
    border: "none",
    background: "transparent",
    font: "inherit",
    fontSize: "1.5rem",
    lineHeight: 1,
    cursor: "pointer",
    // Akzent = "das ist deine Wahl"; ungewählt gedämpft
    color: filled ? "var(--accent)" : "var(--ink-3)",
  };
}

const starsLabel = (n: number) => `${n} von ${RATING_MAX} Sternen`;

export function RecipeRating({ recipe }: { recipe: Recipe }) {
  const userId = useAuthUserId();
  const { mine, isError: mineFailed } = useMyRatings();
  const { rate, unrate } = useRateRecipe();
  const [failed, setFailed] = useState(false);
  // Doppelklicks abfangen, ohne die Knöpfe zu sperren: ein gesperrter Knopf verliert
  // den Fokus, und Tastaturnutzer landen auf der Seite statt im Blatt.
  const busy = useRef(false);
  const firstStar = useRef<HTMLButtonElement>(null);

  const own = mine.get(recipe.id) ?? null;
  const canRate = canRateRecipe(recipe, userId);
  const isOwnRecipe = !!userId && recipe.submittedBy === userId;

  async function run(action: () => ReturnType<typeof rate>, afterOk?: () => void) {
    if (busy.current) return;
    busy.current = true;
    setFailed(false);
    try {
      const result = await action();
      if (result.ok) afterOk?.();
      else setFailed(true);
    } finally {
      busy.current = false;
    }
  }

  const onPick = (stars: number) => run(() => rate(recipe.id, stars));
  // Der Knopf verschwindet mit der Bewertung — der Fokus zieht auf den ersten Stern um
  const onWithdraw = () => run(() => unrate(recipe.id), () => firstStar.current?.focus());

  return (
    <div>
      <p style={SECTION_LABEL_STYLE}>Bewertung</p>
      <p style={SUMMARY_STYLE}>{formatRating(recipe.ratingAvg, recipe.ratingCount)}</p>

      {canRate && (
        <>
          <div role="group" aria-label="Deine Bewertung" style={GROUP_STYLE}>
            {RATING_VALUES.map((n) => {
              const filled = own !== null && n <= own;
              return (
                <button
                  key={n}
                  ref={n === 1 ? firstStar : undefined}
                  type="button"
                  aria-label={starsLabel(n)}
                  aria-pressed={own === n}
                  style={starStyle(filled)}
                  onClick={() => void onPick(n)}
                >
                  <span aria-hidden="true">{filled ? "★" : "☆"}</span>
                </button>
              );
            })}
          </div>
          {own !== null ? (
            <p style={HINT_STYLE}>
              Deine Bewertung: {starsLabel(own)}.{" "}
              <button type="button" style={TAP_BUTTON_STYLE} onClick={() => void onWithdraw()}>
                Bewertung zurücknehmen
              </button>
            </p>
          ) : (
            <p style={HINT_STYLE}>Tippe auf die Sterne, um dieses Rezept zu bewerten.</p>
          )}
        </>
      )}

      {isOwnRecipe && <p style={HINT_STYLE}>Dein eigenes Rezept kannst du nicht bewerten.</p>}

      {canRate && mineFailed && (
        <p role="status" style={HINT_STYLE}>
          Deine bisherige Bewertung konnte nicht geladen werden. Neue Sterne speichern trotzdem.
        </p>
      )}

      {failed && (
        <p role="alert" style={{ ...HINT_STYLE, color: "var(--danger)" }}>
          Die Bewertung konnte nicht gespeichert werden. Bitte versuche es noch einmal.
        </p>
      )}
    </div>
  );
}
