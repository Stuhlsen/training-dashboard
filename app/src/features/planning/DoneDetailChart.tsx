import { RATING_COLOR, RATING_ICON, RATING_LABEL } from "./compliance-rating";
import { complianceRuleText, visibleCompliance } from "./planning-view-model";
import {
  fallbackIntervalRows,
  targetBandFromCompliance,
  targetProfileFromCard,
  zoneMixFromRide,
  type FallbackIntervalRow,
  type TargetBand,
  type TargetProfile,
  type ZoneMixSegment,
} from "./done-detail-chart-view-model";
import { buildNoiseTrace, type NoiseTrace } from "./noise-trace-chart-view-model";
import { useActivityStreams } from "../../api/hooks/useActivityStreams";
import { formatSignedDelta } from "../../core/plan-feedback.js";
import type { DoneTableRow } from "./done-table-view-model";
import type { IntervalsCredentials } from "../../api/types";

const TRACE_HEIGHT = 56;

interface DoneDetailChartProps extends DoneTableRow {
  /** `null`/`undefined` ohne hinterlegte intervals.icu-Zugangsdaten — der
   *  Rausch-Chart bleibt dann einfach aus (kein Blocker, kein Popup). */
  intervalsCredentials?: IntervalsCredentials | null;
  /** Aktuelle FTP des Athleten — speist die zeit-ausgerichtete Ziel-Treppe
   *  (Umrechnung `%FTP` → Watt). Ohne FTP (z.B. Athlet 4) fällt der
   *  Intervall-Zweig aufs flache Ziel-Watt-Band zurück. */
  ftp?: number | null;
}

/** Aufklappbarer Detail-Chart der Done-Tabelle — zwei Zweige:
 *
 *  - Intervall-Workout (sichtbare Compliance-Ampel, `matched` nicht leer):
 *    der echte Sekunden-Verlauf (Watt/Puls, on-demand von intervals.icu)
 *    MIT dem Ziel-Watt-Band (targetBandFromCompliance) dahinter — ein
 *    kombinierter "geplant vs. gefahren"-Chart auf gemeinsamer Watt-Achse.
 *    Ohne Streams (keine Zugangsdaten / kein Ladeergebnis) fällt der obere
 *    Block auf eine kompakte Soll/Ist-Liste je Intervall zurück. Darunter
 *    immer die Compliance-Rating-Zeile.
 *  - Ohne Intervallstruktur: Zonen-Mix + (falls verfügbar) der echte
 *    Sekunden-Verlauf darunter, wie bisher.
 *
 *  `null` bei fehlenden Daten (kein Chart statt Fehler) — spiegelt das
 *  renderChart-Slot-Muster aus WeekGrid.tsx. */
export function DoneDetailChart({ card, ride, intervalsCredentials, ftp }: DoneDetailChartProps) {
  if (!ride) return null;
  const compliance = visibleCompliance(ride, card.id);
  const credentials = intervalsCredentials ?? null;
  const isInterval = !!compliance && compliance.matched.length > 0;

  if (isInterval) {
    // Bevorzugt die volle geplante Phasenfolge als zeit-ausgerichtete
    // Treppe; ohne FTP / ohne workout_structure bleibt das flache
    // Compliance-Band als Rückfall.
    const targetProfile = targetProfileFromCard(card, ftp);
    const targetBand = targetProfile ? null : targetBandFromCompliance(compliance);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <IntervalTopBlock
          activityId={ride.activityId}
          credentials={credentials}
          targetBand={targetBand}
          targetProfile={targetProfile}
          compliance={compliance!}
        />
        <RatingLine compliance={compliance!} />
      </div>
    );
  }

  const zoneMix = zoneMixFromRide(ride);
  const mayHaveNoiseTrace = !!ride.activityId && !!credentials;
  if (!zoneMix && !mayHaveNoiseTrace) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {zoneMix && <ZoneMixBar segments={zoneMix} />}
      {mayHaveNoiseTrace && <NoiseTraceSlot activityId={ride.activityId} credentials={credentials} />}
    </div>
  );
}

/** Oberer Block des Intervall-Zweigs: echte Watt/Puls-Kurve mit Zielband,
 *  sonst (kein Stream) die Soll/Ist-Textliste. Der Streams-Query ist 1:1 an
 *  "gerade diese eine geöffnete Zeile" gebunden — `useActivityStreams`
 *  no-op-t ohne activityId/Credentials (`enabled`), der Aufruf hier ist
 *  trotzdem hook-sicher unbedingt. */
function IntervalTopBlock({
  activityId,
  credentials,
  targetBand,
  targetProfile,
  compliance,
}: {
  activityId: string | null | undefined;
  credentials: IntervalsCredentials | null;
  targetBand: TargetBand | null;
  targetProfile: TargetProfile | null;
  compliance: NonNullable<ReturnType<typeof visibleCompliance>>;
}) {
  const { streams, isLoading } = useActivityStreams(activityId, credentials);
  if (activityId && credentials && isLoading) {
    return <div style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>Lädt Rohdaten …</div>;
  }

  const trace = buildNoiseTrace(
    streams,
    targetProfile ? { targetProfile } : targetBand ? { targetBand } : {},
  );
  if (trace && (trace.watts.length > 0 || trace.heartrate.length > 0)) {
    return <NoiseTraceChart trace={trace} targetBand={targetBand} hasTargetProfile={!!targetProfile} />;
  }
  return <IntervalFallbackList rows={fallbackIntervalRows(compliance)} />;
}

/** Kompakte Soll/Ist-Liste je Intervall — Ersatz für die echte Kurve, wenn
 *  keine Sekunden-Rohdaten vorliegen. `null`-Zeilen (keine Intervalle) →
 *  nichts rendern. */
function IntervalFallbackList({ rows }: { rows: FallbackIntervalRow[] | null }) {
  if (!rows || !rows.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Soll vs. Ist je Intervall</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: ".72rem" }}>
        {rows.map((r) => (
          <div key={r.index} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--ink-3)", flex: "0 0 82px" }}>Intervall {r.index + 1}</span>
            <span style={{ color: "var(--ink-3)" }}>Ziel {r.plannedWatts} W</span>
            <span style={{ color: "var(--ink-3)" }}>→</span>
            <span style={{ color: r.fulfilled ? "var(--ok)" : "var(--danger)" }}>
              {r.actualWatts != null ? `${r.actualWatts} W` : "–"} {r.fulfilled ? "✓" : "✗"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fade + Compliance-Regel als Textzeile — saß früher unter dem Stufenchart,
 *  jetzt fester Fuß des Intervall-Zweigs (unabhängig davon, ob oben die
 *  Kurve oder die Fallback-Liste steht). */
function RatingLine({ compliance }: { compliance: NonNullable<ReturnType<typeof visibleCompliance>> }) {
  const ratingColor = RATING_COLOR[compliance.rating] ?? "var(--ink)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: ".72rem" }}>
      <span style={{ color: "var(--ink-3)" }}>Fade: {formatSignedDelta(compliance.fadePct)}%</span>
      <span style={{ color: ratingColor, fontWeight: 600 }}>
        {RATING_ICON[compliance.rating] ?? ""} {RATING_LABEL[compliance.rating] ?? compliance.rating}:{" "}
        {complianceRuleText(compliance.rule)}
      </span>
    </div>
  );
}

/** Streams-Abruf des Nicht-Intervall-Zweigs (Zonen-Mix darüber). Rendert
 *  `null` ohne activityId/Credentials/Daten UND bei einem Ladefehler
 *  (stilles Fallback — der Zonen-Mix bleibt in jedem Fall sichtbar). */
function NoiseTraceSlot({ activityId, credentials }: { activityId: string | null | undefined; credentials: IntervalsCredentials | null }) {
  const { streams, isLoading } = useActivityStreams(activityId, credentials);
  if (!activityId || !credentials) return null;
  if (isLoading) return <div style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>Lädt Rohdaten …</div>;

  const trace = buildNoiseTrace(streams);
  if (!trace) return null;
  return <NoiseTraceChart trace={trace} targetBand={null} />;
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

/** Einen zusammenhängenden Treppen-Lauf in Polyline-Punkte übersetzen — je
 *  Phase Anfangs- und Endpunkt auf gleicher Höhe; die senkrechten Stufen
 *  zwischen zeitlich anschließenden Phasen entstehen von selbst. */
function stepRunPoints(run: { xStartPct: number; xEndPct: number; yPct: number }[]): string {
  return run.flatMap((s) => [`${s.xStartPct},${100 - s.yPct}`, `${s.xEndPct},${100 - s.yPct}`]).join(" ");
}

function targetBandLabel(band: TargetBand): string {
  return band.lowW === band.highW ? `Ziel ${band.lowW} W` : `Ziel ${band.lowW}–${band.highW} W`;
}

/** Echter Sekunden-Verlauf (Watt/Puls) als zwei überlagerte Trace-Linien.
 *  Mit `hasTargetProfile` (+ `trace.stepRuns`) liegt zusätzlich die zeit-
 *  ausgerichtete Ziel-Treppe (gestrichelt = geplant) auf derselben Watt-
 *  Skala wie die durchgezogene Ist-Watt-Kurve. Mit `targetBand`
 *  (+ `trace.band`) stattdessen das flache getönte Ziel-Watt-Band (Rückfall
 *  ohne FTP / ohne workout_structure). Ohne beides: Watt/Puls je auf ihre
 *  eigene Min/Max-Spanne normiert (kein gemeinsamer Achsenmaßstab, s.
 *  Kopfkommentar noise-trace-chart-view-model.ts). Fehlt eine Linie (z.B.
 *  kein Power Meter), wird nur die andere gezeichnet. */
function NoiseTraceChart({
  trace,
  targetBand,
  hasTargetProfile = false,
}: {
  trace: NoiseTrace;
  targetBand: TargetBand | null;
  hasTargetProfile?: boolean;
}) {
  if (!trace.watts.length && !trace.heartrate.length) return null;
  const band = trace.band;
  const stepRuns = trace.stepRuns;
  const heading = hasTargetProfile
    ? "Leistung — Soll-Profil vs. gefahren"
    : targetBand
      ? "Leistung — Soll-Band vs. gefahren"
      : "Verlauf — Watt/Puls";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>{heading}</div>
      <svg
        viewBox={`0 0 100 100`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: TRACE_HEIGHT, display: "block" }}
      >
        {band && (
          <rect
            x={0}
            width={100}
            y={100 - band.yHighPct}
            height={Math.max(band.yHighPct - band.yLowPct, 0.5)}
            fill="var(--ss)"
            opacity={0.14}
          />
        )}
        {stepRuns?.map((run, i) => (
          <polyline
            key={i}
            points={stepRunPoints(run)}
            fill="none"
            stroke="var(--ss)"
            strokeWidth={1.25}
            strokeDasharray="3 2"
            opacity={0.65}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {trace.watts.length > 0 && (
          <polyline points={points(trace.watts)} fill="none" stroke="var(--ss)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        {trace.heartrate.length > 0 && (
          <polyline points={points(trace.heartrate)} fill="none" stroke="var(--thr)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: ".72rem", color: "var(--ink-3)" }}>
        {hasTargetProfile && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              aria-hidden="true"
              style={{ width: 10, height: 0, borderTop: "1.5px dashed var(--ss)", display: "inline-block" }}
            />
            Ziel-Profil (geplant)
          </span>
        )}
        {!hasTargetProfile && targetBand && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden="true" style={{ width: 10, height: 8, background: "var(--ss)", opacity: 0.3, display: "inline-block" }} />
            {targetBandLabel(targetBand)}
          </span>
        )}
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
