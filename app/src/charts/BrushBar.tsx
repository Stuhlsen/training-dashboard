import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, pmcSkeletonAnchor } from "../core/days.js";
import { densifyPmc, segmentsFor } from "../core/pmc-series.js";
import { makeIndexScale, pathD } from "../core/chart-scale.js";
import { presetWindow } from "../core/brush.js";
import { projectLoad } from "../core/projection.js";

type Ride = import("../types.js").Ride;

interface Range {
  fromISO: string;
  toISO: string;
}

interface BrushBarProps {
  /** Roh, ungefiltert — wie bei PmcChart. */
  rides: Ride[];
  projection: ReturnType<typeof projectLoad>;
  range: Range | null;
  onRangeChange: (range: Range) => void;
  /** Nur gesetzt für Athleten mit eigenem Plan 2 (Athlet 1) — blendet den
   *  "Plan 2"-Preset aus, wenn `null`/`undefined` (docs/phase-5-konzept-
   *  explorer.md §4, "Plan 2" ist nicht für jeden Athleten sinnvoll). */
  plan2StartISO?: string | null;
  /** Cursor-Sync (Etappe 8c, §3) — vom PmcChart-Hover gesetzt (ExplorerPage
   *  reicht dieselbe Prop an beide Charts durch). Rein darstellend: die
   *  BrushBar hat keinen eigenen Datenpunkt-Hover, nur PmcChart löst
   *  `hoveredDate` aus. */
  hoveredDate?: string | null;
}

const W_FALLBACK = 780;
const H = 64;
const PAD = { l: 54, r: 56, t: 8, b: 8 };
const HANDLE_W = 10;
/* UX-Untergrenze während des Ziehens — die kanonische Durchsetzung (auch
   beim Laden/Presets) liegt in core/brush.js::clampWindow (dort minDays=3,
   hier als lokale Konstante gespiegelt, weil das Ziehen in Index- statt
   ISO-Raum rechnet und keinen Zwischen-Roundtrip über clampWindow braucht). */
const MIN_WINDOW_DAYS = 3;

const PRESETS: Array<{ key: "30" | "90" | "365" | "plan2" | "all"; label: string }> = [
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "365", label: "365 Tage" },
  { key: "plan2", label: "Plan 2" },
  { key: "all", label: "Alles" },
];

/** Übersichtsleiste über dem vollen Belastungshorizont (Anker-Fahrt bis
 *  `projection.horizonEnd`) mit ziehbarem Fenster — Etappe 8b (docs/phase-5-
 *  konzept-explorer.md §4, Variante 2B). Zwei Handles + ein Fenster-Rect,
 *  Pointer Events mit `setPointerCapture` (kein `document`-Listener nötig,
 *  anders als das Autoscroll-Muster in ui/plan-drag.js — hier gibt es
 *  keinen scrollenden Container). Live-Updates werden auf einen
 *  `requestAnimationFrame` pro Frame gebatcht. Seit Etappe 8c optional
 *  `hoveredDate` (Cursor-Sync, §3) — rein darstellend, ausgelöst vom
 *  PmcChart-Hover, kein eigener Hover auf dieser Leiste. */
export function BrushBar({ rides, projection, range, onRangeChange, plan2StartISO, hoveredDate }: BrushBarProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(W_FALLBACK);

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

  const todayISO = projection?.days?.[0]?.date ?? null;
  const horizonEndISO = projection?.horizonEnd ?? todayISO;
  const anchorISO = useMemo(() => pmcSkeletonAnchor(rides), [rides]);

  const skeleton = useMemo(() => {
    if (!anchorISO || !horizonEndISO || anchorISO > horizonEndISO) return [];
    return densifyDays(anchorISO, horizonEndISO);
  }, [anchorISO, horizonEndISO]);

  const indexByDate = useMemo(() => new Map(skeleton.map((d, i) => [d.dateISO, i])), [skeleton]);
  const we = Math.max(skeleton.length - 1, 0);
  const todayIdx = todayISO ? (indexByDate.get(todayISO) ?? -1) : -1;

  const { ctlVals } = useMemo(
    () => densifyPmc(skeleton, rides, projection?.days ?? [], todayIdx),
    [skeleton, rides, projection, todayIdx],
  );

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const caVals = ctlVals.filter((v): v is number => v != null);
  // `|| 10` — gleiche Null-Baseline-Absicherung wie PmcChart.tsx (s. dort).
  const caMax = caVals.length ? Math.max(...caVals) * 1.1 || 10 : 10;
  const caY = (v: number) => PAD.t + (1 - v / caMax) * plotH;

  const fromIdx = range && indexByDate.has(range.fromISO) ? (indexByDate.get(range.fromISO) as number) : 0;
  const toIdx = range && indexByDate.has(range.toISO) ? (indexByDate.get(range.toISO) as number) : we;
  const fromX = scale.x(fromIdx);
  const toX = scale.x(toIdx);

  // Cursor-Sync-Marker (Etappe 8c) — nur zeichnen, wenn der Hover-Tag auch
  // im vollen Horizont dieser Übersichtsleiste liegt (er kann außerhalb des
  // aktuell gebrushten Fensters liegen, das ist kein Fehlerfall).
  const hoveredIdx = hoveredDate ? (indexByDate.get(hoveredDate) ?? -1) : -1;
  const showHoverMarker = hoveredIdx >= 0 && hoveredIdx <= we;

  const dragRef = useRef<null | { mode: "from" | "to" | "pan"; startClientX: number; startFromIdx: number; startToIdx: number }>(
    null,
  );
  const pendingRef = useRef<Range | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current) {
      onRangeChange(pendingRef.current);
      pendingRef.current = null;
    }
  }, [onRangeChange]);

  const scheduleFlush = useCallback(
    (next: Range) => {
      pendingRef.current = next;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const idxToISO = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(we, Math.round(idx)));
      return skeleton[clamped]?.dateISO ?? null;
    },
    [we, skeleton],
  );

  const startDrag = useCallback(
    (mode: "from" | "to" | "pan") => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      dragRef.current = { mode, startClientX: e.clientX, startFromIdx: fromIdx, startToIdx: toIdx };
    },
    [fromIdx, toIdx],
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !skeleton.length) return;
      const dxPx = e.clientX - drag.startClientX;
      const deltaIdx = scale.invert(PAD.l + dxPx);
      let f = drag.startFromIdx;
      let t = drag.startToIdx;
      if (drag.mode === "from") {
        f = drag.startFromIdx + deltaIdx;
      } else if (drag.mode === "to") {
        t = drag.startToIdx + deltaIdx;
      } else {
        const len = drag.startToIdx - drag.startFromIdx;
        f = drag.startFromIdx + deltaIdx;
        t = drag.startToIdx + deltaIdx;
        if (f < 0) {
          f = 0;
          t = len;
        }
        if (t > we) {
          t = we;
          f = we - len;
        }
      }
      f = Math.max(0, Math.min(we, f));
      t = Math.max(0, Math.min(we, t));
      if (f > t) [f, t] = [t, f];
      if (t - f < MIN_WINDOW_DAYS) {
        if (drag.mode === "to") t = Math.min(we, f + MIN_WINDOW_DAYS);
        else f = Math.max(0, t - MIN_WINDOW_DAYS);
      }
      const fromISO = idxToISO(f);
      const toISO = idxToISO(t);
      if (fromISO && toISO) scheduleFlush({ fromISO, toISO });
    },
    [scale, we, idxToISO, scheduleFlush, skeleton.length],
  );

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* Capture ist evtl. schon aufgehoben (z.B. pointercancel). */
    }
  }, []);

  const handlePreset = useCallback(
    (preset: (typeof PRESETS)[number]["key"]) => {
      if (!todayISO || !anchorISO || !horizonEndISO) return;
      const next = presetWindow(preset, { todayISO, anchorISO, horizonEndISO, plan2StartISO });
      if (next) onRangeChange(next);
    },
    [todayISO, anchorISO, horizonEndISO, plan2StartISO, onRangeChange],
  );

  const activePreset = useMemo(() => {
    if (!range || !todayISO || !anchorISO || !horizonEndISO) return null;
    for (const p of PRESETS) {
      const win = presetWindow(p.key, { todayISO, anchorISO, horizonEndISO, plan2StartISO });
      if (win && win.fromISO === range.fromISO && win.toISO === range.toISO) return p.key;
    }
    return null;
  }, [range, todayISO, anchorISO, horizonEndISO, plan2StartISO]);

  if (skeleton.length < 2) return null;

  const ctlSegments = segmentsFor(ctlVals, 0, we);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block", touchAction: "none" }}
        role="img"
        aria-label="Zeitraum wählen: Übersicht über den vollen Belastungsverlauf"
      >
        <line x1={PAD.l} x2={width - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--hair)" strokeWidth={1} />

        {ctlSegments.map((seg, i) => (
          <path
            key={i}
            d={pathD(seg.map((p) => [scale.x(p.index), caY(p.value)]))}
            fill="none"
            stroke="var(--role-primary)"
            strokeWidth={1.5}
            opacity={0.55}
          />
        ))}

        <rect x={PAD.l} y={PAD.t} width={Math.max(fromX - PAD.l, 0)} height={plotH} fill="rgba(0,0,0,.5)" pointerEvents="none" />
        <rect x={toX} y={PAD.t} width={Math.max(width - PAD.r - toX, 0)} height={plotH} fill="rgba(0,0,0,.5)" pointerEvents="none" />

        <rect
          x={fromX}
          y={PAD.t}
          width={Math.max(toX - fromX, 0)}
          height={plotH}
          fill="rgba(255,255,255,.07)"
          stroke="var(--role-primary)"
          strokeWidth={1}
          style={{ cursor: "grab", touchAction: "none" }}
          role="slider"
          aria-label="Gewähltes Zeitfenster verschieben"
          onPointerDown={startDrag("pan")}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />

        <rect
          x={fromX - HANDLE_W / 2}
          y={PAD.t}
          width={HANDLE_W}
          height={plotH}
          rx={2}
          fill="var(--role-primary)"
          style={{ cursor: "ew-resize", touchAction: "none" }}
          role="slider"
          aria-label="Fensteranfang ziehen"
          onPointerDown={startDrag("from")}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
        <rect
          x={toX - HANDLE_W / 2}
          y={PAD.t}
          width={HANDLE_W}
          height={plotH}
          rx={2}
          fill="var(--role-primary)"
          style={{ cursor: "ew-resize", touchAction: "none" }}
          role="slider"
          aria-label="Fensterende ziehen"
          onPointerDown={startDrag("to")}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />

        {showHoverMarker && (
          <line
            x1={scale.x(hoveredIdx)}
            x2={scale.x(hoveredIdx)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--role-status)"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        )}
      </svg>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PRESETS.filter((p) => p.key !== "plan2" || plan2StartISO).map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => handlePreset(p.key)}
            aria-pressed={activePreset === p.key}
            style={{
              border: 0,
              borderRadius: "var(--pill)",
              padding: "5px 12px",
              fontSize: ".76rem",
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
              background: activePreset === p.key ? "var(--role-primary)" : "var(--hair)",
              color: activePreset === p.key ? "var(--surface-page)" : "var(--text-label)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
