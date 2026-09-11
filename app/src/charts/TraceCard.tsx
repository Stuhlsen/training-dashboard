/* ============================================================
   CHARTS/TRACECARD.TSX — Spurenkarte im Analyse-Tab „Antworten & Spuren"
   (Handoff-Abschnitt „Die Spurenkarte" + „Fadenkreuz"). Trägt mehrere
   TraceLane-Zeilen + eine gemeinsame x-Achse. Das Fadenkreuz ist bewusst
   NUR innerhalb dieser Karte synchronisiert (Mousemove auf dem Karten-
   Wrapper), nicht global über die ganze Seite — deckt sich mit der
   bestehenden Konvention, dass nur eng gekoppelte Chart-Paare Cursor
   teilen (s. PmcChart/BrushBar, ExplorerSection.tsx).
   ============================================================ */

import { useCallback, useRef, useState, type MouseEvent } from "react";
import { GlassCard } from "../components/GlassCard";
import { buildLaneGeometry } from "../core/trace-lanes.js";
import { rideLabel, fmtDuration, fmt, fmtInt } from "../core/format.js";
import { TraceLane, LANE_LABEL_COL, LANE_VALUE_COL, type LaneDisplay } from "./TraceLane";
import { ChartTooltip } from "./ChartTooltip";
import { buildAxisTicks, effectiveR1 } from "./trace-card-axis";

type Ride = import("../types.js").Ride;

const GRID_TEMPLATE = `${LANE_LABEL_COL}px minmax(0, 1fr) ${LANE_VALUE_COL}px`;

type LaneKind = "line" | "power" | "dots" | "bars" | "tssBars" | "zoneStack" | "fitness" | "tsb" | "diverge" | "weather";

/** Kind-spezifische Serien-Eingabe für core/trace-lanes.js::buildLaneGeometry — */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Lane-Specs sind je `kind` strukturell verschieden (core/trace-lanes.js JSDoc), ein Discriminated Union hier würde die Aufrufstellen in answers-view-model.ts nur unnötig verkomplizieren.
export type LaneSpecInput = { kind: LaneKind; [key: string]: any };

export interface TraceLaneConfig {
  display: LaneDisplay;
  lane: LaneSpecInput;
  /** Spurhöhe (px) im Normalzustand (nicht dicht, nicht aufgeklappt). */
  baseHeight: number;
  formatValue: (raw: number) => string;
  formatUnit: (readKind: string | null) => string;
}

interface TraceCardProps {
  lanes: TraceLaneConfig[];
  r0: number;
  r1: number;
  /** Gesamtlänge des Tages-Skeletts (vm.N). Nur nötig, um die
   *  Mindestbreiten-Aufweitung ausschließlich auf „gesamte Historie ist
   *  kürzer als MIN_SPAN_DAYS" zu beschränken — ein Brush-Zoom in ein
   *  schmales Teilfenster darf NICHT aufgeweitet werden. */
  totalDays: number;
  todayIdx: number;
  eventIdx: number | null;
  /** Formatiert einen Tagesindex zu einem Kurz-Datum (z. B. fmtDate). */
  formatDay: (index: number) => string;
  dense: boolean;
  /** Fahrt am Tagesindex, `null` an trainingsfreien Tagen — treibt die
   *  Fahrt-Detailbox unterm Fadenkreuz (Vorbild intervals.icu-Fitnesschart:
   *  Box erscheint nur an echten Trainingstagen). Optional/fehlend blendet
   *  die Box komplett aus, kein Pflicht-Prop für ältere Aufrufstellen. */
  rideOnDay?: (index: number) => Ride | null;
}

const EXPANDED_FACTOR = 1.6;
const DENSE_FACTOR = 0.74;

function resolveHeight(baseHeight: number, dense: boolean, isExpanded: boolean): number {
  const h = dense ? Math.round(baseHeight * DENSE_FACTOR) : baseHeight;
  return isExpanded ? Math.round(h * EXPANDED_FACTOR) : h;
}

/** Spurenkarte: mehrere TraceLane-Zeilen + gemeinsame x-Achse + Fadenkreuz. */
export function TraceCard({ lanes, r0, r1, totalDays, todayIdx, eventIdx, formatDay, dense, rideOnDay }: TraceCardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  // Tagesindex + die Mausposition, mit der er ermittelt wurde — Letztere
  // NUR für die Fahrt-Detailbox (ChartTooltip-Portal braucht clientX/Y),
  // aktualisiert im selben gated setState wie der Index (kein zusätzlicher
  // Re-Render pro Pixel-Bewegung innerhalb desselben Tages).
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  const cursor = hover?.idx ?? null;
  const wrapRef = useRef<HTMLDivElement>(null);
  // Mindestbreite NUR, wenn das Fenster die gesamte (kurze) Historie zeigt —
  // ein Brush-Zoom in ein Teilfenster bleibt unangetastet (Code-Review-Fund,
  // s. effectiveR1). Alle Geometrie/Achsen rechnen gegen effR1, nicht r1.
  const effR1 = effectiveR1(r0, r1, totalDays);
  const span = Math.max(1, effR1 - r0);

  const handleMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Fadenkreuz lebt nur in der mittleren Chart-Spalte (s. LANE_GRID_TEMPLATE-
      // Kommentar in TraceLane.tsx) — Label-/Ruhewert-Spalte links/rechts müssen
      // aus der Mausposition rausgerechnet werden, sonst läuft die Linie nicht am
      // Zeiger mit (Versatz wächst mit dem Abstand von der Kartenmitte).
      const chartWidth = rect.width - LANE_LABEL_COL - LANE_VALUE_COL;
      if (chartWidth <= 0) return;
      const frac = (e.clientX - rect.left - LANE_LABEL_COL) / chartWidth;
      if (frac < 0 || frac > 1) return;
      const idx = Math.max(r0, Math.min(effR1, Math.round(r0 + frac * span)));
      setHover((prev) => (prev && prev.idx === idx ? prev : { idx, x: e.clientX, y: e.clientY }));
    },
    [r0, effR1, span],
  );
  const handleLeave = useCallback(() => setHover(null), []);

  const xOf = (i: number) => ((i - r0) / span) * 900;
  const todayX = todayIdx >= r0 && todayIdx <= effR1 ? xOf(todayIdx) : null;
  const eventX = eventIdx != null && eventIdx >= r0 && eventIdx <= effR1 ? xOf(eventIdx) : null;
  const cursorX = cursor != null ? xOf(cursor) : null;
  const todayPct = todayX != null ? (todayX / 900) * 100 : null;
  const ticks = buildAxisTicks(r0, effR1, todayIdx, formatDay);
  // Vorbild intervals.icu-Fitnesschart: eine Detailbox mit der echten Fahrt
  // erscheint nur an Tagen, an denen wirklich eine Fahrt liegt — an
  // Ruhetagen bleibt sie ganz weg (kein leerer Platzhalter), s. Live-
  // Vergleich vom 11.09.2026.
  const hoveredRide = cursor != null ? (rideOnDay?.(cursor) ?? null) : null;

  return (
    <GlassCard
      variant="strong"
      radius="20px"
      style={{ padding: "6px 20px 12px", display: "flex", flexDirection: "column", backdropFilter: "blur(22px)" }}
    >
      <div ref={wrapRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
        {lanes.map((cfg) => {
          const height = resolveHeight(cfg.baseHeight, dense, expanded === cfg.display.key);
          const geometry = buildLaneGeometry(cfg.lane, r0, effR1, height, cursor);
          const readValueLabel = geometry.readValue == null ? "—" : cfg.formatValue(geometry.readValue);
          return (
            <TraceLane
              key={cfg.display.key}
              display={cfg.display}
              geometry={geometry}
              height={height}
              expanded={expanded === cfg.display.key}
              onToggle={() => setExpanded((k) => (k === cfg.display.key ? null : cfg.display.key))}
              cursorX={cursorX}
              todayX={todayX}
              eventX={eventX}
              readValueLabel={readValueLabel}
              readUnitLabel={cfg.formatUnit(geometry.readKind)}
            />
          );
        })}

        <div style={{ display: "grid", gridTemplateColumns: GRID_TEMPLATE }}>
          <span />
          <div style={{ position: "relative", height: 22 }}>
            {ticks.map((t) => (
              <span
                key={t.index}
                style={{
                  position: "absolute",
                  left: `${(xOf(t.index) / 900) * 100}%`,
                  top: 4,
                  transform: "translateX(-50%)",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: ".62rem",
                  color: "var(--text-label)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t.label}
              </span>
            ))}
            {todayPct != null && (
              <span
                style={{
                  position: "absolute",
                  left: `${todayPct}%`,
                  top: 4,
                  transform: "translateX(-50%)",
                  fontFamily: "var(--font-mono)",
                  fontSize: ".58rem",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--text-soft)",
                }}
              >
                heute
              </span>
            )}
          </div>
          <span />
        </div>
      </div>
      {hoveredRide && hover && (
        <ChartTooltip x={hover.x} y={hover.y} width={240}>
          <div style={{ fontWeight: 600, color: "var(--text-ink)" }}>{rideLabel(hoveredRide, hoveredRide.km ?? 0)}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {hoveredRide.min != null && <span>{fmtDuration(hoveredRide.min)}</span>}
            {hoveredRide.km != null && <span>{fmt(hoveredRide.km, 1)} km</span>}
            {hoveredRide.tss != null && <span>TSS {fmtInt(hoveredRide.tss)}</span>}
            {hoveredRide.hf != null && <span>Ø {fmtInt(hoveredRide.hf)} bpm</span>}
            {hoveredRide.watt != null && <span>Ø {fmtInt(hoveredRide.watt)} W</span>}
          </div>
        </ChartTooltip>
      )}
    </GlassCard>
  );
}
