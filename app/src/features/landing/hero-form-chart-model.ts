/* Reine Geometrie für das Hero-Form-Widget (HeroFormChart.tsx) — ohne DOM,
   damit testbar. Linien, Zonenfarben und Bandbeschriftungen kommen aus
   denselben Buildern wie die Spuren im Analyse-Tab
   (core/trace-lanes.js::buildFitnessLane/buildTsbLane, Zeichenraster
   LANE_WIDTH × Panelhöhe). Das SVG skaliert per preserveAspectRatio="none",
   Texte liegen als HTML darüber und bekommen deshalb Prozentpositionen. */

import { pickLabelIndices } from "../../core/chart-scale.js";
import { fmtDate } from "../../core/format.js";
import { buildFitnessLane, buildTsbLane, LANE_WIDTH } from "../../core/trace-lanes.js";
import type { DemoFormTrend } from "./landing-demo-model";

export const CHART_W = LANE_WIDTH;
export const FITNESS_H = 120;
export const FORM_H = 110;

/** Angenommene Darstellungsbreite der Kurve (px) — nur für den Mindestabstand
 *  der Achsenbeschriftung (Chart-Label-Konvention, AGENTS.md). */
const AXIS_RENDER_PX = 480;
const AXIS_MIN_PX = 60;

export interface ChartLine {
  d: string;
  width: number;
  dash: string;
  opacity: number;
  role: string;
}

export interface HeroFormChart {
  fitness: { lines: ChartLine[] };
  form: {
    lines: ChartLine[];
    zones: Array<{ y: number; h: number; band: string }>;
    zeroY: number | null;
    labels: Array<{ xPct: number; y: number; text: string; role: string }>;
  };
  todayPct: number;
  axisLabels: Array<{ pct: number; text: string }>;
  current: { ctl: number | null; atl: number | null; tsb: number | null };
}

function axisLabels(dates: string[], todayIdx: number, pctOf: (i: number) => number) {
  const xsPx = dates.map((_, i) => (pctOf(i) / 100) * AXIS_RENDER_PX);
  const todayPx = todayIdx >= 0 ? xsPx[todayIdx] : null;
  const picked = [...pickLabelIndices(xsPx, AXIS_MIN_PX)]
    .filter((i) => todayPx == null || Math.abs(xsPx[i] - todayPx) >= AXIS_MIN_PX)
    .sort((a, b) => a - b)
    .map((i) => ({ pct: pctOf(i), text: fmtDate(dates[i]) }));
  if (todayPx == null) return picked;
  return [...picked, { pct: pctOf(todayIdx), text: "Heute" }].sort((a, b) => a.pct - b.pct);
}

export function buildHeroFormChart(trend: DemoFormTrend): HeroFormChart {
  const { dates, todayIdx, ctlVals, atlVals, tsbVals } = trend;
  const last = Math.max(1, dates.length - 1);
  const pctOf = (i: number) => Math.round((i / last) * 1000) / 10;
  const splitAt = todayIdx >= 0 ? todayIdx : last;

  const fitness = buildFitnessLane({ ctlVals, atlVals, todayIdx: splitAt }, 0, last, FITNESS_H, null);
  const form = buildTsbLane({ tsbVals, todayIdx: splitAt }, 0, last, FORM_H, null);
  const zero = form.hlines.find((line: { kind: string }) => line.kind === "zero");

  return {
    fitness: { lines: fitness.lines },
    form: {
      lines: form.lines,
      zones: form.zones,
      zeroY: zero?.y ?? null,
      labels: form.labels.map((label: { x: number; y: number; text: string; role: string }) => ({
        xPct: Math.round((label.x / LANE_WIDTH) * 1000) / 10,
        y: label.y,
        text: label.text,
        role: label.role,
      })),
    },
    todayPct: pctOf(splitAt),
    axisLabels: axisLabels(dates, todayIdx, pctOf),
    current: {
      ctl: ctlVals[splitAt] ?? null,
      atl: atlVals[splitAt] ?? null,
      tsb: tsbVals[splitAt] ?? null,
    },
  };
}
