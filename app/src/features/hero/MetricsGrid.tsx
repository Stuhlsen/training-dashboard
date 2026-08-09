import { GlassCard } from "../../components/GlassCard";
import type { HeroMetric } from "./hero-view-model";

/** Eine Kachel — Port von `ui/overview.js::_renderMetrics()`s `.metric-card`
 *  (assets/css/components.css). Akzentkante links über einen absolut
 *  positionierten Balken statt `::before` (diese App stylt ausschließlich
 *  inline, kein CSS-Modul für den Hero-Bereich). */
function MetricTile({ metric }: { metric: HeroMetric }) {
  return (
    <GlassCard
      variant="soft"
      style={{ position: "relative", padding: "14px 16px 14px 19px", overflow: "hidden", transition: "transform .18s ease" }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: metric.color }} />
      <div
        style={{
          fontFamily: "var(--font-disp)",
          fontSize: "1.5rem",
          fontWeight: 700,
          color: metric.color,
          letterSpacing: "-.02em",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {metric.value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: ".62rem",
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: ".1em",
          marginTop: 6,
          fontWeight: 500,
        }}
      >
        {metric.label}
      </div>
      <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>{metric.desc}</div>
    </GlassCard>
  );
}

/** Gesamtstatistiken-Kachelreihe unten im Hero (Etappe 11c) — Port von
 *  `#metrics-grid`/`.grid.grid-auto` (assets/css/main.css). */
export function MetricsGrid({ metrics }: { metrics: HeroMetric[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
      {metrics.map((m) => (
        <MetricTile key={m.label} metric={m} />
      ))}
    </div>
  );
}
