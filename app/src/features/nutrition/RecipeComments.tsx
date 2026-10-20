/* ============================================================
   FEATURES/NUTRITION/RECIPECOMMENTS.TSX — Kommentare im Blatt eines Rezepts
   (Fahrplan 30, B5; Entscheidungen K-1 bis K-4)

   Eine Komponente für beide Orte: das Detailblatt freigegebener Rezepte und die
   Prüfansicht für Rezepte in Prüfung. Zeigt die Kommentare mit den meisten Daumen
   zuerst, lässt angemeldete Athleten schreiben, fremde Kommentare mit Daumen hoch
   oder runter bewerten und den eigenen (der Admin jeden) löschen.

   Kommentare sind Nutzertext: jeder Text wird als Text-Knoten gerendert (React
   escaped ihn), nie als HTML. Angezeigt wird das Pseudonym, nie ein echter Name.
   Wer noch kein eigenes Pseudonym gesetzt hat, bekommt statt des Felds einen
   Hinweis mit Link zu den Einstellungen.

   Farbe = Bedeutung: der Akzent markiert nur den eigenen Daumen; Löschen ist
   Gefahr-rot erst in der Rückfrage. Bedienung per Tastatur: Knöpfe mit
   Klartext-Namen und aria-pressed.
   ============================================================ */

import { useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuthUserId, useIsAdmin } from "../../api/hooks/useSession";
import {
  useAddComment,
  useCanComment,
  useDeleteComment,
  useRecipeComments,
  useVoteComment,
} from "../../api/hooks/useRecipeComments";
import type { Recipe, RecipeComment, RecipeVote } from "../../api/types";
import {
  COMMENT_MAX_CHARS,
  canDeleteComment,
  canVoteComment,
  formatCommentDate,
  remainingChars,
} from "../../core/recipe-comments.js";
import { VOTE_DOWN, VOTE_UP, formatVoteCounts } from "../../core/recipe-votes.js";
import {
  FIELD_ERROR_STYLE,
  FIELD_STYLE,
  LABEL_STYLE,
  META_STYLE,
  PRIMARY_BUTTON_DISABLED_STYLE,
  PRIMARY_BUTTON_STYLE,
  TAP_BUTTON_STYLE,
} from "./nutrition-styles";

const SECTION_LABEL_STYLE: CSSProperties = {
  margin: "14px 0 6px",
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  fontWeight: 600,
  color: "var(--ink-2)",
};
const LIST_STYLE: CSSProperties = { listStyle: "none", margin: "0 0 12px", padding: 0 };
const ITEM_STYLE: CSSProperties = { padding: "10px 0", borderTop: "1px solid var(--hair)" };
const AUTHOR_STYLE: CSSProperties = { fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".85rem" };
const BODY_STYLE: CSSProperties = {
  margin: "4px 0 6px",
  fontSize: ".9rem",
  lineHeight: 1.5,
  color: "var(--ink)",
  // Zeilenumbrüche des Schreibers bleiben, lange Wörter sprengen das Blatt nicht
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};
const ROW_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 };
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

const DANGER_BUTTON_STYLE: CSSProperties = {
  ...TAP_BUTTON_STYLE,
  border: "1px solid var(--danger)",
  color: "var(--danger)",
};

interface ItemProps {
  comment: RecipeComment;
  userId: string | null;
  isAdmin: boolean;
  onVote: (comment: RecipeComment, value: RecipeVote) => Promise<boolean>;
  onRemove: (comment: RecipeComment) => Promise<boolean>;
}

function CommentItem({ comment, userId, isAdmin, onVote, onRemove }: ItemProps) {
  const [confirming, setConfirming] = useState(false);
  const canVote = canVoteComment(comment, userId);
  const canRemove = canDeleteComment(comment, isAdmin);

  return (
    <li style={ITEM_STYLE}>
      <div>
        <span style={AUTHOR_STYLE}>{comment.authorName}</span>
        {comment.isMine && <span style={META_STYLE}> · du</span>}
        <span style={META_STYLE}> · {formatCommentDate(comment.createdAt)}</span>
      </div>
      <p style={BODY_STYLE}>{comment.body}</p>
      <p style={{ ...META_STYLE, margin: "0 0 6px" }}>{formatVoteCounts(comment.up, comment.down)}</p>

      <div style={ROW_STYLE}>
        {canVote && (
          <div role="group" aria-label={`Dein Daumen für den Kommentar von ${comment.authorName}`} style={ROW_STYLE}>
            {CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={comment.myVote === c.value}
                style={choiceStyle(comment.myVote === c.value)}
                onClick={() => void onVote(comment, c.value)}
              >
                <span aria-hidden="true">{c.symbol} </span>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {canRemove && !confirming && (
          <button
            type="button"
            style={TAP_BUTTON_STYLE}
            aria-label={`Kommentar von ${comment.authorName} löschen`}
            onClick={() => setConfirming(true)}
          >
            Löschen
          </button>
        )}
        {canRemove && confirming && (
          <>
            <button
              type="button"
              style={DANGER_BUTTON_STYLE}
              onClick={async () => {
                const ok = await onRemove(comment);
                if (!ok) setConfirming(false);
              }}
            >
              Ja, löschen
            </button>
            <button type="button" style={TAP_BUTTON_STYLE} onClick={() => setConfirming(false)}>
              Abbrechen
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function Composer({ recipeId }: { recipeId: string }) {
  const { loaded, canComment } = useCanComment();
  const { add, isPending } = useAddComment(recipeId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  // Profil lädt noch: weder Feld noch Hinweis, sonst blinkt der Hinweis kurz auf
  if (!loaded) return null;

  if (!canComment) {
    return (
      <p style={HINT_STYLE}>
        Um zu kommentieren, wähle zuerst deinen Anzeigenamen in den <Link to="/app/settings">Einstellungen</Link>. Nimm
        ein Pseudonym, keinen echten Namen: es steht neben jedem deiner Kommentare.
      </p>
    );
  }

  const left = remainingChars(text);
  const tooLong = left < 0;
  const blank = text.trim().length === 0;

  async function onSubmit() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const result = await add(text);
      if (result.ok) {
        setText("");
      } else {
        setError(
          result.error.code === "SCHEMA"
            ? result.error.message
            : "Der Kommentar konnte nicht gespeichert werden. Bitte versuche es noch einmal.",
        );
      }
    } finally {
      busy.current = false;
    }
  }

  const disabled = isPending || blank || tooLong;
  return (
    <div>
      <label htmlFor={`comment-${recipeId}`} style={LABEL_STYLE}>
        Dein Kommentar
      </label>
      <textarea
        id={`comment-${recipeId}`}
        value={text}
        rows={3}
        aria-describedby={`comment-count-${recipeId}`}
        style={{ ...FIELD_STYLE, width: "100%", boxSizing: "border-box", resize: "vertical" }}
        onChange={(e) => setText(e.target.value)}
      />
      <p id={`comment-count-${recipeId}`} style={tooLong ? FIELD_ERROR_STYLE : HINT_STYLE}>
        {tooLong
          ? `${-left} Zeichen zu viel (höchstens ${COMMENT_MAX_CHARS}).`
          : `Noch ${left} von ${COMMENT_MAX_CHARS} Zeichen. Nur Text.`}
      </p>
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          style={disabled ? PRIMARY_BUTTON_DISABLED_STYLE : PRIMARY_BUTTON_STYLE}
          disabled={disabled}
          onClick={() => void onSubmit()}
        >
          Kommentar senden
        </button>
      </div>
      {error && (
        <p role="alert" style={FIELD_ERROR_STYLE}>
          {error}
        </p>
      )}
    </div>
  );
}

export function RecipeComments({ recipe }: { recipe: Recipe }) {
  const userId = useAuthUserId();
  const isAdmin = useIsAdmin();
  const { comments, isLoading, isError, refetch } = useRecipeComments(recipe.id);
  const { vote } = useVoteComment(recipe.id);
  const { remove } = useDeleteComment(recipe.id);
  const [failed, setFailed] = useState<string | null>(null);

  // Abgelehnte Rezepte zeigen und nehmen keine Kommentare (die Datenbank blendet sie aus)
  if (recipe.status === "rejected") return null;

  async function onVote(comment: RecipeComment, value: RecipeVote): Promise<boolean> {
    setFailed(null);
    const result = await vote(comment, value);
    if (!result.ok) setFailed("Der Daumen konnte nicht gespeichert werden. Bitte versuche es noch einmal.");
    return result.ok;
  }

  async function onRemove(comment: RecipeComment): Promise<boolean> {
    setFailed(null);
    const result = await remove(comment);
    if (!result.ok) setFailed("Der Kommentar konnte nicht gelöscht werden. Bitte versuche es noch einmal.");
    return result.ok;
  }

  return (
    <section aria-label="Kommentare">
      <p style={SECTION_LABEL_STYLE}>Kommentare</p>

      {isLoading && <p style={HINT_STYLE}>Lade Kommentare …</p>}

      {isError && (
        <p role="alert" style={FIELD_ERROR_STYLE}>
          Die Kommentare konnten nicht geladen werden.{" "}
          <button type="button" style={TAP_BUTTON_STYLE} onClick={() => void refetch()}>
            Noch einmal laden
          </button>
        </p>
      )}

      {!isLoading && !isError && comments.length === 0 && (
        <p style={HINT_STYLE}>Noch keine Kommentare. Sei die erste Person.</p>
      )}

      {comments.length > 0 && (
        <ul style={LIST_STYLE}>
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} userId={userId} isAdmin={isAdmin} onVote={onVote} onRemove={onRemove} />
          ))}
        </ul>
      )}

      {failed && (
        <p role="alert" style={FIELD_ERROR_STYLE}>
          {failed}
        </p>
      )}

      <Composer recipeId={recipe.id} />
    </section>
  );
}
