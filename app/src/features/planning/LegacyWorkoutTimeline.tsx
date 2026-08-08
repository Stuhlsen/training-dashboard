import { legacyWorkoutSegments, type LegacySegment } from "./planning-view-model";

const SEGMENT_BASE_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: ".62rem",
  fontWeight: 600,
  color: "var(--ink)",
  whiteSpace: "nowrap",
  overflow: "hidden",
};

function segmentStyle(segment: LegacySegment, accentColor: string): React.CSSProperties {
  const background =
    segment.type === "interval" ? `color-mix(in oklab, ${accentColor} 80%, transparent)` : "rgba(255,255,255,.06)";
  return { ...SEGMENT_BASE_STYLE, width: `${segment.widthPct}%`, background };
}

/** Segmentbalken für das alte, dialogfreie Workout-Zahlenformat (warmup/
 *  intervals/duration/rest/cooldown/pct|watts) — Port von ui/planned.js::
 *  _renderCard Z. 893-926. `null`-Render bei fehlendem/neuem Format (die
 *  Blockform rendert PlanCard bereits separat über `asWorkoutBlocks()`). */
export function LegacyWorkoutTimeline({ workout, accentColor }: { workout: unknown; accentColor: string }) {
  const timeline = legacyWorkoutSegments(workout);
  if (!timeline) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {timeline.label && (
        <span style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>🏋 {timeline.label}</span>
      )}
      <div style={{ display: "flex", height: 26, borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
        {timeline.segments.map((segment, i) => (
          <div key={i} title={segment.title} style={segmentStyle(segment, accentColor)}>
            {segment.label}
          </div>
        ))}
      </div>
      <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{timeline.summary}</span>
      {timeline.wattsLine && <span style={{ fontSize: ".76rem", color: "var(--ink-2)" }}>{timeline.wattsLine}</span>}
    </div>
  );
}
