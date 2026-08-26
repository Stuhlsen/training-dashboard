/* ============================================================
   FEATURES/SETTINGS/INTERVALSSECTION.TSX — intervals.icu API-Key +
   Athlete-ID (athletengated, Migration 0019). Ersetzt das frühere
   localStorage/window.prompt()-Muster (Wahoo-Push in
   WeekGridDetailRow.tsx) — beide nutzen jetzt diese Werte, statt den Key
   an zwei Stellen zu pflegen. Formular-Muster wie GoalsSection.tsx.
   ============================================================ */

import { useState } from "react";
import { useIntervalsCredentials, useUpdateIntervalsCredentials } from "../../api/hooks/useIntervalsCredentials";
import { SavedCheck } from "./SavedCheck";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, HEADING_STYLE, ERROR_STYLE } from "./section-styles";

export function IntervalsSection() {
  const { credentials } = useIntervalsCredentials();
  const { update, isPending } = useUpdateIntervalsCredentials();

  const [apiKey, setApiKey] = useState("");
  const [athleteId, setAthleteId] = useState(credentials?.athleteId ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Athlete-ID nachziehen, sobald sie (asynchron) eintrifft — der Key
  // selbst wird nie zurück ins Feld geschrieben (kein Klartext-Echo eines
  // bereits gespeicherten Secrets).
  if (credentials && athleteId === "" && credentials.athleteId) {
    setAthleteId(credentials.athleteId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmedKey = apiKey.trim();
    const trimmedAthleteId = athleteId.trim();
    if (!trimmedAthleteId || (!trimmedKey && !credentials)) {
      setError("API-Key und Athlete-ID werden benötigt.");
      return;
    }
    const result = await update({
      apiKey: trimmedKey || credentials!.apiKey,
      athleteId: trimmedAthleteId,
    });
    if (!result.ok) {
      setError(result.error?.message || "Konnte nicht gespeichert werden.");
      return;
    }
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div style={SECTION_STYLE}>
      <div style={HEADING_STYLE}>intervals.icu</div>
      <p style={{ fontSize: ".72rem", color: "var(--ink-3)", margin: "0 0 12px" }}>
        Für Wahoo-Push und den Rausch-Chart in "Absolviert". Zu finden unter intervals.icu → Settings → Developer.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={LABEL_STYLE}>
          API-Key {credentials && "(hinterlegt — leer lassen, um ihn zu behalten)"}
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={credentials ? "••••••••" : ""}
            style={INPUT_STYLE}
          />
        </label>
        <label style={LABEL_STYLE}>
          Athlete-ID (z. B. i12345)
          <input type="text" value={athleteId} onChange={(e) => setAthleteId(e.target.value)} style={INPUT_STYLE} />
        </label>
        {error && <div style={ERROR_STYLE}>{error}</div>}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              alignSelf: "flex-start",
              padding: "9px 18px",
              borderRadius: "var(--pill)",
              border: "none",
              background: "var(--ss)",
              color: "#17110a",
              fontWeight: 600,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? "Speichern …" : "Speichern"}
          </button>
          {saved && <SavedCheck />}
        </span>
      </form>
    </div>
  );
}
