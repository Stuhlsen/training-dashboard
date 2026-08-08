import { useEffect, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { athleteConfig } from "../../config";
import { useCreateEvent, useUpdateEvent } from "../../api/hooks/useEvents";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import type { EventInput, EventItem, EventPriority, EventType } from "../../api/types";

interface EventFormProps {
  athleteId: string;
  /** `null` = neues Event anlegen, sonst bearbeiten. */
  editingEvent: EventItem | null;
  onClose: () => void;
}

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
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
  padding: "9px 11px",
  color: "var(--ink)",
  font: "inherit",
  fontSize: ".9rem",
};

const PRIORITY_OPTIONS: { value: "" | EventPriority; label: string }[] = [
  { value: "", label: "– keine Priorität –" },
  { value: "main", label: "Hauptziel" },
  { value: "secondary", label: "Nebenziel" },
];

/** Formular-Dialog (Modal) für Event anlegen/bearbeiten — ersetzt
 *  ui/event-form.js. Kein `openGuard`-Äquivalent nötig: die Komponente wird
 *  bei `onClose` komplett unmounted, eine spät eintreffende Mutation
 *  aktualisiert nur noch den Query-Cache (gewünscht), nicht mehr den lokalen
 *  State einer bereits verlassenen Instanz. */
export function EventForm({ athleteId, editingEvent, onClose }: EventFormProps) {
  const [title, setTitle] = useState(editingEvent?.title ?? "");
  const [eventDate, setEventDate] = useState(editingEvent?.eventDate ?? "");
  const [type, setType] = useState<EventType>(editingEvent?.type ?? "race");
  const [priority, setPriority] = useState<"" | EventPriority>(editingEvent?.priority ?? "");
  const [ftpGoal, setFtpGoal] = useState(editingEvent?.ftpGoal != null ? String(editingEvent.ftpGoal) : "");
  const [isTest, setIsTest] = useState(editingEvent?.isTest ?? false);
  const [note, setNote] = useState(editingEvent?.note ?? "");
  const [error, setError] = useState("");

  const { create, isPending: creating } = useCreateEvent(athleteId);
  const { update, isPending: updating } = useUpdateEvent(athleteId);
  const { isSelf } = useIsSelfAthlete(athleteId);
  const pending = creating || updating;

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [onClose]);

  const athleteName = athleteConfig(athleteId)?.name;
  const baseTitle = editingEvent ? "Event bearbeiten" : "Event anlegen";
  const dialogTitle = !isSelf && athleteName ? `${baseTitle} (für ${athleteName})` : baseTitle;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Kein type-abhängiges Nullen hier — useCreateEvent/useUpdateEvent
    // erzwingen priority=null/ftpGoal=null/isTest=false bei type="other"
    // bereits selbst (Check-Constraint-Spiegelung).
    const payload: EventInput = {
      title: title.trim(),
      eventDate,
      type,
      priority: priority || null,
      ftpGoal: ftpGoal ? Number(ftpGoal) : null,
      isTest,
      note: note.trim() || null,
    };
    const result = editingEvent ? await update(editingEvent.id, payload) : await create(payload);
    if (!result.ok) {
      setError(result.error?.message || "Event konnte nicht gespeichert werden.");
      return;
    }
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,9,14,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassCard
        variant="strong"
        radius="22px"
        style={{ width: "100%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto", padding: "26px 24px" }}
      >
        <div style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>
          {dialogTitle}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          <label style={LABEL_STYLE}>
            Titel
            <input
              type="text"
              required
              placeholder="z. B. Gran Fondo Bremen"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>

          <label style={LABEL_STYLE}>
            Datum
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              style={INPUT_STYLE}
            />
          </label>

          <div style={LABEL_STYLE}>
            Typ
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              {(["race", "other"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: "var(--pill)",
                    border: "1px solid var(--hair)",
                    background: type === t ? "var(--ss)" : "transparent",
                    color: type === t ? "#17110a" : "var(--ink-2)",
                    fontFamily: "var(--font-body)",
                    fontSize: ".8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t === "race" ? "Rennen/Tour" : "Sonstiges"}
                </button>
              ))}
            </div>
          </div>

          {type === "race" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={LABEL_STYLE}>
                Priorität
                <select value={priority} onChange={(e) => setPriority(e.target.value as "" | EventPriority)} style={INPUT_STYLE}>
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={LABEL_STYLE}>
                Ziel-FTP (Watt, optional)
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="z. B. 210"
                  value={ftpGoal}
                  onChange={(e) => setFtpGoal(e.target.value)}
                  style={INPUT_STYLE}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-body)", fontSize: ".82rem", color: "var(--ink-2)" }}>
                <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
                Ist ein Testtermin (z. B. Ramp-Test) — kein Wettkampf
              </label>
            </div>
          )}

          <label style={LABEL_STYLE}>
            Notiz (optional)
            <textarea
              rows={2}
              placeholder="z. B. Zielzeit, Strecke"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...INPUT_STYLE, resize: "vertical", fontFamily: "var(--font-body)" }}
            />
          </label>

          {error && <div style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: ".7rem" }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              type="submit"
              disabled={pending}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "var(--pill)",
                border: "none",
                background: "var(--ss)",
                color: "#17110a",
                fontWeight: 600,
                cursor: pending ? "default" : "pointer",
                opacity: pending ? 0.7 : 1,
              }}
            >
              {pending ? "Speichern …" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: "var(--pill)",
                border: "1px solid var(--hair)",
                background: "transparent",
                color: "var(--ink-3)",
                cursor: "pointer",
              }}
            >
              Abbrechen
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
