import { GlassCard } from "../../components/GlassCard";
import type { HeroBriefing } from "./hero-view-model";

/** Auch von HeroPage genutzt (Status-Punkt neben dem Workout-Namen). */
export const LEVEL_COLOR: Record<HeroBriefing["level"], string> = {
  green: "var(--ok)",
  yellow: "var(--warn)",
  red: "var(--danger)",
};

const LEVEL_HEADLINE: Record<HeroBriefing["level"], string> = {
  green: "Grünes Licht",
  yellow: "Mit Bedacht",
  red: "Erholung priorisieren",
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 24px", borderLeft: "1px solid var(--hair)" }}>
      <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{label}</span>
      <span style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

/** Belastungsempfehlung-Kachel. Ampel + Verb + Begründung aus
 *  `core/briefing.js::buildBriefing()`, zusammengesetzt in
 *  hero-view-model.ts::buildBriefingInfo(). Maße/Radien synchronisiert mit
 *  Hero-Weitwinkel.dc.html (löst Hero-Ebenen.dc.html als Quelle ab). */
export function BriefingCard({ briefing }: { briefing: HeroBriefing }) {
  return (
    <GlassCard variant="strong" radius="28px" style={{ padding: "34px 36px", display: "flex", gap: 30, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, flex: "none", paddingTop: 22 }}>
        {(["danger", "warn", "ok"] as const).map((tier) => {
          const on =
            (tier === "danger" && briefing.level === "red") ||
            (tier === "warn" && briefing.level === "yellow") ||
            (tier === "ok" && briefing.level === "green");
          const tierColor = tier === "danger" ? "var(--danger)" : tier === "warn" ? "var(--warn)" : "var(--ok)";
          return (
            <div
              key={tier}
              style={{
                width: 54,
                height: 46,
                borderRadius: 14,
                transition: "box-shadow .3s ease, background .3s ease",
                background: on ? tierColor : "rgba(255,255,255,0.07)",
                boxShadow: on
                  ? `0 0 0 1px color-mix(in oklab, ${tierColor} 55%, transparent), 0 12px 30px -6px color-mix(in oklab, ${tierColor} 70%, transparent)`
                  : "inset 0 0 0 1px var(--hair)",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <span style={{ fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
          Belastungsempfehlung
        </span>
        <h2 style={{ margin: 0, fontSize: "clamp(1.9rem,2.3vw,2.6rem)", lineHeight: 1.04, fontWeight: 600, letterSpacing: "-.022em", color: "var(--ink)" }}>
          {LEVEL_HEADLINE[briefing.level]}
        </h2>
        <p style={{ margin: 0, maxWidth: "52ch", fontSize: "1.02rem", lineHeight: 1.5, color: "var(--ink-2)" }}>{briefing.recommendation}</p>
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingRight: 24 }}>
            <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>Form</span>
            <span style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--ink)" }}>{briefing.tsbFmt}</span>
          </div>
          <StatChip label="Ruhepuls" value={briefing.rhr} />
          <StatChip label="HRV" value={briefing.hrv} />
        </div>
      </div>
    </GlassCard>
  );
}
