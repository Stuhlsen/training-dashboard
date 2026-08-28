import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GlassCard } from "../../components/GlassCard";
import { phaseColor } from "../../config";
import { fmtDate } from "../../core/format.js";
import { canDragCard, isDropAllowed } from "../../core/plan-drag.js";
import { weekDisplayLabels } from "../../core/week-labels.js";
import { typeColor, typeIcon } from "./planning-view-model";
import { DAY_STATUS_COLOR_TOKEN, DAY_STATUS_GLYPH, DAY_STATUS_LABEL, type GridDayCell, type GridWeekRow } from "./week-grid-view-model";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CELL_MIN_WIDTH = 104;

export interface WeekGridProps {
  weeks: GridWeekRow[];
  today: string;
  canEdit: boolean;
  trainerProposalMode: boolean;
  /** 13c liefert WeekGridDetailRow als eigentlichen Inhalt — hier nur ein
   *  Einhänge-Slot, damit 13b/13c parallel entwickelbar bleiben (s.
   *  Etappe-13-Plan, Fenster 13c "kann parallel zu 13b laufen"). 13f
   *  verdrahtet PlanningPage.tsx und reicht WeekGridDetailRow hier durch. */
  renderDetail?: (cell: GridDayCell, week: GridWeekRow) => React.ReactNode;
}

/** Mo–So-Raster des Planungstabs (Etappe 13b, Redesign nach "Planungstab
 *  Live"-Mockup) — ersetzt den `sections.weeks.map(...)`-Kartenlisten-Block
 *  UND die separate, nur während eines aktiven Drags eingeblendete
 *  DaySlotRow: jede Tageszelle ist hier dauerhaft zugleich Drag-Quelle (bei
 *  vorhandener, ziehbarer Karte) und Drop-Ziel (bei erlaubtem Zieltag). Die
 *  DndContext/Sensoren/onDragEnd-Verdrahtung selbst bleibt unverändert in
 *  PlanningPage.tsx (13f) — dieses Modul liefert nur die Knoten, an denen
 *  dnd-kit greift, mit denselben IDs wie bisher (Karten-ID zum Ziehen,
 *  ISO-Datum zum Ablegen). */
export function WeekGrid({ weeks, today, canEdit, trainerProposalMode, renderDetail }: WeekGridProps) {
  // Ein offenes Datum je Wochenzeile (weekKey -> date|null) — mehrere
  // Wochen dürfen gleichzeitig eine eigene aufgeklappte Detailzeile haben,
  // je Woche aber immer nur eine (13b-Plan).
  const [openByWeek, setOpenByWeek] = useState<Record<string, string | null>>({});

  function toggle(weekKey: string, date: string) {
    setOpenByWeek((prev) => ({ ...prev, [weekKey]: prev[weekKey] === date ? null : date }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {weeks.map((week) => {
        const openDate = openByWeek[week.weekKey] ?? null;
        const openCell = openDate ? (week.days.find((d) => d.date === openDate) ?? null) : null;
        const detail = openCell ? renderDetail?.(openCell, week) : null;
        return (
          <div key={week.weekKey} data-week={week.weekKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <WeekHeader week={week} />
            <div style={{ overflowX: "auto" }}>
              <GlassCard
                variant="soft"
                radius="var(--radius)"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(7, minmax(${CELL_MIN_WIDTH}px, 1fr))`,
                  gap: 6,
                  minWidth: 7 * CELL_MIN_WIDTH,
                  padding: 6,
                }}
              >
                {week.days.map((cell) => (
                  <DayCell
                    key={cell.date}
                    cell={cell}
                    today={today}
                    canEdit={canEdit}
                    trainerProposalMode={trainerProposalMode}
                    isOpen={cell.date === openDate}
                    onToggle={() => toggle(week.weekKey, cell.date)}
                  />
                ))}
              </GlassCard>
            </div>
            {detail && (
              // radius="var(--radius-sm)" passend zum eigenen Rand von
              // WeekGridDetailRow.tsx (dieselbe Box, sonst mismatchte Ecken).
              <GlassCard variant="soft" radius="var(--radius-sm)">
                {detail}
              </GlassCard>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeekHeader({ week }: { week: GridWeekRow }) {
  const color = phaseColor(week.phase);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-label)",
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: "var(--pill)",
          background: `${color}22`,
          color,
          boxShadow: `inset 0 0 0 1px ${color}44`,
        }}
      >
        {weekDisplayLabels([week.weekKey])[0]}
      </span>
      {week.phase && <span style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{week.phase}</span>}
      {week.isRecoveryWeek && (
        <span style={{ fontSize: ".78rem", color: "var(--accent)" }} title="Erholungswoche (aus den Plankarten erkannt)">
          🌙 Erholungswoche
        </span>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${week.loadPct}%`, background: "var(--ss)" }} />
        </div>
        <span
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-label)", color: "var(--ink-3)" }}
          title={week.tssIsPlanned ? "Geplante TSS (noch keine Fahrten diese Woche)" : "Tatsächlich gefahrene TSS"}
        >
          {Math.round(week.tssSum)} TSS{week.tssIsPlanned ? " (geplant)" : ""}
        </span>
      </div>
    </div>
  );
}

interface DayCellProps {
  cell: GridDayCell;
  today: string;
  canEdit: boolean;
  trainerProposalMode: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

function DayCell({ cell, today, canEdit, trainerProposalMode, isOpen, onToggle }: DayCellProps) {
  const hasCard = !!cell.card;
  // Nur wirklich anstehende, nicht ausgefallene Karten sind Drag-Quelle.
  // canDragCard() prüft nur Datum/Bearbeitungsrecht/Vorschlagsmodus, nicht
  // den Kartenstatus selbst — im Raster erscheinen (anders als bisher in
  // der Karten-Liste) auch vergangene/ausgefallene Tage, deshalb hier
  // zusätzlich explizit auf "open"/"today" eingegrenzt (13b-Plan: "Drag auf
  // vergangene/ausgefallene Zellen deaktiviert").
  const dragEnabled =
    hasCard &&
    (cell.status === "open" || cell.status === "today") &&
    canDragCard({ canEdit, cardDate: cell.date, today, trainerProposalMode });
  const dropEnabled = isDropAllowed(cell.date, today);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: cell.card?.id ?? `empty-${cell.date}`,
    disabled: !dragEnabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cell.date,
    disabled: !dropEnabled,
  });

  function setNodeRef(node: HTMLDivElement | null) {
    setDragRef(node);
    setDropRef(node);
  }

  const statusColor = DAY_STATUS_COLOR_TOKEN[cell.status];
  const weekdayLabel = WEEKDAY_LABELS[(new Date(cell.date).getDay() + 6) % 7];
  const accent = cell.card ? typeColor(cell.card.typ) : undefined;
  const dropActive = isOver && dropEnabled;
  // Longhand statt border-Shorthand + borderLeft gemischt: React warnt beim
  // Rerender vor genau dieser Kombination ("conflicting property"), weil die
  // Anwendungsreihenfolge der beiden Style-Keys nicht garantiert ist.
  const borderRule = `1px ${isDragging ? "dashed" : "solid"} ${dropActive ? "var(--ss)" : isOpen ? statusColor : "var(--hair)"}`;
  const borderLeftRule = accent ? `3px solid ${accent}` : borderRule;
  const statusLabel = DAY_STATUS_LABEL[cell.status];
  // Eigene role/tabIndex statt blind `attributes` zu uebernehmen: dnd-kit
  // setzt darin `aria-disabled` auf den `disabled`-Wert von useDraggable
  // (hier `!dragEnabled`) — das ist bei Tages-Karten, die nur nicht ziehbar
  // (z. B. vergangen/erledigt) aber weiterhin per Klick/Enter aufklappbar
  // sind, fachlich falsch: Screenreader meldeten die Zelle faelschlich als
  // deaktiviert, obwohl onClick/onKeyDown unten unveraendert aktiv bleiben.
  // Nur die klickbare Karten-Zelle bekommt `role="button"` und damit einen
  // vorgelesenen `aria-label`. Die nicht-interaktive Ruhetag-/Leer-Zelle trägt
  // ihre Bedeutung über den sichtbaren Text ("Ruhetag" unten) — ein
  // `aria-label` auf einem rollenlosen <div> würde von Screenreadern ohnehin
  // ignoriert.
  const cellAriaLabel = hasCard
    ? `${weekdayLabel} ${fmtDate(cell.date)}, ${cell.card?.name ?? ""}${statusLabel ? `, ${statusLabel}` : ""}`
    : undefined;

  return (
    <div
      ref={setNodeRef}
      data-grid-cell-date={cell.date}
      data-status={cell.status}
      data-drop-allowed={dropEnabled}
      data-drag-enabled={dragEnabled}
      {...(dragEnabled ? attributes : hasCard ? { role: "button" as const, tabIndex: 0 } : undefined)}
      {...(dragEnabled ? listeners : undefined)}
      aria-label={cellAriaLabel}
      onClick={hasCard ? onToggle : undefined}
      onKeyDown={
        hasCard
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 64,
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        borderTop: borderRule,
        borderRight: borderRule,
        borderBottom: borderRule,
        borderLeft: borderLeftRule,
        background: dropActive ? "rgba(224,138,60,.12)" : cell.isToday ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)",
        opacity: isDragging ? 0.4 : cell.status === "cancelled" ? 0.55 : 1,
        cursor: hasCard ? (dragEnabled ? "grab" : "pointer") : "default",
        touchAction: dragEnabled ? "none" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>
          {weekdayLabel} {fmtDate(cell.date)}
        </span>
        {DAY_STATUS_GLYPH[cell.status] && (
          <span aria-hidden="true" style={{ fontSize: ".72rem", color: statusColor }}>
            {DAY_STATUS_GLYPH[cell.status]}
          </span>
        )}
      </div>
      {cell.card && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <span aria-hidden="true">{typeIcon(cell.card.typ)}</span>
          <span
            style={{
              fontSize: ".78rem",
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cell.card.name}
          </span>
        </div>
      )}
      {/* Abgeleiteter Ruhetag (Fahrplan 6 RUH4): keine Karte, aber laut Plan-
          Wochen-Modell ein Ruhe-Slot — sichtbar als frei kennzeichnen statt
          die Zelle leer zu lassen. */}
      {!cell.card && cell.status === "rest" && (
        <span style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>Ruhetag</span>
      )}
      {cell.otherCards.length > 0 && (
        <span style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>+{cell.otherCards.length}</span>
      )}
    </div>
  );
}
