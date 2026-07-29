/* ============================================================
   UI/CHARTS/WELLNESS.JS — Schlaf, HRV & Ruhepuls
   Rendering only — Trend-Berechnung in core/stats.js.

   Familie 2 (docs/chart-grundlagen.md §7.2, lückige Zeitreihe) — Umbau
   Phase 5, Schritt 7. Teil C: Fadenkreuz-Kopplung an state/chart-view.js
   (tagesgenau, wie ui/charts/pmc.js) — KEIN Übernehmen des PMC-Brush-
   Fensters (ws/we): die Charts zeigen weiter ihre volle Historie, analog
   zu ui/charts/training.js (Familie 3 nimmt am Fenster ebenfalls nicht
   teil). Grund: renderHrvTrend/RhfTrend zeigen bewusst die GANZE Historie
   inkl. HRV-Methodenwechsel-Marker (RMSSD → SDNN) — ein 90-Tage-Default-
   Fenster würde den Wechsel oft aus dem Blick verdrängen (s.
   docs/phase-5-konzept-explorer.md, Schritt-7-Auftrag).

   Umbau "Plan 1/2 → Kalenderwoche" (dashboard-2.0): die frühere Plan-1/
   Plan-2-Segmentierung des HRV/RHF-Charts (Farbsegmente, "Plan 1"/
   "Übergang"/"Plan 2"-Labels) ist entfallen — die Kalenderwochenachse
   läuft jetzt durchgehend. Der HRV-Methodenwechsel selbst ist real und
   bleibt als schlankes `hrvMethod`-Flag ("rmssd"|"sdnn") pro Datenpunkt
   erhalten (s. _mergedOwnPlanSeries), mit dezentem Marker + getrennten
   Mittelwerten/Trendlinien vor/nach dem Wechsel (weiterhin RMSSD/SDNN
   nicht direkt vergleichbare Wertebereiche).
   ============================================================ */

import { fmt, fmtDate, fmtDateFull, wrapText } from "../../core/format.js";
import { linearTrend } from "../../core/stats.js";
import { densifyDays, joinSeries } from "../../core/days.js";
import { getPlan2WeekPhase } from "../../core/plan2-schedule.js";
import { Data } from "../../state/data.js";
import { el, svgEl, Tooltip } from "../dom.js";
import {
  getState as getChartViewState,
  onChartViewChange,
  setHovered,
  clearHovered,
} from "../../state/chart-view.js";
import {
  xLabel,
  autoScrollRight,
  pickLabelIndices,
  axisTitles,
  gradedGrid,
  axisUnit,
  measuredWidth,
  makeIndexScale,
  haloLabel,
  flattestIndex,
  crosshair,
  hoverDot,
} from "./base.js";

/* ── Fadenkreuz-Hover (Phase 5, Schritt 7, Teil C — docs/chart-
   grundlagen.md §7.3, §4.1) ──────────────────────────────────────
   Eine einzige, lokal geteilte Funktion für alle 5 Familie-2-Charts dieser
   Datei — analog zu ui/charts/training.js::paintBucketHover(svg, geoKey),
   das denselben über geoKey parametrisierten Ansatz für seine zwei
   Familie-3-Charts nutzt. Sucht das gehoverte Datum im EIGENEN Skelett des
   jeweiligen Charts (jedes hat seinen eigenen Datumsbereich, s. Kopf-
   kommentar) und bricht sauber ab, wenn das Datum außerhalb liegt — kein
   Fehler, einfach kein Fadenkreuz. */
function paintDayHover(svg, geoKey) {
  const geo = svg[geoKey];
  if (!geo) return;
  geo.hoverLayer.textContent = "";
  const { hoveredDate } = getChartViewState();
  if (!hoveredDate) return;
  const i = geo.skeleton.findIndex((s) => s.dateISO === hoveredDate);
  if (i < 0) return;
  const x = geo.x(i);
  crosshair(geo.hoverLayer, { x, top: geo.top, bottom: geo.bottom });
  for (const s of geo.series) {
    const v = s.vals[i];
    if (v == null) continue;
    const color = typeof s.color === "function" ? s.color(i) : s.color;
    hoverDot(geo.hoverLayer, x, s.yOf(v), color);
  }
}

/* ── Schlaf — Dauer & Schlaf-HF ──────────────────────────────── */
export function renderSleep(svgId, wellness, ownPlan = true) {
  const rows = wellness
    .filter((w) => w.sleepHours != null || w.avgSleepingHR != null)
    .map((w) => ({
      dateISO: w.dateISO || w.date,
      sleepHours: w.sleepHours,
      avgSleepingHR: w.avgSleepingHR,
    }));
  const svg = el(svgId);
  if (!svg) return;
  if (!rows.length) {
    svg.innerHTML = "";
    const t = svgEl("text", {
      x: 390,
      y: 100,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "12",
    });
    t.textContent = ownPlan
      ? "Schlafdaten ab intervals.icu-Ära verfügbar"
      : "Keine Schlafdaten verfügbar";
    svg.appendChild(t);
    if (svg.__sleepResizeObserver) svg.__sleepResizeObserver.disconnect();
    return;
  }

  // Dichtes Tagesgerüst über den eigenen Datumsbereich dieser Serie (kein
  // gemeinsamer Anker mit PMC — wellness.js übernimmt das PMC-Brush-Fenster
  // bewusst nicht, s. docs/phase-5-konzept-explorer.md-Aufgabe Schritt 7).
  const fromISO = rows.reduce((m, r) => (r.dateISO < m ? r.dateISO : m), rows[0].dateISO);
  const toISO = rows.reduce((m, r) => (r.dateISO > m ? r.dateISO : m), rows[0].dateISO);
  const skeleton = densifyDays(fromISO, toISO);
  const sleepVals = joinSeries(skeleton, rows, { key: "sleepHours", absence: "gap" });
  const hrVals = joinSeries(skeleton, rows, { key: "avgSleepingHR", absence: "gap" });

  const PPT = 18;
  const H = 200,
    pad = { l: 52, r: 52, t: 16, b: 36 };

  const draw = () => {
    svg.innerHTML = "";
    const W = Math.max(measuredWidth(svg, 780), skeleton.length * PPT + 100);
    const cw = W - pad.l - pad.r,
      ch = H - pad.t - pad.b;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);

    const definedSleep = sleepVals.filter((v) => v != null);
    const definedHR = hrVals.filter((v) => v != null);
    const maxSleep = definedSleep.length ? Math.ceil(Math.max(...definedSleep) * 1.15) : 10;
    const minHR = definedHR.length ? Math.floor(Math.min(...definedHR) - 3) : 40;
    const maxHR = definedHR.length ? Math.ceil(Math.max(...definedHR) + 3) : 80;
    const yOf = (v) => pad.t + ch - (v / maxSleep) * ch;

    gradedGrid(svg, { x0: pad.l, x1: W - pad.r, yOf, lo: 0, hi: maxSleep });
    axisUnit(svg, { x: pad.l - 6, y: pad.t - 6, text: "h" });
    axisTitles(svg, W, H, pad, {
      x: "Datum",
      yRight: definedHR.length ? "Schlaf-HF (bpm)" : undefined,
    });

    const gap = cw / skeleton.length;
    const bw = Math.min(gap * 0.6, 20);
    const xOf = (i) => pad.l + i * gap + gap / 2;
    const hrY = (v) => pad.t + ch - ((v - minHR) / (maxHR - minHR)) * ch;

    // Balken: Schlafdauer — Tage ohne Messung (null) werden einzeln übersprungen
    skeleton.forEach((day, i) => {
      const v = sleepVals[i];
      if (v == null) return;
      const x = xOf(i) - bw / 2;
      const bh = Math.max((v / maxSleep) * ch, 1);
      const y = pad.t + ch - bh;
      const color = v >= 7 ? "#4a7fa8" : v >= 6 ? "#c9a84c" : "#d94f4f";
      const rect = svgEl("rect", {
        x,
        y,
        width: bw,
        height: bh,
        rx: "2",
        fill: color,
        opacity: "0.75",
      });
      rect.style.cursor = "pointer";
      rect.addEventListener("mouseenter", (e) => {
        rect.setAttribute("opacity", "1");
        Tooltip.show(
          e,
          `
        <div class="tt">${fmtDate(day.dateISO)}</div>
        <div class="tv">${v}h Schlaf${hrVals[i] != null ? ` · ${hrVals[i]} bpm` : ""}</div>
      `
        );
        setHovered(day.dateISO);
      });
      rect.addEventListener("mouseleave", () => {
        rect.setAttribute("opacity", "0.75");
        Tooltip.hide();
        clearHovered();
      });
      svg.appendChild(rect);
    });

    // 7h Ziel-Linie — Gold statt Blau (kein Overlap mit Balkenfarbe) — nur eigener Plan
    if (ownPlan) {
      const targetY = yOf(7);
      svg.appendChild(
        svgEl("line", {
          x1: pad.l,
          y1: targetY,
          x2: W - pad.r,
          y2: targetY,
          stroke: "#c9a84c",
          "stroke-width": "1",
          "stroke-dasharray": "5,3",
          opacity: "0.6",
        })
      );
      const tl = svgEl("text", {
        x: pad.l + 4,
        y: targetY - 4,
        fill: "#c9a84c",
        "font-size": "9",
        opacity: "0.9",
      });
      tl.textContent = "7h Ziel";
      svg.appendChild(tl);
    }

    // Linie: Schlaf-HF (rechte Achse) — verbindet über Messlücken hinweg
    // (Alex' Design-Entscheidung, wie HRV/Ruhepuls/Gewicht): alle Tage mit
    // echtem Wert werden direkt verbunden statt an jeder Lücke abzureißen.
    // Marker bleiben ausschließlich an echten Messtagen (s. Dot-Schleife).
    if (definedHR.length) {
      const hrPts = [];
      for (let i = 0; i < hrVals.length; i++) {
        if (hrVals[i] != null) hrPts.push({ x: xOf(i), y: hrY(hrVals[i]) });
      }
      if (hrPts.length > 1) {
        svg.appendChild(
          svgEl("polyline", {
            fill: "none",
            stroke: "#d94f4f",
            "stroke-width": "1.8",
            points: hrPts.map((p) => `${p.x},${p.y}`).join(" "),
          })
        );
      }
      skeleton.forEach((day, i) => {
        if (hrVals[i] == null) return;
        const c = svgEl("circle", {
          cx: xOf(i),
          cy: hrY(hrVals[i]),
          r: "3",
          fill: "#d94f4f",
          stroke: "#0b0e13",
          "stroke-width": "1.5",
        });
        c.style.cursor = "pointer";
        c.addEventListener("mouseenter", (e) => {
          Tooltip.show(
            e,
            `
        <div class="tt">${fmtDate(day.dateISO)}</div>
        <div class="tv">${hrVals[i]} bpm Schlaf-HF</div>
      `
          );
          setHovered(day.dateISO);
        });
        c.addEventListener("mouseleave", () => {
          Tooltip.hide();
          clearHovered();
        });
        svg.appendChild(c);
      });

      // Rechte Y-Achse: nur 4 Labels
      const hrStep = Math.ceil((maxHR - minHR) / 4);
      for (let v = minHR; v <= maxHR; v += hrStep) {
        const y = pad.t + ch - ((v - minHR) / (maxHR - minHR)) * ch;
        const t = svgEl("text", { x: W - pad.r + 6, y: y + 4, fill: "#d94f4f", "font-size": "9" });
        t.textContent = v;
        svg.appendChild(t);
      }
    }

    // X Labels mit Mindestabstand (letztes Label garantiert kollisionsfrei)
    const sleepLblIdx = pickLabelIndices(
      skeleton.map((_, i) => xOf(i)),
      55
    );
    skeleton.forEach((day, i) => {
      if (sleepLblIdx.has(i)) xLabel(svg, xOf(i), H - pad.b + 14, fmtDate(day.dateISO));
    });

    // Auto-scroll
    const scrollContainer = svg.parentElement;
    if (scrollContainer && scrollContainer.classList.contains("chart-scroll")) {
      autoScrollRight(svg, W, scrollContainer);
    }

    // Hover-Ebene (§4.1) — separate <g>, nie neu gezeichnet außerhalb von
    // draw(). Geometrie am SVG-Knoten hinterlegt, damit paintDayHover() sie
    // ohne erneutes Zeichnen findet (Muster wie ui/charts/pmc.js).
    const hoverLayer = svgEl("g", {});
    svg.appendChild(hoverLayer);
    svg.__sleepGeometry = {
      x: xOf,
      skeleton,
      hoverLayer,
      top: pad.t,
      bottom: pad.t + ch,
      series: [
        { vals: sleepVals, yOf, color: "#4a7fa8" },
        { vals: hrVals, yOf: hrY, color: "#d94f4f" },
      ],
    };
    paintDayHover(svg, "__sleepGeometry");
  };

  draw();

  // Gemessene Breite + ResizeObserver (G7) statt einmaligem Zeichnen —
  // Muster wie ui/charts/pmc.js/training.js. Alten Observer trennen, bevor
  // ein neuer registriert wird (renderSleep wird pro Athletenwechsel erneut
  // aufgerufen, sonst stapeln sich Observer auf demselben Knoten).
  if (svg.__sleepResizeObserver) svg.__sleepResizeObserver.disconnect();
  const observer = new ResizeObserver(() => draw());
  observer.observe(svg);
  svg.__sleepResizeObserver = observer;

  // Fadenkreuz-Kopplung — einmalig abonniert (Guard wie svg.__pmcHoverBound
  // in ui/charts/pmc.js), sonst stapeln sich Listener bei jedem
  // renderSleep()-Aufruf (Athletenwechsel).
  if (!svg.__sleepHoverBound) {
    svg.__sleepHoverBound = true;
    onChartViewChange(() => paintDayHover(svg, "__sleepGeometry"));
  }
}

/* ── HRV / Ruhepuls — durchgehende Kalenderwochen-Linie mit
   Methodenwechsel-Marker (RMSSD → SDNN) ──────────────────────── */
function renderHrvRhfChart(svgId, data, color1, color2, unit, field, methodNote) {
  const svg = el(svgId);
  if (!svg) return;
  if (!data.length) {
    svg.innerHTML = "";
    if (svg.__hrvRhfResizeObserver) svg.__hrvRhfResizeObserver.disconnect();
    return;
  }

  // HRV-Methodenwechsel-Breakpoint auf der KOMPAKTEN Liste ermitteln
  // (chronologisch sortiert, der Wechsel RMSSD→SDNN passiert genau einmal),
  // danach auf Skelett-Index des dichten Tagesgerüsts übersetzen — die
  // Zugehörigkeit ist eine Eigenschaft des DATUMS, nicht der (jetzt
  // lückigen) Werteserie. KEINE Segmentierung der Kalenderwochenachse mehr
  // (Umbau "Plan 1/2 → Kalenderwoche") — der Marker ist nur noch eine
  // dezente Trennlinie + Fußnote, keine Farb-/Flächen-Aufteilung.
  const splitCompact = data.findIndex((d) => d.hrvMethod === "sdnn");
  const hasSplit = splitCompact > 0;

  const fromISO = data[0].dateISO;
  const toISO = data[data.length - 1].dateISO;
  const skeleton = densifyDays(fromISO, toISO);
  const vals = joinSeries(skeleton, data, { key: field, absence: "gap" });
  const byDate = new Map(data.map((d) => [d.dateISO, d]));
  const idxOfDate = (iso) => skeleton.findIndex((s) => s.dateISO === iso);
  const splitIdx = hasSplit ? idxOfDate(data[splitCompact].dateISO) : -1;
  const lastIdx = skeleton.length - 1;
  const showsMethodNote = !!(methodNote && hasSplit);

  const H = 250,
    pad = { l: 50, r: 16, t: 28, b: 36 };

  const draw = () => {
    svg.innerHTML = "";
    const W = measuredWidth(svg, 780);
    const cw = W - pad.l - pad.r,
      ch = H - pad.t - pad.b;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const defined = vals.filter((v) => v != null);
    const minV = Math.max(0, Math.min(...defined) - 5);
    const maxV = Math.max(...defined) + 5;
    const yOf = (v) => pad.t + ch - ((v - minV) / (maxV - minV)) * ch;
    const scale = makeIndexScale({ ws: 0, we: lastIdx, padLeft: pad.l, width: cw });

    gradedGrid(svg, { x0: pad.l, x1: W - pad.r, yOf, lo: minV, hi: maxV });
    axisUnit(svg, { x: pad.l - 6, y: pad.t - 6, text: unit });
    axisTitles(svg, W, H, pad, {
      x: showsMethodNote ? undefined : "Datum",
    });

    // EIN durchgehendes Segment über die volle Kalenderwochenachse (Umbau
    // "Plan 1/2 → Kalenderwoche") — keine Farb-/Flächen-Aufteilung mehr,
    // der Methodenwechsel wird unten nur noch als dezente Marker-Linie +
    // Fußnote markiert, ohne die Linie selbst zu unterbrechen.
    const segBounds = [[0, lastIdx, color1, false]];

    // Linie verbindet bewusst über Messlücken hinweg (Alex' Design-Entscheidung,
    // Phase 5 Bugfix-Nachtrag, gilt für alle vier absence:"gap"-Serien in
    // dieser Datei) — nur die tatsächlich gemessenen Punkte werden gesammelt
    // und DIREKT verbunden, Lücken-Tage werden einfach übersprungen statt das
    // Liniensegment zu unterbrechen. Punkte/Marker (s. "Dots" unten) bleiben
    // ausschließlich an echten Messtagen.
    const drawSegmentLine = (fromIdx, toIdx, color, dashed) => {
      const segment = [];
      for (let i = fromIdx; i <= toIdx; i++) {
        if (vals[i] != null) segment.push({ x: scale.x(i), y: yOf(vals[i]) });
      }
      if (!segment.length) return;
      if (segment.length === 1) {
        svg.appendChild(
          svgEl("circle", { cx: segment[0].x, cy: segment[0].y, r: "3.5", fill: color })
        );
        return;
      }
      const areaPath =
        `M${segment[0].x},${H - pad.b} ` +
        segment.map((p) => `L${p.x},${p.y}`).join(" ") +
        ` L${segment[segment.length - 1].x},${H - pad.b} Z`;
      svg.appendChild(
        svgEl("path", { d: areaPath, fill: color, opacity: dashed ? "0.05" : "0.08" })
      );
      svg.appendChild(
        svgEl("polyline", {
          fill: "none",
          stroke: color,
          "stroke-width": "1.8",
          "stroke-dasharray": dashed ? "5,4" : "none",
          points: segment.map((p) => `${p.x},${p.y}`).join(" "),
        })
      );
    };

    for (const [segFrom, segTo, color, dashed] of segBounds) {
      drawSegmentLine(segFrom, segTo, color, dashed);
    }

    // trendPts() liefert die Punkte für drawTrend() (vor/nach dem HRV-
    // Methodenwechsel getrennt, s. u.) — linearTrend() bekommt nur die
    // tatsächlich gemessenen Punkte (kein null)
    const trendPts = (fromIdx, toIdx) => {
      const pts = [];
      for (let i = fromIdx; i <= toIdx; i++) {
        if (vals[i] != null) pts.push({ x: scale.x(i), y: yOf(vals[i]) });
      }
      return pts;
    };
    const drawTrend = (pts) => {
      const trend = linearTrend(pts);
      if (!trend) return;
      const { slope, intercept } = trend;
      const n = pts.length;
      svg.appendChild(
        svgEl("line", {
          x1: pts[0].x,
          y1: slope * pts[0].x + intercept,
          x2: pts[n - 1].x,
          y2: slope * pts[n - 1].x + intercept,
          stroke: "#4a9a6e",
          "stroke-width": "1.5",
          "stroke-dasharray": "6,3",
          opacity: "0.7",
        })
      );
    };
    // Getrennte Trendlinien vor/nach dem HRV-Methodenwechsel (unterschiedliche
    // absolute Wertebereiche RMSSD/SDNN, eine gemeinsame Regressionsgerade
    // wäre irreführend — Alex' Entscheidung).
    const rmssdEndIdx = hasSplit ? splitIdx : lastIdx;
    const sdnnStartIdx = hasSplit ? splitIdx : -1;
    drawTrend(trendPts(0, rmssdEndIdx));
    if (hasSplit) {
      const sdnnPts = trendPts(sdnnStartIdx, lastIdx);
      if (sdnnPts.length >= 3) drawTrend(sdnnPts);
    }

    // Dots — einheitliche Farbe (kein Plan-Segment mehr), ausgedünnt (nur an
    // tatsächlich gemessenen Tagen).
    const presentIdx = [];
    for (let i = 0; i <= lastIdx; i++) if (vals[i] != null) presentIdx.push(i);
    const step = Math.max(1, Math.floor(presentIdx.length / 24));
    presentIdx.forEach((i, k) => {
      if (k % step !== 0 && k !== presentIdx.length - 1) return;
      const day = skeleton[i];
      const row = byDate.get(day.dateISO);
      const c = svgEl("circle", {
        cx: scale.x(i),
        cy: yOf(vals[i]),
        r: "3.5",
        fill: color1,
        stroke: "#0b0e13",
        "stroke-width": "1.5",
      });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", (e) => {
        Tooltip.show(
          e,
          `
      <div class="tt">${fmtDate(day.dateISO)} · ${row?.week ? row.week + " · " : ""}${row?.hrvMethod ? row.hrvMethod.toUpperCase() : ""}</div>
      <div class="tv">${vals[i]} ${unit}</div>
      <div class="td">${row?.name || ""}</div>
    `
        );
        setHovered(day.dateISO);
      });
      c.addEventListener("mouseleave", () => {
        Tooltip.hide();
        clearHovered();
      });
      svg.appendChild(c);
    });

    // X labels — Mindestabstand über das ganze Skelett; der Methodenwechsel
    // bekommt immer ein Label
    const lblIdx = pickLabelIndices(
      skeleton.map((_, i) => scale.x(i)),
      60
    );
    if (splitIdx > 0) lblIdx.add(splitIdx);
    skeleton.forEach((day, i) => {
      if (lblIdx.has(i)) xLabel(svg, scale.x(i), H - pad.b + 14, fmtDate(day.dateISO));
    });

    // Divider-Linie am Methodenwechsel — Gold wie zuvor bei der Übergangs-
    // woche, damit der Wechsel trotz durchgehender Linie/Farbe klar als
    // Zäsur erkennbar bleibt (keine Segment-Labels/-Flächen mehr, s.
    // Kopfkommentar der Funktion).
    const divider = (idx) => {
      const divX = scale.x(idx - 0.5);
      svg.appendChild(
        svgEl("rect", {
          x: divX - 1,
          y: pad.t,
          width: 2,
          height: ch,
          fill: "#c9a84c",
          opacity: "0.85",
        })
      );
      return divX;
    };

    // Nur noch die dezente Trennlinie am Methodenwechsel — keine
    // Segment-Labels/-Farben mehr (Umbau "Plan 1/2 → Kalenderwoche"). Die
    // Erklärung steht stattdessen im methodNote-Hinweis unter der X-Achse
    // (s. u.).
    if (hasSplit) divider(splitIdx);

    // Kurzer Hinweis unter der X-Achse (die ausführliche Erklärung steht im
    // chart-explainer-Text unter dem Chart, hier bewusst nur ein kompakter
    // Pointer statt derselben Erklärung ein zweites Mal, s. AGENTS.md). Der
    // verfügbare Platz zwischen X-Achsen-Labels und Kartenrand reicht nur für
    // EINE Zeile — bewusst nur die erste `wrapText()`-Zeile zeichnen statt
    // eine zweite Zeile unsichtbar über den viewBox-Rand hinauslaufen zu
    // lassen (SVG-Root clippt standardmäßig).
    if (showsMethodNote) {
      const noteLbl = svgEl("text", {
        x: W / 2,
        y: H - 6,
        "text-anchor": "middle",
        fill: "#c9a84c",
        "font-size": "9",
        "font-weight": "600",
      });
      noteLbl.textContent = wrapText(methodNote, 92)[0];
      svg.appendChild(noteLbl);
    }

    // Mean lines getrennt vor/nach dem HRV-Methodenwechsel (unterschiedliche
    // absolute Wertebereiche RMSSD/SDNN, ein gemeinsamer Mittelwert wäre
    // irreführend — Alex' Entscheidung) — nur die tatsächlich gemessenen
    // Werte im jeweiligen Bereich fließen ein.
    const meanFor = (arr, color, fromIdx, toIdx, labelAbove) => {
      if (!arr.length) return;
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      const meanY = yOf(mean);
      const x1 = scale.x(fromIdx);
      const x2 = scale.x(toIdx);
      svg.appendChild(
        svgEl("line", {
          x1,
          y1: meanY,
          x2,
          y2: meanY,
          stroke: color,
          "stroke-width": "0.8",
          "stroke-dasharray": "3,4",
          opacity: "0.4",
        })
      );
      const meanLabel = svgEl("text", {
        x: x2 - 2,
        y: labelAbove ? meanY - 5 : meanY + 12,
        "text-anchor": "end",
        fill: color,
        "font-size": "9",
        opacity: "0.7",
      });
      meanLabel.textContent = `Ø ${fmt(mean, 0)}`;
      svg.appendChild(meanLabel);
    };

    const valsRmssd = vals.slice(0, rmssdEndIdx + 1).filter((v) => v != null);
    meanFor(valsRmssd, color1, 0, rmssdEndIdx, true);
    if (hasSplit) {
      const valsSdnn = vals.slice(sdnnStartIdx).filter((v) => v != null);
      // Label-Kollision vermeiden: wenn die beiden Mittelwerte nah beieinander liegen, das zweite Label tiefer setzen
      const meanRmssd = valsRmssd.reduce((s, v) => s + v, 0) / valsRmssd.length;
      const meanSdnn = valsSdnn.reduce((s, v) => s + v, 0) / valsSdnn.length;
      const closeMeans = Math.abs(meanRmssd - meanSdnn) < (maxV - minV) * 0.08;
      meanFor(valsSdnn, color2, sdnnStartIdx, lastIdx, !closeMeans);
    }

    // Direktbeschriftung der Hauptserie (Familie 2, „direkt an der Kurve") —
    // an der flachsten Stelle des jüngsten Abschnitts (nach dem
    // Methodenwechsel, falls vorhanden).
    const labelSegFrom = hasSplit ? sdnnStartIdx : 0;
    const labelIdx = flattestIndex(vals, labelSegFrom, lastIdx, yOf, 0.4, 1);
    if (labelIdx != null) {
      haloLabel(
        svg,
        scale.x(labelIdx),
        yOf(vals[labelIdx]) - 12,
        field === "hrv" ? "HRV" : "Ruhepuls",
        color1
      );
    }

    // Hover-Ebene (§4.1) — s. renderSleep. Einheitliche Punktfarbe (kein
    // Plan-Segment mehr), deshalb hier ein fester String statt Funktion.
    const hoverLayer = svgEl("g", {});
    svg.appendChild(hoverLayer);
    svg.__hrvRhfGeometry = {
      x: scale.x,
      skeleton,
      hoverLayer,
      top: pad.t,
      bottom: pad.t + ch,
      series: [{ vals, yOf, color: color1 }],
    };
    paintDayHover(svg, "__hrvRhfGeometry");
  };

  draw();

  if (svg.__hrvRhfResizeObserver) svg.__hrvRhfResizeObserver.disconnect();
  const observer = new ResizeObserver(() => draw());
  observer.observe(svg);
  svg.__hrvRhfResizeObserver = observer;

  if (!svg.__hrvRhfHoverBound) {
    svg.__hrvRhfHoverBound = true;
    onChartViewChange(() => paintDayHover(svg, "__hrvRhfGeometry"));
  }
}

/**
 * Merged Eigenplan-Serie (Bugfix-Nachtrag zu Phase 5 Schritt 7): pro Tag
 * `wellness[wellnessField]`, falls vorhanden, sonst `ride[rideField]` als
 * Fallback. Grund für den Merge statt eines reinen Wechsels auf
 * Data.wellness: die beiden Quellen weichen an einigen Tagen tatsächlich
 * voneinander ab (bestätigt z.B. für HRV am 12.06.2026: ride.hrv=73 vs.
 * wellness.hrv=45, obwohl beide laut Sync-Code aus demselben
 * `wellness[date].hrvSDNN` stammen sollten — vermutlich ein Sync-Pipeline-
 * Thema, s. docs/offene-punkte.md, nicht Teil dieses Fixes) UND
 * Data.wellness hat für die Plan-1-Ära (vor ca. Mitte Juni) gar keine
 * HRV/Ruhepuls-Werte — nur rides trägt sie dort. Ein reiner Wechsel hätte
 * diese Historie gelöscht. Woche/Plan kommen aus dem reinen Datumsraster
 * (core/plan2-schedule.js), unabhängig davon, welche Quelle den Wert
 * lieferte — gilt NUR für den Eigenplan-Athleten, PLAN2_SCHEDULE ist
 * athletenunabhängig nur ein Datumsraster.
 * @param {import("../../types.js").Ride[]} rides
 * @param {string} rideField @param {string} wellnessField @param {string} outField
 */
function _mergedOwnPlanSeries(rides, rideField, wellnessField, outField) {
  const byDate = new Map();
  for (const r of rides) {
    if (r[rideField] != null) byDate.set(r.dateISO, r[rideField]);
  }
  for (const w of Data.wellness || []) {
    if (w[wellnessField] != null) byDate.set(w.dateISO || w.date, w[wellnessField]);
  }
  return [...byDate.entries()]
    .map(([dateISO, value]) => {
      const { week } = getPlan2WeekPhase(dateISO);
      return {
        dateISO,
        dateShort: fmtDate(dateISO),
        week,
        // HRV-Methodenwechsel-Flag (Umbau "Plan 1/2 → Kalenderwoche"):
        // week gesetzt = intervals.icu-Ära (SDNN), sonst Notion-Ära via
        // Apple Health (RMSSD). Gilt strukturell gleich für HRV UND RHF
        // (beide Felder wechseln an derselben Stelle die Datenquelle),
        // auch wenn nur die HRV-Berechnungsmethode sich fachlich ändert.
        hrvMethod: week ? "sdnn" : "rmssd",
        name: "",
        [outField]: value,
      };
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

/* ── HRV-Trend ────────────────────────────────────────────────── */
export function renderHrvTrend(rides) {
  const ownPlan = rides.some((r) => r.week);
  let data;
  if (ownPlan) {
    data = _mergedOwnPlanSeries(rides, "hrv", "hrv", "hrv");
  } else {
    // Kein eigener Plan — direkt aus Wellness lesen (alle Tage, nicht nur
    // Fahrtdaten). Athlet 2 kommt durchgehend aus intervals.icu/Amazfit,
    // kein Methodenwechsel.
    data = (Data.wellness || [])
      .filter((w) => w.hrv != null)
      .map((w) => ({
        dateISO: w.dateISO || w.date,
        dateShort: w.dateShort || (w.date ? fmtDate(w.date) : ""),
        week: null,
        hrvMethod: "sdnn",
        name: "",
        hrv: w.hrv,
      }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }
  renderHrvRhfChart(
    "chart-hrv-p1",
    data,
    "#7c5cbf",
    "#e08a3c",
    "ms",
    "hrv",
    // Kompakter Pointer — die volle Erklärung (RMSSD vs. SDNN) steht schon
    // im chart-explainer-Text unter dem Chart, hier keine zweite Kopie.
    ownPlan ? "⚠ Methodenwechsel RMSSD → SDNN — siehe Beschreibung unten" : null
  );
}

/* ── Ruhepuls-Trend ───────────────────────────────────────────── */
export function renderRhfTrend(rides) {
  const ownPlan = rides.some((r) => r.week);
  let data;
  if (ownPlan) {
    // s. _mergedOwnPlanSeries() / renderHrvTrend — derselbe Merge.
    data = _mergedOwnPlanSeries(rides, "ruhepuls", "restingHR", "ruhepuls");
  } else {
    // Kein eigener Plan — direkt aus Wellness lesen (alle Tage, nicht nur Fahrtdaten)
    data = (Data.wellness || [])
      .filter((w) => w.restingHR != null)
      .map((w) => ({
        dateISO: w.dateISO || w.date,
        dateShort: w.dateShort || (w.date ? fmtDate(w.date) : ""),
        week: null,
        hrvMethod: "sdnn",
        name: "",
        ruhepuls: w.restingHR,
      }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }
  renderHrvRhfChart("chart-rhf-p1", data, "#d94f4f", "#e08a3c", "bpm", "ruhepuls", null);
}

/* ── Körper: Gewicht, Energie, Hydration (Daten: core/body.js) ─── */

/** Gemeinsame, ausgedünnte X-Achsen-Datumslabels für die Körper-Charts —
 *  arbeitet auf dem dichten Tagesgerüst statt den (kompakten) core/body.js-
 *  Punktarrays, damit Sprünge über Messlücken hinweg nicht stillschweigend
 *  Label-Kollisionen verursachen.
 *  @param {SVGElement} svg @param {Array<{dateISO:string}>} skeleton
 *  @param {(i:number)=>number} xOf @param {number} y */
function _bodyDateLabels(svg, skeleton, xOf, y) {
  const xs = skeleton.map((_, i) => xOf(i));
  pickLabelIndices(xs, 44).forEach((i) => {
    xLabel(svg, xs[i], y, fmtDate(skeleton[i].dateISO));
  });
}

/** Energie je Tag: Verbrauch (Grundumsatz + aktiv, gestapelte Balken) und/oder
 *  Zufuhr (Linie, bzw. Balken wenn kein Verbrauch getrackt wird)
 *  @param {string} svgId @param {ReturnType<import("../../core/body.js").energyView>} ev */
export function renderEnergy(svgId, ev, wt) {
  const svg = el(svgId);
  if (!svg) return;
  if (!ev || !ev.days.length) {
    svg.innerHTML = "";
    if (svg.__energyResizeObserver) svg.__energyResizeObserver.disconnect();
    return;
  }
  const hasWeight = !!(wt && wt.points && wt.points.length);

  // Skelett über die UNION aus Energie- und Gewichtsbereich (Bugfix-Nachtrag
  // zu Phase 5 Schritt 7): Gewicht wird oft unabhängig von Kalorien getrackt
  // und kann einen früheren/späteren Bereich abdecken. Ein Skelett, das nur
  // ev.days folgt, machte Gewichtsmessungen außerhalb dieses Bereichs
  // unsichtbar, obwohl sie vorlagen (echter Bug, nicht nur eine Design-
  // Entscheidung — s. docs/offene-punkte.md). Ohne Gewichtsdaten bleibt der
  // Bereich wie bisher exakt ev.days.
  let fromISO = ev.days[0].date;
  let toISO = ev.days[ev.days.length - 1].date;
  if (hasWeight) {
    const wFrom = wt.points[0].date;
    const wTo = wt.points[wt.points.length - 1].date;
    if (wFrom < fromISO) fromISO = wFrom;
    if (wTo > toISO) toISO = wTo;
  }
  const skeleton = densifyDays(fromISO, toISO);
  const joinRows = ev.days.map((d) => ({
    dateISO: d.date,
    resting: d.resting,
    active: d.active,
    burned: d.burned,
    intake: d.intake,
  }));
  const restingVals = joinSeries(skeleton, joinRows, { key: "resting", absence: "gap" });
  const activeVals = joinSeries(skeleton, joinRows, { key: "active", absence: "gap" });
  const burnedVals = joinSeries(skeleton, joinRows, { key: "burned", absence: "gap" });
  const intakeVals = joinSeries(skeleton, joinRows, { key: "intake", absence: "gap" });
  const weightVals = hasWeight
    ? joinSeries(
        skeleton,
        wt.points.map((p) => ({ dateISO: p.date, weight: p.weight })),
        { key: "weight", absence: "gap" }
      )
    : [];

  const H = 300,
    padL = 50,
    padR = 16;

  const draw = () => {
    svg.innerHTML = "";
    const W = measuredWidth(svg, 780);
    const cw = W - padL - padR;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const eTop = 20,
      eBase = hasWeight ? 190 : 250,
      ech = eBase - eTop;
    const n = skeleton.length,
      slot = cw / n,
      bw = Math.min(slot * 0.34, 15);
    const definedBurned = burnedVals.filter((v) => v != null);
    const definedIntake = intakeVals.filter((v) => v != null);
    const maxV = Math.max(1, ...definedBurned, ...definedIntake) * 1.1;
    const Y = (v) => eBase - (v / maxV) * ech;
    const cx = (i) => padL + slot * (i + 0.5);

    const mono = "var(--font-mono)";
    const txt = (x, y, s, fill, anchor) => {
      const t = svgEl("text", { x, y, "font-size": s, fill, "font-family": mono });
      if (anchor) t.setAttribute("text-anchor", anchor);
      return t;
    };

    gradedGrid(svg, { x0: padL, x1: W - padR, yOf: Y, lo: 0, hi: maxV });
    axisUnit(svg, { x: padL - 6, y: eTop - 6, text: "kcal" });

    const tip = (i) => {
      const parts = [];
      const burned = burnedVals[i],
        resting = restingVals[i],
        active = activeVals[i],
        intake = intakeVals[i];
      if (burned > 0)
        parts.push(
          resting > 0
            ? `Verbrauch ${burned} kcal (Grundumsatz ${resting}${ev.restingEstimated ? " gesch." : ""} · aktiv ${active})`
            : `Aktiv verbrannt ${active} kcal`
        );
      if (intake != null) parts.push(`Zufuhr ${intake} kcal`);
      return `<div class="tt">${fmtDateFull(skeleton[i].dateISO)}</div><div class="tv">${
        parts.length ? parts.join(" · ") : "keine Messung"
      }</div>`;
    };

    skeleton.forEach((day, i) => {
      const burned = burnedVals[i],
        resting = restingVals[i],
        intake = intakeVals[i];
      if (burned == null && intake == null) return; // Tag ohne jede Messung: Lücke
      const c = cx(i),
        ex = c - bw - 1.5,
        ix = c + 1.5;
      if (burned != null && burned > 0) {
        const rTop = Y(resting > 0 ? resting : 0),
          aTop = Y(burned);
        if (resting > 0)
          svg.appendChild(
            svgEl("rect", {
              x: ex,
              y: rTop,
              width: bw,
              height: Math.max(0, eBase - rTop),
              rx: "2",
              fill: "#3a4a5c",
            })
          );
        const orangeFrom = resting > 0 ? rTop : eBase;
        svg.appendChild(
          svgEl("rect", {
            x: ex,
            y: aTop,
            width: bw,
            height: Math.max(0, orangeFrom - aTop),
            rx: "2",
            fill: "#e08a3c",
          })
        );
      }
      if (intake != null) {
        const iTop = Y(intake);
        svg.appendChild(
          svgEl("rect", {
            x: ix,
            y: iTop,
            width: bw,
            height: Math.max(0, eBase - iTop),
            rx: "2",
            fill: "#4a7fa8",
          })
        );
      }
      const hit = svgEl("rect", {
        x: c - slot / 2,
        y: eTop,
        width: slot,
        height: eBase - eTop,
        fill: "transparent",
      });
      hit.style.cursor = "pointer";
      hit.addEventListener("mouseenter", (e) => {
        Tooltip.show(e, tip(i));
        setHovered(day.dateISO);
      });
      hit.addEventListener("mouseleave", () => {
        Tooltip.hide();
        clearHovered();
      });
      svg.appendChild(hit);
    });

    const barSeries = [
      { vals: burnedVals, yOf: Y, color: "#e08a3c" },
      { vals: intakeVals, yOf: Y, color: "#4a7fa8" },
    ];

    if (!hasWeight) {
      _bodyDateLabels(svg, skeleton, cx, eBase + 16);
      const hoverLayer = svgEl("g", {});
      svg.appendChild(hoverLayer);
      svg.__energyGeometry = {
        x: cx,
        skeleton,
        hoverLayer,
        top: eTop,
        bottom: eBase,
        series: barSeries,
      };
      paintDayHover(svg, "__energyGeometry");
      return;
    }

    // ── Gewichts-Spur (eigene kg-Skala, gleiche Datums-Achse) ──
    const sep = eBase + 18;
    svg.appendChild(
      svgEl("line", { x1: padL, y1: sep, x2: W - padR, y2: sep, stroke: "rgba(255,255,255,0.10)" })
    );
    const dW = wt.delta30d != null ? `  ·  Δ ${wt.delta30d > 0 ? "+" : ""}${fmt(wt.delta30d)} kg` : "";
    const lbl = txt(padL, sep + 14, "10", "#5f6878");
    lbl.textContent = "Gewicht (kg)" + dW;
    svg.appendChild(lbl);
    const wTop = sep + 22,
      wBot = sep + 66,
      wch = wBot - wTop;
    const definedWeights = weightVals.filter((v) => v != null);
    const wMin = Math.min(...definedWeights) - 0.4,
      wMax = Math.max(...definedWeights) + 0.4;
    const wY = (w) => wBot - ((w - wMin) / (wMax - wMin || 1)) * wch;
    [wMax, wMin].forEach((w) => {
      const y = wY(w);
      svg.appendChild(
        svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "rgba(255,255,255,0.05)" })
      );
      const t = txt(padL - 6, y + 3, "9", "#5f6878", "end");
      t.textContent = fmt(w);
      svg.appendChild(t);
    });

    // Linie verbindet bewusst über Messlücken hinweg (Alex' Design-Entscheidung,
    // Phase 5 Bugfix-Nachtrag, wie im HRV/Ruhepuls-Chart) — alle tatsächlich
    // gewogenen Tage direkt verbunden statt an jeder Lücke abzureißen. Punkte
    // bleiben ausschließlich an echten Wiege-Tagen (s. Dot-Schleife unten).
    const weightPts = [];
    for (let i = 0; i < weightVals.length; i++) {
      if (weightVals[i] != null) weightPts.push({ x: cx(i), y: wY(weightVals[i]) });
    }
    if (weightPts.length > 1) {
      svg.appendChild(
        svgEl("polyline", {
          fill: "none",
          stroke: "#d9b64c",
          "stroke-width": "2.2",
          "stroke-linejoin": "round",
          points: weightPts.map((q) => `${q.x},${q.y}`).join(" "),
        })
      );
    }
    skeleton.forEach((day, i) => {
      if (weightVals[i] == null) return;
      const dot = svgEl("circle", {
        cx: cx(i),
        cy: wY(weightVals[i]),
        r: "3.2",
        fill: "#d9b64c",
        stroke: "#0b0e13",
        "stroke-width": "1.3",
      });
      dot.style.cursor = "pointer";
      dot.addEventListener("mouseenter", (e) => {
        Tooltip.show(
          e,
          `<div class="tt">${fmtDateFull(day.dateISO)}</div><div class="tv">${fmt(weightVals[i])} kg</div>`
        );
        setHovered(day.dateISO);
      });
      dot.addEventListener("mouseleave", () => {
        Tooltip.hide();
        clearHovered();
      });
      svg.appendChild(dot);
    });
    _bodyDateLabels(svg, skeleton, cx, wBot + 16);

    const hoverLayer = svgEl("g", {});
    svg.appendChild(hoverLayer);
    svg.__energyGeometry = {
      x: cx,
      skeleton,
      hoverLayer,
      top: eTop,
      bottom: wBot,
      series: [...barSeries, { vals: weightVals, yOf: wY, color: "#d9b64c" }],
    };
    paintDayHover(svg, "__energyGeometry");
  };

  draw();

  if (svg.__energyResizeObserver) svg.__energyResizeObserver.disconnect();
  const observer = new ResizeObserver(() => draw());
  observer.observe(svg);
  svg.__energyResizeObserver = observer;

  if (!svg.__energyHoverBound) {
    svg.__energyHoverBound = true;
    onChartViewChange(() => paintDayHover(svg, "__energyGeometry"));
  }
}

/** Hydration: Fläche + Linie + Ø-Referenz
 *  @param {string} svgId @param {ReturnType<import("../../core/body.js").hydrationSeries>} hy */
export function renderHydration(svgId, hy) {
  const svg = el(svgId);
  if (!svg) return;
  if (!hy || !hy.points.length) {
    svg.innerHTML = "";
    if (svg.__hydrationResizeObserver) svg.__hydrationResizeObserver.disconnect();
    return;
  }
  const unit = hy.field === "hydrationVolume" ? "L" : "";

  const fromISO = hy.points[0].date;
  const toISO = hy.points[hy.points.length - 1].date;
  const skeleton = densifyDays(fromISO, toISO);
  const vals = joinSeries(
    skeleton,
    hy.points.map((p) => ({ dateISO: p.date, value: p.value })),
    { key: "value", absence: "gap" }
  );

  const H = 200,
    pad = { l: 50, r: 16, t: 24, b: 34 };

  const draw = () => {
    svg.innerHTML = "";
    const W = measuredWidth(svg, 780);
    const cw = W - pad.l - pad.r,
      ch = H - pad.t - pad.b;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const defined = vals.filter((v) => v != null);
    const maxV = Math.max(1, ...defined) * 1.1;
    const scale = makeIndexScale({ ws: 0, we: skeleton.length - 1, padLeft: pad.l, width: cw });
    const Y = (v) => pad.t + ch - (v / maxV) * ch;

    gradedGrid(svg, { x0: pad.l, x1: W - pad.r, yOf: Y, lo: 0, hi: maxV });
    axisUnit(svg, { x: pad.l - 6, y: pad.t - 6, text: unit || "Hydration" });
    axisTitles(svg, W, H, pad, { x: "Datum" });

    // Linie verbindet über Messlücken hinweg (Alex' Design-Entscheidung, wie
    // HRV/Ruhepuls/Gewicht/Schlaf-HF) — alle Tage mit echtem Wert werden
    // direkt verbunden. Marker bleiben ausschließlich an echten Messtagen
    // (Dot-Schleife unten).
    const hydrationPts = [];
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] != null) hydrationPts.push({ x: scale.x(i), y: Y(vals[i]) });
    }
    if (hydrationPts.length > 1) {
      const area =
        `M${hydrationPts[0].x},${H - pad.b} ` +
        hydrationPts.map((p) => `L${p.x},${p.y}`).join(" ") +
        ` L${hydrationPts[hydrationPts.length - 1].x},${H - pad.b} Z`;
      svg.appendChild(svgEl("path", { d: area, fill: "#4a7fa8", opacity: "0.08" }));
      svg.appendChild(
        svgEl("polyline", {
          fill: "none",
          stroke: "#4a7fa8",
          "stroke-width": "2",
          points: hydrationPts.map((p) => `${p.x},${p.y}`).join(" "),
        })
      );
    }
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: Y(hy.avg),
        x2: W - pad.r,
        y2: Y(hy.avg),
        stroke: "#5f6878",
        "stroke-width": "1",
        "stroke-dasharray": "4,4",
      })
    );
    skeleton.forEach((day, i) => {
      if (vals[i] == null) return;
      const c = svgEl("circle", { cx: scale.x(i), cy: Y(vals[i]), r: "2.4", fill: "#4a7fa8" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", (e) => {
        Tooltip.show(
          e,
          `<div class="tt">${fmtDateFull(day.dateISO)}</div><div class="tv">${fmt(vals[i])} ${unit}</div>`
        );
        setHovered(day.dateISO);
      });
      c.addEventListener("mouseleave", () => {
        Tooltip.hide();
        clearHovered();
      });
      svg.appendChild(c);
    });
    _bodyDateLabels(svg, skeleton, scale.x, H - 12);

    const hoverLayer = svgEl("g", {});
    svg.appendChild(hoverLayer);
    svg.__hydrationGeometry = {
      x: scale.x,
      skeleton,
      hoverLayer,
      top: pad.t,
      bottom: pad.t + ch,
      series: [{ vals, yOf: Y, color: "#4a7fa8" }],
    };
    paintDayHover(svg, "__hydrationGeometry");
  };

  draw();

  if (svg.__hydrationResizeObserver) svg.__hydrationResizeObserver.disconnect();
  const observer = new ResizeObserver(() => draw());
  observer.observe(svg);
  svg.__hydrationResizeObserver = observer;

  if (!svg.__hydrationHoverBound) {
    svg.__hydrationHoverBound = true;
    onChartViewChange(() => paintDayHover(svg, "__hydrationGeometry"));
  }
}
