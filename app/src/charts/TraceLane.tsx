/* ============================================================
   CHARTS/TRACELANE.TSX — Eine Spuren-Zeile im Analyse-Tab „Antworten &
   Spuren" (Handoff-Abschnitt „Die Spurenkarte"). Reines Rendering der
   core/trace-lanes.js-Geometrie — Grid 148px | 1fr | 116px (Label-Spalte
   klickbar/klappt Legende auf, Chart-Spalte mit preserveAspectRatio="none"
   für horizontales Strecken, Ruhewert-Spalte rechtsbündig).
   ============================================================ */

/** Grid-Spaltenbreiten (Label-Spalte | Chart-Spalte | Ruhewert-Spalte),
 *  geteilt mit TraceCard.tsx — die Fadenkreuz-Positionsberechnung dort
 *  muss exakt dieselben Werte kennen wie das Grid hier, sonst läuft der
 *  Mauszeiger nicht mit der gezeichneten Linie mit (Versatz proportional
 *  zur Entfernung von der Kartenmitte, s. Kopfkommentar TraceCard.tsx). */
export const LANE_LABEL_COL = 148;
export const LANE_VALUE_COL = 116;
const LANE_GRID_TEMPLATE = `${LANE_LABEL_COL}px minmax(0, 1fr) ${LANE_VALUE_COL}px`;

export interface LaneLine {
  d: string;
  width: number;
  dash: string;
  opacity: number;
  role: string;
}
export interface LaneArea {
  d: string;
  role: string;
}
export interface LaneDot {
  cx: number;
  cy: number;
  good: boolean | null;
  kind?: string;
}
export interface LaneBar {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
}
export interface LaneZone {
  y: number;
  h: number;
  band: string;
}
export interface LaneHLine {
  y: number;
  kind: string;
}
export interface LaneLabel {
  x: number;
  y: number;
  text: string;
  role: string;
  align: "start" | "end";
}
export interface LaneGeometry {
  viewBox: string;
  lines: LaneLine[];
  areas: LaneArea[];
  dots: LaneDot[];
  bars: LaneBar[];
  zones: LaneZone[];
  hlines: LaneHLine[];
  labels: LaneLabel[];
  hasCursorDot: boolean;
  cursorY: number;
  readValue: number | null;
  readKind: string | null;
}

export interface LaneLegendEntry {
  label: string;
  colorVar: string;
  shape: "line" | "block";
}

export interface LaneDisplay {
  key: string;
  title: string;
  sub: string;
  /** Eigene Akzentfarbe der Spur (CSS-Farbwert, meist `var(--role-*)`/`var(--z*)`). */
  colorVar: string;
  legend?: LaneLegendEntry[];
  note?: string;
}

interface TraceLaneProps {
  display: LaneDisplay;
  geometry: LaneGeometry;
  /** Pixelhöhe der Spur (bereits dicht/aufgeklappt aufgelöst). */
  height: number;
  expanded: boolean;
  onToggle: () => void;
  /** x-Position (0..900) für Fadenkreuz/heute/Event, oder null. */
  cursorX: number | null;
  todayX: number | null;
  eventX: number | null;
  /** Fertig formatierter Ruhewert-Text + Einheit. */
  readValueLabel: string;
  readUnitLabel: string;
}

const ZONE_BAND_FILL: Record<string, string> = {
  overload: "rgba(217,79,79,.17)",
  build: "rgba(111,196,140,.12)",
  fresh: "rgba(201,168,76,.14)",
};

const ZONE_BAR_FILL: Record<string, string> = {
  low: "var(--z2)",
  mid: "var(--ss)",
  high: "var(--vo2)",
};

const LABEL_ROLE_COLOR: Record<string, string> = {
  primary: "var(--role-primary)",
  secondary: "var(--role-secondary)",
  fresh: "rgba(201,168,76,.95)",
  build: "rgba(111,196,140,.9)",
  overload: "rgba(217,79,79,.9)",
};

function lineColor(role: string, accent: string): string {
  if (role === "primary") return "var(--role-primary)";
  if (role === "secondary") return "var(--role-secondary)";
  if (role === "positive") return "var(--role-positive)";
  if (role === "neutral") return "var(--text-soft)";
  return accent;
}

function dotColor(dot: LaneDot, accent: string): string {
  if (dot.kind === "wind") return "var(--event)";
  if (dot.good === true) return "var(--z1)";
  return accent;
}

function barColor(bar: LaneBar, accent: string): string {
  switch (bar.kind) {
    case "bad":
      return "var(--role-status)";
    case "planned":
      return "rgba(107,114,128,.5)";
    case "pos":
      return "var(--z1)";
    case "neg":
      return accent;
    case "rain":
      return "var(--z2)";
    default:
      return ZONE_BAR_FILL[bar.kind] ?? accent;
  }
}

/** Eine Spurenzeile — Label · Chart (preserveAspectRatio="none") · Ruhewert. */
export function TraceLane({ display, geometry: g, height, expanded, onToggle, cursorX, todayX, eventX, readValueLabel, readUnitLabel }: TraceLaneProps) {
  const accent = display.colorVar;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: LANE_GRID_TEMPLATE, alignItems: "stretch", borderBottom: "1px solid rgba(255,255,255,.14)" }}>
        <button
          type="button"
          onClick={onToggle}
          style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", justifyContent: "center", padding: "10px 12px 10px 0", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", font: "inherit" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 9, height: 3, borderRadius: 2, background: accent }} />
            <span style={{ fontSize: ".82rem", fontWeight: 500, color: expanded ? "var(--text-ink)" : "var(--text-soft)" }}>{display.title}</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", letterSpacing: ".08em", color: "var(--text-faint)", paddingLeft: 16 }}>{display.sub}</span>
        </button>

        <div style={{ position: "relative", padding: "6px 0" }}>
          <svg viewBox={g.viewBox} width="100%" preserveAspectRatio="none" style={{ display: "block", height }}>
            {g.zones.map((z, i) => (
              <rect key={i} x={0} y={z.y} width={900} height={z.h} fill={ZONE_BAND_FILL[z.band] ?? "transparent"} />
            ))}
            {g.hlines.map((hl, i) => (
              <line key={i} x1={0} x2={900} y1={hl.y} y2={hl.y} stroke={hl.kind === "target" ? "var(--z1)" : "rgba(255,255,255,.22)"} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
            ))}
            {g.bars.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={barColor(b, accent)} opacity={b.kind === "planned" ? 1 : 0.85} />
            ))}
            {g.areas.map((a, i) => (
              <path key={i} d={a.d} fill={`color-mix(in srgb, ${lineColor(a.role, accent)} 12%, transparent)`} />
            ))}
            {g.lines.map((l, i) => (
              <path key={i} d={l.d} fill="none" stroke={lineColor(l.role, accent)} strokeWidth={l.width} strokeDasharray={l.dash} opacity={l.opacity} strokeLinejoin="round" />
            ))}
            {g.dots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r={2.8} fill={dotColor(d, accent)} opacity={0.9} />
            ))}
            {todayX != null && <line x1={todayX} x2={todayX} y1={0} y2={height} stroke="rgba(255,255,255,.22)" strokeWidth={1} />}
            {eventX != null && <line x1={eventX} x2={eventX} y1={0} y2={height} stroke="var(--event)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />}
            {cursorX != null && <line x1={cursorX} x2={cursorX} y1={0} y2={height} stroke="rgba(255,255,255,.55)" strokeWidth={1} />}
            {cursorX != null && g.hasCursorDot && <circle cx={cursorX} cy={g.cursorY} r={3.4} fill={accent} />}
          </svg>

          {g.labels.map((lb, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${(lb.x / 900) * 100}%`,
                top: `${(6 + Math.max(7, Math.min(height - 7, lb.y))).toFixed(1)}px`,
                transform: lb.align === "end" ? "translate(-100%, -50%)" : "translate(0, -50%)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                padding: "1px 4px",
                borderRadius: 4,
                background: "rgba(10,12,18,.6)",
                fontFamily: "var(--font-mono)",
                fontSize: ".6rem",
                letterSpacing: ".04em",
                color: LABEL_ROLE_COLOR[lb.role] ?? "var(--text-soft)",
              }}
            >
              {lb.text}
            </span>
          ))}

          {expanded && (display.legend?.length || display.note) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "2px 0 8px" }}>
              {display.legend?.map((lg, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: lg.shape === "line" ? 2 : 8, borderRadius: 2, background: lg.colorVar }} />
                  <span style={{ fontSize: ".68rem", color: "var(--text-soft)" }}>{lg.label}</span>
                </div>
              ))}
              {display.note && <span style={{ fontSize: ".72rem", color: "var(--text-soft)", lineHeight: 1.5, flex: "1 1 320px", minWidth: 240 }}>{display.note}</span>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end", justifyContent: "center", padding: "10px 0 10px 12px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: ".88rem", color: geometry_readColor(g), fontVariantNumeric: "tabular-nums" }}>{readValueLabel}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", letterSpacing: ".08em", color: "var(--text-faint)" }}>{readUnitLabel}</span>
        </div>
      </div>
    </div>
  );
}

function geometry_readColor(g: LaneGeometry): string {
  if (g.readValue == null) return "var(--text-faint)";
  return g.readKind === "cursor" || g.readKind?.startsWith("cursor") ? "var(--text-ink)" : "var(--text-soft)";
}
