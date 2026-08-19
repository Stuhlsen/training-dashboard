import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, joinSeries } from "../core/days.js";
import { makeIndexScale, pickLabelIndices } from "../core/chart-scale.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { energyView, estimateBMR, weightTrend } from "../core/body.js";
import { ChartTooltip } from "./ChartTooltip";

type WellnessDay = import("../types.js").WellnessDay;

interface EnergyWeightChartProps {
  wellness: WellnessDay[];
  bmr?: { heightCm: number; age: number; sex?: string; weightKg: number };
}

const W_FALLBACK = 780;
const H = 220;
const PAD = { l: 46, r: 46, t: 20, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

interface Row {
  dateISO: string;
  resting: number | null;
  active: number | null;
  burned: number | null;
  intake: number | null;
}

/** Energie & Gewicht (Etappe 12h, Familie 2, docs/chart-grundlagen.md §7.2,
 *  lückige Zeitreihe) — Port von assets/js/ui/charts/wellness.js
 *  ::renderEnergy() nach dem SleepChart-Baumuster (densifyDays/joinSeries
 *  ("gap"), makeIndexScale, Balken auf der Primärachse + Linie auf einer
 *  zweiten y-Achse) statt vanillas eigenem Split-Panel-Layout (getrennter
 *  Gewichts-Unterbereich mit eigener Sub-Skala) — Angleichung an die
 *  übrigen Familie-2-React-Charts, dieselbe Dual-Achsen-Konvention wie
 *  SleepChart. `estBMR` (Mifflin-St-Jeor) wird wie in
 *  analysis-view-model.ts::buildBodyCards lokal aus dem aktuellsten Gewicht
 *  hergeleitet und bewusst hier dupliziert statt aus features/analysis
 *  importiert — Feature-Ordner sollen nicht aneinander koppeln (s.
 *  ExplorerSection.tsx-Kopfkommentar zu toProjectionCard/toProjectionEvent).
 *  Balken: Verbrauch (`--ss`) + Zufuhr (`--z2`, 1:1 aus dem vanilla-Blau
 *  #4a7fa8), Linie: Gewicht (`--role-status`, Gold-Ton wie vanillas
 *  #d9b64c). Beide Serien sind unabhängig verfügbar (core/body.js::
 *  energyView/weightTrend geben je für sich `null` unter MIN_POINTS
 *  zurück) — das Tagesgerüst deckt die UNION beider Bereiche ab, sonst
 *  wären Gewichtsmessungen außerhalb des Energie-Zeitraums unsichtbar
 *  (derselbe Bug, den der vanilla-Kopfkommentar in renderEnergy()
 *  dokumentiert). */
export function EnergyWeightChart({ wellness, bmr }: EnergyWeightChartProps) {
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

  const wt = useMemo(() => weightTrend(wellness), [wellness]);

  const estBMR = useMemo(() => {
    if (!bmr) return null;
    const recentWeight = wt?.points.length ? wt.points[wt.points.length - 1].weight : bmr.weightKg;
    return estimateBMR({ weightKg: recentWeight, heightCm: bmr.heightCm, age: bmr.age, sex: bmr.sex });
  }, [wt, bmr]);

  const ev = useMemo(() => energyView(wellness, estBMR), [wellness, estBMR]);

  const rows = useMemo<Row[]>(
    () =>
      ev
        ? ev.days.map((d) => ({ dateISO: d.date, resting: d.resting, active: d.active, burned: d.burned, intake: d.intake }))
        : [],
    [ev],
  );

  const skeleton = useMemo(() => {
    if (!rows.length && !wt?.points.length) return [];
    let fromISO = rows.length ? rows[0].dateISO : (wt as NonNullable<typeof wt>).points[0].date;
    let toISO = rows.length ? rows[rows.length - 1].dateISO : (wt as NonNullable<typeof wt>).points[wt!.points.length - 1].date;
    if (wt?.points.length) {
      const wFrom = wt.points[0].date;
      const wTo = wt.points[wt.points.length - 1].date;
      if (wFrom < fromISO) fromISO = wFrom;
      if (wTo > toISO) toISO = wTo;
    }
    return densifyDays(fromISO, toISO);
  }, [rows, wt]);

  const we = Math.max(skeleton.length - 1, 0);

  const restingVals = useMemo(() => joinSeries(skeleton, rows, { key: "resting", absence: "gap" }), [skeleton, rows]);
  const activeVals = useMemo(() => joinSeries(skeleton, rows, { key: "active", absence: "gap" }), [skeleton, rows]);
  const burnedVals = useMemo(() => joinSeries(skeleton, rows, { key: "burned", absence: "gap" }), [skeleton, rows]);
  const intakeVals = useMemo(() => joinSeries(skeleton, rows, { key: "intake", absence: "gap" }), [skeleton, rows]);
  const weightRows = useMemo(
    () => (wt ? wt.points.map((p) => ({ dateISO: p.date, weight: p.weight })) : []),
    [wt],
  );
  const weightVals = useMemo(
    () => joinSeries(skeleton, weightRows, { key: "weight", absence: "gap" }),
    [skeleton, weightRows],
  );

  if (!skeleton.length) {
    return (
      <div role="img" aria-label="Energie & Gewicht" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch keine Energie- oder Gewichtsdaten verfügbar.
      </div>
    );
  }
  if (skeleton.length < 2) {
    return (
      <div role="img" aria-label="Energie & Gewicht" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch nicht genug Energie-/Gewichtsdaten für einen Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });
  const step = we > 0 ? plotW / we : plotW;
  const barW = Math.min(step * 0.32, 14);

  const definedBurned = burnedVals.filter((v): v is number => v != null);
  const definedIntake = intakeVals.filter((v): v is number => v != null);
  const definedWeight = weightVals.filter((v): v is number => v != null);
  const hasEnergy = definedBurned.length > 0 || definedIntake.length > 0;
  const hasWeight = definedWeight.length > 0;

  const maxKcal = hasEnergy ? Math.max(...definedBurned, ...definedIntake) * 1.1 : 1;
  const yOf = (v: number) => PAD.t + plotH * (1 - v / maxKcal);
  const yBase = PAD.t + plotH;

  const wMin = hasWeight ? Math.min(...definedWeight) - 0.4 : 0;
  const wMax = hasWeight ? Math.max(...definedWeight) + 0.4 : 1;
  const wY = (v: number) => PAD.t + plotH * (1 - (v - wMin) / (wMax - wMin || 1));

  const connectedWeightPoints: { index: number; value: number }[] = [];
  for (let i = 0; i <= we; i++) {
    if (weightVals[i] != null) connectedWeightPoints.push({ index: i, value: weightVals[i] as number });
  }
  const weightPath =
    connectedWeightPoints.length > 1
      ? connectedWeightPoints.map((p, i) => `${i === 0 ? "M" : "L"}${scale.x(p.index)},${wY(p.value)}`).join(" ")
      : null;

  const dateXs = skeleton.map((_, i) => scale.x(i));
  const pickedTicks = [...pickLabelIndices(dateXs, 55)];

  const energyTip = (i: number) => {
    const burned = burnedVals[i];
    const resting = restingVals[i];
    const active = activeVals[i];
    const intake = intakeVals[i];
    const parts: string[] = [];
    if (burned != null && burned > 0) {
      parts.push(
        resting != null && resting > 0
          ? `Verbrauch ${burned} kcal (Grundumsatz ${resting}${ev?.restingEstimated ? " gesch." : ""} · aktiv ${active ?? 0})`
          : `Aktiv verbrannt ${active ?? burned} kcal`,
      );
    }
    if (intake != null) parts.push(`Zufuhr ${intake} kcal`);
    return `${fmtDateFull(skeleton[i].dateISO)} · ${parts.join(" · ")}`;
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Energieverbrauch/-zufuhr und Gewicht über Zeit"
      >
        {[0, 1, 2, 3, 4].map((step2) => {
          const v = (maxKcal / 4) * step2;
          const y = yOf(v);
          return (
            <g key={step2}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              {hasEnergy && (
                <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                  {Math.round(v)}
                </text>
              )}
            </g>
          );
        })}
        {hasEnergy && (
          <text x={PAD.l - 8} y={PAD.t - 6} textAnchor="end" fontSize={9} fill="var(--text-label)">
            kcal
          </text>
        )}

        {hasEnergy &&
          skeleton.map((day, i) => {
            const burned = burnedVals[i];
            const intake = intakeVals[i];
            if (burned == null && intake == null) return null;
            const cx = scale.x(i);
            return (
              <g key={day.dateISO}>
                {burned != null && burned > 0 && (
                  <rect
                    x={cx - barW - 1}
                    y={yOf(burned)}
                    width={barW}
                    height={Math.max(yBase - yOf(burned), 1)}
                    rx={2}
                    fill="var(--ss)"
                    opacity={0.85}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, content: energyTip(i) })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )}
                {intake != null && (
                  <rect
                    x={cx + 1}
                    y={yOf(intake)}
                    width={barW}
                    height={Math.max(yBase - yOf(intake), 1)}
                    rx={2}
                    fill="var(--z2)"
                    opacity={0.85}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, content: energyTip(i) })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )}
              </g>
            );
          })}

        {weightPath && <path d={weightPath} fill="none" stroke="var(--role-status)" strokeWidth={2} />}
        {hasWeight &&
          skeleton.map((day, i) => {
            const v = weightVals[i];
            if (v == null) return null;
            return (
              <g key={`w-${day.dateISO}`}>
                {/* Unsichtbare, größere Trefferfläche zuerst im DOM
                    (19.08.2026, Bugfix) — s. PmcChart.tsx für die
                    ausführliche Begründung. */}
                <circle
                  cx={scale.x(i)}
                  cy={wY(v)}
                  r={10}
                  fill="transparent"
                  pointerEvents="all"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) =>
                    setTooltip({ x: e.clientX, y: e.clientY, content: `${fmtDateFull(day.dateISO)} · ${v} kg` })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
                <circle cx={scale.x(i)} cy={wY(v)} r={3} fill="var(--role-status)" stroke="var(--surface-page)" strokeWidth={1.5} pointerEvents="none" />
              </g>
            );
          })}

        {hasWeight && (
          <>
            {[wMin + 0.4, (wMin + wMax) / 2, wMax - 0.4].map((v, i) => (
              <text key={i} x={width - PAD.r + 6} y={wY(v) + 3} fontSize={10} fill="var(--role-status)" opacity={0.9}>
                {v.toFixed(1)}
              </text>
            ))}
            <text x={width - PAD.r + 6} y={PAD.t - 6} fontSize={9} fill="var(--role-status)" opacity={0.9}>
              kg
            </text>
          </>
        )}

        {pickedTicks.map((i) => (
          <text key={i} x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(skeleton[i].dateISO)}
          </text>
        ))}
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
    </div>
  );
}
