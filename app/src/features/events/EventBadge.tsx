/** Kleine Farbmarke für Event-Typ/Priorität — von EventRow und EventForm
 *  gemeinsam genutzt (Muster wie assets/js/ui/event-timeline.js::badge()). */
export function EventBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: "var(--pill)",
        fontSize: ".68rem",
        fontWeight: 600,
        letterSpacing: ".02em",
        color: "var(--ink)",
        background: `color-mix(in oklab, ${color} 22%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 45%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
