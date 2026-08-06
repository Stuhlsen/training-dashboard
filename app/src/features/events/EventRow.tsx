import { fmtDate } from "../../core/format.js";
import { EventBadge } from "./EventBadge";
import { PRIORITY_LABEL, TYPE_LABEL, priorityBadgeColor, typeBadgeColor } from "./events-view-model";
import type { EventItem } from "../../api/types";

interface EventRowProps {
  event: EventItem;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

/** Eine Event-Zeile — ersetzt eventRow() aus assets/js/ui/event-timeline.js.
 *  React escaped Textinhalte automatisch (kein innerHTML), der dortige
 *  escapeHtml()-Aufwand entfällt strukturell. */
export function EventRow({ event, canEdit, deleting, onEdit, onRemove }: EventRowProps) {
  return (
    <div
      onClick={canEdit ? onEdit : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 4px",
        borderBottom: "1px solid var(--hair)",
        cursor: canEdit ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".76rem", color: "var(--ink-3)", minWidth: 44 }}>
          {fmtDate(event.eventDate)}
        </span>
        <span style={{ fontSize: ".92rem", fontWeight: 500, color: "var(--ink)" }}>{event.title}</span>
        <EventBadge label={TYPE_LABEL[event.type]} color={typeBadgeColor(event.type)} />
        {event.type === "race" && event.priority && (
          <EventBadge label={PRIORITY_LABEL[event.priority]} color={priorityBadgeColor(event.priority)} />
        )}
        {canEdit && (
          <button
            type="button"
            disabled={deleting}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Event löschen"
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              color: "var(--ink-3)",
              fontSize: "1rem",
              lineHeight: 1,
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.5 : 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
        )}
      </div>
      {event.note && <div style={{ fontSize: ".78rem", color: "var(--ink-3)" }}>{event.note}</div>}
    </div>
  );
}
