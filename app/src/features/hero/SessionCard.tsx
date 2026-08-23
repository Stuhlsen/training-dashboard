import { GlassCard } from "../../components/GlassCard";
import type { HeroSession } from "./hero-view-model";

/** "Was steht heute an" — Port des Design-Canvas-Entwurfs vom 23.08.2026
 *  (Option B, 2× überarbeitet nach Review-Feedback: Warmup/Cooldown-Details
 *  jetzt in einer freien Zeile UNTER dem Balken statt im abgerundeten,
 *  clippenden Segment selbst; "Warmup"/"Cooldown" bewusst englisch belassen).
 *  Ersetzt die reine Fließtext-Zeile aus dem vorherigen Stand — Segmente
 *  kommen aus `legacyWorkoutSegments()` (Planungstab), nur die Watt-Werte
 *  sind Hero-eigen (aktuelle FTP statt %FTP/Autorenzeit-Watt). */
export function SessionCard({ session, statusColor }: { session: HeroSession; statusColor: string }) {
  const hero = session.interval
    ? { value: `${session.interval.wattRange[0]}–${session.interval.wattRange[1]}`, unit: "W" }
    : session.km
      ? { value: `~${session.km}`, unit: "km" }
      : null;

  return (
    <GlassCard variant="strong" radius="20px" style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch", padding: "18px 22px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: statusColor,
              boxShadow: `0 0 0 5px color-mix(in oklab, ${statusColor} 18%, transparent)`,
              flex: "none",
            }}
          />
          <span style={{ fontSize: "1.04rem", fontWeight: 600, color: "var(--ink)" }}>
            {session.when} · {session.label}
            {session.interval && session.km ? ` · ~${session.km} km` : ""}
          </span>
        </div>
        {hero && (
          <span style={{ fontFamily: "var(--font-disp)", fontSize: "1.7rem", fontWeight: 700, lineHeight: 1, letterSpacing: "-.02em", color: session.color, whiteSpace: "nowrap" }}>
            {hero.value}
            <span style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--ink-3)" }}> {hero.unit}</span>
          </span>
        )}
      </div>

      {session.interval && (
        <>
          <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden" }}>
            {session.interval.segments.map((seg, i) => (
              <div
                key={i}
                title={seg.title}
                style={{
                  flex: `0 0 ${seg.widthPct}%`,
                  background: seg.type === "interval" ? session.color : seg.type === "rest" ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.09)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: ".6rem",
                  color: seg.type === "interval" ? "var(--ink)" : "var(--ink-3)",
                  borderLeft: i > 0 ? "1px solid rgba(0,0,0,.25)" : undefined,
                }}
              >
                {seg.type !== "rest" ? seg.label : ""}
              </div>
            ))}
          </div>

          {(session.interval.warmupLabel || session.interval.cooldownLabel) && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "var(--ink-2)" }}>
                {session.interval.warmupLabel && (
                  <>
                    Warmup <span style={{ color: "var(--ink-3)" }}>{session.interval.warmupLabel}</span>
                  </>
                )}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".72rem", color: "var(--ink-2)", textAlign: "right" }}>
                {session.interval.cooldownLabel && (
                  <>
                    Cooldown <span style={{ color: "var(--ink-3)" }}>{session.interval.cooldownLabel}</span>
                  </>
                )}
              </span>
            </div>
          )}
        </>
      )}

      {session.chips.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {session.chips.map((chip) => (
            <span
              key={chip}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: ".7rem",
                letterSpacing: ".04em",
                color: "var(--ink-2)",
                background: "rgba(255,255,255,.06)",
                border: "1px solid var(--hair)",
                borderRadius: 999,
                padding: "5px 13px",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {session.detailParts.map((part) => (
        <span key={part} style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>
          {part}
        </span>
      ))}
    </GlassCard>
  );
}
