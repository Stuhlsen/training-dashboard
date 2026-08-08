import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { fmt, fmtDate } from "../../core/format.js";
import { cardImpact, conflictsForCard, restDayRiddenSignal } from "../../core/plan-feedback.js";
import { projectLoad } from "../../core/projection.js";
import { detectConflicts } from "../../core/conflicts.js";
import { EventBadge } from "../events/EventBadge";
import { ComplianceTable } from "./ComplianceTable";
import { HintChip, type HintItem } from "./HintChip";
import { LegacyWorkoutTimeline } from "./LegacyWorkoutTimeline";
import { RecoveryBlock } from "./RecoveryBlock";
import { WeatherBadge } from "./WeatherBadge";
import { Z2Block } from "./Z2Block";
import {
  asWorkoutBlocks,
  isRecoveryType,
  isRestDay,
  isZ2Type,
  legacyWorkoutSegments,
  typeColor,
  typeIcon,
  type DayForecast,
  type PlannedSessionRef,
} from "./planning-view-model";
import type { PlanCard as PlanCardT, Result } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;
type Projection = ReturnType<typeof projectLoad>;
type Conflict = ReturnType<typeof detectConflicts>[number];

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
  /** Steuert, ob das "Ruhetag gefahren"-Hinweisbadge geprüft wird UND ob die
   *  Compliance-Tabelle (statt Konflikt-Chip/Wirkungsanzeige/Wetter/Workout-
   *  Detailblöcken) gerendert wird — nur für Karten aus dem
   *  Absolviert-Abschnitt (spiegelt die Vanilla-Aufteilung `_renderCard`
   *  vs. `_renderDoneCard`, s. ui/planned.js). */
  isDone?: boolean;
  /** Nur von PlanningPage im Ausstehend-Zweig (`week.cards.map`) gesetzt —
   *  Vanillas `_renderCard` zeigt den Push-Button nie in Absolviert/
   *  Verpasst/Ausgefallen (eigene Render-Pfade dort, s. ui/planned.js
   *  Zeilen 684–728 vs. 1064). `onPush` fehlt konsequent überall sonst. */
  canPush?: boolean;
  onPush?: (id: string, token: string, athleteId: string) => Promise<Result>;
  /** Zeigt den Drag-Griff (nur die "Ausstehend"-Sektion setzt das über
   *  canDragCard() — dort ist die per-Wochenblock eingeblendete
   *  Tages-Slot-Zeile das einzige gültige Drop-Ziel, s. PlanningPage). */
  draggable?: boolean;
  /** Etappe 7a: Trainer im Vorschlagsmodus — Verschieben/Ausfallen erzeugen
   *  über onMove/onCancel einen `proposals`-Eintrag statt die Karte direkt
   *  zu ändern. Rein kosmetisch hier (Button-Beschriftung); die eigentliche
   *  Verzweigung sitzt in PlanningPage.tsx::handleMove/handleCancel. */
  trainerProposalMode?: boolean;
  /** Nur bei `isDone` gesetzt (Ride-Matching läuft in PlanningPage.tsx über
   *  matchRideForCard) — Grundlage der Compliance-Tabelle. */
  ride?: Ride | null;
  /** Vollständige Konfliktliste der Projektion (wie Vanillas
   *  `getPlanCardsState().conflicts`) — wird intern über `conflictsForCard`
   *  auf diese Karte gefiltert. Nur bei `!isDone` relevant. */
  conflicts: Conflict[];
  projection: Projection;
  ftp: number | undefined;
  forecast: Record<string, unknown>;
  wellness: WellnessDay[];
  plannedSessions: PlannedSessionRef[];
  onEdit: () => void;
  // Result statt Result<{card}> — im Vorschlagsmodus (Etappe 7a) liefert
  // PlanningPage.tsx::handleMove/handleCancel stattdessen Result<{proposal}>
  // (createTrainerProposal). Nur `.ok`/`.error` werden hier gelesen.
  onMove: (id: string, date: string, reason?: string) => Promise<Result>;
  onCancel: (id: string, reason?: string) => Promise<Result>;
  onUndo: (id: string) => Promise<Result<{ card?: PlanCardT }>>;
}

type OpenForm = "move" | "cancel" | null;

/** Eine Plankarte — ersetzt den Karten-Teil von ui/planned.js::render()
 *  (Etappe 6a: Grundgerüst; Etappe 6c: Wirkungsanzeige, Konflikt-/Hinweis-
 *  Chip, Wetter-Badge, Legacy-Segmentbalken, Z2/Recovery-Detailblöcke,
 *  Compliance-Tabelle). Verschieben/Ausfallen als eingeklapptes
 *  Inline-Formular statt Dialog, wie in Vanilla. */
export function PlanCard({
  card,
  canEdit,
  isDone,
  draggable,
  trainerProposalMode,
  ride,
  conflicts,
  projection,
  ftp,
  forecast,
  wellness,
  plannedSessions,
  canPush,
  onPush,
  onEdit,
  onMove,
  onCancel,
  onUndo,
}: PlanCardProps) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [moveDate, setMoveDate] = useState(card.date);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Getrennt von submitting/error (Verschieben/Ausfallen-Formulare) — der
  // Push-Status bleibt sichtbar stehen, auch wenn kein Formular offen ist
  // (spiegelt Vanillas eigenes #push-status-<id>-Element).
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; message: string } | null>(null);

  // useDraggable() unbedingt aufgerufen (Hook-Regel) — `disabled` steuert
  // die Wirkung, nicht ein bedingter Hook-Aufruf.
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: card.id,
    disabled: !draggable,
  });

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

  /** Token/Athlete-ID aus localStorage, sonst einmalig per prompt() abfragen
   *  und persistieren — 1:1 wie ui/planned.js::_handlePush (Etappe 6d). */
  async function handlePush() {
    if (!onPush) return;
    let token = localStorage.getItem("intervals_api_key");
    let intervalsAthleteId = localStorage.getItem("intervals_athlete_id");

    if (!token) {
      token = window.prompt("intervals.icu API Key eingeben:");
      if (!token) return;
      localStorage.setItem("intervals_api_key", token);
    }
    if (!intervalsAthleteId) {
      intervalsAthleteId = window.prompt("intervals.icu Athlete ID eingeben (z.B. i12345):");
      if (!intervalsAthleteId) return;
      localStorage.setItem("intervals_athlete_id", intervalsAthleteId);
    }

    setPushing(true);
    setPushResult(null);
    const result = await onPush(card.id, token, intervalsAthleteId);
    setPushing(false);
    setPushResult(
      result.ok
        ? { ok: true, message: "✅ Gepusht!" }
        : { ok: false, message: "❌ " + (result.error?.message || "Fehler") },
    );
  }

  const color = typeColor(card.typ);
  const workoutBlocks = asWorkoutBlocks(card.workout);
  const riddenRestDayInfo = isDone && isRestDay(card) ? restDayRiddenSignal(card, true) : null;

  // Etappe 6c: Konflikt-/Push-Hinweise, Wirkungsanzeige, Wetter-Badge und
  // die Workout-Detailblöcke (Legacy-Segmentbalken/Z2/Recovery/Freitext)
  // sind Vanillas `_renderCard` vorbehalten — `_renderDoneCard` zeigt
  // stattdessen nur die Compliance-Tabelle + den separaten Ruhetag-Chip
  // (unten, außerhalb der Karte).
  const hintItems: HintItem[] = !isDone
    ? conflictsForCard(conflicts, card.id).map((c: Conflict) => ({ severity: c.severity, text: c.message }))
    : [];
  if (!isDone && card.pushedExternalId) {
    hintItems.push({
      severity: "info",
      text: "📤 Bereits auf Wahoo gepusht — wird beim nächsten Push aktualisiert.",
    });
  }
  // cardImpact()s JSDoc-Parametertyp erwartet workout/workoutStructure als
  // Object|null (core/plan-feedback.js) — PlanCard.workout/workoutStructure
  // sind unknown (api/types.ts), daher derselbe schmale Adapter wie
  // toProjectionCard() in PlanningPage.tsx.
  const impact = !isDone
    ? cardImpact(
        {
          date: card.date,
          tssPlanned: card.tssPlanned,
          workout: card.workout as object | null,
          workoutStructure: card.workoutStructure as object | null,
          typ: card.typ,
        },
        projection,
        { ftp },
      )
    : null;
  const dayForecast = !isDone ? (forecast[card.date] as DayForecast | undefined) : undefined;
  const hasLegacyTimeline = !isDone && !!legacyWorkoutSegments(card.workout);

  return (
    <>
      <div
        ref={setNodeRef}
        data-plan-card-date={card.date}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "12px 14px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(255,255,255,.03)",
          border: `1px ${isDragging ? "dashed" : "solid"} var(--hair)`,
          opacity: isDragging ? 0.4 : 1,
        }}
      >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {draggable && (
          <span
            {...listeners}
            {...attributes}
            aria-hidden="true"
            title="Auf einen anderen Tag ziehen"
            style={{ cursor: "grab", color: "var(--ink-3)", touchAction: "none" }}
          >
            ⠿
          </span>
        )}
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
                    // moveDate wurde nur beim ersten Mount aus card.date
                    // initialisiert — eine Karte, die inzwischen per Drag
                    // (gleiche React-Instanz, gleiche card.id) verschoben
                    // wurde, zeigt beim Öffnen sonst noch das alte Datum.
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

      {!isDone && hintItems.length > 0 && <HintChip items={hintItems} idSeed={card.id} />}
      {!isDone && impact && (
        <div style={{ fontSize: ".76rem", color: "var(--ink-3)" }}>{impact.label}</div>
      )}

      {(card.km || card.tssPlanned) && (
        <div style={{ display: "flex", gap: 14, fontSize: ".76rem", color: "var(--ink-3)" }}>
          {card.km ? <span>{fmt(card.km, 0)} km</span> : null}
          {card.tssPlanned ? <span>{fmt(card.tssPlanned, 0)} TSS</span> : null}
        </div>
      )}

      {!isDone && dayForecast && <WeatherBadge forecast={dayForecast} />}

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

      {!isDone && !workoutBlocks && hasLegacyTimeline && (
        <LegacyWorkoutTimeline workout={card.workout} accentColor={color} />
      )}

      {!isDone && !workoutBlocks && !hasLegacyTimeline && card.details && isZ2Type(card.typ) && card.km && (
        <Z2Block typ={card.typ} km={card.km} details={card.details} />
      )}

      {!isDone && !workoutBlocks && !hasLegacyTimeline && card.details && !(isZ2Type(card.typ) && card.km) && isRecoveryType(card.typ) && (
        <RecoveryBlock
          typ={card.typ}
          date={card.date}
          details={card.details}
          wellness={wellness}
          plannedSessions={plannedSessions}
        />
      )}

      {!isDone &&
        !workoutBlocks &&
        !hasLegacyTimeline &&
        card.details &&
        !(isZ2Type(card.typ) && card.km) &&
        !isRecoveryType(card.typ) && <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{card.details}</div>}

      {isDone && <ComplianceTable ride={ride} cardId={card.id} workoutStructure={card.workoutStructure} />}

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
      </div>
      {riddenRestDayInfo && (
        <HintChip
          items={[{ severity: riddenRestDayInfo.severity, text: riddenRestDayInfo.message }]}
          idSeed={`${card.id}-rest`}
        />
      )}
    </>
  );
}
