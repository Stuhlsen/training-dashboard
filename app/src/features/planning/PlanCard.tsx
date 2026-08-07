import { useState } from "react";
import { fmt, fmtDate } from "../../core/format.js";
import { restDayRiddenSignal } from "../../core/plan-feedback.js";
import { EventBadge } from "../events/EventBadge";
import { asWorkoutBlocks, isRestDay, typeColor, typeIcon } from "./planning-view-model";
import type { PlanCard as PlanCardT, Result } from "../../api/types";

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontFamily: "var(--font-mono)",
  fontSize: ".64rem",
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--ink-3)",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm)",
  padding: "7px 9px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".84rem",
};

const ACTION_BTN_STYLE: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "var(--pill)",
  border: "1px solid var(--hair)",
  background: "transparent",
  color: "var(--ink-3)",
  fontSize: ".72rem",
  fontWeight: 600,
  cursor: "pointer",
};

interface PlanCardProps {
  card: PlanCardT;
  canEdit: boolean;
  /** Steuert, ob das "Ruhetag gefahren"-Hinweisbadge geprüft wird — nur
   *  relevant für Karten aus dem Absolviert-Abschnitt. */
  isDone?: boolean;
  onEdit: () => void;
  onMove: (id: string, date: string, reason?: string) => Promise<Result<{ card: PlanCardT }>>;
  onCancel: (id: string, reason?: string) => Promise<Result<{ card: PlanCardT }>>;
  onUndo: (id: string) => Promise<Result<{ card?: PlanCardT }>>;
}

type OpenForm = "move" | "cancel" | null;

/** Eine Plankarte — ersetzt den Karten-Teil von ui/planned.js::render()
 *  (Etappe 6a: nur Grundgerüst, ohne Wirkungsanzeige/Compliance-Tabelle/
 *  Wetter-Badge/Hinweis-Chip — s. Etappe-6a-Plan). Verschieben/Ausfallen als
 *  eingeklapptes Inline-Formular statt Dialog, wie in Vanilla. */
export function PlanCard({ card, canEdit, isDone, onEdit, onMove, onCancel, onUndo }: PlanCardProps) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [moveDate, setMoveDate] = useState(card.date);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function closeForms() {
    setOpenForm(null);
    setReason("");
    setError("");
  }

  async function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await onMove(card.id, moveDate, reason.trim() || undefined);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error?.message || "Verschieben fehlgeschlagen.");
      return;
    }
    closeForms();
  }

  async function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const result = await onCancel(card.id, reason.trim() || undefined);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error?.message || "Ausfallen fehlgeschlagen.");
      return;
    }
    closeForms();
  }

  async function handleUndo() {
    setSubmitting(true);
    setError("");
    const result = await onUndo(card.id);
    setSubmitting(false);
    if (!result.ok) setError(result.error?.message || "Rückgängig fehlgeschlagen.");
  }

  const color = typeColor(card.typ);
  const workoutBlocks = asWorkoutBlocks(card.workout);
  const riddenRestDayInfo = isDone && isRestDay(card) ? restDayRiddenSignal(card, true) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(255,255,255,.03)",
        border: "1px solid var(--hair)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".76rem", color: "var(--ink-3)", minWidth: 44 }}>
          {fmtDate(card.date)}
        </span>
        <span aria-hidden="true">{typeIcon(card.typ)}</span>
        <span style={{ fontSize: ".92rem", fontWeight: 500, color: "var(--ink)" }}>{card.name}</span>
        <EventBadge label={card.typ ?? "—"} color={color} />
        {card.originalDate && (
          <span style={{ fontSize: ".68rem", color: "var(--ink-3)" }}>
            verschoben von {fmtDate(card.originalDate)}
          </span>
        )}
        {card.cancelled && card.cancelReason && (
          <span style={{ fontSize: ".68rem", color: "var(--danger)" }}>Grund: {card.cancelReason}</span>
        )}
        {canEdit && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={ACTION_BTN_STYLE} onClick={onEdit}>
              Bearbeiten
            </button>
            {card.cancelled || card.originalDate ? (
              <button type="button" style={ACTION_BTN_STYLE} disabled={submitting} onClick={() => void handleUndo()}>
                ↩ Rückgängig
              </button>
            ) : (
              <>
                <button
                  type="button"
                  style={ACTION_BTN_STYLE}
                  onClick={() => setOpenForm(openForm === "move" ? null : "move")}
                >
                  Verschieben
                </button>
                <button
                  type="button"
                  style={ACTION_BTN_STYLE}
                  onClick={() => setOpenForm(openForm === "cancel" ? null : "cancel")}
                >
                  Ausfallen
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {(card.km || card.tssPlanned) && (
        <div style={{ display: "flex", gap: 14, fontSize: ".76rem", color: "var(--ink-3)" }}>
          {card.km ? <span>{fmt(card.km, 0)} km</span> : null}
          {card.tssPlanned ? <span>{fmt(card.tssPlanned, 0)} TSS</span> : null}
        </div>
      )}

      {card.details && <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{card.details}</div>}

      {riddenRestDayInfo && (
        <div style={{ fontSize: ".74rem", color: "var(--accent)" }}>ℹ️ {riddenRestDayInfo.message}</div>
      )}

      {workoutBlocks && workoutBlocks.blocks.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {workoutBlocks.blocks.map((b, i) => (
            <span
              key={i}
              style={{
                fontSize: ".72rem",
                color: "var(--ink-2)",
                background: "rgba(255,255,255,.04)",
                border: "1px solid var(--hair)",
                borderRadius: "var(--pill)",
                padding: "3px 10px",
              }}
            >
              {b.type === "warmup" ? "WU" : b.type === "cooldown" ? "CD" : "Intervall"}: {b.text}
            </span>
          ))}
        </div>
      )}

      {openForm === "move" && (
        <form
          onSubmit={(e) => void handleMoveSubmit(e)}
          style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 4 }}
        >
          <label style={LABEL_STYLE}>
            Neues Datum
            <input type="date" required value={moveDate} onChange={(e) => setMoveDate(e.target.value)} style={INPUT_STYLE} />
          </label>
          <label style={{ ...LABEL_STYLE, flex: 1, minWidth: 160 }}>
            Begründung (optional)
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={INPUT_STYLE} />
          </label>
          <button type="submit" disabled={submitting} style={{ ...ACTION_BTN_STYLE, background: "var(--ss)", color: "#17110a", border: "none" }}>
            {submitting ? "Speichern …" : "Verschieben"}
          </button>
          <button type="button" style={ACTION_BTN_STYLE} onClick={closeForms}>
            Abbrechen
          </button>
        </form>
      )}

      {openForm === "cancel" && (
        <form
          onSubmit={(e) => void handleCancelSubmit(e)}
          style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 4 }}
        >
          <label style={{ ...LABEL_STYLE, flex: 1, minWidth: 160 }}>
            Grund (optional)
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} style={INPUT_STYLE} />
          </label>
          <button type="submit" disabled={submitting} style={{ ...ACTION_BTN_STYLE, background: "var(--danger)", color: "#fff", border: "none" }}>
            {submitting ? "Speichern …" : "Ausfallen"}
          </button>
          <button type="button" style={ACTION_BTN_STYLE} onClick={closeForms}>
            Abbrechen
          </button>
        </form>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: ".74rem" }}>{error}</div>}
    </div>
  );
}
