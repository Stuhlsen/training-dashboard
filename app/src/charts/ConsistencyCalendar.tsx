import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { weeklyConsistency } from "../core/consistency.js";
import { pickLabelIndices } from "../core/chart-scale.js";
import { fmtDate } from "../core/format.js";
import { ChartTooltip, TooltipSessionRow } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface ConsistencyCalendarProps {
  rides: Ride[];
  todayISO: string;
}

const W_FALLBACK = 780;
const CELL_H = 40;
const Y_TOP = 30;
const PAD_L = 6;
const PAD_R = 6;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
// Ein Repräsentant je Ampel-Band (0/1/3/5, s. LEVEL_FILL) statt 5 Stufen
// eines früheren Gradienten — vier klar unterscheidbare Farben statt
// mehrerer Legenden-Kästchen im selben Farbton.
const LEGEND_LEVELS = [0, 1, 3, 5];

/** 0 (kein Trainingstag) … 7 (jeden Tag) — Index = Trainingstage der Woche.
 *  Ampel-Bänder statt Ein-Hue-Rampe (Review-Kommentar 23.08.2026: sieben
 *  Grüntöne blieben trotz Kontrast-Tuning kaum auseinanderzuhalten). Nutzt
 *  dieselben Statusfarben wie die Belastungsempfehlung (--danger/--warn/--ok,
 *  BriefingCard.tsx) statt neuer Werte — bewusst weiter reine Tagesanzahl,
 *  nicht an die Plankarten gekoppelt (Alex' Entscheidung: das Thema der
 *  Kachel ist Konsistenz, nicht Plan-Erfüllung). */
const LEVEL_FILL = [
  "var(--hair)",
  "var(--danger)",
  "var(--danger)",
  "var(--warn)",
  "var(--warn)",
  "var(--ok)",
  "var(--ok)",
  "var(--ok)",
];

type ConsistencyWeek = NonNullable<ReturnType<typeof weeklyConsistency>>["weeks"][number];

interface Tooltip {
  x: number;
  y: number;
  week: ConsistencyWeek;
}

const TOOLTIP_WIDTH = 260;

/** Trainingskonsistenz-Wochenstreifen (Etappe 12a, Familie 6 — eigene
 *  Layout-Logik, docs/dashboard-3.0-konzept-react-umbau.md Etappe 12).
 *  Port von assets/js/ui/charts/training.js::renderConsistency() nach dem
 *  WeeklyVolumeChart-Baumuster (ResizeObserver statt fixer Breite). Eine
 *  Zelle pro Woche ab der ersten aktiven Woche, Farbintensität = Trainingstage
 *  (0–7) statt Last — core/consistency.js::weeklyConsistency() macht die
 *  eigentliche Aggregation. */
export function ConsistencyCalendar({ rides, todayISO }: ConsistencyCalendarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(W_FALLBACK);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useLayoutEffect(() => {
    const node = svgRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const wc = useMemo(() => weeklyConsistency(rides ?? [], todayISO), [rides, todayISO]);

  if (!wc || !wc.weeks.length) {
    return (
      <div role="img" aria-label="Trainingskonsistenz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Keine Trainingstage erfasst.
      </div>
    );
  }

  const n = wc.weeks.length;
  const gap = n > 30 ? 2 : 3;
  const cellW = Math.min((width - PAD_L - PAD_R - (n - 1) * gap) / n, 60);
  const stepX = cellW + gap;
  const showNum = cellW >= 20;
  // +72 statt +54: Fußzeile (Wochen-/Tage-Summe) und Legende stehen auf
  // zwei Zeilen statt einer gemeinsamen — bei schmaler Kachel liefen beide
  // sonst horizontal ineinander (Review-Kommentar 23.08.2026, Screenshot:
  // "22 von 22 Wochen trainiert · 93 aktive Tage" überlappte "wenig → viel
  // Tage"). Eigene Zeilen sind robust gegen jede Textlänge, ohne
  // Pixel-Breiten schätzen zu müssen.
  const H = Y_TOP + CELL_H + 72;

  // Monatswechsel pro Woche vorab bestimmen (kein Mutieren einer Closure-
  // Variable innerhalb des JSX-`.map()` unten, s. react-hooks/immutability).
  // Bei vielen Wochen (schmale Zellen) liegen Monatswechsel enger als ihre
  // Labelbreite zusammen und überlappen sich — Ausdünnung nach der
  // Chart-Label-Konvention (AGENTS.md), analog zu den anderen Charts, statt
  // jeden Wechsel ungeachtet des verfügbaren Platzes zu zeichnen (Review-
  // Kommentar 23.08.2026: "wird unübersichtlich, Text überlagert").
  const monthOf = wc.weeks.map((w) => new Date(`${w.monday}T00:00:00`).getMonth());
  const monthChangeIndices = wc.weeks.map((_, i) => i).filter((i) => i === 0 || monthOf[i] !== monthOf[i - 1]);
  const monthChangeX = monthChangeIndices.map((i) => PAD_L + i * stepX);
  const keptMonthChangeIdx = pickLabelIndices(monthChangeX, 40);
  const showMonthAt = wc.weeks.map(() => false);
  monthChangeIndices.forEach((weekIdx, j) => {
    if (keptMonthChangeIdx.has(j)) showMonthAt[weekIdx] = true;
  });

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Trainingskonsistenz: Trainingstage je Woche"
      >
        <text x={PAD_L} y={16} fontSize={12} fontFamily="var(--font-mono)" fill="var(--text-soft)">
          serie aktuell{" "}
          <tspan fill="var(--role-positive)" fontWeight={500}>
            {wc.streakCurrent} Wochen
          </tspan>
          {"   ·   längste "}
          <tspan fill="var(--role-positive)" fontWeight={500}>
            {wc.streakLongest}
          </tspan>
          {"   ·   Ø "}
          <tspan fill="var(--text-ink)" fontWeight={500}>
            {String(wc.avgDays).replace(".", ",")}
          </tspan>
          {" Tage/Woche"}
        </text>

        {wc.weeks.map((w, i) => {
          const x = PAD_L + i * stepX;
          const days = Math.max(0, Math.min(7, w.days));
          const showMonth = showMonthAt[i];
          return (
            <g key={w.monday}>
              <rect
                x={x}
                y={Y_TOP}
                width={cellW}
                height={CELL_H}
                rx={4}
                fill={LEVEL_FILL[days]}
                style={{ cursor: w.days > 0 ? "pointer" : "default" }}
                onMouseEnter={(e) => {
                  if (!w.days) return;
                  setTooltip({ x: e.clientX, y: e.clientY, week: w });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {showNum && w.days > 0 && (
                <text
                  x={x + cellW / 2}
                  y={Y_TOP + CELL_H / 2 + 5}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={500}
                  // Alle sichtbaren Zahlen (Tage > 0) sitzen jetzt auf einer
                  // der drei Ampelfarben (--danger/--warn/--ok) — Kontrast
                  // gegen alle drei geprüft, dunkler Text gewinnt überall
                  // klar (5.9–12.2:1 vs. 1.5–3.0:1 mit hellem Text).
                  fill="var(--surface-page)"
                >
                  {w.days}
                </text>
              )}
              {showMonth && (
                <text x={x} y={Y_TOP + CELL_H + 18} fontSize={10.5} fontFamily="var(--font-mono)" fill="var(--text-label)">
                  {MONTHS[monthOf[i]]}
                </text>
              )}
            </g>
          );
        })}

        <text x={PAD_L} y={H - 26} fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-soft)">
          {wc.activeWeeks} von {wc.totalWeeks} Wochen trainiert · {wc.activeDays} aktive Tage
        </text>
        {LEGEND_LEVELS.map((lvl, i) => (
          <rect
            key={lvl}
            x={width - PAD_R - (LEGEND_LEVELS.length - i) * 16}
            y={H - 18}
            width={13}
            height={13}
            rx={3}
            fill={LEVEL_FILL[lvl]}
          />
        ))}
        <text
          x={width - PAD_R - LEGEND_LEVELS.length * 16 - 8}
          y={H - 7}
          textAnchor="end"
          fontSize={10.5}
          fontFamily="var(--font-mono)"
          fill="var(--text-label)"
        >
          wenig → viel Tage
        </text>
      </svg>
      {tooltip && (
        // Strukturierte Mini-Tabelle statt eines langen, umbrechenden
        // Text-Strings (Review-Kommentar 23.08.2026: mit reinem
        // Zeilenumbruch blieb es "sehr unübersichtlich") — Datum/Name/km je
        // eigene Spalte, Name-Spalte mit eigenem Ellipsis statt Umbruch.
        <ChartTooltip x={tooltip.x} y={tooltip.y} width={TOOLTIP_WIDTH}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {tooltip.week.days} Trainingstag{tooltip.week.days === 1 ? "" : "e"} · {tooltip.week.km} km
              </div>
              <div style={{ fontSize: "var(--fs-label)", color: "var(--text-soft)" }}>Woche ab {fmtDate(tooltip.week.monday)}</div>
            </div>
            {tooltip.week.sessions.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  paddingTop: 6,
                  borderTop: "1px solid var(--hair)",
                }}
              >
                {tooltip.week.sessions.map((s, i) => (
                  <TooltipSessionRow key={i} date={fmtDate(s.dateISO)} label={s.label} km={s.km} />
                ))}
              </div>
            )}
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}
