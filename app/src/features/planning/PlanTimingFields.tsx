/* ============================================================
   FEATURES/PLANNING/PLANTIMINGFIELDS.TSX — „Wann?" im „Neuer Plan"-Dialog:
   Modus (offen / auf ein Event hin), Startdatum, Planlänge bzw. Ziel-Event
   und ein neues Event (Renntag + Name).

   Aus NewPlanDialog.tsx herausgelöst (Fahrplan 44 E4, damit die Datei nicht
   wächst) — reine Verschiebung, keine Verhaltensänderung. Alles hier gilt
   gemeinsam für alle Sportarten des Plans.
   ============================================================ */

import { fmtDate } from "../../core/format.js";
import { FIELD_STYLE, LABEL_STYLE, PILL_STYLE, PRIMARY_BTN_STYLE } from "./new-plan-dialog-styles";
import type { NewPlanFormState } from "./new-plan-dialog-view-model";

const NEW_EVENT_VALUE = "__new__";

export interface EventOption {
  id: string;
  eventDate: string;
  title: string;
  priority: string | null;
  ftpGoal?: number | null;
}

interface PlanTimingFieldsProps {
  form: NewPlanFormState;
  patch: (next: Partial<NewPlanFormState>) => void;
  eventOptions: readonly EventOption[];
}

export function PlanTimingFields({ form, patch, eventOptions }: PlanTimingFieldsProps) {
  return (
    <>
      {/* Modus */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          style={form.mode === "open" ? PRIMARY_BTN_STYLE : PILL_STYLE}
          onClick={() => patch({ mode: "open" })}
        >
          Ohne festes Ende
        </button>
        <button
          type="button"
          style={form.mode === "event" ? PRIMARY_BTN_STYLE : PILL_STYLE}
          onClick={() => patch({ mode: "event" })}
        >
          Auf ein Event hin
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={LABEL_STYLE}>
          Startdatum (Montag)
          <input
            type="date"
            style={FIELD_STYLE}
            value={form.startDate}
            onChange={(e) => patch({ startDate: e.target.value })}
          />
        </label>

        {form.mode === "open" ? (
          <label style={LABEL_STYLE}>
            Planlänge (Wochen)
            <input
              type="number"
              min={3}
              max={40}
              style={FIELD_STYLE}
              value={form.weeks}
              onChange={(e) => patch({ weeks: Number(e.target.value) || 0 })}
            />
          </label>
        ) : (
          <label style={LABEL_STYLE}>
            Ziel-Event
            <select
              style={FIELD_STYLE}
              value={form.eventId || NEW_EVENT_VALUE}
              onChange={(e) => {
                const v = e.target.value;
                if (v === NEW_EVENT_VALUE) {
                  patch({ eventId: "" });
                } else {
                  const ev = eventOptions.find((x) => x.id === v);
                  patch({ eventId: v, ftpTarget: form.ftpTarget ?? ev?.ftpGoal ?? null });
                }
              }}
            >
              {eventOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {fmtDate(e.eventDate)} — {e.title}
                  {e.priority ? ` (${e.priority})` : ""}
                </option>
              ))}
              <option value={NEW_EVENT_VALUE}>Anderes Event anlegen …</option>
            </select>
          </label>
        )}
      </div>

      {form.mode === "event" && !form.eventId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={LABEL_STYLE}>
            Renntag
            <input
              type="date"
              style={FIELD_STYLE}
              value={form.newEventDate}
              onChange={(e) => patch({ newEventDate: e.target.value })}
            />
          </label>
          <label style={LABEL_STYLE}>
            Event-Name
            <input
              type="text"
              style={FIELD_STYLE}
              value={form.newEventName}
              onChange={(e) => patch({ newEventName: e.target.value })}
              placeholder="z. B. GFNY Hamburg"
            />
          </label>
        </div>
      )}
    </>
  );
}
