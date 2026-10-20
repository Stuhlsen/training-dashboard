/* ============================================================
   FEATURES/NUTRITION/RECIPEREVIEWPANEL.TSX — Entscheidung im Blatt (nur Admin)
   (Fahrplan 30, B4; Entscheidung R-2: der Admin entscheidet immer allein)

   "Freigeben" gibt das Rezept für alle frei. "Ablehnen" verlangt einen Grund
   (höchstens 500 Zeichen), den der Autor in "Meine Einreichungen" liest. Beides
   läuft über admin-api (Audit-Log, nur Rezepte in Prüfung). Das Panel selbst
   prüft keine Adminrechte — der Aufrufer zeigt es nur dem Admin, der Server
   prüft sie bei jedem Aufruf neu.

   Farbe = Bedeutung: Freigeben ist die eine Primäraktion, Ablehnen ist ein
   Gefahr-Rand (nicht umkehrbar für den Autor), Abbrechen bleibt neutral.
   ============================================================ */

import { useRef, useState, type CSSProperties } from "react";
import { REJECTION_REASON_MAX } from "../../api/admin-recipes";
import { useDecideRecipe } from "../../api/hooks/useRecipeReview";
import type { Recipe, ResultError } from "../../api/types";
import {
  FIELD_ERROR_STYLE,
  FIELD_STYLE,
  LABEL_STYLE,
  META_STYLE,
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
const ROW_STYLE: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 10 };
const HINT_STYLE: CSSProperties = { ...META_STYLE, margin: "6px 0 0" };
const REJECT_BUTTON_STYLE: CSSProperties = { ...TAP_BUTTON_STYLE, borderColor: "var(--danger)", color: "var(--danger)" };

export type Decision = "approved" | "rejected";

function decisionErrorText(error: ResultError): string {
  if (error.code === "NETWORK") return "Keine Verbindung zum Server. Bitte versuche es gleich noch einmal.";
  if (error.code === "TOKEN_INVALID") return "Du bist nicht angemeldet. Bitte melde dich neu an.";
  if (error.code === "NO_DATA") return "Dieses Rezept gibt es nicht mehr.";
  // HTTP/SCHEMA/Server-Meldungen sind schon verständlich ("Das Rezept ist nicht mehr in Prüfung")
  return error.message || "Die Entscheidung konnte nicht gespeichert werden.";
}

export function RecipeReviewPanel({
  recipe,
  onDecided,
}: {
  recipe: Recipe;
  onDecided: (decision: Decision) => void;
}) {
  const { approve, reject } = useDecideRecipe();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Doppelklicks abfangen, ohne die Knöpfe zu sperren (gesperrte Knöpfe verlieren den Fokus)
  const busy = useRef(false);

  async function run(action: () => ReturnType<typeof approve>, decision: Decision) {
    if (busy.current) return;
    busy.current = true;
    setProblem(null);
    try {
      const result = await action();
      if (result.ok) onDecided(decision);
      else setProblem(decisionErrorText(result.error));
    } finally {
      busy.current = false;
    }
  }

  const trimmed = reason.trim();
  const reasonMissing = trimmed.length === 0;

  return (
    <div>
      <p style={SECTION_LABEL_STYLE}>Prüfung</p>
      <p style={{ ...META_STYLE, margin: "0 0 10px" }}>
        Du entscheidest allein, die Daumen sind nur eine Meinung. Der Autor sieht deine Entscheidung in „Meine Einreichungen“.
      </p>

      {rejecting ? (
        <div role="group" aria-label={`Ablehnung von ${recipe.title}`}>
          <label htmlFor={`reject-reason-${recipe.id}`} style={LABEL_STYLE}>
            Grund der Ablehnung
          </label>
          <textarea
            id={`reject-reason-${recipe.id}`}
            rows={3}
            maxLength={REJECTION_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...FIELD_STYLE, width: "100%", resize: "vertical", boxSizing: "border-box" }}
            aria-describedby={`reject-reason-hint-${recipe.id}`}
          />
          <p id={`reject-reason-hint-${recipe.id}`} style={HINT_STYLE}>
            {reason.length} / {REJECTION_REASON_MAX} Zeichen · Der Autor liest den Grund.
          </p>
          {reasonMissing && reason.length > 0 && <p style={FIELD_ERROR_STYLE}>Bitte einen Grund angeben.</p>}
          <div style={{ ...ROW_STYLE, marginTop: 10 }}>
            <button
              type="button"
              style={REJECT_BUTTON_STYLE}
              disabled={reasonMissing}
              onClick={() => void run(() => reject(recipe.id, reason), "rejected")}
            >
              Ablehnen
            </button>
            <button
              type="button"
              style={TAP_BUTTON_STYLE}
              onClick={() => {
                setRejecting(false);
                setReason("");
                setProblem(null);
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div style={ROW_STYLE}>
          <button type="button" style={PRIMARY_BUTTON_STYLE} onClick={() => void run(() => approve(recipe.id), "approved")}>
            Freigeben
          </button>
          <button type="button" style={REJECT_BUTTON_STYLE} onClick={() => setRejecting(true)}>
            Ablehnen …
          </button>
        </div>
      )}

      {problem && (
        <p role="alert" style={{ ...HINT_STYLE, color: "var(--danger)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}
