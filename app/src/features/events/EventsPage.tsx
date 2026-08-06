import { useState } from "react";
import { AthleteToggle } from "../../components/AthleteToggle";
import { GlassCard } from "../../components/GlassCard";
import { useActiveAthlete } from "../../api/hooks/useActiveAthlete";
import { useCanWriteForAthlete } from "../../api/hooks/useWriteAuthorization";
import { useEvents, useRemoveEvent } from "../../api/hooks/useEvents";
import { localISODate } from "../../core/format.js";
import { EventForm } from "./EventForm";
import { EventRow } from "./EventRow";
import { groupEvents } from "./events-view-model";
import type { EventItem } from "../../api/types";

const TODAY = localISODate();

type DialogState = "closed" | "new" | EventItem;

export function EventsPage() {
  const { activeAthleteId, setActiveAthleteId } = useActiveAthlete();
  const { data: events, isLoading, error } = useEvents(activeAthleteId);
  const { canWrite } = useCanWriteForAthlete(activeAthleteId);
  const { remove } = useRemoveEvent(activeAthleteId);

  const [dialog, setDialog] = useState<DialogState>("closed");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");

  async function handleRemove(id: string) {
    setRemoveError("");
    setDeletingId(id);
    const result = await remove(id);
    setDeletingId(null);
    if (!result.ok) {
      setRemoveError(result.error?.message || "Event konnte nicht gelöscht werden.");
    }
  }

  const { upcoming, past } = groupEvents(events ?? [], TODAY);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-disp)", fontSize: "1.6rem", fontWeight: 600, color: "var(--ink)" }}>
          Events
        </h1>
        <AthleteToggle activeAthleteId={activeAthleteId} onChange={setActiveAthleteId} />
      </div>

      <GlassCard variant="soft" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        {isLoading && <p style={{ color: "var(--ink-3)", margin: 0 }}>Lädt …</p>}
        {!isLoading && error && <p style={{ color: "var(--danger)", margin: 0 }}>Events konnten nicht geladen werden.</p>}

        {!isLoading && !error && (
          <>
            <EventSection
              title="Anstehend"
              events={upcoming}
              emptyLabel="Keine anstehenden Events."
              canEdit={canWrite}
              deletingId={deletingId}
              onEdit={setDialog}
              onRemove={(id) => void handleRemove(id)}
            />
            <EventSection
              title="Vergangen"
              events={past}
              emptyLabel="Keine vergangenen Events."
              canEdit={canWrite}
              deletingId={deletingId}
              onEdit={setDialog}
              onRemove={(id) => void handleRemove(id)}
            />
          </>
        )}

        {removeError && <div style={{ color: "var(--danger)", fontSize: ".78rem" }}>{removeError}</div>}

        {canWrite && (
          <button
            type="button"
            onClick={() => setDialog("new")}
            style={{
              alignSelf: "flex-start",
              padding: "9px 18px",
              borderRadius: "var(--pill)",
              border: "1px solid var(--hair)",
              background: "transparent",
              color: "var(--ink)",
              fontSize: ".84rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Event hinzufügen
          </button>
        )}
      </GlassCard>

      {dialog !== "closed" && (
        <EventForm
          athleteId={activeAthleteId}
          editingEvent={dialog === "new" ? null : dialog}
          onClose={() => setDialog("closed")}
        />
      )}
    </div>
  );
}

function EventSection({
  title,
  events,
  emptyLabel,
  canEdit,
  deletingId,
  onEdit,
  onRemove,
}: {
  title: string;
  events: EventItem[];
  emptyLabel: string;
  canEdit: boolean;
  deletingId: string | null;
  onEdit: (event: EventItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: ".7rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
        {title}
      </span>
      {events.length === 0 ? (
        <p style={{ color: "var(--ink-3)", fontSize: ".84rem", margin: "4px 0" }}>{emptyLabel}</p>
      ) : (
        events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            canEdit={canEdit}
            deleting={deletingId === event.id}
            onEdit={() => onEdit(event)}
            onRemove={() => onRemove(event.id)}
          />
        ))
      )}
    </div>
  );
}
