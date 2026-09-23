/* ============================================================
   FEATURES/LANDING/HEROFORMCHART.TSX — Form-Kurve im Hero (Fahrplan 22,
   nach E8). Schlanke eigene Darstellung statt TraceCard: deren feste
   Titel-/Wertspalten (264 px) ließen in der halben Hero-Breite nur gut
   200 px für die Kurve (Alex, 23.09.2026: im Browser gut erkennbar).
   Inhalt, Farben und Bandgrenzen wie der Analyse-Tab ("Fitness &
   Ermüdung", "Form (TSB)"), die Geometrie rechnet hero-form-chart-model.ts.
   ============================================================ */

import { GlassCard } from "../../components/GlassCard";
import { fmtSigned } from "../../core/format.js";
import { tsbBandOf } from "../../core/trace-lanes.js";
import { CHART_W, FITNESS_H, FORM_H, type ChartLine, type HeroFormChart as HeroFormChartModel } from "./hero-form-chart-model";

/** Bandfüllungen und Zonenfarben wie charts/TraceLane.tsx
 *  (ZONE_BAND_FILL/LABEL_ROLE_COLOR/lineColor) — dort bei Änderungen mitziehen. */
const BAND_FILL: Record<string, string> = {
  overload: "rgba(217,79,79,.32)",
  build: "rgba(111,196,140,.26)",
  fresh: "rgba(201,168,76,.28)",
};

const ROLE_COLOR: Record<string, string> = {
  primary: "var(--role-primary)",
  secondary: "var(--role-secondary)",
  positive: "var(--role-positive)",
  fresh: "rgba(201,168,76,.95)",
  build: "rgba(111,196,140,.9)",
  overload: "rgba(217,79,79,.9)",
};

/** Bandbeschriftung bleibt innerhalb der Panelhöhe (wie TraceLane.tsx). */
const LABEL_EDGE_PX = 7;

/** Zustandswörter wie der Ruhewert der TSB-Spur im Analyse-Tab
 *  (answers-view-model.ts, laneTsb) — passend zu den Bandbeschriftungen. */
const BAND_WORD: Record<string, string> = {
  overload: "überlastet",
  build: "produktiv",
  fresh: "erholt",
  "too-fresh": "zu frisch",
  neutral: "neutral",
};

function Lines({ lines }: { lines: ChartLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <path
          key={i}
          className="hero-form__line"
          d={line.d}
          stroke={ROLE_COLOR[line.role] ?? "var(--role-positive)"}
          strokeWidth={line.width + 0.4}
          strokeDasharray={line.dash === "0" ? undefined : line.dash}
          opacity={line.opacity}
        />
      ))}
    </>
  );
}

export function HeroFormChart({ chart }: { chart: HeroFormChartModel }) {
  const { fitness, form, todayPct, axisLabels, current } = chart;
  const todayX = (todayPct / 100) * CHART_W;
  const band = tsbBandOf(current.tsb) ?? "neutral";
  const summary = `Demo: Fitness ${current.ctl != null ? Math.round(current.ctl) : "–"}, Form ${current.tsb != null ? fmtSigned(current.tsb, 0) : "–"}`;

  return (
    <GlassCard variant="strong" radius="20px" className="hero-form" style={{ padding: "18px 22px 12px" }}>
      <div role="img" aria-label={summary}>
        <div className="hero-form__head">
          <div>
            <p className="hero-form__title">Fitness &amp; Ermüdung</p>
            <p className="hero-form__legend">
              <span className="hero-form__key hero-form__key--ctl">CTL Fitness</span>
              <span className="hero-form__key hero-form__key--atl">ATL Ermüdung</span>
            </p>
          </div>
          <p className="hero-form__value">
            {current.ctl != null ? Math.round(current.ctl) : "–"}
            <span>CTL</span>
          </p>
        </div>
        <svg className="hero-form__plot" style={{ height: FITNESS_H }} viewBox={`0 0 ${CHART_W} ${FITNESS_H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="hero-form__today" x1={todayX} x2={todayX} y1={0} y2={FITNESS_H} />
          <Lines lines={fitness.lines} />
        </svg>

        <div className="hero-form__head hero-form__head--form">
          <p className="hero-form__title">Form (TSB)</p>
          <p className="hero-form__value">
            {current.tsb != null ? fmtSigned(current.tsb, 0) : "–"}
            <span>{BAND_WORD[band]}</span>
          </p>
        </div>
        <div className="hero-form__panel">
          <svg className="hero-form__plot" style={{ height: FORM_H }} viewBox={`0 0 ${CHART_W} ${FORM_H}`} preserveAspectRatio="none" aria-hidden="true">
            {form.zones.map((zone) => (
              <rect key={zone.band} x={0} y={zone.y} width={CHART_W} height={zone.h} fill={BAND_FILL[zone.band] ?? "transparent"} />
            ))}
            {form.zeroY != null && <line className="hero-form__zero" x1={0} x2={CHART_W} y1={form.zeroY} y2={form.zeroY} />}
            <line className="hero-form__today" x1={todayX} x2={todayX} y1={0} y2={FORM_H} />
            <Lines lines={form.lines} />
          </svg>
          {form.labels.map((label) => (
            <span
              key={label.text}
              className="hero-form__band-label"
              aria-hidden="true"
              style={{
                left: `${label.xPct}%`,
                top: `${Math.max(LABEL_EDGE_PX, Math.min(FORM_H - LABEL_EDGE_PX, label.y))}px`,
                color: ROLE_COLOR[label.role] ?? "var(--ink-3)",
              }}
            >
              {label.text}
            </span>
          ))}
        </div>

        <div className="hero-form__axis" aria-hidden="true">
          {axisLabels.map((label) => (
            <span
              key={`${label.pct}-${label.text}`}
              className={label.text === "Heute" ? "hero-form__tick hero-form__tick--today" : "hero-form__tick"}
              style={{ left: `${label.pct}%` }}
            >
              {label.text}
            </span>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
