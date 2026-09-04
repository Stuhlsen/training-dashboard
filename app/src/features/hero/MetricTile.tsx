import { GlassCard } from "../../components/GlassCard";
import { InfoTooltip } from "../../components/InfoTooltip";
import type { HeroMetric } from "./hero-view-model";

/** Kachel-Label → Glossar-Key. Nur echte Abkürzungen/Jargon, nicht jedes
 *  Label (Gesamtdistanz/Fahrten/… bleiben ohne Tooltip). Die Labels kommen
 *  als Strings aus `buildHeroMetrics()` — hier gematcht, damit das
 *  View-Model reine Daten bleibt. */
const METRIC_TERMS: Record<string, string> = {
  "FTP (Ramp Test)": "ftp",
  "eFTP (Intervals.icu)": "eftp",
  "CTL Peak": "ctl",
  "Ø Kadenz": "cadence",
};

/** Eine Kennzahlen-Kachel — Port von `ui/overview.js::_renderMetrics()`s
 *  `.metric-card` (assets/css/components.css). Akzentkante links über einen
 *  absolut positionierten Balken statt `::before` (diese App stylt
 *  ausschließlich inline, kein CSS-Modul für den Hero-Bereich). Seit dem
 *  Umbau auf ein 2D-Raster (HeroTileGrid.tsx) ist JEDE Kennzahl ihre eigene
 *  Hero-Kachel (einzeln verschiebbar) statt Teil eines gemeinsamen
 *  `MetricsGrid`-Blocks — s. HeroPage.tsx's Kachel-Registry. */
export function MetricTile({ metric }: { metric: HeroMetric }) {
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
          fontSize: "var(--fs-label)",
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: ".1em",
          marginTop: 6,
          fontWeight: 500,
        }}
      >
        {METRIC_TERMS[metric.label] ? (
          <InfoTooltip termKey={METRIC_TERMS[metric.label]}>{metric.label}</InfoTooltip>
        ) : (
          metric.label
        )}
      </div>
      <div style={{ fontSize: ".72rem", color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>{metric.desc}</div>
    </GlassCard>
  );
}
