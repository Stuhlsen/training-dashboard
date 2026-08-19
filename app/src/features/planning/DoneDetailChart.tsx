import { RATING_COLOR, RATING_ICON, RATING_LABEL } from "./compliance-rating";
import { complianceRuleText, fmtMinSec, visibleCompliance } from "./planning-view-model";
import { buildStepChart, zoneMixFromRide, type StepChartBar, type ZoneMixSegment } from "./done-detail-chart-view-model";
import { formatSignedDelta } from "../../core/plan-feedback.js";
import type { DoneTableRow } from "./done-table-view-model";

const CHART_HEIGHT = 64;
const BAR_GAP = 3;

/** Aufklappbarer Detail-Chart der Done-Tabelle (Etappe 13e) — vereinfachter
 *  Stufenchart statt des im Mockup gezeigten (nicht baubaren) Rausch-Traces
 *  (s. Kopfkommentar done-detail-chart-view-model.ts). Zweigwahl:
 *  Intervall-Workout (sichtbare Compliance-Ampel) → buildStepChart(),
 *  sonst → zoneMixFromRide(). `null` bei fehlenden Daten (kein Chart statt
 *  Fehler) — spiegelt das renderChart-Slot-Muster aus WeekGrid.tsx. */
export function DoneDetailChart({ card, ride }: DoneTableRow) {
  if (!ride) return null;
  const compliance = visibleCompliance(ride, card.id);
  const bars = buildStepChart(compliance);

  if (bars) return <StepChart bars={bars} compliance={compliance!} />;

  const zoneMix = zoneMixFromRide(ride);
  if (zoneMix) return <ZoneMixBar segments={zoneMix} />;

  return null;
}

function StepChart({ bars, compliance }: { bars: StepChartBar[]; compliance: NonNullable<ReturnType<typeof visibleCompliance>> }) {
  const ratingColor = RATING_COLOR[compliance.rating] ?? "var(--ink)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Leistung — Soll vs. Ist</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: BAR_GAP, height: CHART_HEIGHT }}>
        {bars.map((bar) => (
          <div
            key={bar.index}
            title={`${fmtMinSec(bar.plannedDurationS)} @ ${Math.round(bar.plannedWatts)} W → ${fmtMinSec(bar.actualDurationS)} @ ${
              bar.actualWatts != null ? `${Math.round(bar.actualWatts)} W` : "–"
            }`}
            style={{
              position: "relative",
              flex: `${Math.max(bar.widthPct, 4)} 0 0`,
              height: "100%",
              display: "flex",
              alignItems: "flex-end",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                top: `${100 - bar.plannedHeightPct}%`,
                border: "1px dashed var(--ink-3)",
                borderBottom: "none",
              }}
            />
            {bar.actualHeightPct != null && (
              <div
                style={{
                  width: "100%",
                  height: `${bar.actualHeightPct}%`,
                  background: bar.fulfilled ? "var(--ok)" : "var(--danger)",
                  opacity: 0.8,
                  borderRadius: "2px 2px 0 0",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: ".72rem" }}>
        <span style={{ color: "var(--ink-3)" }}>Fade: {formatSignedDelta(compliance.fadePct)}%</span>
        <span style={{ color: ratingColor, fontWeight: 600 }}>
          {RATING_ICON[compliance.rating] ?? ""} {RATING_LABEL[compliance.rating] ?? compliance.rating}:{" "}
          {complianceRuleText(compliance.rule)}
        </span>
      </div>
    </div>
  );
}

function ZoneMixBar({ segments }: { segments: ZoneMixSegment[] }) {
  const visible = segments.filter((s) => s.secs > 0);
  if (!visible.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Zonen-Mix</div>
      <div style={{ display: "flex", height: 10, borderRadius: 4, overflow: "hidden" }}>
        {visible.map((s) => (
          <div key={s.id} title={`${s.label}: ${s.pct}%`} style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: ".72rem", color: "var(--ink-3)" }}>
        {visible.map((s) => (
          <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label} {s.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
