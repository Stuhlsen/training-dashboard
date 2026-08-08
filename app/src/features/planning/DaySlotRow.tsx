import { useDroppable } from "@dnd-kit/core";
import { fmtDate } from "../../core/format.js";
import { daySlots } from "../../core/plan-drag.js";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "Mi 22.07." — wie ui/plan-drag.js::fmtDay, bewusst UI-lokal (reine
 *  Formatierung, kein Wiederverwendungsbedarf außerhalb dieser Zeile). */
function fmtDay(iso: string): string {
  return `${WEEKDAYS[new Date(iso).getDay()]} ${fmtDate(iso)}`;
}

interface DaySlotRowProps {
  /** ISO-Datum irgendeiner Karte der Woche — daySlots() leitet daraus die
   *  Mo–So-Spanne ab. */
  anchorDate: string;
  today: string;
}

/** Tages-Slot-Zeile unter einem Wochenblock — nur während eines aktiven
 *  Drags sichtbar (s. PlanningPage). Port von ui/plan-drag.js::showDaySlots
 *  als React-Komponente; die Tagesauswahl selbst kommt unverändert aus
 *  core/plan-drag.js::daySlots(). */
export function DaySlotRow({ anchorDate, today }: DaySlotRowProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 4 }}>
      {daySlots(anchorDate, today).map((slot: { date: string; allowed: boolean }) => (
        <DaySlot key={slot.date} date={slot.date} allowed={slot.allowed} />
      ))}
    </div>
  );
}

function DaySlot({ date, allowed }: { date: string; allowed: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: date, disabled: !allowed });
  const over = isOver && allowed;

  return (
    <div
      ref={setNodeRef}
      data-drop-date={allowed ? date : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        minHeight: 56,
        borderRadius: "var(--radius-sm)",
        border: `1px ${allowed ? "dashed" : "solid"} ${over ? "var(--ss)" : "var(--hair)"}`,
        background: over ? "rgba(224,138,60,.12)" : "rgba(255,255,255,.02)",
        opacity: allowed ? 1 : 0.35,
        fontFamily: "var(--font-mono)",
        fontSize: ".68rem",
        color: over ? "var(--ss)" : "var(--ink-3)",
      }}
    >
      <span>{fmtDay(date)}</span>
      <span>{allowed ? "ablegen" : "vorbei"}</span>
    </div>
  );
}
