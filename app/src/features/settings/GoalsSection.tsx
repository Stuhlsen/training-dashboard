/* ============================================================
   FEATURES/SETTINGS/GOALSSECTION.TSX — Ziele (athletengated), Port von
   ui/settings-panel.js::buildGoalsSection()
   ============================================================ */

import { useState } from "react";
import { useGoals, useSaveGoal, useDeactivateGoal } from "../../api/hooks/useGoals";
import { fmtDate } from "../../core/format.js";
import { SECTION_STYLE, LABEL_STYLE, INPUT_STYLE, LINK_BUTTON_STYLE, ERROR_STYLE } from "./section-styles";

function goalUnitLabel(kind: string): string {
  return kind === "ftp" || kind === "watt" ? "W" : "";
}

export function GoalsSection() {
  const { goals, isLoading } = useGoals();
  const { save, isPending } = useSaveGoal();
  const { deactivate } = useDeactivateGoal();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const result = await save({
      kind,
      targetValue: targetValue ? Number(targetValue) : null,
      targetDate: targetDate || null,
      note: note || null,
    });
    if (!result.ok) {
      setError("Ziel konnte nicht gespeichert werden.");
      return;
    }
    setKind("");
    setTargetValue("");
    setTargetDate("");
    setNote("");
    setOpen(false);
  }

  return (
    <div style={SECTION_STYLE}>
      {isLoading && <p style={{ color: "var(--ink-3)", fontSize: ".78rem", margin: "0 0 10px" }}>Lädt …</p>}

      {!isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {goals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              title="Klicken zum Deaktivieren"
              onClick={() => void deactivate(goal.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                padding: "6px 8px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                textAlign: "left",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".65rem", color: "var(--ink-3)" }}>
                {goal.kind}
                {goal.targetDate ? ` · ${fmtDate(goal.targetDate)}` : ""}
              </span>
              <span style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".8rem", color: "var(--ss)" }}>
                {goal.targetValue != null ? `${goal.targetValue}${goalUnitLabel(goal.kind)}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {!open && (
        <button type="button" onClick={() => setOpen(true)} style={LINK_BUTTON_STYLE}>
          + Ziel hinzufügen
        </button>
      )}

      {open && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
        >
          <label style={LABEL_STYLE}>
            Art (z. B. FTP)
            <input type="text" required value={kind} onChange={(e) => setKind(e.target.value)} style={INPUT_STYLE} />
          </label>
          <label style={LABEL_STYLE}>
            Zielwert
            <input
              type="number"
              step="any"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>
          <label style={LABEL_STYLE}>
            Zieldatum
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={INPUT_STYLE} />
          </label>
          <label style={LABEL_STYLE}>
            Notiz (optional)
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={INPUT_STYLE} />
          </label>
          {error && <div style={ERROR_STYLE}>{error}</div>}
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
        </form>
      )}
    </div>
  );
}
