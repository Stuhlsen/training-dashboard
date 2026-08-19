import { formatSignedDelta } from "../../core/plan-feedback.js";
import { fmtDate } from "../../core/format.js";
import type { DeltaBannerState } from "./planning-delta";

const CLOSE_BTN_STYLE: React.CSSProperties = {
  width: 26,
  height: 26,
  flex: "none",
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  background: "transparent",
  color: "var(--ink-3)",
  cursor: "pointer",
  fontSize: ".74rem",
  lineHeight: 1,
};

/** Persistenter Vorher/Nachher-Vergleich nach Verschieben/Ausfallen/Drag —
 *  Port von ui/planned.js::_renderDeltaBanner (Z. 312-346). Kein
 *  Auto-Dismiss, nur manuelles Schließen (`onClose`). */
export function DeltaBanner({ state, onClose }: { state: DeltaBannerState; onClose: () => void }) {
  const { event, impact } = state;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "13px 16px",
        borderRadius: "16px",
        background: "rgba(20,24,34,.6)",
        border: "1px solid var(--hair)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".82rem", color: "var(--ink-2)" }}>
        {event && (
          <span>
            TSB am Eventtag ({event.event.title ? `${event.event.title}, ` : ""}
            {fmtDate(event.event.eventDate)}): <span style={{ color: "var(--ink-3)" }}>{Math.round(event.before)}</span> →{" "}
            <span style={{ color: event.after < event.before ? "var(--warn)" : "var(--ink)" }}>
              {Math.round(event.after)}
            </span>
          </span>
        )}
        {impact && (
          <span>
            Wirkung am {fmtDate(impact.date)} (vorher → nachher): Ermüdung{" "}
            {formatSignedDelta(impact.before.deltaFatigue)} → {formatSignedDelta(impact.after.deltaFatigue)} · Fitness{" "}
            {formatSignedDelta(impact.before.deltaFitness)} → {formatSignedDelta(impact.after.deltaFitness)} · Form{" "}
            {formatSignedDelta(impact.before.deltaForm)} → {formatSignedDelta(impact.after.deltaForm)} — modelliert
          </span>
        )}
        <span style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>nur Information, keine Blockade</span>
      </div>
      <button type="button" title="Schließen" onClick={onClose} style={CLOSE_BTN_STYLE}>
        ✕
      </button>
    </div>
  );
}
