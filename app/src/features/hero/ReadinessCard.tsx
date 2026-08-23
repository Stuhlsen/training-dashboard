import { useNavigate } from "react-router-dom";
import { GlassCard } from "../../components/GlassCard";
import { LEVEL_COLOR } from "./BriefingCard";
import type { HeroBriefing } from "./hero-view-model";
import type { assessReadiness } from "../../core/readiness.js";

type Readiness = NonNullable<ReturnType<typeof assessReadiness>>;
type Metric = Readiness["metrics"][number];

const LEVEL_LABEL: Record<Readiness["level"], string> = {
  green: "Bereit",
  yellow: "Angeschlagen",
  red: "Erholung nötig",
};

const STATUS_COLOR: Record<Metric["status"], string> = {
  ok: "var(--ok)",
  caution: "var(--warn)",
  alert: "var(--danger)",
  nodata: "var(--ink-3)",
};

const CONFIDENCE_BADGE: Record<Metric["confidence"], string> = {
  vorhanden: "",
  ausstehend: "⏳",
  veraltet: "⚠",
};

function metricTitle(m: Metric): string {
  const days = m.daysSinceLastValue != null ? ` (${m.daysSinceLastValue}d)` : "";
  return `z = ${m.z != null ? m.z : "–"} · Konfidenz: ${m.confidence}${days}`;
}

function BriefingLink({ briefing }: { briefing: HeroBriefing }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/analysis")}
      style={{
        marginTop: 12,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
        fontSize: ".78rem",
        color: LEVEL_COLOR[briefing.level],
      }}
    >
      Belastungsempfehlung: {briefing.headline} →
    </button>
  );
}

/** Port von `ui/panels.js::renderReadiness()` — Tagesform als eigenständige
 *  Detailkarte NEBEN der Belastungsempfehlung (BriefingCard): beide
 *  verrechnen dasselbe `assessReadiness()`-Rohsignal unterschiedlich weit
 *  (s. hero-view-model.ts::HeroCore.readiness-Kommentar), können also
 *  divergieren — genau deshalb zeigt Vanilla beide Panels nebeneinander
 *  statt nur eines. */
export function ReadinessCard({ readiness, briefing }: { readiness: Readiness | null; briefing: HeroBriefing }) {
  if (!readiness) {
    return (
      <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Tagesform
        </span>
        <p style={{ margin: "10px 0 0", fontSize: ".85rem", color: "var(--ink-3)" }}>
          Noch zu wenig Wellness-Historie für eine belastbare Baseline (braucht ~6 Wochen intervals.icu-Daten).
        </p>
        <BriefingLink briefing={briefing} />
      </GlassCard>
    );
  }

  const color = LEVEL_COLOR[readiness.level];

  return (
    <GlassCard variant="soft" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Tagesform
        </span>
        <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>7 Tage vs. 42-Tage-Baseline</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 14px ${color}`, flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".95rem", color }}>{LEVEL_LABEL[readiness.level]}</div>
          <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{readiness.recommendation}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {readiness.metrics.map((m) => (
          <div
            key={m.key}
            title={metricTitle(m)}
            style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: ".82rem" }}
          >
            <span style={{ color: STATUS_COLOR[m.status] }}>●</span>
            <span style={{ color: "var(--ink-2)", flex: 1 }}>{m.label}</span>
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>
              {m.recent != null ? m.recent : "–"}
              {CONFIDENCE_BADGE[m.confidence] ? ` ${CONFIDENCE_BADGE[m.confidence]}` : ""}
            </span>
            <span style={{ color: "var(--ink-3)" }}>Ø {m.baseline != null ? m.baseline : "–"}</span>
          </div>
        ))}
      </div>

      {readiness.basisNote && (
        <p style={{ margin: "10px 0 0", fontSize: ".72rem", color: "var(--ink-3)" }}>{readiness.basisNote}</p>
      )}
      {readiness.staleWarning && (
        <p style={{ margin: "4px 0 0", fontSize: ".72rem", color: "var(--warn)" }}>⚠ {readiness.staleWarning}</p>
      )}

      <BriefingLink briefing={briefing} />
    </GlassCard>
  );
}
