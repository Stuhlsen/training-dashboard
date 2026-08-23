import { GlassCard } from "../../components/GlassCard";
import { ProgressRing } from "../../components/ProgressRing";
import { fmtDate } from "../../core/format.js";
import type { HeroRing, HeroViewModel } from "./hero-view-model";

/** Tier "FTP-Ringe" — zwei Ringe (eFTP/Ramp-Test) + Saisonziel-Zeitstrahl
 *  (`core/ftp-progress.js::ringProgress/buildMilestones`). */
/** Ring-Belegung: der jeweils HÖHERE Wert (eFTP oder Ramp-Test) bekommt den
 *  großen, akzentuierten Ring — welcher das ist, entscheidet bereits
 *  `hero-view-model.ts::buildHeroCore` (`ftpPrimary`, dort auch getestet).
 *  Diese Komponente liest den Wert nur noch und rendert; kein eigener
 *  Wertevergleich hier (Regression: der eine Vergleich lebt an genau EINER
 *  Stelle, mit Testschutz). */
type RingKind = "eftp" | "ramp";
const RING_LABEL: Record<RingKind, string> = { eftp: "eFTP · W", ramp: "Ramp · W" };
/** Gemessen (Ramp-Test) vs. geschätzt (eFTP) — Wort UND Icon an jeder
 *  Stelle, an der einer der beiden Werte auftaucht (Ringe + Zeitstrahl),
 *  damit der Unterschied auch ohne genaues Lesen auffällt (Review-Feedback
 *  23.08.2026 auf dem Design-Canvas, s. docs-Historie in der Session). */
const QUALIFIER_LABEL: Record<RingKind, string> = { eftp: "geschätzt", ramp: "gemessen" };

function CheckIcon({ color = "var(--ink-2)", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ flex: "none" }}>
      <circle cx="7" cy="7" r="6.5" fill={color} />
      <path d="M4 7.2 L6.1 9.3 L10 5" stroke="#0b0e13" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ApproxIcon({ color = "var(--accent-2)", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ flex: "none" }}>
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="2.4 2.2" />
    </svg>
  );
}

function RingQualifier({ kind }: { kind: RingKind }) {
  const color = kind === "ramp" ? "var(--ink-3)" : "var(--accent-2)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {kind === "ramp" ? <CheckIcon color={color} /> : <ApproxIcon color={color} />}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".66rem", letterSpacing: ".06em", textTransform: "uppercase", color }}>
        {QUALIFIER_LABEL[kind]}
      </span>
    </div>
  );
}

/** Icon/Tag/Punkt-Zuordnung je Meilenstein-Label — rein anhand des von
 *  `buildMilestones()` gelieferten Labels, keine eigene Werte-Logik hier. */
function timelineMeta(label: string): { icon: "measured" | "estimated" | null; tag?: string; dot: "plain" | "accent" | "future" } {
  if (label === "Ramp-Test") return { icon: "measured", dot: "plain" };
  if (label === "Aktuelle eFTP") return { icon: "estimated", tag: "Heute", dot: "accent" };
  if (label === "Saisonziel") return { icon: null, dot: "future" };
  return { icon: null, dot: "plain" };
}

function TimelineRow({
  label,
  value,
  date,
  suffix,
  isLast,
}: {
  label: string;
  value: number;
  date?: string;
  suffix?: string;
  isLast: boolean;
}) {
  const { icon, tag, dot } = timelineMeta(label);
  const dashedAfter = label === "Aktuelle eFTP";
  const labelColor = dot === "accent" ? "var(--accent-2)" : "var(--ink-3)";

  return (
    <div style={{ display: "flex", gap: 13 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 12, flex: "none" }}>
        {dot === "future" ? (
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "transparent", border: "2px solid var(--ink-3)", boxSizing: "border-box" }} />
        ) : dot === "accent" ? (
          <span
            style={{
              width: 13,
              height: 13,
              margin: "-2px 0 0 -2px",
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 0 4px color-mix(in oklab, var(--accent) 22%, transparent)",
            }}
          />
        ) : (
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ink-3)", flex: "none" }} />
        )}
        {!isLast && (
          <span
            style={{
              width: 2,
              flex: 1,
              minHeight: 16,
              marginTop: dot === "accent" ? 4 : 2,
              background: dashedAfter
                ? "repeating-linear-gradient(to bottom, var(--hair) 0 4px, transparent 4px 8px)"
                : "var(--hair)",
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: isLast ? 0 : 13, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {icon === "measured" && <CheckIcon color="var(--ink-2)" />}
            {icon === "estimated" && <ApproxIcon color="var(--accent-2)" />}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".64rem", letterSpacing: ".07em", textTransform: "uppercase", color: labelColor }}>
              {label}
              {icon === "measured" ? " · gemessen" : icon === "estimated" ? " · geschätzt" : ""}
              {date ? ` · ${fmtDate(date)}` : ""}
            </span>
            {tag && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: ".58rem",
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: "var(--ink)",
                  background: "color-mix(in oklab, var(--accent) 30%, transparent)",
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                {tag}
              </span>
            )}
          </div>
          <span
            style={{
              fontFamily: "var(--font-disp)",
              fontSize: dot === "accent" ? "1.02rem" : ".96rem",
              fontWeight: dot === "accent" ? 700 : 600,
              color: dot === "accent" ? "var(--ink)" : "var(--ink-2)",
            }}
          >
            {value} W
            {suffix && <span style={{ fontFamily: "var(--font-body)", fontSize: ".78rem", fontWeight: 400, color: "var(--ink-3)" }}> · {suffix}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

export function FtpRings({
  eftp,
  ramp,
  ftpPrimary,
  milestones,
  goal,
}: {
  eftp: HeroRing;
  ramp: HeroRing & { date: string | null };
  ftpPrimary: RingKind;
  milestones: HeroViewModel["milestones"];
  goal: number;
}) {
  const remaining = Math.max(0, goal - eftp.value);
  const remainingSuffix = goal ? (remaining > 0 ? `noch ${remaining} W` : "erreicht") : undefined;

  const secondaryKind: RingKind = ftpPrimary === "ramp" ? "eftp" : "ramp";
  const primary = ftpPrimary === "ramp" ? ramp : eftp;
  const secondary = secondaryKind === "ramp" ? ramp : eftp;
  // Nur der Ramp-Ring trägt ein Testdatum, unabhängig davon, ob er gerade
  // groß (primary) oder klein (secondary) dargestellt wird.
  const rampDate = ramp.date;

  return (
    <GlassCard variant="soft" radius="24px" style={{ padding: "26px 28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-tile-title)", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700 }}>
        FTP-Fortschritt
      </span>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <ProgressRing size={150} strokeWidth={12} progress={primary.progress} color="var(--accent)">
            <span style={{ fontSize: "2.35rem", fontWeight: 600, lineHeight: 1, letterSpacing: "-.02em", color: "var(--ink)" }}>{primary.value}</span>
            <span style={{ fontSize: ".64rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-2)", fontWeight: 600 }}>
              {RING_LABEL[ftpPrimary]}
            </span>
          </ProgressRing>
          <RingQualifier kind={ftpPrimary} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 22 }}>
          <ProgressRing size={104} strokeWidth={8} progress={secondary.progress} color="var(--ink-2)">
            <span style={{ fontSize: "1.44rem", fontWeight: 600, lineHeight: 1, color: "var(--ink)" }}>{secondary.value}</span>
            <span style={{ fontSize: ".56rem", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
              {RING_LABEL[secondaryKind]}
            </span>
          </ProgressRing>
          <RingQualifier kind={secondaryKind} />
        </div>
      </div>

      <div style={{ height: 1, background: "var(--hair)" }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {milestones.map((m, i) => (
          <TimelineRow
            key={m.label}
            label={m.label}
            value={m.value}
            date={m.label === "Ramp-Test" ? (m.date ?? rampDate ?? undefined) : m.date}
            suffix={m.label === "Saisonziel" ? remainingSuffix : undefined}
            isLast={i === milestones.length - 1}
          />
        ))}
      </div>
    </GlassCard>
  );
}
