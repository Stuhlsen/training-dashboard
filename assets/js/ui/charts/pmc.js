/* ============================================================
   UI/CHARTS/PMC.JS — CTL-Progression, PMC, Aerobe Entkopplung
   Rendering only — Interpolation/TSB kommt aus core/pmc.js.
   ============================================================ */

import { fmt, fmtDate, fmtDateFull, localISODate, addDaysISO } from "../../core/format.js";
import { interpolateCtl, tsbOf, currentPmc, projectPmc } from "../../core/pmc.js";
import { densifyDays } from "../../core/days.js";
import { isoWeekKey } from "../../core/aggregate.js";
import { buildCompare } from "../../core/compare.js";
import { el, svgEl, Tooltip } from "../dom.js";
import { activateTab } from "../nav.js";
import { Planned } from "../planned.js";
import {
  gridLines,
  xLabel,
  pickLabelIndices,
  axisTitles,
  makeIndexScale,
  pathD,
  haloLabel,
  flattestIndex,
  glowFilter,
  gradedGrid,
  axisUnit,
  CHART_THEME,
  presetWindow,
  brushOverlay,
  crosshair,
  hoverDot,
  SERIES_STYLE,
  fitsLabel,
  weekDisplayLabels,
} from "./base.js";
import {
  loadForAthlete as loadChartView,
  getState as getChartViewState,
  setWindow,
  setHovered,
  clearHovered,
  onChartViewChange,
  setScenarioParams,
  setScenarioEnabled,
  setCompareSlot,
  setCompareEnabled,
} from "../../state/chart-view.js";

/* ── CTL-Progression mit Interpolation ───────────────────────── */
export function renderCTL(svgId, rides) {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";
  const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (!sorted.some((r) => r.ctl != null)) return;

  // Fehlende CTL-Werte linear interpolieren (core/pmc.js)
  const data = interpolateCtl(sorted);

  const W = 780,
    H = 210,
    pad = { l: 50, r: 16, t: 16, b: 36 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const maxV = Math.max(...data.map((d) => d.ctlVal)) * 1.12;

  gridLines(svg, W, H, pad, maxV);

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * cw,
    y: pad.t + ch - (d.ctlVal / maxV) * ch,
    d,
  }));

  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id: "ctl-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#e08a3c", "stop-opacity": "0.2" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#e08a3c", "stop-opacity": "0" }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const areaPath =
    "M" +
    pts.map((p) => `${p.x},${p.y}`).join(" L") +
    ` L${pts[pts.length - 1].x},${pad.t + ch} L${pts[0].x},${pad.t + ch} Z`;
  svg.appendChild(svgEl("path", { d: areaPath, fill: "url(#ctl-grad)" }));
  svg.appendChild(
    svgEl("polyline", {
      fill: "none",
      stroke: "#e08a3c",
      "stroke-width": "2",
      points: pts.map((p) => `${p.x},${p.y}`).join(" "),
    })
  );

  const step = Math.max(1, Math.floor(pts.length / 20));
  pts.forEach((p, i) => {
    if (i % step !== 0 && i !== pts.length - 1) return;
    const interp = p.d.interpolated;
    const c = svgEl("circle", {
      cx: p.x,
      cy: p.y,
      r: interp ? "2" : "3",
      fill: interp ? "#5f6878" : "#e08a3c",
      stroke: "#0b0e13",
      "stroke-width": "1.5",
      opacity: interp ? "0.5" : "1",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `
      <div class="tt">${p.d.dateShort}${p.d.week ? " · " + p.d.week : ""}</div>
      <div class="tv">CTL ${Math.round(p.d.ctlVal)}${interp ? " (interpoliert)" : ""}</div>
      <div class="td">${p.d.name}</div>
    `
      )
    );
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  const lblIdx = pickLabelIndices(
    pts.map((p) => p.x),
    60
  );
  pts.forEach((p, i) => {
    if (lblIdx.has(i)) xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
  });
}

/* ── PMC — Performance Management Chart ──────────────────────── */
/* ── PMC — Performance Management Chart (Phase 5, Schritt 0) ─────
   Kontinuierliche Tagesachse statt Index-über-Ride-Zeilen (X3, docs/
   phase-5-konzept-explorer.md §2.2): CTL/ATL/TSB existieren an jedem
   Kalendertag, auch an Ruhetagen ohne eigene Ride-Zeile. Naht bei
   `projection.asOf` (X7): davor durchgezogen aus data/*.json, danach
   gestrichelt aus getState().projection — Historie wird nie selbst
   nachgerechnet. Achse reicht immer bis projection.horizonEnd (X8),
   unabhängig vom Fensterstart. Direktbeschriftung statt Legende (G5). */

const PMC_H = 260;
const PMC_PAD = { l: 54, r: 56, t: 30, b: 40 };

function measuredWidth(svg, fallback = 780) {
  const w = svg.clientWidth;
  return w > 0 ? w : fallback;
}

/**
 * Lückenlose CTL/ATL/TSB-Reihe über den gesamten Skelett-Bereich.
 *
 * CTL/ATL sind eine kontinuierlich geglättete Zustandsgröße — sie existieren
 * an JEDEM Tag, unabhängig davon, wie viele Tage seit der letzten Fahrt
 * vergangen sind. Ein früherer Versuch, das über `joinSeries(..., "carry")`
 * zu lösen, brach genau dort: die generische "carry"-Regel überträgt nur
 * EINEN einzelnen fehlenden Tag und behandelt zwei oder mehr als echte
 * Lücke. Das erzeugte zwei sichtbare Fehler (Playwright-Screenshot-Review):
 * eine Lücke zwischen der letzten Fahrt (`asOf`) und "heute" bei Stuhlsen
 * (Brücke oft länger als 1 Tag), und bei hc_diZee zerfiel die gesamte
 * Ist-Kurve in Fragmente, weil dünnere Datenlage regelmäßig Trainingspausen
 * von 2+ Tagen enthält, die keine "echte Datenlücke" sind, sondern schlicht
 * Ruhetage.
 *
 * Statt einer willkürlichen Lauflängen-Schwelle wird hier für JEDEN Tag ohne
 * eigene Ride-Zeile über `core/pmc.js::projectPmc()` (TSS=0) vom letzten
 * bekannten CTL/ATL aus weiter zerfallen — dieselbe Fortschreibung, die
 * `currentPmc()` bereits für den "Aktuell"-Wert im Chart-Header nutzt.
 * Das deckt sowohl innerhalb der Historie liegende Ruhetage als auch die
 * Brücke zwischen `asOf` und "heute" ab, ohne dass hier selbst Prognose
 * betrieben würde (X7 bleibt gewahrt: ab `todayIdx` werden ausschließlich
 * die bereits fertigen Werte aus `projection.days` übernommen, nie
 * eigenständig weitergerechnet).
 * @param {Array<{dateISO:string}>} skeleton
 * @param {import("../../types.js").Ride[]} sortedRides Nach dateISO aufsteigend, nur mit ctl+atl
 * @param {Array<{dateISO:string, ctl:number, atl:number, tsb:number}>} projRows Prognosetage (bereits dicht)
 * @param {number} todayIdx Skelett-Index von "heute" (Prognosestart), -1 wenn unbekannt
 * @returns {{ctl: Array<number|null>, atl: Array<number|null>, tsb: Array<number|null>}}
 */
function densifyPmc(skeleton, sortedRides, projRows, todayIdx) {
  const rideByDate = new Map(sortedRides.map((r) => [r.dateISO, r]));
  const projByDate = new Map(projRows.map((r) => [r.dateISO, r]));
  const n = skeleton.length;
  const ctl = new Array(n).fill(null);
  const atl = new Array(n).fill(null);
  const tsb = new Array(n).fill(null);
  const histEnd = todayIdx >= 0 ? todayIdx : n; // exklusiv — ab hier zählt nur projection.days

  let last = null; // { ctl, atl, sinceIdx }
  for (let i = 0; i < histEnd; i++) {
    const ride = rideByDate.get(skeleton[i].dateISO);
    if (ride) {
      ctl[i] = ride.ctl;
      atl[i] = ride.atl;
      tsb[i] = tsbOf(ride);
      last = { ctl: ride.ctl, atl: ride.atl, sinceIdx: i };
    } else if (last) {
      const proj = projectPmc(last.ctl, last.atl, i - last.sinceIdx);
      ctl[i] = proj.ctl;
      atl[i] = proj.atl;
      tsb[i] = proj.tsb;
    }
    // sonst: vor der ersten bekannten Fahrt im sichtbaren Fenster — bleibt null,
    // kein erfundener Vorgeschichte-Wert.
  }
  for (let i = Math.max(histEnd, 0); i < n; i++) {
    const row = projByDate.get(skeleton[i].dateISO);
    if (row) {
      ctl[i] = row.ctl;
      atl[i] = row.atl;
      tsb[i] = row.tsb;
    }
  }
  return { ctl, atl, tsb };
}

/** Baut zusammenhängende Pfad-Segmente aus einer Werteserie, an `null`-Lücken
 *  unterbrochen (kein Sprung über eine echte Datenlücke hinweg). */
function segmentsFor(vals, from, to, scale, yOf) {
  const segments = [];
  let current = [];
  for (let i = from; i <= to; i++) {
    const v = vals[i];
    if (v == null) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push([scale.x(i), yOf(v)]);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/* Zeitraum-Brushing (Phase 5, Schritt 1) — MIN_W deckungsgleich mit
   docs/chart-grundlagen.md §4.4. */
const MIN_W = 7;
const OVERVIEW_H = 64;
const OVERVIEW_PAD = { l: PMC_PAD.l, r: PMC_PAD.r, t: 8, b: 8 };

/** Übersichtsleiste: zeigt IMMER den vollen Skelett-Bereich (Vergangenheit +
 *  Prognosehorizont) als schmale CTL-Sparkline und trägt den Brush
 *  (docs/phase-5-konzept-explorer.md §4, Variante 2B). Eigene Y-Skala über
 *  die volle Serie — bewusst unabhängig von der Y-Skala des Hauptcharts, die
 *  sich beim Zoomen auf das sichtbare Fenster anpasst. */
function drawOverview(svg, { skeleton, ctlVals, seamIdx, todayIdx, totalWs, totalWe, ws, we, onChange }) {
  svg.innerHTML = "";
  const W = measuredWidth(svg);
  const H = OVERVIEW_H,
    pad = OVERVIEW_PAD;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const plotW = W - pad.l - pad.r,
    plotH = H - pad.t - pad.b;
  const fullScale = makeIndexScale({ ws: totalWs, we: totalWe, padLeft: pad.l, width: plotW });

  const known = ctlVals.filter((v) => v != null);
  const maxCA = known.length ? Math.max(...known) * 1.1 : 10;
  const caY = (v) => pad.t + plotH - (v / maxCA) * plotH;

  const histTo = Math.min(totalWe, seamIdx >= 0 ? seamIdx : totalWe);
  for (const seg of segmentsFor(ctlVals, totalWs, histTo, fullScale, caY)) {
    svg.appendChild(
      svgEl("path", {
        d: pathD(seg),
        fill: "none",
        stroke: CHART_THEME.role.primary,
        "stroke-width": "1.4",
      })
    );
  }
  if (seamIdx >= 0 && seamIdx < totalWe) {
    const projFrom = Math.max(totalWs, seamIdx);
    for (const seg of segmentsFor(ctlVals, projFrom, totalWe, fullScale, caY)) {
      svg.appendChild(
        svgEl("path", {
          d: pathD(seg),
          fill: "none",
          stroke: CHART_THEME.role.primary,
          "stroke-width": "1.4",
          "stroke-dasharray": "4,3",
        })
      );
    }
  }

  if (todayIdx >= totalWs && todayIdx <= totalWe) {
    const xt = fullScale.x(todayIdx);
    svg.appendChild(
      svgEl("line", {
        x1: xt,
        y1: pad.t,
        x2: xt,
        y2: H - pad.b,
        stroke: CHART_THEME.label,
        "stroke-width": "1",
        "stroke-dasharray": "2,3",
      })
    );
  }

  brushOverlay(svg, { scale: fullScale, pad, H, plotW, totalWs, totalWe, ws, we, minW: MIN_W, onChange });
}

/** Zeichnet das Fadenkreuz + je Serie einen Doppelkreis für den aktuell
 *  gehoverten Tag (Schritt 2, Teil B) — leert und befüllt ausschließlich
 *  `geo.hoverLayer`, das Chart selbst wird nie neu gezeichnet (§4.1). Liest
 *  `svg.__pmcGeometry` frisch bei jedem Aufruf (wie `svg.__brushConfig` in
 *  base.js), nie eine über einen renderPMC()-Aufruf hinweg festgehaltene
 *  Closure — ein Athletenwechsel ersetzt die Geometrie vor dem nächsten
 *  Hover-Event.
 * @param {SVGElement} svg */
function paintHover(svg) {
  const geo = svg.__pmcGeometry;
  // Vergleichsmodus (Schritt 4) hinterlegt keine Geometrie mit `skeleton`
  // (Hover läuft dort lokal, s. drawCompareView/Teil D) — ohne diese Wache
  // würde ein beliebiger chart-view-Change (z.B. setCompareEnabled selbst)
  // hier auf `geo.skeleton.findIndex` crashen.
  if (!geo || !geo.skeleton) return;
  geo.hoverLayer.textContent = "";
  const { hoveredDate } = getChartViewState();
  if (!hoveredDate) return;
  const i = geo.skeleton.findIndex((s) => s.dateISO === hoveredDate);
  if (i < 0 || i < geo.ws || i > geo.we) return;

  const x = geo.x(i);
  crosshair(geo.hoverLayer, { x, top: geo.top, bottom: geo.top + geo.plotH });
  for (const s of geo.series) {
    const v = s.vals[i];
    if (v == null) continue;
    hoverDot(geo.hoverLayer, x, s.yOf(v), s.color);
  }
}

/* ── Vergleichsmodus (Phase 5, Schritt 4, Teil C — docs/phase-5-konzept-
   explorer.md §5): zwei gemerkte Zeiträume desselben Athleten, überlagert
   auf einer RELATIVEN dayOffset-Achse (Tag 1 = Blockstart). Ersetzt die
   normale Historie/Prognose/Szenario-Zeichnung für diesen draw()-Aufruf
   komplett (nicht überlagert) — eine relative und eine absolute Achse
   lassen sich nicht gleichzeitig in derselben <svg> darstellen. Nur CTL
   wird verglichen (nicht ATL/TSB) — dieselbe Beschränkung, mit der schon
   die Szenario-Zweitserie (Schritt 3) nur die CTL-Kurve überlagert. */
const COMPARE_PAD = { l: 54, r: 24, t: 30, b: 50 };
const MIN_DAY_TICK_PX = 40;
const MIN_WEEK_TICK_PX = 50;

/** Erste Tag-Position jeder ISO-Kalenderwoche, die in `days` vorkommt —
 *  vollständige, geordnete Liste (Voraussetzung für weekDisplayLabels()s
 *  zustandsbehafteten Jahreswechsel-Marker, §1.4), noch NICHT ausgedünnt.
 *  @param {Array<{dayOffset:number, dateISO:string}>} days
 *  @returns {Array<{key:string, dayOffset:number}>} */
function weekStartsFor(days) {
  const weeks = [];
  let lastKey = null;
  for (const d of days) {
    const key = isoWeekKey(d.dateISO);
    if (key !== lastKey) {
      weeks.push({ key, dayOffset: d.dayOffset });
      lastKey = key;
    }
  }
  return weeks;
}

/** Zeichnet eine ausgedünnte Reihe farbiger Wochen-Ticks für einen Slot
 *  (eigene Zeile je Slot, s. Teil C — beide Slots liegen auf unterschied-
 *  lichen realen Kalenderwochen, teilen sich aber dieselbe x-Skala). */
function drawWeekTicks(svg, days, scale, color, y) {
  const weeks = weekStartsFor(days);
  if (!weeks.length) return;
  // Reihenfolge-Vorbedingung §1.4: weekDisplayLabels() läuft auf der
  // VOLLSTÄNDIGEN geordneten Liste, bevor pickLabelIndices() ausdünnt.
  const labels = weekDisplayLabels(weeks.map((w) => w.key));
  const tickX = weeks.map((w) => scale.x(w.dayOffset));
  const picked = pickLabelIndices(tickX, MIN_WEEK_TICK_PX);
  weeks.forEach((w, i) => {
    if (!picked.has(i)) return;
    const t = svgEl("text", {
      x: tickX[i],
      y,
      "text-anchor": "middle",
      fill: color,
      "font-size": "9",
    });
    t.textContent = labels[i];
    svg.appendChild(t);
  });
}

/**
 * @param {SVGElement} svg
 * @param {{W:number, H:number}} dims
 * @param {import("../../types.js").Ride[]} rides Voller, ungefilterter Bestand
 * @param {{a: {from:string,to:string}, b: {from:string,to:string}}} compareSlots
 * @returns {{a: ReturnType<typeof buildCompare>["a"], b: ReturnType<typeof buildCompare>["b"]}}
 */
function drawCompareView(svg, { W, H }, rides, compareSlots) {
  const pad = COMPARE_PAD;
  const { a, b } = buildCompare(rides, compareSlots.a, compareSlots.b);
  const maxLen = Math.max(a.days.length, b.days.length, 1);
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const scale = makeIndexScale({ ws: 0, we: Math.max(1, maxLen - 1), padLeft: pad.l, width: plotW });

  const aCtl = a.days.map((d) => d.ctl);
  const bCtl = b.days.map((d) => d.ctl);
  const known = [...aCtl, ...bCtl].filter((v) => v != null);
  const maxCA = known.length ? Math.max(...known) * 1.12 : 10;
  const caY = (v) => pad.t + plotH - (v / maxCA) * plotH;

  gradedGrid(svg, { x0: pad.l, x1: W - pad.r, yOf: caY, lo: 0, hi: maxCA, steps: 4 });
  axisUnit(svg, { x: pad.l - 6, y: pad.t - 10, text: "CTL" });
  axisTitles(svg, W, H, pad, { x: "Tage seit Blockstart" });

  const drawSeries = (days, vals, color, dashed, glowId) => {
    if (!days.length) return;
    const defs = svg.querySelector("defs") || svg.insertBefore(svgEl("defs", {}), svg.firstChild);
    const filterUrl = !dashed && glowId ? glowFilter(defs, glowId, color, 2.5) : null;
    const segs = segmentsFor(vals, 0, days.length - 1, scale, caY);
    for (const seg of segs) {
      svg.appendChild(
        svgEl("path", {
          d: pathD(seg),
          fill: "none",
          stroke: color,
          "stroke-width": "2.2",
          filter: filterUrl || undefined,
          "stroke-dasharray": dashed ? SERIES_STYLE.secondary["stroke-dasharray"] : undefined,
          opacity: dashed ? SERIES_STYLE.secondary.opacity : undefined,
        })
      );
    }
  };

  // Serie A: durchgezogen + Glow (Erstserie). Serie B: SERIES_STYLE.secondary
  // (gestrichelt, reduzierte Deckkraft) — Konvention aus Schritt 3, hier für
  // eine echte Zweitserie statt einem synthetischen Szenario.
  drawSeries(a.days, aCtl, CHART_THEME.z2, false, `glow-${svg.id}-compare-a`);
  drawSeries(b.days, bCtl, CHART_THEME.ss, true, null);

  // Segment-Labels über das fitsLabel()-Muster (§1.4) — der Explorer nutzt
  // es von Anfang an, anders als pmc/power/training.js' altes Rand-Muster.
  if (a.days.length && fitsLabel(plotW, "Zeitraum A")) {
    const idx = flattestIndex(aCtl, 0, a.days.length - 1, caY, 0.3, 1);
    if (idx != null) haloLabel(svg, scale.x(idx), caY(aCtl[idx]) - 12, "Zeitraum A", CHART_THEME.z2);
  }
  if (b.days.length && fitsLabel(plotW, "Zeitraum B")) {
    const idx = flattestIndex(bCtl, 0, b.days.length - 1, caY, 0.3, 1);
    if (idx != null) haloLabel(svg, scale.x(idx), caY(bCtl[idx]) + 16, "Zeitraum B", CHART_THEME.ss);
  }

  // Tages- vs. Wochen-Ticks je nach Pixel-Teilung (§5, Teil C).
  const pxPerDay = plotW / maxLen;
  if (pxPerDay >= MIN_DAY_TICK_PX) {
    const tickIdx = Array.from({ length: maxLen }, (_, i) => i);
    const tickX = tickIdx.map((i) => scale.x(i));
    const picked = pickLabelIndices(tickX, MIN_DAY_TICK_PX);
    tickIdx.forEach((i, k) => {
      if (picked.has(k)) xLabel(svg, scale.x(i), H - pad.b + 14, `Tag ${i + 1}`);
    });
  } else {
    // Zwei Tick-Zeilen (eine je Slot) — beide Slots liegen auf verschiedenen
    // realen Kalenderwochen, teilen sich aber denselben dayOffset-x-Punkt.
    drawWeekTicks(svg, a.days, scale, CHART_THEME.z2, H - pad.b + 14);
    drawWeekTicks(svg, b.days, scale, CHART_THEME.ss, H - pad.b + 26);
  }

  // Cursor pro Slot (Phase 5, Schritt 4, Teil D — §7.1): beide Serien teilen
  // sich denselben dayOffset-x-Punkt, deshalb genügt EIN gemeinsamer
  // Crosshair mit je einem hoverDot() pro Slot — keine neue Struktur nötig,
  // dasselbe Muster wie paintHover()s geo.series-Liste in der Normalansicht.
  // Bewusst LOKAL am SVG-Knoten (kein setHovered()/state/chart-view.js):
  // ein dayOffset trägt zwei echte Daten (Slot A ≠ Slot B), die sich nicht
  // auf ein einzelnes globales `hoveredDate` abbilden lassen.
  const hoverLayer = svgEl("g", {});
  svg.appendChild(hoverLayer);

  const showCompareHover = (e, dayOffset) => {
    hoverLayer.textContent = "";
    const x = scale.x(dayOffset);
    crosshair(hoverLayer, { x, top: pad.t, bottom: pad.t + plotH });
    const lines = [];
    if (aCtl[dayOffset] != null) {
      hoverDot(hoverLayer, x, caY(aCtl[dayOffset]), CHART_THEME.z2);
      lines.push(
        `<div class="tv">Zeitraum A: ${fmtDateFull(a.days[dayOffset].dateISO)} · CTL ${fmt(aCtl[dayOffset])}</div>`
      );
    }
    if (bCtl[dayOffset] != null) {
      hoverDot(hoverLayer, x, caY(bCtl[dayOffset]), CHART_THEME.ss);
      lines.push(
        `<div class="tv">Zeitraum B: ${fmtDateFull(b.days[dayOffset].dateISO)} · CTL ${fmt(bCtl[dayOffset])}</div>`
      );
    }
    Tooltip.show(e, lines.join(""));
  };
  const clearCompareHover = () => {
    hoverLayer.textContent = "";
    Tooltip.hide();
  };

  // Punkte ausgedünnt wie die CTL-Punkte der Normalansicht (max. ~25 sichtbar).
  const addPoints = (days, vals, color) => {
    if (!days.length) return;
    const step = Math.max(1, Math.floor(days.length / 25));
    days.forEach((d, i) => {
      if (i % step !== 0 && i !== days.length - 1) return;
      if (vals[i] == null) return;
      const c = svgEl("circle", {
        cx: scale.x(d.dayOffset),
        cy: caY(vals[i]),
        r: "3",
        fill: color,
        stroke: CHART_THEME.bg,
        "stroke-width": "1.5",
      });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", (e) => showCompareHover(e, d.dayOffset));
      c.addEventListener("mouseleave", clearCompareHover);
      svg.appendChild(c);
    });
  };
  addPoints(a.days, aCtl, CHART_THEME.z2);
  addPoints(b.days, bCtl, CHART_THEME.ss);

  return { a, b };
}

export function renderPMC(svgId, rides, projection, events, athleteId) {
  const svg = el(svgId);
  if (!svg) return;
  const overviewSvg = el("chart-pmc-overview");
  const presetsWrap = el("pmc-brush-presets");
  const scenarioWrap = el("pmc-scenario");
  const compareWrap = el("pmc-compare");

  const sorted = (rides || [])
    .filter((r) => r.ctl != null && r.atl != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  let rafId = 0;
  const scheduleFrame = (fn) => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      fn();
    });
  };

  const draw = (overrideWindow) => {
    svg.innerHTML = "";
    if (!sorted.length && !projection?.days?.length) return;

    const today = localISODate();
    // Skelett-Start = frühestes bekanntes CTL/ATL-Datum (nicht mehr fix
    // "heute-90") — deckt die volle Historie ab, sonst hätten die Presets
    // "365 Tage"/"Alles" keinen Spielraum. Stabil über die Zeit (frühestes
    // Datum ändert sich nicht rückwirkend), damit bleiben persistierte
    // Fenster-Indizes über Tage/Reloads hinweg gültig — nur das Skelett-Ende
    // (Prognosehorizont) wandert mit "heute" mit.
    const from = sorted.length ? sorted[0].dateISO : addDaysISO(today, -90);
    const lastRideISO = sorted.length ? sorted[sorted.length - 1].dateISO : today;
    const rawTo = projection?.horizonEnd ?? lastRideISO;
    const to = rawTo < from ? from : rawTo;
    const skeleton = densifyDays(from, to);
    if (skeleton.length < 2) return;

    const totalWs = 0;
    const totalWe = skeleton.length - 1;
    // Default-Fenster (nur beim allerersten Laden ohne persistierten
    // Zustand) bleibt visuell wie bisher: letzte 90 Tage + Horizont.
    const defaultWsIdx = skeleton.findIndex((d) => d.dateISO === addDaysISO(today, -90));
    const defaultWindow = { ws: defaultWsIdx >= 0 ? defaultWsIdx : totalWs, we: totalWe };

    loadChartView(athleteId, defaultWindow);
    let { ws, we } = overrideWindow || getChartViewState();
    // Defensiv an einen ggf. gewachsenen/geschrumpften Skelett-Bereich
    // klemmen — persistierter Zustand kann älter sein als der aktuelle
    // Sync-Stand (Systemgrenze: localStorage-Wert kommt von außen).
    we = Math.min(we, totalWe);
    ws = Math.max(totalWs, Math.min(ws, we - MIN_W));

    const W = measuredWidth(svg);
    const H = PMC_H,
      pad = PMC_PAD;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const plotW = W - pad.l - pad.r,
      plotH = H - pad.t - pad.b;
    const scale = makeIndexScale({ ws, we, padLeft: pad.l, width: plotW });

    // Ist-Fahrten + Prognosetage auf dasselbe Tagesgerüst bringen (X7).
    const projRows = (projection?.days || []).map((d) => ({
      dateISO: d.date,
      ctl: d.ctl,
      atl: d.atl,
      tsb: d.tsb,
      uncertain: d.uncertain,
    }));
    const uncertainDates = new Set(projRows.filter((r) => r.uncertain).map((r) => r.dateISO));

    const todayISO = projection?.days?.[0]?.date ?? null;
    const todayIdx = todayISO ? skeleton.findIndex((s) => s.dateISO === todayISO) : -1;
    const asOfISO = projection?.asOf ?? null;
    const foundAsOfIdx = asOfISO ? skeleton.findIndex((s) => s.dateISO === asOfISO) : -1;
    const seamIdx = foundAsOfIdx >= 0 ? foundAsOfIdx : todayIdx;

    const { ctl: ctlVals, atl: atlVals, tsb: tsbVals } = densifyPmc(skeleton, sorted, projRows, todayIdx);

    // scenario/scenarioProjection UND compareSlots werden hier (vor dem
    // Modus-Zweig) aus demselben getChartViewState()-Aufruf gelesen: beide
    // werden auch AUSSERHALB des Zweigs gebraucht (Szenario-Regler-Sync bzw.
    // Vergleichsmodus-Bedienelemente laufen unverändert nach dem Zweig).
    const { scenario, scenarioProjection, compareSlots } = getChartViewState();

    // Vergleichsmodus (Schritt 4, Teil C) — ersetzt die normale Historie/
    // Prognose/Szenario-Zeichnung komplett für diesen draw()-Aufruf (relative
    // und absolute Achse passen nicht in dieselbe <svg>). Übersichtsleiste,
    // Presets und Szenario-Regler bleiben unverändert aktiv (Fensterwahl für
    // "Als A/B merken" bleibt möglich, unabhängig vom Anzeigemodus).
    const compareActive = !!(compareSlots.enabled && compareSlots.a && compareSlots.b);
    let compareResult = null;
    if (compareActive) {
      compareResult = drawCompareView(svg, { W, H }, rides, compareSlots);
    } else {
    // Y-Skalen aus dem SICHTBAREN Fenster, nicht aus dem vollen Skelett —
    // Reinzoomen zeigt mehr Y-Detail (erwartete Brush/Zoom-Semantik).
    const windowSlice = (vals) => vals.slice(ws, we + 1).filter((v) => v != null);
    const knownVals = [...windowSlice(ctlVals), ...windowSlice(atlVals)];
    const maxCA = knownVals.length ? Math.max(...knownVals) * 1.1 : 10;
    const knownTsb = windowSlice(tsbVals);
    const minTSB = (knownTsb.length ? Math.min(...knownTsb) : -10) - 5;
    const maxTSB = (knownTsb.length ? Math.max(...knownTsb) : 10) + 5;

    const caY = (v) => pad.t + plotH - (v / maxCA) * plotH;
    const tsbY = (v) => pad.t + plotH - ((v - minTSB) / (maxTSB - minTSB)) * plotH;

    gradedGrid(svg, { x0: pad.l, x1: W - pad.r, yOf: caY, lo: 0, hi: maxCA, steps: 4 });
    axisUnit(svg, { x: pad.l - 6, y: pad.t - 10, text: "TSS/Tag" });
    axisTitles(svg, W, H, pad, { x: "Datum", yRight: "TSB" });

    // TSB-Sweet-Spot-Zone (-10 bis -30) + Nulllinie
    const zoneTop = tsbY(-10),
      zoneBot = tsbY(-30);
    svg.appendChild(
      svgEl("rect", {
        x: pad.l,
        y: Math.min(zoneTop, zoneBot),
        width: plotW,
        height: Math.abs(zoneBot - zoneTop),
        fill: CHART_THEME.z1,
        opacity: "0.06",
        rx: "2",
      })
    );
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: tsbY(0),
        x2: W - pad.r,
        y2: tsbY(0),
        stroke: CHART_THEME.z1,
        "stroke-width": "0.5",
        "stroke-dasharray": "4,4",
        opacity: "0.4",
      })
    );

    // Unsicherheitsband: Prognosetage mit uncertain===true (§6.3) — Hinweisfläche,
    // kein erfundener Präzisionsschein bei dünner K3-Typ-Default-TSS-Basis.
    // EIN durchgehendes Band über den gesamten unsicheren Bereich (erster bis
    // letzter unsicherer Tag), nicht ein Rechteck pro Tag oder pro Lauf —
    // `uncertain` wechselt tageweise (K3-Typ-Default hängt von der jeweiligen
    // Karte ab), ein Rechteck pro zusammenhängendem Lauf hätte bei täglichem
    // Wechsel dasselbe Zebra-Muster erzeugt wie Einzeltag-Rechtecke
    // (Playwright-Screenshot-Review). Ein einzelnes zusammenfassendes Band
    // sagt ehrlich "irgendwo in diesem Bereich ist die Prognose unsicher",
    // ohne den Eindruck tagesgenauer Präzision zu erwecken, den die
    // zugrunde liegende K3-Typ-Default-TSS ohnehin nicht hergibt.
    let uMin = null,
      uMax = null;
    for (let i = Math.max(seamIdx, ws); i <= we; i++) {
      if (!uncertainDates.has(skeleton[i].dateISO)) continue;
      if (uMin === null) uMin = i;
      uMax = i;
    }
    if (uMin !== null) {
      const halfStep = (scale.x(1) - scale.x(0)) / 2;
      const x0 = scale.x(uMin) - halfStep;
      const x1 = scale.x(uMax) + halfStep;
      svg.appendChild(
        svgEl("rect", {
          x: x0,
          y: pad.t,
          width: Math.max(1, x1 - x0),
          fill: CHART_THEME.role.status,
          opacity: "0.06",
          height: plotH,
        })
      );
    }

    // Naht/Fenster geklemmt (nicht bloß seamIdx direkt): ein Fenster kann
    // vollständig vor oder nach der Naht liegen (z. B. der "Plan 2"-Preset,
    // lange vor "heute") — ohne diese Klemmung rechnet segmentsFor() für
    // Indizes weit außerhalb von [ws, we], scale.x() extrapoliert dafür
    // unklemmt (s. makeIndexScale-Doku), und die Linie reicht sichtbar über
    // den Plot-Rand hinaus.
    const histTo = Math.min(we, seamIdx >= 0 ? seamIdx : we);
    const projFrom = Math.max(ws, seamIdx >= 0 ? seamIdx : we);

    // CTL/ATL: durchgezogen bis zur Naht, gestrichelt danach (X7, X5) —
    // das Brückensegment zwischen asOf und "heute" (falls beide auseinander-
    // liegen) läuft bewusst im gestrichelten Teil mit, statt einen dritten
    // Stil einzuführen: beide Enden teilen sich den Index seamIdx exakt,
    // daher keine Lücke am Schnittpunkt (Abnahmekriterium 3).
    const drawLineSeries = (vals, color, roleGlow) => {
      const defs =
        svg.querySelector("defs") || svg.insertBefore(svgEl("defs", {}), svg.firstChild);
      const filterUrl = roleGlow
        ? glowFilter(defs, `glow-${svgId}-${roleGlow}`, color, 2.5)
        : null;
      const histSeg = segmentsFor(vals, ws, histTo, scale, caY);
      for (const seg of histSeg) {
        svg.appendChild(
          svgEl("path", {
            d: pathD(seg),
            fill: "none",
            stroke: color,
            "stroke-width": "2.2",
            filter: filterUrl || undefined,
          })
        );
      }
      if (seamIdx >= 0 && seamIdx < we) {
        const projSeg = segmentsFor(vals, projFrom, we, scale, caY);
        for (const seg of projSeg) {
          svg.appendChild(
            svgEl("path", {
              d: pathD(seg),
              fill: "none",
              stroke: color,
              "stroke-width": "2.2",
              "stroke-dasharray": "5,4",
            })
          );
        }
      }
    };

    drawLineSeries(ctlVals, CHART_THEME.role.primary, "ctl");
    drawLineSeries(atlVals, CHART_THEME.role.secondary, null);

    // What-if-Szenario (Phase 5, Schritt 3, Teil C — docs/phase-5-konzept-
    // explorer.md §6): zweite CTL-Kurve über der Basisprognose, erzeugt aus
    // core/scenario.js über einen zweiten projectLoad()-Aufruf in
    // state/chart-view.js. Startet immer bei "heute" (projectLoad() rechnet
    // stets ab today), nicht bei seamIdx/asOf — die Szenario-Kurve hat keine
    // Vergangenheit. Der Achsenhorizont (skeleton/to) bleibt unverändert aus
    // der BASIS-Prognose berechnet (X8) — ein Ein-/Ausschalten des Szenarios
    // darf die Achse nie verschieben, sonst wäre der Vorher-Nachher-Vergleich
    // nicht mehr möglich.
    if (scenarioProjection) {
      const scenarioRowByDate = new Map(scenarioProjection.days.map((d) => [d.date, d]));
      const scenarioCtl = skeleton.map((s) => scenarioRowByDate.get(s.dateISO)?.ctl ?? null);
      const scenarioFrom = Math.max(ws, todayIdx >= 0 ? todayIdx : ws);

      for (const seg of segmentsFor(scenarioCtl, scenarioFrom, we, scale, caY)) {
        svg.appendChild(
          svgEl("path", {
            d: pathD(seg),
            fill: "none",
            stroke: CHART_THEME.role.primary,
            "stroke-width": "2.2",
            "stroke-dasharray": SERIES_STYLE.secondary["stroke-dasharray"],
            opacity: SERIES_STYLE.secondary.opacity,
          })
        );
      }

      // Eigenes Unsicherheitsband für die Szenario-Kurve (§6.3, Pflicht nicht
      // Kür) — gleiches Zebra-Vermeidungsmuster wie das Basis-Band oben: EIN
      // zusammenhängendes Band von erstem bis letztem unsicheren Tag.
      const scenarioUncertainDates = new Set(
        scenarioProjection.days.filter((d) => d.uncertain).map((d) => d.date)
      );
      let suMin = null,
        suMax = null;
      for (let i = scenarioFrom; i <= we; i++) {
        if (!scenarioUncertainDates.has(skeleton[i].dateISO)) continue;
        if (suMin === null) suMin = i;
        suMax = i;
      }
      if (suMin !== null) {
        const halfStep = (scale.x(1) - scale.x(0)) / 2;
        const x0 = scale.x(suMin) - halfStep;
        const x1 = scale.x(suMax) + halfStep;
        svg.appendChild(
          svgEl("rect", {
            x: x0,
            y: pad.t,
            width: Math.max(1, x1 - x0),
            fill: CHART_THEME.role.status,
            opacity: "0.06",
            height: plotH,
          })
        );
      }

      const scenarioLabelIdx = flattestIndex(scenarioCtl, scenarioFrom, we, caY, 0.3, 1);
      if (scenarioLabelIdx != null) {
        haloLabel(
          svg,
          scale.x(scenarioLabelIdx),
          caY(scenarioCtl[scenarioLabelIdx]) - 12,
          "Szenario",
          CHART_THEME.role.primary
        );
      }
    }

    // TSB — eigene Achse (Punkte statt TSS/Tag), kein Glow (Sekundärserie in
    // diesem Chart, G8: Glow höchstens auf CTL/ATL).
    const tsbHist = segmentsFor(tsbVals, ws, histTo, scale, tsbY);
    for (const seg of tsbHist) {
      svg.appendChild(
        svgEl("path", {
          d: pathD(seg),
          fill: "none",
          stroke: CHART_THEME.role.positive,
          "stroke-width": "1.5",
        })
      );
    }
    if (seamIdx >= 0 && seamIdx < we) {
      const tsbProj = segmentsFor(tsbVals, projFrom, we, scale, tsbY);
      for (const seg of tsbProj) {
        svg.appendChild(
          svgEl("path", {
            d: pathD(seg),
            fill: "none",
            stroke: CHART_THEME.role.positive,
            "stroke-width": "1.5",
            "stroke-dasharray": "5,4",
          })
        );
      }
    }

    // TSB rechte Achsen-Zahlen (eigene Skala, kein gemeinsames Gitter mit CTL/ATL)
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(minTSB + ((maxTSB - minTSB) / 4) * (4 - i));
      const y = pad.t + (plotH / 4) * i;
      const t = svgEl("text", {
        x: W - pad.r + 6,
        y: y + 4,
        fill: CHART_THEME.role.positive,
        "font-size": "9",
      });
      t.textContent = val;
      svg.appendChild(t);
    }

    // Direktbeschriftung CTL/ATL/TSB (G5) — flachstes Stück im historischen
    // Bereich, kein Legende-Fallback. Gleiche Klemmung wie histTo, sonst
    // sucht flattestIndex einen Platz außerhalb des sichtbaren Fensters.
    const labelWindow = histTo;
    const ctlLabelIdx = flattestIndex(ctlVals, ws, labelWindow, caY, 0.5, 1);
    if (ctlLabelIdx != null) {
      haloLabel(
        svg,
        scale.x(ctlLabelIdx),
        caY(ctlVals[ctlLabelIdx]) - 12,
        "CTL",
        CHART_THEME.role.primary
      );
    }
    const atlLabelIdx = flattestIndex(atlVals, ws, labelWindow, caY, 0.5, 1);
    if (atlLabelIdx != null) {
      haloLabel(
        svg,
        scale.x(atlLabelIdx),
        caY(atlVals[atlLabelIdx]) + 14,
        "ATL",
        CHART_THEME.role.secondary
      );
    }
    const tsbLabelIdx = flattestIndex(tsbVals, ws, labelWindow, tsbY, 0.5, 1);
    if (tsbLabelIdx != null) {
      haloLabel(
        svg,
        scale.x(tsbLabelIdx),
        tsbY(tsbVals[tsbLabelIdx]) - 12,
        "TSB",
        CHART_THEME.role.positive
      );
    }

    // Heute-Marke separat gezeichnet (X5) — nicht über pickLabelIndices'
    // mustKeep. Zusätzlicher Sichtbarkeits-Guard: liegt "heute" außerhalb
    // des gebrushten Fensters (z. B. beim "Plan 2"-Preset), nicht zeichnen —
    // sonst extrapoliert scale.x() knapp neben den Plot-Rand statt weit
    // genug weg, um vom SVG-Root-Clipping aufgefangen zu werden.
    if (todayIdx >= ws && todayIdx <= we) {
      const xt = scale.x(todayIdx);
      svg.appendChild(
        svgEl("line", {
          x1: xt,
          y1: pad.t,
          x2: xt,
          y2: H - pad.b,
          stroke: CHART_THEME.label,
          "stroke-width": "1",
          "stroke-dasharray": "2,3",
        })
      );
      xLabel(svg, xt, H - pad.b + 14, `Heute ${fmtDate(todayISO)}`);
    }

    // Event-Marke — nächstes Event im Horizont (falls vorhanden).
    const upcomingEvents = (events || [])
      .filter((e) => e.eventDate >= (todayISO || today) && e.eventDate <= to)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    if (upcomingEvents.length) {
      const ev = upcomingEvents[0];
      const evIdx = skeleton.findIndex((s) => s.dateISO === ev.eventDate);
      if (evIdx >= ws && evIdx <= we) {
        const xe = scale.x(evIdx);
        svg.appendChild(
          svgEl("line", {
            x1: xe,
            y1: pad.t,
            x2: xe,
            y2: H - pad.b,
            stroke: CHART_THEME.role.status,
            "stroke-width": "1",
            "stroke-dasharray": "2,2",
          })
        );
        xLabel(svg, xe, pad.t - 4, ev.title);
      }
    }

    // Kalender-Ticks (Montage/Monatserste), ausgedünnt über pickLabelIndices,
    // Kandidaten zu nah an der Heute-Marke ausgeschlossen (Kollisionsschutz).
    // Kandidaten auf das sichtbare Fenster beschränkt (Schritt 0 iterierte
    // hier noch über den GESAMTEN Skelett-Bereich, der bei einem echten
    // Teilfenster größer als [ws, we] ist — ungeklemmt landen Ticks für
    // Tage außerhalb des Fensters im Rand statt außerhalb der viewBox).
    const MIN_TICK_PX = 58;
    const todayX = todayIdx >= ws && todayIdx <= we ? scale.x(todayIdx) : null;
    const tickIdx = skeleton
      .map((s, i) => i)
      .filter((i) => i >= ws && i <= we)
      .filter((i) => {
        const d = new Date(`${skeleton[i].dateISO}T00:00:00`);
        return d.getDay() === 1 || d.getDate() === 1;
      })
      .filter((i) => todayX == null || Math.abs(scale.x(i) - todayX) >= MIN_TICK_PX);
    const tickX = tickIdx.map((i) => scale.x(i));
    const picked = pickLabelIndices(tickX, MIN_TICK_PX);
    tickIdx.forEach((i, k) => {
      if (picked.has(k)) xLabel(svg, scale.x(i), H - pad.b + 14, fmtDate(skeleton[i].dateISO));
    });
    xLabel(svg, scale.x(ws), H - pad.b + 14, fmtDate(skeleton[ws].dateISO));

    // Hover-Ebene (§4.1) — Geometrie-Objekt am SVG-Knoten hinterlegt, damit
    // paintHover() (Schritt 2, Teil B) sie ohne erneutes Zeichnen findet.
    // `series` trägt CTL/ATL/TSB mit ihrer jeweils eigenen y-Skala (TSB
    // läuft auf tsbY, nicht caY) — ein Hover markiert alle drei am selben
    // Tagesindex (§3, "hovern CTL/ATL/TSB gemeinsam auf denselben Index").
    const hoverLayer = svgEl("g", {});
    svg.appendChild(hoverLayer);
    svg.__pmcGeometry = {
      x: scale.x,
      y: caY,
      padLeft: pad.l,
      top: pad.t,
      plotW,
      plotH,
      width: W,
      hoverLayer,
      skeleton,
      ws,
      we,
      series: [
        { vals: ctlVals, yOf: caY, color: CHART_THEME.role.primary },
        { vals: atlVals, yOf: caY, color: CHART_THEME.role.secondary },
        { vals: tsbVals, yOf: tsbY, color: CHART_THEME.role.positive },
      ],
    };
    paintHover(svg);

    // Punkte + Tooltip auf CTL, ausgedünnt (wie zuvor)
    const step = Math.max(1, Math.floor((we - ws) / 25));
    for (let i = ws; i <= we; i++) {
      if (i % step !== 0 && i !== we) continue;
      if (ctlVals[i] == null) continue;
      const c = svgEl("circle", {
        cx: scale.x(i),
        cy: caY(ctlVals[i]),
        r: "3",
        fill: CHART_THEME.role.primary,
        stroke: "#0b0e13",
        "stroke-width": "1.5",
      });
      c.style.cursor = "pointer";
      const dateISO = skeleton[i].dateISO;
      c.addEventListener("mouseenter", (e) => {
        Tooltip.show(
          e,
          `<div class="tt">${fmtDateFull(dateISO)}</div>
           <div class="tv">CTL ${fmt(ctlVals[i])} · ATL ${fmt(atlVals[i])} · TSB ${fmt(tsbVals[i])}</div>`
        );
        setHovered(dateISO);
      });
      c.addEventListener("mouseleave", () => {
        Tooltip.hide();
        clearHovered();
      });
      // Planungstab-Sprung bewusst auf KLICK beschränkt, nicht Hover (Teil C
      // der Aufgabe): Planned.scrollToDate() scrollt den Planungstab-
      // Viewport — das bei jeder Mausbewegung über den Chart mitlaufen zu
      // lassen wäre unruhig, zumal der Tab meist gar nicht aktiv ist,
      // während man den Chart betrachtet. Die Fahrtenbuch-Hervorhebung
      // bleibt bei Hover (state/chart-view.js → ui/table.js), nur der
      // Tab-Wechsel + Scroll ist eine bewusste Nutzeraktion.
      c.addEventListener("click", () => {
        activateTab("planned");
        setTimeout(() => Planned.scrollToDate(dateISO), 50);
      });
      svg.appendChild(c);
    }
    } // Ende `if (!compareActive)` — Übersichtsleiste/Presets/Szenario-Regler folgen unverändert.

    // Note — TSB auf heute fortgeschrieben (s. core/pmc.js::currentPmc), sonst
    // widerspricht dieses "Aktuell" der Belastungsempfehlung nach Ruhetagen.
    const noteEl = el("pmc-note");
    const pmcNow = currentPmc(sorted, localISODate());
    if (noteEl && pmcNow) {
      const asOfNote =
        pmcNow.daysProjected > 0 ? ` (Stand ${fmtDate(pmcNow.asOfDate)}, fortgeschrieben)` : "";
      noteEl.textContent = `Aktuell: CTL ${fmt(pmcNow.ctl)} · ATL ${fmt(pmcNow.atl)} · TSB ${fmt(pmcNow.tsb)}${asOfNote}`;
    }

    // Übersichtsleiste — zeigt immer den vollen Horizont, trägt den Brush.
    // onChange(final:false) läuft während eines aktiven Drags (rAF-gebündelt,
    // NICHT persistiert — setWindow() schriebe sonst bei jedem Pointer-Move
    // nach localStorage); onChange(final:true) am Drag-Ende persistiert und
    // rendert final aus dem Store neu (Single Source of Truth danach wieder
    // state/chart-view.js, nicht die lokale overrideWindow-Variable).
    if (overviewSvg) {
      drawOverview(overviewSvg, {
        skeleton,
        ctlVals,
        seamIdx,
        todayIdx,
        totalWs,
        totalWe,
        ws,
        we,
        onChange: (nws, nwe, meta) => {
          if (meta.final) {
            setWindow(nws, nwe);
            draw();
          } else {
            scheduleFrame(() => draw({ ws: nws, we: nwe }));
          }
        },
      });
    }

    // Preset-Kontext für die (einmalig gebundenen) Buttons aktuell halten —
    // Muster wie svg.__pmcGeometry: der Klick-Handler liest ihn erst beim
    // nächsten Klick, nie eine veraltete Closure aus einem früheren
    // renderPMC()-Aufruf (Athletenwechsel).
    if (presetsWrap) {
      const plan2Rides = (rides || []).filter((r) => r.plan === "Plan 2" && r.dateISO);
      let plan2FromIdx = null,
        plan2ToIdx = null;
      if (plan2Rides.length) {
        const p2sorted = [...plan2Rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
        const fromIdx = skeleton.findIndex((s) => s.dateISO === p2sorted[0].dateISO);
        const toIdx = skeleton.findIndex((s) => s.dateISO === p2sorted[p2sorted.length - 1].dateISO);
        plan2FromIdx = fromIdx >= 0 ? fromIdx : 0;
        plan2ToIdx = toIdx >= 0 ? toIdx : totalWe;
      }
      const presetCtx = { totalWs, totalWe, todayIdx, plan2FromIdx, plan2ToIdx, minW: MIN_W };
      presetsWrap.__pmcApi = { presetCtx, draw };
      presetsWrap.querySelectorAll("[data-preset]").forEach((btn) => {
        if (btn.dataset.preset === "plan2") btn.hidden = plan2FromIdx == null;
        const win = presetWindow(btn.dataset.preset, presetCtx);
        btn.classList.toggle("active", !!win && win.ws === ws && win.we === we);
      });
    }

    // Szenario-Bedienelemente (Phase 5, Schritt 3, Teil D) — hält `draw`
    // aktuell (Muster wie presetsWrap.__pmcApi) UND spiegelt den geladenen
    // `scenario`-Zustand in die Regler (Toggle-Zustand + Werte), damit ein
    // Athletenwechsel/Reload die persistierten Parameter sichtbar zeigt statt
    // stumm nur intern zu halten.
    if (scenarioWrap) {
      scenarioWrap.__pmcApi = { draw };
      const toggle = scenarioWrap.querySelector("#pmc-scenario-toggle");
      const tssInput = scenarioWrap.querySelector("#pmc-scenario-tss");
      const tssVal = scenarioWrap.querySelector("#pmc-scenario-tss-val");
      const restInput = scenarioWrap.querySelector("#pmc-scenario-rest");
      const restVal = scenarioWrap.querySelector("#pmc-scenario-rest-val");
      const rampInput = scenarioWrap.querySelector("#pmc-scenario-ramp");
      const rampVal = scenarioWrap.querySelector("#pmc-scenario-ramp-val");
      if (toggle) toggle.checked = scenario.enabled;
      if (tssInput) tssInput.value = String(scenario.weekTssPct);
      if (tssVal) tssVal.textContent = `${scenario.weekTssPct > 0 ? "+" : ""}${scenario.weekTssPct}%`;
      if (restInput) restInput.value = String(scenario.restDays);
      if (restVal) restVal.textContent = String(scenario.restDays);
      if (rampInput) rampInput.value = String(scenario.rampRatePct);
      if (rampVal) rampVal.textContent = `${scenario.rampRatePct > 0 ? "+" : ""}${scenario.rampRatePct}%`;
    }

    // Vergleichsmodus-Bedienelemente (Phase 5, Schritt 4, Teil E) — hält
    // `draw`/`skeleton` aktuell (Muster wie presetsWrap.__pmcApi, für die
    // "Als A/B merken"-Buttons, die ws/we über das aktuelle Skelett in
    // {from, to} umrechnen müssen) UND spiegelt Toggle + Kennzahlen.
    if (compareWrap) {
      compareWrap.__pmcApi = { draw, skeleton, ws, we };
      const toggle = compareWrap.querySelector("#pmc-compare-toggle");
      if (toggle) toggle.checked = compareSlots.enabled;

      const renderMetrics = (id, label, slot, metrics) => {
        const dl = compareWrap.querySelector(`#${id}`);
        if (!dl) return;
        if (!slot) {
          dl.innerHTML = `<dt>${label}</dt><dd>noch nicht gemerkt</dd>`;
        } else if (!compareActive) {
          dl.innerHTML = `<dt>${label}</dt><dd>gemerkt — Vergleichsmodus einschalten für Kennzahlen</dd>`;
        } else {
          dl.innerHTML = `<dt>${label}</dt>
            <dd>Σ TSS ${fmt(metrics.sumTss)}</dd>
            <dd>⌀ CTL ${metrics.avgCtl != null ? fmt(metrics.avgCtl) : "–"}</dd>
            <dd>Rampe ${metrics.ramp != null ? (metrics.ramp > 0 ? "+" : "") + fmt(metrics.ramp) : "–"}</dd>
            <dd>Harte Tage ${metrics.hardDays}</dd>`;
        }
      };
      renderMetrics("pmc-compare-metrics-a", "Zeitraum A", compareSlots.a, compareResult?.a?.metrics);
      renderMetrics("pmc-compare-metrics-b", "Zeitraum B", compareSlots.b, compareResult?.b?.metrics);
    }
  };

  draw();

  // Presets — EINMAL gebunden (Guard wie ui/chart-visibility.js), sonst
  // stapeln sich Klick-Handler bei jedem renderPMC()-Aufruf (Athletenwechsel/
  // renderAll). Liest bei Klickzeit `presetsWrap.__pmcApi`, den draw() bei
  // JEDEM Aufruf aktuell hält — so bekommt der Handler nie eine veraltete
  // Closure aus dem allerersten renderPMC()-Aufruf zu fassen.
  if (presetsWrap && !presetsWrap._bound) {
    presetsWrap._bound = true;
    presetsWrap.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const api = presetsWrap.__pmcApi;
        if (!api) return;
        const win = presetWindow(btn.dataset.preset, api.presetCtx);
        if (!win) return;
        setWindow(win.ws, win.we);
        api.draw();
      });
    });
  }

  // Szenario-Bedienelemente — EINMAL gebunden (Guard wie bei den Preset-
  // Buttons), liest `scenarioWrap.__pmcApi.draw` erst beim jeweiligen Event,
  // nie eine veraltete Closure. Das Toggle ist die einzige Stelle, die
  // Szenario-Ein/Aus setzt (X8/§6: "Regler auf 0" bedeutet weiterhin AN,
  // nur wirkungslos) — die drei Regler ändern nur die Parameter, nie
  // `enabled`.
  if (scenarioWrap && !scenarioWrap._bound) {
    scenarioWrap._bound = true;
    const redraw = () => scenarioWrap.__pmcApi?.draw();

    const toggle = scenarioWrap.querySelector("#pmc-scenario-toggle");
    toggle?.addEventListener("change", () => {
      setScenarioEnabled(toggle.checked);
      redraw();
    });

    const tssInput = scenarioWrap.querySelector("#pmc-scenario-tss");
    const tssVal = scenarioWrap.querySelector("#pmc-scenario-tss-val");
    tssInput?.addEventListener("input", () => {
      const v = Number(tssInput.value);
      if (tssVal) tssVal.textContent = `${v > 0 ? "+" : ""}${v}%`;
      setScenarioParams({ weekTssPct: v });
      redraw();
    });

    const restInput = scenarioWrap.querySelector("#pmc-scenario-rest");
    const restVal = scenarioWrap.querySelector("#pmc-scenario-rest-val");
    restInput?.addEventListener("input", () => {
      const v = Number(restInput.value);
      if (restVal) restVal.textContent = String(v);
      setScenarioParams({ restDays: v });
      redraw();
    });

    const rampInput = scenarioWrap.querySelector("#pmc-scenario-ramp");
    const rampVal = scenarioWrap.querySelector("#pmc-scenario-ramp-val");
    rampInput?.addEventListener("input", () => {
      const v = Number(rampInput.value);
      if (rampVal) rampVal.textContent = `${v > 0 ? "+" : ""}${v}%`;
      setScenarioParams({ rampRatePct: v });
      redraw();
    });
  }

  // Vergleichsmodus-Bedienelemente (Schritt 4, Teil E) — EINMAL gebunden
  // (Guard wie bei Presets/Szenario), liest `compareWrap.__pmcApi` erst beim
  // jeweiligen Event. "Als A/B merken" rechnet das aktuelle Brush-Fenster
  // (ws/we, Tagesindex) über das zuletzt gezeichnete Skelett in {from, to}
  // (ISO) um — der Vergleich ist damit die natürliche Fortsetzung des
  // Brush-Fensters aus Schritt 1, kein eigenes Bedienkonzept.
  if (compareWrap && !compareWrap._bound) {
    compareWrap._bound = true;
    const redraw = () => compareWrap.__pmcApi?.draw();

    const toggle = compareWrap.querySelector("#pmc-compare-toggle");
    toggle?.addEventListener("change", () => {
      setCompareEnabled(toggle.checked);
      redraw();
    });

    compareWrap.querySelectorAll("[data-compare-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const api = compareWrap.__pmcApi;
        if (!api) return;
        const { skeleton, ws: curWs, we: curWe } = api;
        if (!skeleton?.length) return;
        const from = skeleton[curWs]?.dateISO;
        const to = skeleton[curWe]?.dateISO;
        if (!from || !to) return;
        setCompareSlot(btn.dataset.compareSlot, { from, to });
        redraw();
      });
    });
  }

  // Cursor-Sync (Schritt 2, Teil B) — EINMAL abonniert (Guard wie bei den
  // Preset-Buttons), sonst stapeln sich Listener bei jedem renderPMC()-
  // Aufruf. paintHover() liest `svg.__pmcGeometry` erst beim jeweiligen
  // Change-Event, nie eine veraltete Closure.
  if (!svg.__pmcHoverBound) {
    svg.__pmcHoverBound = true;
    onChartViewChange(() => paintHover(svg));
  }

  // Gemessene Breite + ResizeObserver statt skaliertem viewBox (G7) — draw()
  // ist idempotent (svg.innerHTML wird am Anfang geleert). Alten Observer
  // trennen, bevor ein neuer registriert wird (renderPMC wird pro Athleten-
  // wechsel/renderAll erneut aufgerufen, sonst stapeln sich Observer auf
  // demselben Knoten). Zweiter Observer auf der Übersichtsleiste (G7 gilt
  // für jedes Chart-Element) — beide rufen dieselbe draw(), mehrfaches
  // Feuern ist harmlos (idempotent).
  if (svg.__pmcResizeObserver) svg.__pmcResizeObserver.disconnect();
  const observer = new ResizeObserver(() => draw());
  observer.observe(svg);
  svg.__pmcResizeObserver = observer;

  if (overviewSvg) {
    if (overviewSvg.__pmcResizeObserver) overviewSvg.__pmcResizeObserver.disconnect();
    const overviewObserver = new ResizeObserver(() => draw());
    overviewObserver.observe(overviewSvg);
    overviewSvg.__pmcResizeObserver = overviewObserver;
  }
}

/* ── Aerobe Entkopplung (Decoupling) ─────────────────────────── */
export function renderDecoupling(svgId, rides) {
  const data = rides
    .filter((r) => r.decoupling != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const svg = el(svgId);
  if (!svg || !data.length) return;
  svg.innerHTML = "";

  const W = 780,
    H = 200,
    pad = { l: 50, r: 16, t: 16, b: 36 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const maxV = Math.max(Math.max(...data.map((d) => Math.abs(d.decoupling))), 10) + 3;
  const minV = 0;

  gridLines(svg, W, H, pad, maxV, minV);
  axisTitles(svg, W, H, pad, { x: "Datum", yLeft: "Aerobe Entkopplung (%)" });

  // Target line at 5%
  const targetY = pad.t + ch - ((5 - minV) / (maxV - minV)) * ch;
  svg.appendChild(
    svgEl("line", {
      x1: pad.l,
      y1: targetY,
      x2: W - pad.r,
      y2: targetY,
      stroke: "#4a9a6e",
      "stroke-width": "1",
      "stroke-dasharray": "4,3",
      opacity: "0.6",
    })
  );
  const tgt = svgEl("text", {
    x: W - pad.r + 4,
    y: targetY + 4,
    fill: "#4a9a6e",
    "font-size": "9",
  });
  tgt.textContent = "5%";
  svg.appendChild(tgt);

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * cw,
    y: pad.t + ch - ((Math.abs(d.decoupling) - minV) / (maxV - minV)) * ch,
    d,
  }));

  svg.appendChild(
    svgEl("polyline", {
      fill: "none",
      stroke: "#e08a3c",
      "stroke-width": "1.8",
      points: pts.map((p) => `${p.x},${p.y}`).join(" "),
    })
  );

  pts.forEach((p) => {
    const color =
      Math.abs(p.d.decoupling) <= 5
        ? "#4a9a6e"
        : Math.abs(p.d.decoupling) <= 10
          ? "#c9a84c"
          : "#d94f4f";
    const c = svgEl("circle", {
      cx: p.x,
      cy: p.y,
      r: "4",
      fill: color,
      stroke: "#0b0e13",
      "stroke-width": "1.5",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `
      <div class="tt">${p.d.dateShort}${p.d.week ? " · " + p.d.week : ""}</div>
      <div class="tv">${fmt(Math.abs(p.d.decoupling))}%</div>
      <div class="td">${p.d.name}</div>
    `
      )
    );
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1) xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
  });
}

/* ── FTP-Projektion: eFTP-Verlauf + Prognose auf ein Zieldatum ──
   Athlet 1: fester Retest-Termin. Athlet 2 (kein Plan/Retest): invertierte
   Ziel-Horizont-Prognose (core/ftp-forecast.js::dateForTarget) — retestISO
   ist dann das errechnete Datum, an dem der Trend das Ziel erreicht, oder
   null, wenn sich kein belastbarer Horizont ableiten lässt (dann nur
   Verlauf ohne Prognosefächer). */
export function renderFtpForecast(svgId, history, fc, goal, retestISO, targetLabel = "Retest") {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";
  if (!history || history.length < 3) {
    const t = svgEl("text", {
      x: 390,
      y: 95,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "12",
    });
    t.textContent = "eFTP-Historie wird ab dem nächsten Daten-Sync aufgebaut";
    svg.appendChild(t);
    return;
  }

  const W = 780,
    H = 200,
    pad = { l: 46, r: 60, t: 18, b: 36 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;

  // Ohne Zieldatum (Athlet 2 ohne belastbaren Horizont) endet die X-Achse
  // am letzten Historienpunkt — reine Verlaufsdarstellung ohne Fächer.
  const t0 = new Date(history[0].date).getTime();
  const lastISO = history[history.length - 1].date;
  const tEnd = Math.max(new Date(retestISO || lastISO).getTime(), t0 + 86400000);
  const xOf = (iso) => pad.l + ((new Date(iso).getTime() - t0) / (tEnd - t0)) * cw;

  const vals = history.map((h) => h.eftp);
  const lowCandidates = [...vals];
  const highCandidates = [...vals];
  if (fc) {
    lowCandidates.push(fc.low);
    highCandidates.push(fc.high);
  }
  if (goal != null) {
    lowCandidates.push(goal);
    highCandidates.push(goal);
  }
  const minV = Math.min(...lowCandidates) - 4;
  const maxV = Math.max(...highCandidates) + 4;
  const yOf = (v) => pad.t + ch - ((v - minV) / (maxV - minV)) * ch;

  gridLines(svg, W, H, pad, maxV, minV);
  axisTitles(svg, W, H, pad, { x: "Datum", yLeft: "eFTP (W)" });

  // Ziel-Linie (nur wenn ein Ziel konfiguriert ist)
  if (goal != null) {
    const gy = yOf(goal);
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: gy,
        x2: W - pad.r,
        y2: gy,
        stroke: "#c9a84c",
        "stroke-width": "1.2",
        "stroke-dasharray": "6,3",
        opacity: "0.8",
      })
    );
    const gl = svgEl("text", { x: W - pad.r + 4, y: gy + 3, fill: "#c9a84c", "font-size": "9" });
    gl.textContent = `Ziel ${goal}`;
    svg.appendChild(gl);
  }

  // Historie
  const histPts = history.map((h) => ({ x: xOf(h.date), y: yOf(h.eftp), h }));
  svg.appendChild(
    svgEl("polyline", {
      fill: "none",
      stroke: "#e08a3c",
      "stroke-width": "2",
      "stroke-linejoin": "round",
      points: histPts.map((p) => `${p.x},${p.y}`).join(" "),
    })
  );
  const step = Math.max(1, Math.floor(histPts.length / 14));
  histPts.forEach((p, i) => {
    if (i % step !== 0 && i !== histPts.length - 1) return;
    const c = svgEl("circle", {
      cx: p.x,
      cy: p.y,
      r: "3",
      fill: "#e08a3c",
      stroke: "#0b0e13",
      "stroke-width": "1.5",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `<div class="tt">${fmtDateFull(p.h.date)}</div><div class="tv">eFTP ${p.h.eftp} W</div>`
      )
    );
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  // Projektion mit Unsicherheitsband bis zum Zieldatum (nur wenn bekannt)
  if (fc && retestISO) {
    const last = histPts[histPts.length - 1];
    const xT = xOf(retestISO);
    svg.appendChild(
      svgEl("path", {
        d: `M${last.x},${last.y} L${xT},${yOf(fc.high)} L${xT},${yOf(fc.low)} Z`,
        fill: "#e08a3c",
        opacity: "0.12",
      })
    );
    svg.appendChild(
      svgEl("line", {
        x1: last.x,
        y1: last.y,
        x2: xT,
        y2: yOf(fc.projected),
        stroke: "#e08a3c",
        "stroke-width": "1.6",
        "stroke-dasharray": "5,4",
      })
    );
    const proj = svgEl("text", {
      x: xT + 4,
      y: yOf(fc.projected) + 3,
      fill: "#e2e7ef",
      "font-size": "10",
      "font-weight": "600",
    });
    proj.textContent = `~${fc.projected} W`;
    svg.appendChild(proj);
    const band = svgEl("text", {
      x: xT + 4,
      y: yOf(fc.projected) + 15,
      fill: "#97a1b3",
      "font-size": "8.5",
    });
    band.textContent = `${fc.low}–${fc.high}`;
    svg.appendChild(band);
  }

  // Ziel-/Retest-Markierung (nur wenn ein Zieldatum bekannt ist)
  if (retestISO) {
    const xr = xOf(retestISO);
    svg.appendChild(
      svgEl("line", {
        x1: xr,
        y1: pad.t,
        x2: xr,
        y2: pad.t + ch,
        stroke: "#5f6878",
        "stroke-width": "1",
        "stroke-dasharray": "2,3",
      })
    );
    xLabel(svg, xr, H - pad.b + 14, `${targetLabel} ${fmtDate(retestISO)}`);
  }
  xLabel(svg, histPts[0].x, H - pad.b + 14, fmtDate(history[0].date));
}
