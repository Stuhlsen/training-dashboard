/* ============================================================
   UI/CHARTS/WELLNESS.JS — Schlaf, HRV & Ruhepuls (Plan-Compare)
   Rendering only — Trend-Berechnung in core/stats.js.
   ============================================================ */

import { fmt, wrapText } from "../../core/format.js";
import { linearTrend } from "../../core/stats.js";
import { Data } from "../../state/data.js";
import { el, svgEl, Tooltip } from "../dom.js";
import { gridLines, xLabel, autoScrollRight } from "./base.js";

/* ── Schlaf — Dauer & Schlaf-HF ──────────────────────────────── */
export function renderSleep(svgId, wellness, ownPlan = true) {
  const data = wellness.filter(w => w.sleepHours != null || w.avgSleepingHR != null);
  const svg = el(svgId);
  if (!svg) return;
  if (!data.length) {
    svg.innerHTML = "";
    const t = svgEl("text", { x: 390, y: 100, "text-anchor": "middle", fill: "#5f6878", "font-size": "12" });
    t.textContent = ownPlan ? "Schlafdaten ab Plan 2 verfügbar" : "Keine Schlafdaten verfügbar";
    svg.appendChild(t);
    return;
  }
  svg.innerHTML = "";

  const PPT = 18;
  const W = Math.max(780, data.length * PPT + 100);
  const H = 200, pad = { l: 52, r: 52, t: 16, b: 36 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);

  const sleepVals = data.map(d => d.sleepHours).filter(Boolean);
  const hrVals = data.map(d => d.avgSleepingHR).filter(Boolean);
  const maxSleep = sleepVals.length ? Math.ceil(Math.max(...sleepVals) * 1.15) : 10;
  const minHR = hrVals.length ? Math.floor(Math.min(...hrVals) - 3) : 40;
  const maxHR = hrVals.length ? Math.ceil(Math.max(...hrVals) + 3) : 80;

  gridLines(svg, W, H, pad, maxSleep, 0, 4, true);

  const bw = Math.min(cw / data.length * 0.6, 20);
  const gap = cw / data.length;

  // Balken: Schlafdauer
  data.forEach((d, i) => {
    if (!d.sleepHours) return;
    const x = pad.l + i * gap + (gap - bw) / 2;
    const bh = Math.max(d.sleepHours / maxSleep * ch, 1);
    const y = pad.t + ch - bh;
    const color = d.sleepHours >= 7 ? "#4a7fa8" : d.sleepHours >= 6 ? "#c9a84c" : "#d94f4f";
    const rect = svgEl("rect", { x, y, width: bw, height: bh, rx: "2", fill: color, opacity: "0.75" });
    rect.style.cursor = "pointer";
    rect.addEventListener("mouseenter", e => {
      rect.setAttribute("opacity", "1");
      Tooltip.show(e, `
        <div class="tt">${d.dateShort}</div>
        <div class="tv">${d.sleepHours}h Schlaf${d.avgSleepingHR ? ` · ${d.avgSleepingHR} bpm` : ""}</div>
      `);
    });
    rect.addEventListener("mouseleave", () => { rect.setAttribute("opacity", "0.75"); Tooltip.hide(); });
    svg.appendChild(rect);
  });

  // 7h Ziel-Linie — Gold statt Blau (kein Overlap mit Balkenfarbe) — nur eigener Plan
  if (ownPlan) {
    const targetY = pad.t + ch - (7 / maxSleep * ch);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
      stroke: "#c9a84c", "stroke-width": "1", "stroke-dasharray": "5,3", opacity: "0.6",
    }));
    const tl = svgEl("text", { x: pad.l + 4, y: targetY - 4, fill: "#c9a84c", "font-size": "9", opacity: "0.9" });
    tl.textContent = "7h Ziel"; svg.appendChild(tl);
  }

  // Linke Y-Achse: saubere ganzzahlige Labels, genug Abstand
  const sleepStep = maxSleep <= 8 ? 2 : maxSleep <= 12 ? 3 : 4;
  for (let v = 0; v <= maxSleep; v += sleepStep) {
    const y = pad.t + ch - (v / maxSleep * ch);
    const t = svgEl("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", fill: "#5f6878", "font-size": "9" });
    t.textContent = v + "h"; svg.appendChild(t);
  }

  // Linie: Schlaf-HF (rechte Achse)
  if (hrVals.length) {
    const hrPts = data
      .filter(d => d.avgSleepingHR != null)
      .map(d => {
        const i = data.indexOf(d);
        return {
          x: pad.l + i * gap + gap / 2,
          y: pad.t + ch - (d.avgSleepingHR - minHR) / (maxHR - minHR) * ch,
          d,
        };
      });

    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#d94f4f", "stroke-width": "1.8",
      points: hrPts.map(p => `${p.x},${p.y}`).join(" "),
    }));

    hrPts.forEach(p => {
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: "#d94f4f", stroke: "#0b0e13", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort}</div>
        <div class="tv">${p.d.avgSleepingHR} bpm Schlaf-HF</div>
      `));
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });

    // Rechte Y-Achse: nur 4 Labels
    const hrStep = Math.ceil((maxHR - minHR) / 4);
    for (let v = minHR; v <= maxHR; v += hrStep) {
      const y = pad.t + ch - ((v - minHR) / (maxHR - minHR) * ch);
      const t = svgEl("text", { x: W - pad.r + 6, y: y + 4, fill: "#d94f4f", "font-size": "9" });
      t.textContent = v; svg.appendChild(t);
    }
  }

  // X Labels mit Mindestabstand
  let lastLabelX = -999;
  data.forEach((d, i) => {
    const x = pad.l + i * gap + gap / 2;
    const isLast = i === data.length - 1;
    if (x - lastLabelX >= 55 || isLast) {
      xLabel(svg, x, H - pad.b + 14, d.dateShort);
      lastLabelX = x;
    }
  });

  // Auto-scroll
  const scrollContainer = svg.parentElement;
  if (scrollContainer && scrollContainer.classList.contains("chart-scroll")) {
    autoScrollRight(svg, W, scrollContainer);
  }
}

/* ── HRV / Ruhepuls — durchgehende Linie mit Plan-Divider ────── */
function renderHrvRhfChart(svgId, data, color1, color2, unit, field, methodNote) {
  const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

  const W = 780, H = 250, pad = { l: 50, r: 16, t: 28, b: 36 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const allVals = data.map(d => d[field]);
  const minV = Math.max(0, Math.min(...allVals) - 5);
  const maxV = Math.max(...allVals) + 5;

  gridLines(svg, W, H, pad, maxV, minV);

  const pts = data.map((d, i) => ({
    x: pad.l + i / Math.max(data.length - 1, 1) * cw,
    y: pad.t + ch - (d[field] - minV) / (maxV - minV) * ch,
    d,
  }));

  // Drei Segmente: Plan 1 / Übergang W0 / Plan 2
  const w0Start = data.findIndex(d => d.week === "P2-W0");
  const w1Start = data.findIndex(d => d.week && d.week.startsWith("P2-") && d.week !== "P2-W0");
  const plan2Start = w0Start >= 0 ? w0Start : data.findIndex(d => d.plan === "Plan 2");
  const hasW0 = w0Start >= 0 && w1Start > w0Start;
  const hasSplit = plan2Start > 0;

  const colorW0 = "#c9a84c";

  let seg1, segW0, seg2;
  if (hasW0) {
    seg1 = pts.slice(0, w0Start + 1);
    segW0 = pts.slice(w0Start, w1Start + 1);
    seg2 = pts.slice(w1Start);
  } else if (hasSplit) {
    seg1 = pts.slice(0, plan2Start + 1);
    segW0 = [];
    seg2 = pts.slice(plan2Start);
  } else {
    seg1 = pts; segW0 = []; seg2 = [];
  }

  const drawSegment = (segment, color, dashed) => {
    if (segment.length < 1) return;
    if (segment.length === 1) {
      svg.appendChild(svgEl("circle", { cx: segment[0].x, cy: segment[0].y, r: "3.5", fill: color }));
      return;
    }
    const areaPath = `M${segment[0].x},${H - pad.b} ` +
      segment.map(p => `L${p.x},${p.y}`).join(" ") +
      ` L${segment[segment.length - 1].x},${H - pad.b} Z`;
    svg.appendChild(svgEl("path", { d: areaPath, fill: color, opacity: dashed ? "0.05" : "0.08" }));
    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: color, "stroke-width": "1.8",
      "stroke-dasharray": dashed ? "5,4" : "none",
      points: segment.map(p => `${p.x},${p.y}`).join(" "),
    }));
  };

  drawSegment(seg1, color1, false);
  if (hasW0) drawSegment(segW0, colorW0, true);
  if (seg2.length) drawSegment(seg2, color2, false);

  // Getrennte Trendlinien je Segment (Plan 1 und Plan 2 — W0 zu kurz für eigenen Trend)
  const drawTrend = (segment) => {
    const trend = linearTrend(segment);
    if (!trend) return;
    const { slope, intercept } = trend;
    const n = segment.length;
    svg.appendChild(svgEl("line", {
      x1: segment[0].x, y1: slope * segment[0].x + intercept,
      x2: segment[n - 1].x, y2: slope * segment[n - 1].x + intercept,
      stroke: "#4a9a6e", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.7",
    }));
  };
  drawTrend(pts.slice(0, plan2Start > 0 ? plan2Start : pts.length));
  if (seg2.length >= 3) drawTrend(seg2);

  // Dots — Farbe je Segment
  const step = Math.max(1, Math.floor(pts.length / 24));
  pts.forEach((p, i) => {
    if (i % step !== 0 && i !== pts.length - 1) return;
    const dotColor = p.d.week === "P2-W0" ? colorW0 : p.d.plan === "Plan 2" ? color2 : color1;
    const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3.5", fill: dotColor, stroke: "#0b0e13", "stroke-width": "1.5" });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", e => Tooltip.show(e, `
      <div class="tt">${p.d.dateShort} · ${p.d.week ? p.d.week + " · " : ""}${p.d.plan && p.d.plan !== "Vergleich" ? p.d.plan : ""}</div>
      <div class="tv">${p.d[field]} ${unit}</div>
      <div class="td">${p.d.name}</div>
    `));
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  // X labels
  const labelStep = Math.max(1, Math.floor(pts.length / 8));
  pts.forEach((p, i) => {
    if (i % labelStep === 0 || i === pts.length - 1 || i === plan2Start)
      xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
  });

  // Divider-Linien: Plan1→W0 und W0→Plan2 (falls W0 existiert), sonst nur ein Divider
  const diviAt = (idx, label1, label2, c1, c2) => {
    const divX = pad.l + (idx - 0.5) / Math.max(data.length - 1, 1) * cw;
    svg.appendChild(svgEl("rect", {
      x: divX - 1, y: pad.t, width: 2, height: ch,
      fill: "#5f6878", opacity: "0.6",
    }));
    if (label1) {
      const lbl1 = svgEl("text", { x: divX - 8, y: pad.t + 12, "text-anchor": "end", fill: c1, "font-size": "9", "font-weight": "600" });
      lbl1.textContent = label1; svg.appendChild(lbl1);
    }
    if (label2) {
      const lbl2 = svgEl("text", { x: divX + 8, y: pad.t + 12, "text-anchor": "start", fill: c2, "font-size": "9", "font-weight": "600" });
      lbl2.textContent = label2; svg.appendChild(lbl2);
    }
    return divX;
  };

  if (hasW0) {
    diviAt(w0Start, "← Plan 1", "W0 →", color1, colorW0);
    diviAt(w1Start, "← W0", "Plan 2 →", colorW0, color2);
  } else if (hasSplit) {
    diviAt(plan2Start, "← Plan 1", "Plan 2 →", color1, color2);
  }

  // Methodenwechsel-Hinweis — umgebrochen, unter der X-Achse
  if (methodNote && hasSplit) {
    const lines = wrapText(methodNote, 92);
    lines.forEach((line, i) => {
      const noteLbl = svgEl("text", {
        x: W / 2, y: H - 6 + i * 11, "text-anchor": "middle",
        fill: "#c9a84c", "font-size": "9", "font-weight": "600",
      });
      noteLbl.textContent = line;
      svg.appendChild(noteLbl);
    });
  }

  // Mean lines getrennt je Segment (Plan 1 / Plan 2, W0 ausgelassen — zu kurz für aussagekräftigen Mittelwert)
  const meanFor = (arr, color, fromIdx, toIdx, labelAbove) => {
    if (!arr.length) return;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const meanY = pad.t + ch - (mean - minV) / (maxV - minV) * ch;
    const x1 = pad.l + fromIdx / Math.max(data.length - 1, 1) * cw;
    const x2 = pad.l + toIdx / Math.max(data.length - 1, 1) * cw;
    svg.appendChild(svgEl("line", {
      x1, y1: meanY, x2, y2: meanY,
      stroke: color, "stroke-width": "0.8", "stroke-dasharray": "3,4", opacity: "0.4",
    }));
    const meanLabel = svgEl("text", {
      x: x2 - 2, y: labelAbove ? meanY - 5 : meanY + 12,
      "text-anchor": "end", fill: color, "font-size": "9", opacity: "0.7",
    });
    meanLabel.textContent = `Ø ${fmt(mean, 0)}`;
    svg.appendChild(meanLabel);
  };

  const p1EndIdx = hasW0 ? w0Start : (hasSplit ? plan2Start : data.length - 1);
  const p2StartIdx = hasW0 ? w1Start : plan2Start;
  const vals1 = data.slice(0, p1EndIdx + 1).map(d => d[field]);
  meanFor(vals1, color1, 0, p1EndIdx, true);
  if (hasSplit) {
    const vals2 = data.slice(p2StartIdx).map(d => d[field]);
    // Label-Kollision vermeiden: wenn Plan-1-Mittelwert nah am Plan-2-Mittelwert liegt, Plan-2-Label tiefer setzen
    const mean1 = vals1.reduce((s, v) => s + v, 0) / vals1.length;
    const mean2 = vals2.reduce((s, v) => s + v, 0) / vals2.length;
    const closeMeans = Math.abs(mean1 - mean2) < (maxV - minV) * 0.08;
    meanFor(vals2, color2, p2StartIdx, data.length - 1, !closeMeans);
  }
}

/* ── HRV Plan Compare ────────────────────────────────────────── */
export function renderPlanCompareHRV(rides) {
  const ownPlan = rides.some(r => r.week);
  let data;
  if (ownPlan) {
    data = rides.filter(r => r.hrv != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  } else {
    // Kein eigener Plan — direkt aus Wellness lesen (alle Tage, nicht nur Fahrtdaten)
    data = (Data.wellness || [])
      .filter(w => w.hrv != null)
      .map(w => ({
        dateISO:   w.dateISO || w.date,
        dateShort: w.dateShort || (w.date ? w.date.slice(5).replace("-", ".") : ""),
        week:      null,
        plan:      "Vergleich",
        name:      "",
        hrv:       w.hrv,
      }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }
  renderHrvRhfChart("chart-hrv-p1", data, "#7c5cbf", "#e08a3c", "ms", "hrv",
    ownPlan ? "⚠ Methodenwechsel: Plan 1 = RMSSD (Apple Health), Plan 2 = SDNN Schlafschnitt (intervals.icu) — Niveau nicht direkt vergleichbar, Trend pro Segment getrennt berechnet." : null);
}

/* ── RHF Plan Compare ────────────────────────────────────────── */
export function renderPlanCompareRHF(rides) {
  const ownPlan = rides.some(r => r.week);
  let data;
  if (ownPlan) {
    data = rides.filter(r => r.ruhepuls != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  } else {
    // Kein eigener Plan — direkt aus Wellness lesen (alle Tage, nicht nur Fahrtdaten)
    data = (Data.wellness || [])
      .filter(w => w.restingHR != null)
      .map(w => ({
        dateISO:   w.dateISO || w.date,
        dateShort: w.dateShort || (w.date ? w.date.slice(5).replace("-", ".") : ""),
        week:      null,
        plan:      "Vergleich",
        name:      "",
        ruhepuls:  w.restingHR,
      }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }
  renderHrvRhfChart("chart-rhf-p1", data, "#d94f4f", "#e08a3c", "bpm", "ruhepuls", null);
}
