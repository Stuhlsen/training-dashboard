import { RATING_COLOR, RATING_ICON, RATING_LABEL } from "./compliance-rating";
import { complianceRuleText, fmtMinSec, visibleCompliance } from "./planning-view-model";
import { buildStepChart, zoneMixFromRide, type StepChartBar, type ZoneMixSegment } from "./done-detail-chart-view-model";
import { buildNoiseTrace, type NoiseTrace } from "./noise-trace-chart-view-model";
import { useActivityStreams } from "../../api/hooks/useActivityStreams";
import { formatSignedDelta } from "../../core/plan-feedback.js";
import type { DoneTableRow } from "./done-table-view-model";
import type { IntervalsCredentials } from "../../api/types";

const CHART_HEIGHT = 64;
const BAR_GAP = 3;
const TRACE_HEIGHT = 56;

interface DoneDetailChartProps extends DoneTableRow {
  /** `null`/`undefined` ohne hinterlegte intervals.icu-Zugangsdaten — der
   *  Rausch-Chart bleibt dann einfach aus (kein Blocker, kein Popup). */
  intervalsCredentials?: IntervalsCredentials | null;
}

/** Aufklappbarer Detail-Chart der Done-Tabelle (Etappe 13e) — Stufenchart/
 *  Zonen-Mix (Soll/Ist bzw. Zonenanteile, aus den bereits vorliegenden
 *  Plandaten) UND darunter, wenn verfügbar, der echte Sekunden-Rausch-Trace
 *  (Watt/Puls, on-demand von intervals.icu geladen — s.
 *  noise-trace-chart-view-model.ts). Zweigwahl des oberen Blocks:
 *  Intervall-Workout (sichtbare Compliance-Ampel) → buildStepChart(),
 *  sonst → zoneMixFromRide(). `null` bei fehlenden Daten (kein Chart statt
 *  Fehler) — spiegelt das renderChart-Slot-Muster aus WeekGrid.tsx. */
export function DoneDetailChart({ card, ride, intervalsCredentials }: DoneDetailChartProps) {
  if (!ride) return null;
  const compliance = visibleCompliance(ride, card.id);
  const bars = buildStepChart(compliance);
  const zoneMix = bars ? null : zoneMixFromRide(ride);
  const topChart = bars ? (
    <StepChart bars={bars} compliance={compliance!} />
  ) : zoneMix ? (
    <ZoneMixBar segments={zoneMix} />
  ) : null;
  const credentials = intervalsCredentials ?? null;
  const mayHaveNoiseTrace = !!ride.activityId && !!credentials;

  // Kein Chart überhaupt (weder Stufenchart/Zonen-Mix noch ein möglicher
  // Rausch-Trace) -> null statt eines leeren Wrapper-Divs (kein Crash-Test
  // erwartet hier container.firstChild === null, s. DoneDetailChart.test.tsx).
  if (!topChart && !mayHaveNoiseTrace) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {topChart}
      {mayHaveNoiseTrace && <NoiseTraceSlot activityId={ride.activityId} credentials={credentials} />}
    </div>
  );
}

/** Eigene, gemountete-nur-während-aufgeklappt Komponente für den Streams-
 *  Abruf (statt eine Ebene höher in PlanningPage.tsx) — der Query ist 1:1
 *  an "gerade diese eine geöffnete Zeile" gebunden, nichts darüber
 *  bräuchte das Ergebnis. `intervalsCredentials` selbst kommt weiterhin
 *  als Prop von PlanningPage (geteilter Wert für Push UND diesen Chart,
 *  s. WeekGridDetailRow.tsx) — nur der zeilen-scoped Streams-Query lebt
 *  hier. Rendert `null` ohne activityId/Credentials/Daten UND bei einem
 *  Ladefehler (stilles Fallback, kein Fehlertext für diese optionale
 *  Ergänzung — der Stufenchart/Zonen-Mix bleibt in jedem Fall sichtbar). */
function NoiseTraceSlot({ activityId, credentials }: { activityId: string | null | undefined; credentials: IntervalsCredentials | null }) {
  const { streams, isLoading } = useActivityStreams(activityId, credentials);
  if (!activityId || !credentials) return null;
  if (isLoading) return <div style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>Lädt Rohdaten …</div>;

  const trace = buildNoiseTrace(streams);
  if (!trace) return null;
  return <NoiseTraceChart trace={trace} />;
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

function points(pts: { xPct: number; yPct: number }[]): string {
  return pts.map((p) => `${p.xPct},${100 - p.yPct}`).join(" ");
}

/** Echter Sekunden-Verlauf (Watt/Puls) als zwei überlagerte Trace-Linien —
 *  jede auf ihre eigene Min/Max-Spanne normiert (s. Kopfkommentar
 *  noise-trace-chart-view-model.ts), kein gemeinsamer Achsenmaßstab. Fehlt
 *  eine der beiden Linien (z.B. kein Power Meter), wird nur die andere
 *  gezeichnet statt eine leere Achse zu zeigen. */
function NoiseTraceChart({ trace }: { trace: NoiseTrace }) {
  if (!trace.watts.length && !trace.heartrate.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Verlauf — Watt/Puls</div>
      <svg
        viewBox={`0 0 100 100`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: TRACE_HEIGHT, display: "block" }}
      >
        {trace.watts.length > 0 && (
          <polyline points={points(trace.watts)} fill="none" stroke="var(--ss)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        {trace.heartrate.length > 0 && (
          <polyline points={points(trace.heartrate)} fill="none" stroke="var(--thr)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: ".72rem", color: "var(--ink-3)" }}>
        {trace.avgWatts != null && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden="true" style={{ width: 10, height: 2, background: "var(--ss)", display: "inline-block" }} />
            Ø {Math.round(trace.avgWatts)} W · max {Math.round(trace.maxWatts ?? 0)} W
          </span>
        )}
        {trace.avgHr != null && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden="true" style={{ width: 10, height: 2, background: "var(--thr)", display: "inline-block" }} />
            Ø {Math.round(trace.avgHr)} bpm · max {Math.round(trace.maxHr ?? 0)} bpm
          </span>
        )}
      </div>
    </div>
  );
}
