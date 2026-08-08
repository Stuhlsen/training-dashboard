import { isRecoveryType, latestWellness, nextLoadAfter, type PlannedSessionRef } from "./planning-view-model";

type WellnessDay = import("../../types.js").WellnessDay;

const ROW_STYLE: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: ".8rem" };
const LABEL_STYLE: React.CSSProperties = { color: "var(--ink-3)", minWidth: 92 };

interface RecoveryBlockProps {
  typ: string | null;
  date: string;
  details: string;
  wellness: WellnessDay[];
  plannedSessions: PlannedSessionRef[];
}

/** HRV/Ruhepuls + nächste Belastungseinheit für Recovery-Karten — Port von
 *  ui/planned.js::_renderCard Z. 962-1003. `null`-Render außerhalb der
 *  Recovery-Typen (`isRecoveryType`). */
export function RecoveryBlock({ typ, date, details, wellness, plannedSessions }: RecoveryBlockProps) {
  if (!isRecoveryType(typ)) return null;

  const last = latestWellness(wellness);
  const nextLoad = nextLoadAfter(plannedSessions, date);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>📊 Aktuelle Erholungswerte</div>
      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>💜 HRV</span>
        {last?.hrv != null ? (
          <>
            <span style={{ color: "var(--ink)" }}>{last.hrv} ms</span>
            <span style={{ color: "var(--ink-3)" }}>({last.dateShort})</span>
          </>
        ) : (
          <span style={{ color: "var(--ink-3)" }}>– nicht erfasst</span>
        )}
      </div>
      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>❤️ Ruhepuls</span>
        {last?.restingHR != null ? (
          <>
            <span style={{ color: "var(--ink)" }}>{last.restingHR} bpm</span>
            <span style={{ color: "var(--ink-3)" }}>({last.dateShort})</span>
          </>
        ) : (
          <span style={{ color: "var(--ink-3)" }}>– nicht erfasst</span>
        )}
      </div>
      {nextLoad && (
        <div style={{ fontSize: ".78rem", color: "var(--accent)" }}>
          ⚡ Nächste Belastung in {nextLoad.daysUntil} Tag{nextLoad.daysUntil !== 1 ? "en" : ""}: {nextLoad.name}
        </div>
      )}
      <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{details}</div>
    </div>
  );
}
