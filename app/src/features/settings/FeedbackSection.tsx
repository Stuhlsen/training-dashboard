/* ============================================================
   FEATURES/SETTINGS/FEEDBACKSECTION.TSX — In-App-Feedback-Knopf
   (Fahrplan 15 E5, Muster InviteAthleteSection)

   Freitextfeld → „Absenden" → Insert in `feedback` (Migration 0001,
   is_approved=false). Kein anonymer Weg — athlete_id ist immer der
   eingeloggte User (useAuthUserId(), s. Kommentar dort: das richtige
   Gate für Schreibpfade, nicht das noch nachladende Profil).
   ============================================================ */

import { useState } from "react";
import { submitFeedback } from "../../api/supabase/feedback";
import { useAuthUserId } from "../../api/hooks/useSession";
import type { ResultError } from "../../api/types";
import { SECTION_STYLE, LABEL_STYLE, ERROR_STYLE } from "./section-styles";

const TEXTAREA_STYLE = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 11px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".85rem",
  width: "100%",
  minHeight: 90,
  resize: "vertical" as const,
};

const PRIMARY_BUTTON_STYLE = {
  alignSelf: "flex-start" as const,
  padding: "9px 18px",
  borderRadius: "var(--pill)",
  border: "none",
  background: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

const MAX_LENGTH = 1000;

function translateError(error: ResultError): string {
  switch (error.code) {
    case "NETWORK":
      return "Gerade nicht erreichbar — später erneut versuchen.";
    case "TOKEN_INVALID":
      return "Sitzung abgelaufen — bitte neu einloggen.";
    default:
      return error.message || "Absenden fehlgeschlagen.";
  }
}

export function FeedbackSection() {
  const athleteId = useAuthUserId();
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!athleteId) return;
    setIsPending(true);
    setError(null);
    setSent(false);
    const result = await submitFeedback(athleteId, message.trim());
    setIsPending(false);
    if (!result.ok) {
      setError(translateError(result.error));
      return;
    }
    setMessage("");
    setSent(true);
  }

  return (
    <div style={SECTION_STYLE}>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={LABEL_STYLE}>
          Feedback, Bug oder Idee
          <textarea
            required
            maxLength={MAX_LENGTH}
            value={message}
            disabled={isPending}
            onChange={(e) => {
              setMessage(e.target.value);
              setSent(false);
            }}
            style={TEXTAREA_STYLE}
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !message.trim()}
          style={{ ...PRIMARY_BUTTON_STYLE, cursor: isPending ? "default" : "pointer", opacity: isPending ? 0.7 : 1 }}
        >
          {isPending ? "Sendet …" : "Absenden"}
        </button>
      </form>

      {error && <p style={{ ...ERROR_STYLE, marginTop: 8 }}>{error}</p>}
      {sent && !error && (
        <p style={{ marginTop: 8, color: "var(--ink-3)", fontSize: ".78rem" }}>Danke — angekommen ✓</p>
      )}
    </div>
  );
}
