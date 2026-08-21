/* ============================================================
   CORE/TRACE-LANES.JS — Geometrie-Engine für den Analyse-Tab „Antworten
   & Spuren" (kein DOM). Port der `build()`-Logik aus dem Claude-Design-
   Prototyp (Verlaeufe-C-Antworten-Spuren.dc.html), umgestellt von
   modul-globalen Demo-Arrays auf echte, mit core/days.js::densifyDays +
   joinSeries() gebaute dichte Wertreihen.

   Jede Spur hat dieselbe Grundform: ein Fenster [r0, r1] über einer
   dichten Tagesreihe (Index = core/days.js-Tagesindex) wird auf eine
   feste Plotbreite LW=900 (viewBox-Einheiten, s. Handoff „preserveAspect-
   Ratio=none, damit die Spur horizontal streckbar ist") abgebildet.
   Rückgabe ist reine Geometrie/Zahlen — Farben wählt die Komponente
   anhand der `good`/`band`-Klassifikation und der Design-Tokens
   (`--role-*`, `--z1` …), analog zu core/loadguard.js::riskLevel(), das
   auch nur "ok"/"caution"/"high" liefert statt einer Farbe.
   ============================================================ */

export const LANE_WIDTH = 900;

/** TSB-Korridor für die Form-Spur (Trainingslehre-Konvention, keine
 *  Konstante aus der Codebase — s. Handoff). ACHTUNG: bewusst getrennt
 *  von core/briefing.js::TSB_FRESH/TSB_DEEP_FATIGUE — dort geht es um
 *  eine Tages-Ampel (harter Reiz ja/nein heute), hier um die Einordnung
 *  eines mehrwöchigen Trainingsbogens. Beide Zahlenräume sehen ähnlich
 *  aus, sind aber nicht dasselbe Konzept und dürfen nicht zusammengelegt
 *  werden. */
export const TSB_OVERLOAD = -25;
export const TSB_BUILD_LOW = -25;
export const TSB_BUILD_HIGH = -5;
export const TSB_FRESH_LOW = 5;
export const TSB_FRESH_HIGH = 20;

/** @param {(number|null)[]} vals @returns {number[]} */
function nonNull(vals) {
  return vals.filter((v) => v != null);
}

/** Indizes im Fenster [r0, r1] (inklusive). @returns {number[]} */
function windowIndices(r0, r1) {
  const idx = [];
  for (let i = r0; i <= r1; i++) idx.push(i);
  return idx;
}

/** x-Position eines Tagesindex im Fenster. */
function xOf(i, r0, span) {
  return ((i - r0) / span) * LANE_WIDTH;
}

/** SVG-Pfad aus Punktpaaren. */
function pathFrom(points) {
  return points.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
}

/**
 * Zusammenhängende Liniensegmente im Bereich [from, to], an null-Lücken
 * getrennt (wie core/pmc-series.js::segmentsFor, hier lokal gehalten, da
 * die Achse hier Tagesindex im FENSTER ist, nicht das volle Skelett).
 * @param {(number|null)[]} vals @param {number} from @param {number} to
 * @param {(i:number)=>number} x @param {(v:number)=>number} y
 * @returns {Array<[number,number]>[]}
 */
function segmentPoints(vals, from, to, x, y) {
  const segs = [];
  let cur = [];
  for (let i = from; i <= to; i++) {
    const v = vals[i];
    if (v == null) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
      continue;
    }
    cur.push([x(i), y(v)]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

/**
 * Gemeinsamer Rahmen für alle Spurentypen: liefert Fenster-Hilfsfunktionen
 * und das leere Ausgabegerüst.
 * @param {number} r0 @param {number} r1 @param {number} h
 */
function frame(r0, r1, h) {
  const span = Math.max(1, r1 - r0);
  const x = (i) => xOf(i, r0, span);
  return {
    idx: windowIndices(r0, r1),
    x,
    out: {
      viewBox: `0 0 ${LANE_WIDTH} ${h}`,
      lines: /** @type {Array<{d:string,width:number,dash:string,opacity:number,role:string}>} */ ([]),
      areas: /** @type {Array<{d:string,role:string}>} */ ([]),
      dots: /** @type {Array<{cx:number,cy:number,good:boolean|null}>} */ ([]),
      bars: /** @type {Array<{x:number,y:number,w:number,h:number,kind:string}>} */ ([]),
      zones: /** @type {Array<{y:number,h:number,band:string}>} */ ([]),
      hlines: /** @type {Array<{y:number,kind:string}>} */ ([]),
      hasCursorDot: false,
      cursorY: 0,
      readValue: /** @type {number|null} */ (null),
      readKind: /** @type {string|null} */ (null),
    },
  };
}

/**
 * Einfacher Linien-/Punkt-/Balken-Spurtyp (`line`, `power`, `dots`, `bars`).
 * @param {"line"|"power"|"dots"|"bars"} kind
 * @param {{vals:(number|null)[], target?:number, goodAbove?:boolean, min?:number, max?:number, area?:boolean}} series
 * @param {number} r0 @param {number} r1 @param {number} h @param {number|null} cursor
 */
export function buildValueLane(kind, series, r0, r1, h, cursor) {
  const { idx, x, out } = frame(r0, r1, h);
  const vals = series.vals;
  const shown = idx.map((i) => vals[i]).filter((v) => v != null);
  const pool = shown.length ? shown : nonNull(vals);
  const pad = kind === "power" ? 6 : 1;
  const min = series.min != null ? series.min : (pool.length ? Math.min(...pool) - pad : 0);
  const max = series.max != null ? series.max : (pool.length ? Math.max(...pool) + pad : 1);
  const y = (v) => h - 4 - ((v - min) / (max - min || 1)) * (h - 9);

  if (kind === "line" || kind === "power") {
    for (const pts of segmentPoints(vals, r0, r1, x, y)) {
      out.lines.push({ d: pathFrom(pts), width: 1.7, dash: "0", opacity: 1, role: "series" });
      if (series.area) {
        const first = pts[0], last = pts[pts.length - 1];
        out.areas.push({
          d: `M${first[0].toFixed(1)},${(h - 4).toFixed(1)} ${pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} L${last[0].toFixed(1)},${(h - 4).toFixed(1)} Z`,
          role: "series",
        });
      }
    }
  } else if (kind === "bars") {
    const bw = Math.max(1.4, LANE_WIDTH / (idx.length + 1) - 1.4);
    for (const i of idx) {
      const v = vals[i];
      if (v == null) continue;
      const good = series.target == null ? null : v >= series.target;
      out.bars.push({ x: x(i) - bw / 2, y: y(v), w: bw, h: Math.max(1, h - 4 - y(v)), kind: good === false ? "bad" : "ok" });
    }
  } else {
    for (const i of idx) {
      const v = vals[i];
      if (v == null) continue;
      const good = series.target == null ? null : series.goodAbove ? v >= series.target : v <= series.target;
      out.dots.push({ cx: x(i), cy: y(v), good });
    }
  }
  if (series.target != null) out.hlines.push({ y: y(series.target), kind: "target" });

  if (cursor != null && vals[cursor] != null) {
    out.hasCursorDot = kind === "line" || kind === "power";
    out.cursorY = y(vals[cursor]);
    out.readValue = vals[cursor];
    out.readKind = "cursor";
  } else {
    let last = null;
    for (let i = Math.min(r1, vals.length - 1); i >= r0; i--) {
      if (vals[i] != null) { last = i; break; }
    }
    out.readValue = last != null ? vals[last] : null;
    out.readKind = "last";
  }
  return out;
}

/**
 * Fitness-Spur (CTL/ATL, gemeinsame Skala, Prognose ab `todayIdx` gestrichelt).
 * @param {{ctlVals:(number|null)[], atlVals:(number|null)[], todayIdx:number}} series
 */
export function buildFitnessLane(series, r0, r1, h, cursor) {
  const { idx, x, out } = frame(r0, r1, h);
  const { ctlVals, atlVals, todayIdx } = series;
  const pool = idx.map((i) => Math.max(ctlVals[i] ?? 0, atlVals[i] ?? 0)).filter((v) => v > 0);
  const vmax = (pool.length ? Math.max(...pool) : 1) * 1.14;
  const vmin = (pool.length ? Math.min(...pool) : 0) * 0.7;
  const y = (v) => h - 4 - ((v - vmin) / (vmax - vmin || 1)) * (h - 12);

  const pushSeries = (vals, dashedFrom) => {
    for (const pts of segmentPoints(vals, r0, Math.min(dashedFrom, r1), x, y)) {
      out.lines.push({ d: pathFrom(pts), width: vals === ctlVals ? 2 : 1.3, dash: "0", opacity: 1, role: vals === ctlVals ? "primary" : "secondary" });
    }
    if (dashedFrom < r1) {
      for (const pts of segmentPoints(vals, dashedFrom, r1, x, y)) {
        out.lines.push({ d: pathFrom(pts), width: vals === ctlVals ? 2 : 1.3, dash: "5 4", opacity: 0.9, role: vals === ctlVals ? "primary" : "secondary" });
      }
    }
  };
  pushSeries(atlVals, todayIdx);
  pushSeries(ctlVals, todayIdx);

  const lastI = Math.min(r1, ctlVals.length - 1);
  if (cursor != null && ctlVals[cursor] != null) {
    out.hasCursorDot = true;
    out.cursorY = y(ctlVals[cursor]);
    out.readValue = ctlVals[cursor];
    out.readKind = "cursor-ctl";
  } else {
    out.readValue = ctlVals[Math.min(lastI, todayIdx)] ?? null;
    out.readKind = "last-ctl";
  }
  return out;
}

/**
 * Form-Spur (TSB) mit Korridorbändern — EINE eigene Skala, getrennt von
 * der Fitness-Spur (Regel aus dem Handoff: "Eine Skala pro Spur").
 * @param {{tsbVals:(number|null)[], todayIdx:number}} series
 */
export function buildTsbLane(series, r0, r1, h, cursor) {
  const { idx, x, out } = frame(r0, r1, h);
  const { tsbVals, todayIdx } = series;
  const win = idx.map((i) => tsbVals[i]).filter((v) => v != null);
  const tmax = Math.max(TSB_FRESH_HIGH + 2, ...(win.length ? win : [0]).map((v) => v + 4));
  const tmin = Math.min(TSB_OVERLOAD - 5, ...(win.length ? win : [0]).map((v) => v - 4));
  const ty = (v) => h - 5 - ((v - tmin) / (tmax - tmin || 1)) * (h - 12);
  const band = (lo, hi, name) => ({ y: ty(hi), h: Math.max(1, ty(lo) - ty(hi)), band: name });
  out.zones.push(band(tmin, TSB_OVERLOAD, "overload"));
  out.zones.push(band(TSB_BUILD_LOW, TSB_BUILD_HIGH, "build"));
  out.zones.push(band(TSB_FRESH_LOW, TSB_FRESH_HIGH, "fresh"));
  out.hlines.push({ y: ty(0), kind: "zero" });

  for (const pts of segmentPoints(tsbVals, r0, Math.min(todayIdx, r1), x, ty)) {
    out.lines.push({ d: pathFrom(pts), width: 1.6, dash: "0", opacity: 0.95, role: "positive" });
  }
  if (todayIdx < r1) {
    for (const pts of segmentPoints(tsbVals, todayIdx, r1, x, ty)) {
      out.lines.push({ d: pathFrom(pts), width: 1.6, dash: "5 4", opacity: 0.6, role: "positive" });
    }
  }

  const ri = cursor ?? Math.min(todayIdx, r1);
  const t = tsbVals[ri];
  out.hasCursorDot = cursor != null && t != null;
  out.cursorY = t != null ? ty(t) : 0;
  out.readValue = t ?? null;
  out.readKind =
    t == null ? null : t < TSB_OVERLOAD ? "overload" : t <= TSB_BUILD_HIGH ? "build" : t < TSB_FRESH_LOW ? "neutral" : t <= TSB_FRESH_HIGH ? "fresh" : "too-fresh";
  return out;
}

/**
 * Tageslast-Spur (TSS-Balken, ab `todayIdx` geplant statt gefahren).
 * @param {{vals:(number|null)[], todayIdx:number}} series
 */
export function buildTssBarsLane(series, r0, r1, h, cursor) {
  const { idx, x, out } = frame(r0, r1, h);
  const { vals, todayIdx } = series;
  const shown = idx.map((i) => vals[i]).filter((v) => v != null);
  const max = Math.max(60, ...(shown.length ? shown : [0])) * 1.15;
  const y = (v) => h - 3 - (v / max) * (h - 8);
  const bw = Math.max(1.4, LANE_WIDTH / (idx.length + 1) - 1.4);
  for (const i of idx) {
    const v = vals[i];
    if (!v) continue;
    out.bars.push({ x: x(i) - bw / 2, y: y(v), w: bw, h: Math.max(1, h - 3 - y(v)), kind: i <= todayIdx ? "actual" : "planned" });
  }
  if (cursor != null) {
    const v = vals[cursor];
    out.readValue = v ?? null;
    out.readKind = cursor > todayIdx ? "planned" : "cursor";
  } else {
    let sum = 0, days = 0;
    for (let i = Math.min(r1, todayIdx); i >= r0 && days < 7; i--) {
      if (vals[i] == null) continue;
      sum += vals[i]; days++;
    }
    out.readValue = days ? Math.round(sum) : null;
    out.readKind = "sum7";
  }
  return out;
}

/**
 * Intensitäts-Spur (Wochenweise gestapelt low/mid/high).
 * @param {{weeks: Array<{startIdx:number, endIdx:number, low:number, mid:number, high:number}>}} series
 *   low/mid/high sind Anteile (0..1), die sich zu 1 summieren.
 */
export function buildZoneStackLane(series, r0, r1, h, cursor, targetShare = 0.8) {
  const { x, out } = frame(r0, r1, h);
  for (const wk of series.weeks) {
    if (wk.endIdx < r0 || wk.startIdx > r1) continue;
    const x0 = x(Math.max(wk.startIdx, r0));
    const x1 = x(Math.min(wk.endIdx + 1, r1));
    let acc = 0;
    for (const [v, band] of [[wk.low, "low"], [wk.mid, "mid"], [wk.high, "high"]]) {
      const y0 = h - 3 - acc * (h - 6);
      const y1 = h - 3 - (acc + v) * (h - 6);
      out.bars.push({ x: x0, y: y1, w: Math.max(2, x1 - x0 - 1.5), h: Math.max(1, y0 - y1), kind: band });
      acc += v;
    }
  }
  out.hlines.push({ y: h - 3 - targetShare * (h - 6), kind: "target" });

  let wk = cursor != null ? series.weeks.find((w) => cursor >= w.startIdx && cursor <= w.endIdx) : null;
  if (!wk) {
    for (let k = series.weeks.length - 1; k >= 0; k--) {
      if (series.weeks[k].startIdx <= r1) { wk = series.weeks[k]; break; }
    }
  }
  out.readValue = wk ? Math.round(wk.low * 100) : null;
  out.readKind = wk ? (cursor == null ? "last-week" : "cursor") : null;
  return out;
}

/**
 * Divergierende Balken um die Nulllinie (Energiebilanz).
 * @param {{vals:(number|null)[]}} series
 */
export function buildDivergeLane(series, r0, r1, h, cursor) {
  const { idx, x, out } = frame(r0, r1, h);
  const shown = idx.map((i) => series.vals[i]).filter((v) => v != null);
  const m = Math.max(400, ...shown.map((v) => Math.abs(v)), 0) * 1.1;
  const y = (v) => h / 2 - (v / m) * (h / 2 - 4);
  const bw = Math.max(1.4, LANE_WIDTH / (idx.length + 1) - 1.4);
  for (const i of idx) {
    const v = series.vals[i];
    if (v == null) continue;
    const y0 = y(0), y1 = y(v);
    out.bars.push({ x: x(i) - bw / 2, y: Math.min(y0, y1), w: bw, h: Math.max(1, Math.abs(y1 - y0)), kind: v >= 0 ? "pos" : "neg" });
  }
  out.hlines.push({ y: y(0), kind: "zero" });
  if (cursor != null && series.vals[cursor] != null) {
    out.readValue = series.vals[cursor];
    out.readKind = "cursor";
  } else {
    let sum = 0, days = 0;
    for (let i = Math.min(r1, idx[idx.length - 1] ?? r1); i >= r0 && days < 30; i--) {
      if (series.vals[i] == null) continue;
      sum += series.vals[i]; days++;
    }
    out.readValue = days ? sum / days : null;
    out.readKind = "avg30";
  }
  return out;
}

/**
 * Wetter-Spur (Temperaturlinie + Regenbalken + Windmarker).
 * @param {{tempVals:(number|null)[], windVals:(number|null)[], rainVals:(number|null)[]}} series
 */
export function buildWeatherLane(series, r0, r1, h, cursor, opts = {}) {
  const { idx, x, out } = frame(r0, r1, h);
  const tmin = opts.tempMin ?? 8, tmax = opts.tempMax ?? 34, hotThreshold = opts.hotThreshold ?? 24, windThreshold = opts.windThreshold ?? 20;
  const y = (v) => h - 4 - ((v - tmin) / (tmax - tmin)) * (h - 12);
  const bw = Math.max(1.4, LANE_WIDTH / (idx.length + 1) - 1.4);
  for (const i of idx) {
    const rain = series.rainVals[i];
    if (rain != null && rain > 0) {
      const rh = Math.min(h - 6, (rain / 6) * (h * 0.5));
      out.bars.push({ x: x(i) - bw / 2, y: h - 3 - rh, w: bw, h: Math.max(1, rh), kind: "rain" });
    }
    const wind = series.windVals[i];
    if (wind != null && wind > windThreshold) out.dots.push({ cx: x(i), cy: 5, good: null, kind: "wind" });
    const temp = series.tempVals[i];
    if (temp != null && temp > hotThreshold) out.dots.push({ cx: x(i), cy: y(temp), good: false, kind: "hot" });
  }
  out.hlines.push({ y: y(hotThreshold), kind: "hot-threshold" });
  const pts = idx.filter((i) => series.tempVals[i] != null).map((i) => [x(i), y(series.tempVals[i])]);
  if (pts.length > 1) out.lines.push({ d: pathFrom(pts), width: 1.4, dash: "0", opacity: 0.9, role: "neutral" });

  if (cursor != null && series.tempVals[cursor] != null) {
    out.hasCursorDot = true;
    out.cursorY = y(series.tempVals[cursor]);
    out.readValue = series.tempVals[cursor];
    out.readKind = "cursor";
  } else {
    let hot = 0, days = 0;
    for (const i of idx) {
      if (series.tempVals[i] == null) continue;
      days++;
      if (series.tempVals[i] > hotThreshold) hot++;
    }
    out.readValue = days ? hot : null;
    out.readKind = "hot-days";
  }
  return out;
}

/**
 * Dispatcher — nimmt eine Lane-Spec (Kind + kind-spezifische Serien) und
 * liefert die Geometrie. Spiegelt die `kind`-Verzweigung im Prototyp.
 * @param {{kind:string, [key:string]: any}} lane
 * @param {number} r0 @param {number} r1 @param {number} h @param {number|null} cursor
 */
export function buildLaneGeometry(lane, r0, r1, h, cursor) {
  switch (lane.kind) {
    case "fitness":
      return buildFitnessLane(lane, r0, r1, h, cursor);
    case "tsb":
      return buildTsbLane(lane, r0, r1, h, cursor);
    case "tssBars":
      return buildTssBarsLane(lane, r0, r1, h, cursor);
    case "zoneStack":
      return buildZoneStackLane(lane, r0, r1, h, cursor);
    case "diverge":
      return buildDivergeLane(lane, r0, r1, h, cursor);
    case "weather":
      return buildWeatherLane(lane, r0, r1, h, cursor);
    default:
      return buildValueLane(lane.kind, lane, r0, r1, h, cursor);
  }
}

/* ── Ruhewert-Aggregate (ohne Fadenkreuz) ──────────────────────────
   Regel aus dem Handoff: "Ohne Fadenkreuz zeigt jede Spur ein Aggregat
   statt '—'". Die kind-spezifischen build*Lane()-Funktionen oben liefern
   das bereits über readValue/readKind — diese Helfer sind für Spuren
   gedacht, deren Ruhewert nicht 1:1 aus der Geometrie-Funktion fällt
   (aktuell keine — Platzhalter für zukünftige Spurentypen). */
