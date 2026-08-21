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
import { TraceLane, LANE_LABEL_COL, LANE_VALUE_COL, type LaneDisplay } from "./TraceLane";

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

export interface DayTick {
  index: number;
  label: string;
}

interface TraceCardProps {
  lanes: TraceLaneConfig[];
  r0: number;
  r1: number;
  todayIdx: number;
  eventIdx: number | null;
  /** Formatiert einen Tagesindex zu einem Kurz-Datum (z. B. fmtDate). */
  formatDay: (index: number) => string;
  dense: boolean;
}

const EXPANDED_FACTOR = 1.6;
const DENSE_FACTOR = 0.74;

function resolveHeight(baseHeight: number, dense: boolean, isExpanded: boolean): number {
  const h = dense ? Math.round(baseHeight * DENSE_FACTOR) : baseHeight;
  return isExpanded ? Math.round(h * EXPANDED_FACTOR) : h;
}

/** Fünf Achsen-Ticks bei 0/25/50/75/100% des Fensters, "heute"-Marker
 *  unterdrückt Ticks näher als 7% (Handoff „Chart-Label-Konvention"). */
function buildAxisTicks(r0: number, r1: number, todayIdx: number, formatDay: (i: number) => string): DayTick[] {
  const span = Math.max(1, r1 - r0);
  const todayFrac = (todayIdx - r0) / span;
  const showsToday = todayIdx >= r0 && todayIdx <= r1;
  return [0, 0.25, 0.5, 0.75, 1]
    .filter((f) => !showsToday || Math.abs(f - todayFrac) > 0.07)
    .map((f) => {
      const index = Math.round(r0 + f * span);
      return { index, label: formatDay(index) };
    });
}

/** Spurenkarte: mehrere TraceLane-Zeilen + gemeinsame x-Achse + Fadenkreuz. */
export function TraceCard({ lanes, r0, r1, todayIdx, eventIdx, formatDay, dense }: TraceCardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const span = Math.max(1, r1 - r0);

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
      const idx = Math.max(r0, Math.min(r1, Math.round(r0 + frac * span)));
      setCursor((prev) => (prev === idx ? prev : idx));
    },
    [r0, r1, span],
  );
  const handleLeave = useCallback(() => setCursor(null), []);

  const xOf = (i: number) => ((i - r0) / span) * 900;
  const todayX = todayIdx >= r0 && todayIdx <= r1 ? xOf(todayIdx) : null;
  const eventX = eventIdx != null && eventIdx >= r0 && eventIdx <= r1 ? xOf(eventIdx) : null;
  const cursorX = cursor != null ? xOf(cursor) : null;
  const todayPct = todayX != null ? (todayX / 900) * 100 : null;
  const ticks = buildAxisTicks(r0, r1, todayIdx, formatDay);

  return (
    <GlassCard
      variant="strong"
      radius="20px"
      style={{ padding: "6px 20px 12px", display: "flex", flexDirection: "column", backdropFilter: "blur(22px)" }}
    >
      <div ref={wrapRef} onMouseMove={handleMove} onMouseLeave={handleLeave}>
        {lanes.map((cfg) => {
          const height = resolveHeight(cfg.baseHeight, dense, expanded === cfg.display.key);
          const geometry = buildLaneGeometry(cfg.lane, r0, r1, height, cursor);
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
    </GlassCard>
  );
}
