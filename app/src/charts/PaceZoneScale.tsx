/* ============================================================
   CHARTS/PACEZONESCALE.TSX — Pace-Trainingszonen als horizontaler
   Bänder-Streifen (Fahrplan 10 E8b). Das Pace-Pendant zur Hero-
   Leistungsskala (PowerScale.tsx), aber ohne What-if-Slider/Pins —
   eine reine Ablese-Skala.

   Zwei Zustände:
   - NORMAL: die fünf Zonen (Daniels E/M/T/I/R bzw. CSS Rekom…Sprint),
     breitenproportional zur Geschwindigkeit, Pace-Grenzen darunter.
   - DEGRADIERT (`degraded`): keine belastbare Schwellenpace vorhanden
     (Athlet 3 hat keinen erschöpfenden Effort, E0 2026-09-07). Gleich
     breite, ausgegraute Bänder mit Zonen-Labels, KEINE Zahlen, darunter
     ein fester, freundlicher Hinweistext (Grill-Punkt 6 — nicht der rohe
     `reason`-String).
   ============================================================ */

import { fmtPace } from "../core/format.js";
import type { PaceZone } from "../features/analysis/pace-section-view-model";

interface PaceZoneScaleProps {
  zones: PaceZone[];
  scaleMaxSpeed: number;
  degraded: boolean;
  thresholdUnit: string;
  /** Nur für den Wortlaut des Degradations-Hinweises ("Lauf" vs.
   *  "Schwimm-Einheit"). */
  sport: "run" | "swim";
  /** Technischer Grund aus critical-speed.js — nur als title-Tooltip, nie
   *  als sichtbarer Text. */
  degradedReason?: string | null;
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".6rem",
  letterSpacing: ".04em",
  color: "var(--text-ink)",
  whiteSpace: "nowrap",
};

export function PaceZoneScale({
  zones,
  scaleMaxSpeed,
  degraded,
  thresholdUnit,
  sport,
  degradedReason,
}: PaceZoneScaleProps) {
  if (degraded || zones.length === 0 || scaleMaxSpeed <= 0) {
    const missing =
      sport === "run"
        ? "ein annähernd erschöpfender Lauf über zwei unterschiedliche Distanzen (z. B. eine Zeitfahrt oder ein Test)"
        : "eine Schwimm-Einheit mit zwei unterschiedlichen Distanzen (z. B. 400 m + 200 m)";
    // Die Zonen-Labels stehen als reines Wertegerüst schon fest (Daniels/CSS,
    // UNKALIBRIERT) — sie ausgegraut zu zeigen macht klar, WAS erscheinen wird.
    const skeleton = FALLBACK_LABELS[sport];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} title={degradedReason ?? undefined}>
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid var(--hair)" }}>
          {skeleton.map((label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                padding: "10px 8px",
                background: "rgba(255,255,255,.04)",
                borderLeft: i === 0 ? "none" : "1px solid var(--hair)",
                textAlign: "center",
              }}
            >
              <span style={{ ...LABEL_STYLE, color: "var(--text-label)" }}>{label}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-soft)", lineHeight: 1.55 }}>
          Schwellenpace noch nicht schätzbar — es fehlt {missing}. Die Pace-Zonen
          erscheinen automatisch, sobald {sport === "run" ? "einer" : "eine"} vorliegt.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid var(--hair)" }}>
        {zones.map((z, i) => {
          const widthPct = ((z.bisSpeed - z.vonSpeed) / scaleMaxSpeed) * 100;
          return (
            <div
              key={z.id}
              style={{
                width: `${Math.max(0, widthPct)}%`,
                padding: "10px 6px",
                background: `color-mix(in srgb, ${z.farbe} 24%, transparent)`,
                borderLeft: i === 0 ? "none" : "1px solid var(--hair)",
                textAlign: "center",
                minWidth: 0,
              }}
            >
              <span style={{ ...LABEL_STYLE, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{z.label}</span>
            </div>
          );
        })}
      </div>
      {/* Pace-Grenzen: je Zone die schnellere (obere) Grenze als Tick am
          rechten Rand des Bandes. Zone 1 beginnt bei Geschwindigkeit 0
          (Pace unendlich) — daher nur die bisPaceSec-Werte. */}
      <div style={{ position: "relative", height: 16 }}>
        {zones.map((z) => {
          const rightPct = (z.bisSpeed / scaleMaxSpeed) * 100;
          return (
            <span
              key={z.id}
              style={{
                position: "absolute",
                left: `${Math.min(100, rightPct)}%`,
                transform: "translateX(-100%)",
                fontFamily: "var(--font-mono)",
                fontSize: ".58rem",
                color: "var(--text-label)",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {fmtPace(z.bisPaceSec)}
            </span>
          );
        })}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-label)" }}>
        {thresholdUnit} · geschätzt (unkalibriert)
      </span>
    </div>
  );
}

/** Zonen-Labels für den degradierten Zustand — index-gleich zu den echten
 *  Profil-Zonen (sports/running/zones.ts DANIELS_ZONE_META bzw.
 *  sports/swimming/zones.ts CSS_ZONE_META). Bewusst hier dupliziert: der
 *  degradierte Fall soll ohne eine gültige Schwelle auskommen, an der die
 *  computePaceZones()-Kette sonst hängt. */
const FALLBACK_LABELS: Record<"run" | "swim", string[]> = {
  run: ["E Easy", "M Marathon", "T Schwelle", "I Intervall", "R Wiederholung"],
  swim: ["Rekom", "Grundlage", "CSS", "VO2max", "Sprint"],
};
