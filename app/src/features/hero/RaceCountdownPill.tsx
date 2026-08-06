import { fmtDate } from "../../core/format.js";
import type { EventItem } from "../../api/types";

export interface RaceCountdown {
  event: EventItem;
  days: number;
  label: string;
}

/** Renn-Countdown-Chip — spiegelt die `.session-pill`-Optik aus
 *  assets/css/components.css (Punkt + Akzentfarbe), ersetzt
 *  countdownCard() aus assets/js/ui/event-timeline.js. Eigene, von der
 *  Hero-Session-Karte unabhängige Datenquelle (Events statt Plankarten) —
 *  wird IMMER zusätzlich angezeigt, nie anstelle der Session-Karte (Muster
 *  wie overview.js::_renderSessionPill). */
export function RaceCountdownPill({ countdown }: { countdown: RaceCountdown | null }) {
  if (!countdown) return null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        alignSelf: "flex-start",
        background: "color-mix(in oklab, var(--ss) 14%, transparent)",
        border: "1px solid color-mix(in oklab, var(--ss) 40%, transparent)",
        borderRadius: "var(--pill)",
        padding: "7px 16px",
        fontSize: ".8rem",
        color: "var(--ink-2)",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ss)", flexShrink: 0 }} />
      <span>
        {countdown.label} · <b style={{ color: "var(--ink)", fontWeight: 600 }}>{countdown.event.title}</b> ·{" "}
        {fmtDate(countdown.event.eventDate)}
      </span>
    </div>
  );
}
