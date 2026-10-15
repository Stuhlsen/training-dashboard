/* ============================================================
   CHARTS/HRZONESCALE.TSX — HF-bpm-Zonen als horizontaler Bänder-Streifen
   (Fahrplan 12 E7, nur Lauf). Muster 1:1 wie PaceZoneScale.tsx, aber ohne
   Pace-Schwellenabhängigkeit: die Zonen hängen allein am geschätzten
   Athleten-`hrMax` aus dem Sync-Output.

   Zwei Zustände:
   - NORMAL: die fünf Zonen (%HFmax, RUNNING_HR_ZONES), breitenproportional
     zur bpm-Grenze, mit festem Vermerk "HFmax geschätzt" (G15).
   - DEGRADIERT (`degraded`): kein `hrMax` schätzbar (zu wenig HF-Daten) —
     gleich breite, ausgegraute Bänder mit Zonen-Labels, KEINE bpm-Zahlen,
     darunter ein fester Hinweistext (Muster Grill-Punkt 6, wie PaceZoneScale).
   ============================================================ */

import type { HrZone } from "../features/analysis/pace-section-view-model";

interface HrZoneScaleProps {
  zones: HrZone[];
  degraded: boolean;
  /** Optional (Hero-Zonen-Erklärer, Fahrplan 24 E2): gewählte Zone hervorheben
   *  und Klick auf ein Band melden. Reine Zeiger-Bequemlichkeit — die
   *  Tastaturbedienung liegt in der Auswahlleiste des Erklärers. Ohne diese
   *  Props bleibt das Verhalten (Analyse-Tab) unverändert. */
  selectedId?: string;
  onSelectZone?: (id: string) => void;
  /** Überschreibt den Hinweis im degradierten Zustand (Standard: Lauf-Text). */
  degradedText?: string;
  /** Überschreibt den Herkunftsvermerk des HFmax. */
  hrMaxNote?: string;
}

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: ".6rem",
  letterSpacing: ".04em",
  color: "var(--text-ink)",
  whiteSpace: "nowrap",
};

const SKELETON_LABELS = ["Z1 Recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max"];

export function HrZoneScale({ zones, degraded, selectedId, onSelectZone, degradedText, hrMaxNote }: HrZoneScaleProps) {
  const selectable = onSelectZone != null;
  if (degraded || zones.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid var(--hair)" }}>
          {SKELETON_LABELS.map((label, i) => {
            // Die Skelett-Bänder tragen keine ids; alle HR-Zonen-Konstanten
            // heißen z1..z5 in Reihenfolge der Labels.
            const id = `z${i + 1}`;
            return (
              <div
                key={label}
                onClick={selectable ? () => onSelectZone(id) : undefined}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  background: id === selectedId ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.04)",
                  borderLeft: i === 0 ? "none" : "1px solid var(--hair)",
                  textAlign: "center",
                  cursor: selectable ? "pointer" : undefined,
                }}
              >
                <span style={{ ...LABEL_STYLE, color: "var(--text-label)" }}>{label}</span>
              </div>
            );
          })}
        </div>
        <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-soft)", lineHeight: 1.55 }}>
          {degradedText ??
            "HFmax noch nicht schätzbar — es fehlen genug Lauf-Trainingsdaten mit Herzfrequenz. Die HF-Zonen erscheinen automatisch, sobald eine Schätzung möglich ist."}
        </p>
      </div>
    );
  }

  const maxBpm = zones[zones.length - 1].bisBpm;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid var(--hair)" }}>
        {zones.map((z, i) => {
          const widthPct = ((z.bisBpm - z.vonBpm) / maxBpm) * 100;
          return (
            <div
              key={z.id}
              onClick={selectable ? () => onSelectZone(z.id) : undefined}
              style={{
                width: `${Math.max(0, widthPct)}%`,
                padding: "10px 6px",
                background: `color-mix(in srgb, ${z.farbe} ${z.id === selectedId ? 48 : 24}%, transparent)`,
                borderLeft: i === 0 ? "none" : "1px solid var(--hair)",
                textAlign: "center",
                minWidth: 0,
                cursor: selectable ? "pointer" : undefined,
              }}
            >
              <span style={{ ...LABEL_STYLE, overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{z.label}</span>
            </div>
          );
        })}
      </div>
      {/* bpm-Grenzen: je Zone die obere Grenze als Tick am rechten Rand. */}
      <div style={{ position: "relative", height: 16 }}>
        {zones.map((z) => {
          const rightPct = (z.bisBpm / maxBpm) * 100;
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
              {z.bisBpm} bpm
            </span>
          );
        })}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: ".58rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-label)" }}>
        {hrMaxNote ?? "HFmax geschätzt (aus Trainingsdaten)"}
      </span>
    </div>
  );
}
