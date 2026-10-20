/* ============================================================
   FEATURES/NUTRITION/RECIPEVOTES.TSX — Daumen im Blatt eines Rezepts in Prüfung
   (Fahrplan 30, B4; Entscheidungen R-1, R-2)

   Zeigt "3 dafür · 1 dagegen" und lässt fremde Rezepte in Prüfung mit Daumen hoch
   oder runter bewerten und die Wahl ändern (ein Daumen wird geändert, nicht
   entfernt). Daumen sind nur eine Meinung für den Admin — der Hinweis sagt das.
   Bedienung wie bei den Sternen: Knöpfe in einer Gruppe mit Klartext-Namen und
   aria-pressed, per Tab und Leertaste/Enter erreichbar.

   Farbe = Bedeutung: der Akzent markiert nur die eigene Wahl; die Zahlen der
   anderen sind Text in Grau. Das eigene Rezept und entschiedene Rezepte bieten
   keine Daumen an (die Datenbank lehnt sie ohnehin ab). Wer wie abgestimmt hat,
   zeigt diese Oberfläche nie — nur Zahlen.
   ============================================================ */

import { useRef, useState, type CSSProperties } from "react";
import { useAuthUserId } from "../../api/hooks/useSession";
import { useMyVotes, useVoteRecipe } from "../../api/hooks/useRecipeVotes";
import type { Recipe, RecipeVote } from "../../api/types";
import { VOTE_DOWN, VOTE_UP, canVoteRecipe, formatVoteCounts } from "../../core/recipe-votes.js";
import { META_STYLE, TAP_BUTTON_STYLE } from "./nutrition-styles";

const SECTION_LABEL_STYLE: CSSProperties = {
  margin: "14px 0 6px",
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  fontWeight: 600,
  color: "var(--ink-2)",
};
const SUMMARY_STYLE: CSSProperties = { margin: "0 0 6px", fontSize: ".9rem", lineHeight: 1.5, color: "var(--ink)" };
const GROUP_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 };
const HINT_STYLE: CSSProperties = { ...META_STYLE, margin: "6px 0 0" };

const CHOICES: ReadonlyArray<{ value: RecipeVote; label: string; symbol: string }> = [
  { value: VOTE_UP, label: "Daumen hoch", symbol: "👍" },
  { value: VOTE_DOWN, label: "Daumen runter", symbol: "👎" },
];

function choiceStyle(selected: boolean): CSSProperties {
  // Akzent = "das ist deine Wahl"; ungewählt neutral
  return selected
    ? { ...TAP_BUTTON_STYLE, border: "1px solid var(--accent)", background: "var(--accent)", color: "#17110a" }
    : TAP_BUTTON_STYLE;
}

export function RecipeVotes({ recipe }: { recipe: Recipe }) {
  const userId = useAuthUserId();
  const { mine, isError: mineFailed } = useMyVotes();
  const { vote } = useVoteRecipe();
  const [failed, setFailed] = useState(false);
  // Doppelklicks abfangen, ohne die Knöpfe zu sperren: ein gesperrter Knopf verliert
  // den Fokus, und Tastaturnutzer landen auf der Seite statt im Blatt.
  const busy = useRef(false);

  const own = mine.get(recipe.id) ?? null;
  const canVote = canVoteRecipe(recipe, userId);
  const isOwnRecipe = !!userId && recipe.submittedBy === userId;

  async function onPick(value: RecipeVote) {
    if (busy.current) return;
    busy.current = true;
    setFailed(false);
    try {
      const result = await vote(recipe.id, value);
      if (!result.ok) setFailed(true);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div>
      <p style={SECTION_LABEL_STYLE}>Daumen</p>
      <p style={SUMMARY_STYLE}>{formatVoteCounts(recipe.voteUp, recipe.voteDown)}</p>

      {canVote && (
        <>
          <div role="group" aria-label="Dein Daumen" style={GROUP_STYLE}>
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={own === c.value}
                style={choiceStyle(own === c.value)}
                onClick={() => void onPick(c.value)}
              >
                <span aria-hidden="true">{c.symbol} </span>
                {c.label}
              </button>
            ))}
          </div>
          <p style={HINT_STYLE}>
            {own === null
              ? "Dein Daumen ist nur eine Meinung für den Admin. Er entscheidet allein."
              : `Dein Daumen: ${own === VOTE_UP ? "hoch" : "runter"}. Du kannst ihn jederzeit ändern. Er ist nur eine Meinung für den Admin.`}
          </p>
        </>
      )}

      {isOwnRecipe && <p style={HINT_STYLE}>Auf dein eigenes Rezept kannst du keinen Daumen geben.</p>}

      {canVote && mineFailed && (
        <p role="status" style={HINT_STYLE}>
          Dein bisheriger Daumen konnte nicht geladen werden. Neue Daumen speichern trotzdem.
        </p>
      )}

      {failed && (
        <p role="alert" style={{ ...HINT_STYLE, color: "var(--danger)" }}>
          Der Daumen konnte nicht gespeichert werden. Bitte versuche es noch einmal.
        </p>
      )}
    </div>
  );
}
