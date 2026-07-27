/* ============================================================
   UI/CHARTS/POWER.JS — Power Curve, Effizienz, Scatter,
   Small Multiples (Tempo · HF · Kadenz)
   Rendering only — Kurven-Parsing in core/powercurve.js,
   Regression in core/stats.js.
   ============================================================ */

import { fmt, fmtInt, fmtDateFull } from "../../core/format.js";
import { linearTrend } from "../../core/stats.js";
import { buildCurveData } from "../../core/powercurve.js";
import { CONFIG } from "../../state/config.js";
import { el, svgEl, Tooltip } from "../dom.js";
import {
  gridLines,
  xLabel,
  autoScrollRight,
  pickLabelIndices,
  cardContentWidth,
  axisTitles,
  gradedGrid,
  axisUnit,
  pathD,
  crosshair,
  hoverDot,
  CHART_THEME,
} from "./base.js";

/** Zeichnet die Trendlinie einer Punktwolke (falls berechenbar) */
function drawTrendLine(svg, pts, opts = {}) {
  const trend = linearTrend(pts);
  if (!trend) return;
  const { slope, intercept } = trend;
  const x1 = pts[0].x,
    x2 = pts[pts.length - 1].x;
  svg.appendChild(
    svgEl("line", {
      x1,
      y1: slope * x1 + intercept,
      x2,
      y2: slope * x2 + intercept,
      stroke: "#4a9a6e",
      "stroke-width": "1.5",
      "stroke-dasharray": "6,3",
      opacity: opts.opacity || "0.6",
    })
  );
}

/* ── Aerobe Effizienz (Watt/HF) — EF-Trend über vergleichbare
      Z2-Fahrten, Intervalltage nur als Kontext ─────────────────── */
export function renderEfficiency(svgId, rides, trend) {
  const data = rides.filter((r) => r.efficiency).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const svg = el(svgId);
  if (!svg || !data.length) return;
  svg.innerHTML = "";
  const comparableSet = new Set((trend?.comparable || []).map((r) => r.dateISO + (r.name || "")));

  // Hinweiszeile im Chart-Header aktualisieren
  const note = el("efficiency-note");
  if (note) {
    note.textContent =
      trend && trend.comparable.length
        ? `EF-Trend: ${trend.comparable.length} vergleichbare Z2-Fahrten${trend.slopePer30d != null ? ` · ${trend.slopePer30d > 0 ? "+" : ""}${trend.slopePer30d} W/bpm je 30 Tage` : ""}`
        : "Nur Powermeter-Fahrten";
  }

  const W = 780,
    H = 210,
    pad = { l: 50, r: 16, t: 16, b: 36 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const vals = data.map((d) => d.efficiency);
  const minV = Math.max(0, Math.min(...vals) - 0.1);
  const maxV = Math.max(...vals) + 0.1;

  gridLines(svg, W, H, pad, maxV, minV);
  axisTitles(svg, W, H, pad, { x: "Datum", yLeft: "Effizienz (W/bpm)" });

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(data.length - 1, 1)) * cw,
    y: pad.t + ch - ((d.efficiency - minV) / (maxV - minV)) * ch,
    d,
  }));

  // Rolling-Mean-Linie über die vergleichbaren Fahrten (core/efficiency.js)
  if (trend && trend.comparable.length >= 3) {
    const rollPts = [];
    trend.comparable.forEach((r, ci) => {
      const idx = data.findIndex((d) => d.dateISO === r.dateISO && d.name === r.name);
      const rv = trend.rolling[ci];
      if (idx >= 0 && rv != null)
        rollPts.push(`${pts[idx].x},${pad.t + ch - ((rv - minV) / (maxV - minV)) * ch}`);
    });
    if (rollPts.length >= 2) {
      svg.appendChild(
        svgEl("polyline", {
          fill: "none",
          stroke: "#4a9a6e",
          "stroke-width": "2",
          "stroke-linejoin": "round",
          points: rollPts.join(" "),
          opacity: "0.9",
        })
      );
    }
  } else {
    drawTrendLine(svg, pts);
  }

  // Datenpunkte: vergleichbare Z2-Fahrten voll, andere als Kontext ausgegraut
  data.forEach((d, i) => {
    const p = pts[i];
    const comparable = !trend || comparableSet.has(d.dateISO + (d.name || ""));
    const c = svgEl("circle", {
      cx: p.x,
      cy: p.y,
      r: comparable ? "4.5" : "3",
      fill: comparable ? "#4a7fa8" : "#5f6878",
      opacity: comparable ? "0.9" : "0.35",
      stroke: "#0b0e13",
      "stroke-width": "1",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `
      <div class="tt">${d.dateShort} · ${d.week || ""}</div>
      <div class="tv">Effizienz: ${fmt(d.efficiency, 2)} W/bpm</div>
      <div class="td">${fmtInt(d.watt)}W · ${fmtInt(d.hf)} bpm${trend ? (comparableSet.has(d.dateISO + (d.name || "")) ? " · vergleichbar (Z2)" : " · Kontext") : ""}</div>
      <div class="td">${d.name}</div>
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

/* ── Tempo vs. HF Scatterplot ────────────────────────────────── */
export function renderScatter(svgId, rides) {
  const data = rides
    .filter((r) => r.kmh && r.hf)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const svg = el(svgId);
  if (!svg || !data.length) return;
  svg.innerHTML = "";

  const W = 780,
    H = 260,
    pad = { l: 54, r: 20, t: 16, b: 44 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const minX = Math.min(...data.map((d) => d.kmh)) - 1;
  const maxX = Math.max(...data.map((d) => d.kmh)) + 1;
  const minY = Math.min(...data.map((d) => d.hf)) - 5;
  const maxY = Math.max(...data.map((d) => d.hf)) + 5;

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ch / 4) * i;
    const yVal = Math.round(maxY - ((maxY - minY) / 4) * i);
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: y,
        x2: W - pad.r,
        y2: y,
        stroke: "#232a37",
        "stroke-width": "1",
      })
    );
    const t = svgEl("text", {
      x: pad.l - 6,
      y: y + 4,
      "text-anchor": "end",
      fill: "#5f6878",
      "font-size": "10",
    });
    t.textContent = yVal;
    svg.appendChild(t);
  }
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (cw / 4) * i;
    const xVal = (minX + ((maxX - minX) / 4) * i).toFixed(1);
    const t = svgEl("text", {
      x,
      y: H - pad.b + 14,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "10",
    });
    t.textContent = xVal;
    svg.appendChild(t);
  }

  axisTitles(svg, W, H, pad, { x: "Tempo (km/h)", yLeft: "Ø HF (bpm)" });

  // Koordinaten vorberechnen
  const pts = data.map((d) => ({
    px: pad.l + ((d.kmh - minX) / (maxX - minX)) * cw,
    py: pad.t + ch - ((d.hf - minY) / (maxY - minY)) * ch,
    d,
  }));

  // Punkte — Farbe nach Phase
  pts.forEach(({ px, py, d }) => {
    const color = CONFIG.phaseColor(d.phase);
    const c = svgEl("circle", {
      cx: px,
      cy: py,
      r: "5",
      fill: color,
      opacity: "0.75",
      stroke: "#0b0e13",
      "stroke-width": "1",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `
      <div class="tt">${d.dateShort} · ${d.week || ""}</div>
      <div class="tv">${fmt(d.kmh)} km/h · ${fmtInt(d.hf)} bpm</div>
      <div class="td">${d.name}</div>
    `
      )
    );
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });
}

/* ── Small Multiples (Tempo · HF · Kadenz pro Fahrt) ─────────── */
export function renderSmallMultiples(rides) {
  const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ownPlan = rides.some((r) => r.week);
  const PPT = 16;
  const H = 180,
    pad = { l: 50, r: 24, t: 16, b: 36 };

  const render = (svgId, data, field, color, unit, targetLine, yTitle) => {
    const svg = el(svgId);
    if (!svg || !data.length) return;
    svg.innerHTML = "";

    const W = Math.max(cardContentWidth(), data.length * PPT + 74);
    const cw = W - pad.l - pad.r,
      ch = H - pad.t - pad.b;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);

    const vals = data.map((d) => d[field]);
    const minV = Math.max(0, Math.min(...vals) - 2);
    const maxV = Math.max(...vals) + 2;

    gridLines(svg, W, H, pad, maxV, minV);
    axisTitles(svg, W, H, pad, { x: "Datum", yLeft: yTitle });

    // Plan divider + Labels
    const plan2Start = data.findIndex((d) => d.plan === "Plan 2");
    if (plan2Start > 0) {
      const divX = pad.l + ((plan2Start - 0.5) / Math.max(data.length - 1, 1)) * cw;
      svg.appendChild(
        svgEl("rect", {
          x: divX - 0.5,
          y: pad.t,
          width: 1,
          height: ch,
          fill: "#5f6878",
          opacity: "0.5",
        })
      );
      const lbl1 = svgEl("text", {
        x: divX - 8,
        y: pad.t + 12,
        "text-anchor": "end",
        fill: "#5f6878",
        "font-size": "9",
        "font-weight": "600",
      });
      lbl1.textContent = "Plan 1";
      svg.appendChild(lbl1);
      const lbl2 = svgEl("text", {
        x: divX + 8,
        y: pad.t + 12,
        "text-anchor": "start",
        fill: "#e08a3c",
        "font-size": "9",
        "font-weight": "600",
      });
      lbl2.textContent = "Plan 2";
      svg.appendChild(lbl2);
    }

    if (targetLine != null) {
      const ty = pad.t + ch - ((targetLine - minV) / (maxV - minV)) * ch;
      svg.appendChild(
        svgEl("line", {
          x1: pad.l,
          y1: ty,
          x2: W - pad.r,
          y2: ty,
          stroke: "#c9a84c",
          "stroke-width": "1",
          "stroke-dasharray": "4,3",
          opacity: "0.5",
        })
      );
      // Label oberhalb der Linie, nicht rechts daneben — kein Overlap mit Plan-Label
      const lt = svgEl("text", {
        x: W - pad.r - 4,
        y: ty - 5,
        "text-anchor": "end",
        fill: "#c9a84c",
        "font-size": "9",
        opacity: "0.85",
      });
      lt.textContent = `Ziel ${targetLine}`;
      svg.appendChild(lt);
    }

    const pts = data.map((d, i) => ({
      x: pad.l + (i / Math.max(data.length - 1, 1)) * cw,
      y: pad.t + ch - ((d[field] - minV) / (maxV - minV)) * ch,
      d,
    }));

    svg.appendChild(
      svgEl("polyline", {
        fill: "none",
        stroke: color,
        "stroke-width": "1.8",
        points: pts.map((p) => `${p.x},${p.y}`).join(" "),
      })
    );

    drawTrendLine(svg, pts);

    pts.forEach((p) => {
      const c = svgEl("circle", {
        cx: p.x,
        cy: p.y,
        r: "3",
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
        <div class="tv">${Math.round(p.d[field] * 10) / 10} ${unit}</div>
        <div class="td">${p.d.name}</div>
      `
        )
      );
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });

    // X-Labels: mindestens 55px Abstand zwischen Labels
    const effLblIdx = pickLabelIndices(
      pts.map((p) => p.x),
      55
    );
    pts.forEach((p, i) => {
      if (effLblIdx.has(i)) xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });

    // Scroll: Container-Breite explizit setzen damit Browser scrollt
    const scrollContainer = svg.parentElement;
    if (scrollContainer && scrollContainer.classList.contains("chart-scroll")) {
      autoScrollRight(svg, W, scrollContainer);
    }
  };

  const filterOutliers = (arr, field) => {
    const vals = arr
      .map((d) => d[field])
      .filter((v) => v != null)
      .sort((a, b) => a - b);
    if (vals.length < 4) return arr;
    const q1 = vals[Math.floor(vals.length * 0.25)];
    const q3 = vals[Math.floor(vals.length * 0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 2.5 * iqr;
    const hi = q3 + 2.5 * iqr;
    return arr.filter((d) => d[field] == null || (d[field] >= lo && d[field] <= hi));
  };

  render(
    "chart-sm-tempo",
    filterOutliers(
      sorted.filter((r) => r.kmh),
      "kmh"
    ),
    "kmh",
    "#4a7fa8",
    "km/h",
    null,
    "Tempo (km/h)"
  );
  render(
    "chart-sm-hf",
    filterOutliers(
      sorted.filter((r) => r.hf),
      "hf"
    ),
    "hf",
    "#d94f4f",
    "bpm",
    null,
    "Herzfrequenz (bpm)"
  );
  render(
    "chart-sm-kadenz",
    filterOutliers(
      sorted.filter((r) => r.kad),
      "kad"
    ),
    "kad",
    "#c9a84c",
    "RPM",
    ownPlan ? CONFIG.cadenceTarget : null,
    "Kadenz (RPM)"
  );
}

/* ── Power Curve (docs/chart-grundlagen.md §7.2, Familie 4 — Nicht-
   Datumsachse: Dauer, keine Tagesachse). Schicht A vollständig übernommen:
   Tokens, abgestuftes Gitter, Achseneinheit über der obersten Achsenzahl
   (G4), gemessene Breite + ResizeObserver (G7) statt skaliertem viewBox,
   pathD()/xLabel() statt Handschrift, lokale Hover-Ebene (§4.1). Schicht B
   bewusst OHNE Brush, OHNE Fadenkreuz-Kopplung zu anderen Charts, OHNE Glow
   und OHNE Kurvenbeschriftung (halo()/flat()) — Achsentitel statt Kurven-
   label, Hover ist "nächstgelegener Punkt" auf der Dauer-Achse statt
   Tages-Snapping (§7.2/§7.3). crosshair()/hoverDot() werden hier rein LOKAL
   als Zeichenprimitiven verwendet (kein setHovered()/state/chart-view.js),
   dasselbe Muster wie das Vergleichsmodus-Hover in pmc.js — Dauer-Buckets
   sind keine Tagesindizes und nehmen an der Chart-übergreifenden Kopplung
   nicht teil. Achsenlogik (Watt-/W-kg-Rundung, Bucket-Labels aus
   core/powercurve.js) bewusst unverändert übernommen, nur die
   Zeichenprimitiven ausgetauscht. ───────────────────────────────────── */

// Cache für Einheiten-/Block-Toggle (Modul-Zustand statt this._pcCache)
let pcCache = null;
let pcMode = "total"; // "total" | "blocks"
let pcUnit = "w";

const BLOCK_COLORS = {
  plan1: CHART_THEME.z2,
  "sweet-spot": CHART_THEME.ss,
  schwelle: CHART_THEME.thr,
  vo2max: CHART_THEME.vo2,
};

const POWER_H = 260;
const POWER_PAD = { l: 56, r: 16, t: 30, b: 44 };

function measuredWidth(svg, fallback = 780) {
  const w = svg.clientWidth;
  return w > 0 ? w : fallback;
}

export function renderPowerCurve(svgId, powerCurves, ftp, weight, blocks) {
  // Daten einmal cachen für Toggles
  pcCache = { svgId, powerCurves, ftp, weight, blocks: blocks || [] };
  pcMode = "total";
  pcUnit = "w";
  drawPowerCurve("w");

  // Block-Toggle: nur zeigen wenn Blockkurven vorhanden
  const blockToggle = el("power-curve-block-toggle");
  if (blockToggle) {
    const usable = pcCache.blocks.filter((b) => buildCurveData(b.curve).length);
    blockToggle.classList.toggle("hidden", usable.length < 2);
    const btns = blockToggle.querySelectorAll(".unit-btn");
    btns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === "total");
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        pcMode = btn.dataset.mode;
        drawPowerCurve(pcUnit);
      });
    });
  }

  // Toggle-Buttons verdrahten
  const toggle = el("power-curve-unit-toggle");
  if (toggle) {
    const btns = toggle.querySelectorAll(".unit-btn");
    const wkgBtn = toggle.querySelector('[data-unit="wkg"]');

    // W/kg deaktivieren wenn kein Gewicht
    if (!weight && wkgBtn) {
      wkgBtn.disabled = true;
      wkgBtn.title = "Kein Gewicht in intervals.icu verfügbar";
    }

    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        pcUnit = btn.dataset.unit;
        drawPowerCurve(pcUnit);
      });
    });
  }

  // Gemessene Breite + ResizeObserver (G7) statt skaliertem viewBox — draw()
  // ist idempotent (svg.innerHTML wird am Anfang geleert). Alten Observer
  // trennen, bevor ein neuer registriert wird (renderPowerCurve läuft pro
  // Athletenwechsel/renderAll erneut, sonst stapeln sich Observer).
  const svg = el(svgId);
  if (svg) {
    if (svg.__pcResizeObserver) svg.__pcResizeObserver.disconnect();
    const observer = new ResizeObserver(() => drawPowerCurve(pcUnit));
    observer.observe(svg);
    svg.__pcResizeObserver = observer;
  }
}

function drawPowerCurve(unit) {
  const { svgId, powerCurves, ftp, weight, blocks } = pcCache;
  const blockMode = pcMode === "blocks";
  const isWkg = unit === "wkg" && weight > 0;

  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";

  const W = measuredWidth(svg);
  const H = POWER_H,
    pad = POWER_PAD;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  if (!powerCurves) {
    const t = svgEl("text", {
      x: W / 2,
      y: H / 2,
      "text-anchor": "middle",
      fill: CHART_THEME.ink.soft,
      "font-size": "12",
    });
    t.textContent = "Power-Curve-Daten werden beim nächsten Sync geladen";
    svg.appendChild(t);
    return;
  }

  // Beide intervals.icu-Formate → Standard-Datenpunkte (core/powercurve.js)
  const curveData = buildCurveData(powerCurves);

  if (!curveData.length) {
    const t = svgEl("text", {
      x: W / 2,
      y: H / 2,
      "text-anchor": "middle",
      fill: CHART_THEME.ink.soft,
      "font-size": "12",
    });
    t.textContent = "Noch keine Power-Curve-Daten verfügbar";
    svg.appendChild(t);
    return;
  }

  // Werte konvertieren wenn W/kg
  const toVal = (w) => (isWkg ? w / weight : w);
  const fmtVal = (v) => (isWkg ? v.toFixed(2) + " W/kg" : Math.round(v) + "W");
  const fmtAxis = (v) => (isWkg ? v.toFixed(1) : v + "W");
  const ftpVal = ftp ? toVal(ftp) : null;

  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const vals = curveData.map((d) => toVal(d.watts));
  const maxV = Math.max(...vals) * 1.1;
  const xScale = (i) => pad.l + (i / (curveData.length - 1)) * cw;
  const yScale = (v) => pad.t + ch - (v / maxV) * ch;

  // Gitter (abgestuft, §2.4) + y-Einheit über der obersten Achsenzahl (G4).
  // Rundung/Schrittweite unverändert aus dem Bestand — nur die Zeichnung
  // (gradedGrid statt fester Grid-Linie) und die Farbtoken sind neu.
  const step = isWkg ? (maxV > 10 ? 2 : maxV > 5 ? 1 : 0.5) : Math.ceil(maxV / 5 / 50) * 50;
  const gridSteps = Math.max(1, Math.floor(maxV / step));
  gradedGrid(svg, {
    x0: pad.l,
    x1: W - pad.r,
    yOf: yScale,
    lo: 0,
    hi: gridSteps * step,
    steps: gridSteps,
  });
  for (let i = 0; i <= gridSteps; i++) {
    const v = i * step;
    const t = svgEl("text", {
      x: pad.l - 6,
      y: yScale(v) + 4,
      "text-anchor": "end",
      fill: CHART_THEME.ink.label,
      "font-size": "9",
    });
    t.textContent = fmtAxis(v);
    svg.appendChild(t);
  }
  axisUnit(svg, { x: pad.l - 6, y: pad.t - 10, text: isWkg ? "W/kg" : "Watt" });
  axisTitles(svg, W, H, pad, { x: "Zeitintervall" });

  // FTP-Linie
  if (ftpVal != null) {
    const ftpY = yScale(ftpVal);
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: ftpY,
        x2: W - pad.r,
        y2: ftpY,
        stroke: CHART_THEME.gold,
        "stroke-width": "1.5",
        "stroke-dasharray": "6,3",
        opacity: "0.8",
      })
    );
    const ft = svgEl("text", {
      x: pad.l + 6,
      y: ftpY - 5,
      fill: CHART_THEME.gold,
      "font-size": "9",
      "font-weight": "600",
    });
    ft.textContent = isWkg ? `FTP ${(ftp / weight).toFixed(2)} W/kg` : `FTP ${ftp}W`;
    svg.appendChild(ft);
  }

  // Fläche unter der Kurve
  const curvePts = curveData.map((d, i) => [xScale(i), yScale(toVal(d.watts))]);
  const areaD =
    pathD([[xScale(0), pad.t + ch], ...curvePts, [xScale(curveData.length - 1), pad.t + ch]]) + " Z";
  svg.appendChild(svgEl("path", { d: areaD, fill: CHART_THEME.ss, opacity: "0.04" }));

  // Fläche über FTP — anaerobe Reserve
  if (ftpVal != null) {
    const ftpY = yScale(ftpVal);
    const clampedPts = curvePts.map(([x, y]) => [x, Math.min(y, ftpY)]);
    const aboveFtpD =
      pathD([
        [xScale(0), Math.min(curvePts[0][1], ftpY)],
        ...clampedPts,
        [xScale(curveData.length - 1), ftpY],
        [xScale(0), ftpY],
      ]) + " Z";
    svg.appendChild(svgEl("path", { d: aboveFtpD, fill: CHART_THEME.thr, opacity: "0.15" }));
  }

  // Hauptkurve (Gesamt): im Blockmodus nur als heller Kontext
  svg.appendChild(
    svgEl("path", {
      d: pathD(curvePts),
      fill: "none",
      stroke: CHART_THEME.ink.ink,
      "stroke-width": blockMode ? "1.4" : "2",
      "stroke-linejoin": "round",
      opacity: blockMode ? "0.35" : "0",
      "stroke-dasharray": blockMode ? "4,3" : "none",
    })
  );
  if (!blockMode) {
    svg.appendChild(
      svgEl("path", {
        d: pathD(curvePts),
        fill: "none",
        stroke: CHART_THEME.ss,
        "stroke-width": "2",
        "stroke-linejoin": "round",
      })
    );
  }

  // Block-Overlay: eine Kurve je Trainingsblock — zeigt, WO welcher Block
  // Leistung gebracht hat (Sweet Spot → 20–60 min, VO2max → 1–8 min)
  const legend = el("power-curve-block-legend");
  if (blockMode && blocks?.length) {
    const legendItems = [];
    for (const block of blocks) {
      const bd = buildCurveData(block.curve);
      if (!bd.length) continue;
      const color = BLOCK_COLORS[block.key] || CHART_THEME.gold;
      // auf die Standard-Labels der Hauptkurve mappen
      const pts = bd
        .map((d) => {
          const idx = curveData.findIndex((c) => c.secs === d.secs);
          return idx >= 0 ? [xScale(idx), yScale(toVal(d.watts))] : null;
        })
        .filter(Boolean);
      if (pts.length < 2) continue;
      const line = svgEl("path", {
        d: pathD(pts),
        fill: "none",
        stroke: color,
        "stroke-width": "2",
        "stroke-linejoin": "round",
        opacity: "0.9",
      });
      line.addEventListener("mouseenter", (e) =>
        Tooltip.show(
          e,
          `<div class="tt">${block.label}</div><div class="td">${fmtDateFull(block.from)} – ${fmtDateFull(block.to)}</div>`
        )
      );
      line.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(line);
      legendItems.push(
        `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div> ${block.label}</div>`
      );
    }
    if (legend) {
      legend.innerHTML =
        legendItems.join("") +
        `<div class="legend-item"><div class="legend-dot" style="background:${CHART_THEME.ink.ink};opacity:0.4"></div> Gesamt</div>`;
      legend.classList.remove("hidden");
    }
  } else if (legend) {
    legend.classList.add("hidden");
  }
  if (blockMode) {
    // X-Labels auch ohne Punkt-/Hover-Layer zeichnen
    curveData.forEach((d, i) => {
      xLabel(svg, xScale(i), H - pad.b + 16, d.label);
    });
    return; // Punkte/Wert-Labels/Hover nur in der Gesamtansicht
  }

  // Hover-Ebene (§4.1): eigene <g>, wird bei jedem Hover geleert und neu
  // befüllt statt den Chart neu zu zeichnen. Familie 4 nimmt NICHT an der
  // Chart-übergreifenden Fadenkreuz-Kopplung teil (§7.3) — crosshair()/
  // hoverDot() werden hier rein lokal als Zeichenprimitiven verwendet, ohne
  // state/chart-view.js, genau wie das Vergleichsmodus-Hover in pmc.js.
  // "Nächstgelegener Punkt" ist hier trivial erfüllt: jeder Datenpunkt ist
  // bereits ein diskreter Dauer-Bucket, es gibt nichts dazwischen zu
  // interpolieren.
  const hoverLayer = svgEl("g", {});
  svg.appendChild(hoverLayer);

  // Punkte + Labels
  curveData.forEach((d, i) => {
    const v = toVal(d.watts);
    const x = xScale(i),
      y = yScale(v);
    const above = i % 2 === 0;
    const overFtp = ftp && d.watts > ftp;

    svg.appendChild(
      svgEl("circle", {
        cx: x,
        cy: y,
        r: "5",
        fill: CHART_THEME.ss,
        stroke: CHART_THEME.bg,
        "stroke-width": "1.5",
      })
    );

    // Hit-Fläche (größerer Radius) trägt Hover + Tooltip — zeigt immer
    // beide Einheiten
    const hit = svgEl("circle", { cx: x, cy: y, r: "10", fill: "transparent" });
    hit.style.cursor = "pointer";
    const wkgInfo = weight ? `${(d.watts / weight).toFixed(2)} W/kg` : "";
    hit.addEventListener("mouseenter", (e) => {
      hoverLayer.textContent = "";
      crosshair(hoverLayer, { x, top: pad.t, bottom: pad.t + ch });
      hoverDot(hoverLayer, x, y, CHART_THEME.ss);
      Tooltip.show(
        e,
        `
      <div class="tt">${d.label}</div>
      <div class="tv">${Math.round(d.watts)} W${wkgInfo ? " · " + wkgInfo : ""}</div>
      <div class="td">${ftp ? `${(d.watts / ftp).toFixed(2)}× FTP · ${overFtp ? "über FTP" : "unter FTP"}` : ""}</div>
    `
      );
    });
    hit.addEventListener("mouseleave", () => {
      hoverLayer.textContent = "";
      Tooltip.hide();
    });
    svg.appendChild(hit);

    // Wert-Label abwechselnd oben/unten
    const labelY = above ? y - 10 : y + 18;
    const clampedY = Math.max(pad.t + 10, Math.min(pad.t + ch - 4, labelY));
    const wl = svgEl("text", {
      x,
      y: clampedY,
      "text-anchor": "middle",
      fill: CHART_THEME.ss,
      "font-size": "9",
      "font-weight": "600",
    });
    wl.textContent = fmtVal(v);
    svg.appendChild(wl);

    // X-Label
    xLabel(svg, x, H - pad.b + 16, d.label);
  });
}

/* ── Kadenz-Coach: Statuszeile über dem Kadenz-Chart ─────────── */
export function renderCadenceCoach(containerId, coach, target) {
  const wrap = el(containerId);
  if (!wrap) return;
  if (!coach) {
    wrap.innerHTML = "";
    return;
  }

  const deltaCls = coach.delta == null ? "" : coach.delta >= 0 ? "coach-up" : "coach-down";
  const goalReached = coach.recentAvg >= target;

  wrap.innerHTML = `
    <div class="coach-chip">
      <span class="coach-label">Ø zuletzt</span>
      <span class="coach-val" style="color:${goalReached ? "var(--z1)" : "var(--gold)"}">${coach.recentAvg} RPM</span>
      ${coach.delta != null ? `<span class="coach-sub ${deltaCls}">${coach.delta > 0 ? "+" : ""}${coach.delta} seit Start</span>` : ""}
    </div>
    <div class="coach-chip">
      <span class="coach-label">Ziel ≥${target}</span>
      <span class="coach-val">${coach.shareAbove}%</span>
      <span class="coach-sub">${coach.nAbove}/${coach.nTotal} Fahrten</span>
    </div>
    <div class="coach-chip coach-types">
      <span class="coach-label">Nach Typ</span>
      ${coach.perType.map((t) => `<span class="coach-type">${t.typ} <b style="color:${t.avg >= target ? "var(--z1)" : "var(--dim)"}">${t.avg}</b></span>`).join("")}
    </div>`;
}
