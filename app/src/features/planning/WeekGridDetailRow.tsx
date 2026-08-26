import { useState } from "react";
import { fmt, fmtDate } from "../../core/format.js";
import { cardImpact, conflictsForCard, restDayRiddenSignal } from "../../core/plan-feedback.js";
import { projectLoad } from "../../core/projection.js";
import { detectConflicts } from "../../core/conflicts.js";
import { EventBadge } from "../events/EventBadge";
import { HintChip, type HintItem } from "./HintChip";
import { LegacyWorkoutTimeline } from "./LegacyWorkoutTimeline";
import { RecoveryBlock } from "./RecoveryBlock";
import { WeatherBadge } from "./WeatherBadge";
import { Z2Block } from "./Z2Block";
import {
  asWorkoutBlocks,
  doneDatesOf,
  isRecoveryType,
  isRestDay,
  isZ2Type,
  legacyWorkoutSegments,
  typeColor,
  typeIcon,
  type DayForecast,
  type PlannedSessionRef,
} from "./planning-view-model";
import type { IntervalsCredentials, PlanCard as PlanCardT, Result } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;
type Projection = ReturnType<typeof projectLoad>;
type Conflict = ReturnType<typeof detectConflicts>[number];

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-label)",
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

export interface WeekGridDetailRowProps {
  card: PlanCardT;
  canEdit: boolean;
  /** Push bleibt athletenexklusiv, wie in PlanCard.tsx — Trainer sehen den
   *  Button nicht (canPush wird an der Aufrufstelle entsprechend gesetzt). */
  canPush?: boolean;
  onPush?: (id: string, token: string, athleteId: string) => Promise<Result>;
  /** intervals.icu-Zugangsdaten des eingeloggten Users (Settings,
   *  Migration 0019) — `null` ohne hinterlegte Werte. Ersetzt das frühere
   *  localStorage/window.prompt()-Muster. */
  intervalsCredentials?: IntervalsCredentials | null;
  trainerProposalMode?: boolean;
  /** Für `restDayRiddenSignal` — die Zelle selbst kennt nur den Status
   *  ("done"), nicht ob dieser done-Tag ein Ruhetag war, der trotzdem
   *  gefahren wurde. `doneDatesOf(rides)` reicht hier (dieselbe Ableitung
   *  wie in week-grid-view-model.ts), kein Ride-Match nötig. */
  rides: Ride[];
  conflicts: Conflict[];
  projection: Projection;
  ftp: number | undefined;
  forecast: Record<string, unknown>;
  wellness: WellnessDay[];
  plannedSessions: PlannedSessionRef[];
  onEdit: () => void;
  onMove: (id: string, date: string, reason?: string) => Promise<Result>;
  onCancel: (id: string, reason?: string) => Promise<Result>;
  onUndo: (id: string) => Promise<Result<{ card?: PlanCardT }>>;
}

type OpenForm = "move" | "cancel" | null;

/** Aufklappbare Tages-Detailzeile unter einer WeekGrid-Zelle (Etappe 13c,
 *  Redesign nach "Planungstab Live"-Mockup) — übernimmt 1:1 den bisherigen
 *  `!isDone`-Zweig aus PlanCard.tsx (Wirkungsanzeige, Konflikt-/Push-Hinweis,
 *  Wetter-Badge, Workout-Detailblöcke, Verschieben/Ausfallen/Push-Formulare).
 *  Die Compliance-Tabelle/DoneCompareBlock (bisheriger `isDone`-Zweig) bleibt
 *  bewusst außen vor — die lebt ab Etappe 13d/13e in der neuen
 *  "Absolviert"-Tabelle (DoneTable/DoneDetailChart), nicht hier. Kein
 *  Drag-Griff — Ziehen läuft ausschließlich über die Zelle selbst
 *  (WeekGrid.tsx), nicht über die aufgeklappte Detailzeile. */
export function WeekGridDetailRow({
  card,
  canEdit,
  canPush,
  onPush,
  intervalsCredentials,
  trainerProposalMode,
  rides,
  conflicts,
  projection,
  ftp,
  forecast,
  wellness,
  plannedSessions,
  onEdit,
  onMove,
  onCancel,
  onUndo,
}: WeekGridDetailRowProps) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [moveDate, setMoveDate] = useState(card.date);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  /** Token/Athlete-ID kommen aus den Settings (Migration 0019) statt aus
   *  localStorage/window.prompt() — fehlen sie, gibt es einen Hinweistext
   *  statt eines Blocker-Popups (kein Blocker-Dialog für eine optionale
   *  Aktion). */
  async function handlePush() {
    if (!onPush) return;
    if (!intervalsCredentials) {
      setPushResult({ ok: false, message: "intervals.icu-Key fehlt — in den Einstellungen eintragen." });
      return;
    }

    setPushing(true);
    setPushResult(null);
    const result = await onPush(card.id, intervalsCredentials.apiKey, intervalsCredentials.athleteId);
    setPushing(false);
    setPushResult(
      result.ok
        ? { ok: true, message: "✅ Gepusht!" }
        : { ok: false, message: "❌ " + (result.error?.message || "Fehler") },
    );
  }

  const color = typeColor(card.typ);
  const workoutBlocks = asWorkoutBlocks(card.workout);
  const riddenRestDayInfo = isRestDay(card) ? restDayRiddenSignal(card, doneDatesOf(rides).has(card.date)) : null;

  const hintItems: HintItem[] = conflictsForCard(conflicts, card.id).map((c: Conflict) => ({
    severity: c.severity,
    text: c.message,
  }));
  if (card.pushedExternalId) {
    hintItems.push({
      severity: "info",
      text: "📤 Bereits auf Wahoo gepusht — wird beim nächsten Push aktualisiert.",
    });
  }
  // cardImpact()s JSDoc-Parametertyp erwartet workout/workoutStructure als
  // Object|null (core/plan-feedback.js) — PlanCard.workout/workoutStructure
  // sind unknown (api/types.ts), daher derselbe schmale Adapter wie in
  // PlanCard.tsx/PlanningPage.tsx. `null` bei Karten außerhalb der
  // Projektion (vergangene/ausgefallene Tage) — dann rendert einfach nichts.
  const impact = cardImpact(
    {
      date: card.date,
      tssPlanned: card.tssPlanned,
      workout: card.workout as object | null,
      workoutStructure: card.workoutStructure as object | null,
      typ: card.typ,
    },
    projection,
    { ftp },
  );
  const dayForecast = forecast[card.date] as DayForecast | undefined;
  const hasLegacyTimeline = !!legacyWorkoutSegments(card.workout);

  return (
    <div
      data-plan-card-date={card.date}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 16px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(255,255,255,.025)",
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
            {canPush && card.workout != null && onPush && (
              <button type="button" style={ACTION_BTN_STYLE} disabled={pushing} onClick={() => void handlePush()}>
                {pushing ? "⏳ Wird gepusht…" : "📤 Auf Wahoo pushen"}
              </button>
            )}
            {pushResult && (
              <span style={{ fontSize: ".7rem", color: pushResult.ok ? "var(--z1)" : "var(--danger)" }}>
                {pushResult.message}
              </span>
            )}
            {card.cancelled || card.originalDate ? (
              <button type="button" style={ACTION_BTN_STYLE} disabled={submitting} onClick={() => void handleUndo()}>
                ↩ Rückgängig
              </button>
            ) : (
              <>
                <button
                  type="button"
                  style={ACTION_BTN_STYLE}
                  onClick={() => {
                    if (openForm === "move") {
                      setOpenForm(null);
                      return;
                    }
                    setMoveDate(card.date);
                    setOpenForm("move");
                  }}
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

      {hintItems.length > 0 && <HintChip items={hintItems} idSeed={card.id} />}
      {impact && <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{impact.label}</div>}

      {(card.km || card.tssPlanned) && (
        <div style={{ display: "flex", gap: 14, fontSize: ".76rem", color: "var(--ink-3)" }}>
          {card.km ? <span>{fmt(card.km, 0)} km</span> : null}
          {card.tssPlanned ? <span>{fmt(card.tssPlanned, 0)} TSS</span> : null}
        </div>
      )}

      {dayForecast && <WeatherBadge forecast={dayForecast} />}

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

      {!workoutBlocks && hasLegacyTimeline && <LegacyWorkoutTimeline workout={card.workout} accentColor={color} />}

      {!workoutBlocks && !hasLegacyTimeline && card.details && isZ2Type(card.typ) && card.km && (
        <Z2Block typ={card.typ} km={card.km} details={card.details} />
      )}

      {!workoutBlocks &&
        !hasLegacyTimeline &&
        card.details &&
        !(isZ2Type(card.typ) && card.km) &&
        isRecoveryType(card.typ) && (
          <RecoveryBlock
            typ={card.typ}
            date={card.date}
            details={card.details}
            wellness={wellness}
            plannedSessions={plannedSessions}
          />
        )}

      {!workoutBlocks &&
        !hasLegacyTimeline &&
        card.details &&
        !(isZ2Type(card.typ) && card.km) &&
        !isRecoveryType(card.typ) && <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{card.details}</div>}

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
            {submitting ? "Speichern …" : trainerProposalMode ? "Als Vorschlag speichern" : "Verschieben"}
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
            {submitting ? "Speichern …" : trainerProposalMode ? "Als Vorschlag speichern" : "Ausfallen"}
          </button>
          <button type="button" style={ACTION_BTN_STYLE} onClick={closeForms}>
            Abbrechen
          </button>
        </form>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: ".74rem" }}>{error}</div>}

      {riddenRestDayInfo && (
        <HintChip
          items={[{ severity: riddenRestDayInfo.severity, text: riddenRestDayInfo.message }]}
          idSeed={`${card.id}-rest`}
        />
      )}
    </div>
  );
}
