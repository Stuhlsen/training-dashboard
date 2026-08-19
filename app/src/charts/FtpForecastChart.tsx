import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { eftpHistory, eftpHistoryFromWellness, forecastFtp, mergeEftpHistories } from "../core/ftp-forecast.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;
type WellnessDay = import("../types.js").WellnessDay;

interface FtpForecastChartProps {
  rides: Ride[];
  wellness: WellnessDay[];
  ftpGoal: number | null;
  /** Nur bei eigenem Plan gibt es einen belastbaren Retest-Termin — ohne ihn
   *  zeichnet der Chart reine Verlaufsdarstellung ohne Prognose-Fächer
   *  (Port-Kommentar aus assets/js/ui/charts/pmc.js::renderFtpForecast). */
  ownPlan: boolean;
  retestDateISO: string | null;
  targetLabel?: string;
}

const W_FALLBACK = 780;
const H = 200;
const PAD = { l: 46, r: 60, t: 18, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** FTP-Retest-Prognose (Etappe 12b, Familie 1 — echte Zeitachse über
 *  Kalenderdaten, docs/dashboard-3.0-konzept-react-umbau.md Etappe 12).
 *  Port von assets/js/ui/charts/pmc.js::renderFtpForecast() nach dem
 *  WeeklyVolumeChart-Baumuster. `core/ftp-forecast.js` liefert Historie +
 *  Projektion unverändert — dieselben Funktionen, die
 *  analysis-view-model.ts::buildPowerDiagnostics() für die Text-Sektion
 *  nutzt (FtpTriad), hier nur zusätzlich grafisch. */
export function FtpForecastChart({ rides, wellness, ftpGoal, ownPlan, retestDateISO, targetLabel = "Retest" }: FtpForecastChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(W_FALLBACK);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useLayoutEffect(() => {
    const node = svgRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const history = useMemo(
    () => mergeEftpHistories(eftpHistory(rides ?? []), eftpHistoryFromWellness(wellness ?? [])),
    [rides, wellness],
  );
  const retestISO = ownPlan ? retestDateISO : null;
  const fc = useMemo(
    () => (history.length >= 3 && retestISO ? forecastFtp(history, retestISO) : null),
    [history, retestISO],
  );

  if (history.length < 3) {
    return (
      <div role="img" aria-label="FTP-Retest-Prognose" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        eFTP-Historie wird ab dem nächsten Daten-Sync aufgebaut.
      </div>
    );
  }

  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const plotH = H - PAD.t - PAD.b;

  const t0 = new Date(history[0].date).getTime();
  const lastISO = history[history.length - 1].date;
  const tEnd = Math.max(new Date(retestISO || lastISO).getTime(), t0 + 86400000);
  const xOf = (iso: string) => PAD.l + ((new Date(iso).getTime() - t0) / (tEnd - t0)) * plotW;

  const vals = history.map((h) => h.eftp);
  const lowCandidates = [...vals];
  const highCandidates = [...vals];
  if (fc) {
    lowCandidates.push(fc.low);
    highCandidates.push(fc.high);
  }
  if (ftpGoal != null) {
    lowCandidates.push(ftpGoal);
    highCandidates.push(ftpGoal);
  }
  const minV = Math.min(...lowCandidates) - 4;
  const maxV = Math.max(...highCandidates) + 4;
  const yOf = (v: number) => PAD.t + plotH - ((v - minV) / (maxV - minV)) * plotH;

  const gridStep = Math.max(1, Math.round((maxV - minV) / 4 / 5) * 5);
  const gridStart = Math.ceil(minV / gridStep) * gridStep;
  const gridValues: number[] = [];
  for (let v = gridStart; v <= maxV; v += gridStep) gridValues.push(v);

  const histPts = history.map((h) => ({ x: xOf(h.date), y: yOf(h.eftp), h }));
  const pointStep = Math.max(1, Math.floor(histPts.length / 14));
  const last = histPts[histPts.length - 1];
  const xT = retestISO ? xOf(retestISO) : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="FTP-Retest-Prognose: eFTP-Verlauf mit Projektion"
      >
        {gridValues.map((v) => {
          const y = yOf(v);
          return (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {ftpGoal != null && (
          <g>
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={yOf(ftpGoal)}
              y2={yOf(ftpGoal)}
              stroke="var(--role-status)"
              strokeWidth={1.2}
              strokeDasharray="6,3"
              opacity={0.8}
            />
            <text x={width - PAD.r + 4} y={yOf(ftpGoal) + 3} fontSize={9} fill="var(--role-status)">
              Ziel {ftpGoal}
            </text>
          </g>
        )}

        <polyline
          fill="none"
          stroke="var(--ss)"
          strokeWidth={2}
          strokeLinejoin="round"
          points={histPts.map((p) => `${p.x},${p.y}`).join(" ")}
        />
        {histPts.map((p, i) => {
          if (i % pointStep !== 0 && i !== histPts.length - 1) return null;
          return (
            <g key={p.h.date}>
              {/* Unsichtbare, größere Trefferfläche zuerst im DOM
                  (19.08.2026, Bugfix) — s. PmcChart.tsx für die
                  ausführliche Begründung. */}
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, content: `${fmtDateFull(p.h.date)} · eFTP ${p.h.eftp} W` })}
                onMouseLeave={() => setTooltip(null)}
              />
              <circle cx={p.x} cy={p.y} r={3} fill="var(--ss)" stroke="var(--surface-page)" strokeWidth={1.5} pointerEvents="none" />
            </g>
          );
        })}

        {fc && xT != null && (
          <g>
            <path d={`M${last.x},${last.y} L${xT},${yOf(fc.high)} L${xT},${yOf(fc.low)} Z`} fill="var(--ss)" opacity={0.12} />
            <line x1={last.x} x2={xT} y1={last.y} y2={yOf(fc.projected)} stroke="var(--ss)" strokeWidth={1.6} strokeDasharray="5,4" />
            <text x={xT + 4} y={yOf(fc.projected) + 3} fill="var(--text-ink)" fontSize={10} fontWeight={600}>
              ~{fc.projected} W
            </text>
            <text x={xT + 4} y={yOf(fc.projected) + 15} fill="var(--text-soft)" fontSize={8.5}>
              {fc.low}–{fc.high}
            </text>
          </g>
        )}

        {retestISO && xT != null && (
          <g>
            <line x1={xT} x2={xT} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="2,3" />
            <text x={xT} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
              {targetLabel} {fmtDate(retestISO)}
            </text>
          </g>
        )}
        <text x={histPts[0].x} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
          {fmtDate(history[0].date)}
        </text>
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
    </div>
  );
}
