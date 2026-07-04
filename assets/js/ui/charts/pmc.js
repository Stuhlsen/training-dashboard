/* ============================================================
   UI/CHARTS/PMC.JS — CTL-Progression, PMC, Aerobe Entkopplung
   Rendering only — Interpolation/TSB kommt aus core/pmc.js.
   ============================================================ */

import { fmt } from "../../core/format.js";
import { interpolateCtl, tsbOf } from "../../core/pmc.js";
import { el, svgEl, Tooltip } from "../dom.js";
import { gridLines, xLabel, autoScrollRight } from "./base.js";

/* ── CTL-Progression mit Interpolation ───────────────────────── */
export function renderCTL(svgId, rides) {
  const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
  const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (!sorted.some(r => r.ctl != null)) return;

  // Fehlende CTL-Werte linear interpolieren (core/pmc.js)
  const data = interpolateCtl(sorted);

  const W = 780, H = 210, pad = { l: 50, r: 16, t: 16, b: 36 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const maxV = Math.max(...data.map(d => d.ctlVal)) * 1.12;

  gridLines(svg, W, H, pad, maxV);

  const pts = data.map((d, i) => ({
    x: pad.l + i / Math.max(data.length - 1, 1) * cw,
    y: pad.t + ch - d.ctlVal / maxV * ch,
    d,
  }));

  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id: "ctl-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.appendChild(svgEl("stop", { offset: "0%",   "stop-color": "#e08a3c", "stop-opacity": "0.2" }));
  grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#e08a3c", "stop-opacity": "0"   }));
  defs.appendChild(grad); svg.appendChild(defs);

  const areaPath = "M" + pts.map(p => `${p.x},${p.y}`).join(" L") +
    ` L${pts[pts.length - 1].x},${pad.t + ch} L${pts[0].x},${pad.t + ch} Z`;
  svg.appendChild(svgEl("path", { d: areaPath, fill: "url(#ctl-grad)" }));
  svg.appendChild(svgEl("polyline", {
    fill: "none", stroke: "#e08a3c", "stroke-width": "2",
    points: pts.map(p => `${p.x},${p.y}`).join(" "),
  }));

  const step = Math.max(1, Math.floor(pts.length / 20));
  pts.forEach((p, i) => {
    if (i % step !== 0 && i !== pts.length - 1) return;
    const interp = p.d.interpolated;
    const c = svgEl("circle", {
      cx: p.x, cy: p.y,
      r: interp ? "2" : "3",
      fill: interp ? "#5f6878" : "#e08a3c",
      stroke: "#0b0e13", "stroke-width": "1.5",
      opacity: interp ? "0.5" : "1",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", e => Tooltip.show(e, `
      <div class="tt">${p.d.dateShort}${p.d.week ? " · " + p.d.week : ""}</div>
      <div class="tv">CTL ${Math.round(p.d.ctlVal)}${interp ? " (interpoliert)" : ""}</div>
      <div class="td">${p.d.name}</div>
    `));
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  const ls = Math.max(1, Math.floor(pts.length / 10));
  pts.forEach((p, i) => {
    if (i % ls === 0 || i === pts.length - 1)
      xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
  });
}

/* ── PMC — Performance Management Chart ──────────────────────── */
export function renderPMC(svgId, rides) {
  const data = rides.filter(r => r.ctl != null && r.atl != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

  const PPT = 18;
  const W = Math.max(780, data.length * PPT + 100);
  const H = 250, pad = { l: 50, r: 50, t: 20, b: 36 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);

  const ctlVals = data.map(d => d.ctl);
  const atlVals = data.map(d => d.atl);
  const tsbVals = data.map(d => tsbOf(d));

  const maxCA = Math.max(...ctlVals, ...atlVals) * 1.1;
  const minTSB = Math.min(...tsbVals) - 5;
  const maxTSB = Math.max(...tsbVals) + 5;

  const tsbY = (v) => pad.t + ch - (v - minTSB) / (maxTSB - minTSB) * ch;
  const caY = (v) => pad.t + ch - v / maxCA * ch;

  gridLines(svg, W, H, pad, Math.round(maxCA), 0);

  // Plan divider
  const plan2Start = data.findIndex(d => d.plan === "Plan 2");
  if (plan2Start > 0) {
    const divX = pad.l + (plan2Start - 0.5) / Math.max(data.length - 1, 1) * cw;
    svg.appendChild(svgEl("rect", {
      x: divX - 0.5, y: pad.t, width: 1, height: ch,
      fill: "#5f6878", opacity: "0.6",
    }));
    const lbl1 = svgEl("text", { x: divX - 8, y: pad.t + 12, "text-anchor": "end", fill: "#5f6878", "font-size": "9", "font-weight": "600" });
    lbl1.textContent = "Plan 1"; svg.appendChild(lbl1);
    const lbl2 = svgEl("text", { x: divX + 8, y: pad.t + 12, "text-anchor": "start", fill: "#e08a3c", "font-size": "9", "font-weight": "600" });
    lbl2.textContent = "Plan 2"; svg.appendChild(lbl2);
  }

  // TSB sweet spot zone (-10 to -30)
  const zoneTop = tsbY(-10);
  const zoneBot = tsbY(-30);
  svg.appendChild(svgEl("rect", {
    x: pad.l, y: Math.min(zoneTop, zoneBot),
    width: cw, height: Math.abs(zoneBot - zoneTop),
    fill: "#4a9a6e", opacity: "0.06", rx: "2",
  }));
  const zoneLabel = svgEl("text", {
    x: pad.l + 4, y: Math.min(zoneTop, zoneBot) + 10,
    fill: "#4a9a6e", "font-size": "8", opacity: "0.5",
  });
  zoneLabel.textContent = "Sweet Spot Zone";
  svg.appendChild(zoneLabel);

  // TSB zero line
  const tsbZeroY = tsbY(0);
  svg.appendChild(svgEl("line", {
    x1: pad.l, y1: tsbZeroY, x2: W - pad.r, y2: tsbZeroY,
    stroke: "#4a9a6e", "stroke-width": "0.5", "stroke-dasharray": "4,4", opacity: "0.4",
  }));

  // TSB area fill
  const tsbPtsRaw = data.map((d, i) => ({
    x: pad.l + i / Math.max(data.length - 1, 1) * cw,
    v: tsbOf(d),
  }));
  const posPath = `M${tsbPtsRaw[0].x},${tsbZeroY} ` +
    tsbPtsRaw.map(p => `L${p.x},${p.v >= 0 ? tsbY(p.v) : tsbZeroY}`).join(" ") +
    ` L${tsbPtsRaw[tsbPtsRaw.length - 1].x},${tsbZeroY} Z`;
  svg.appendChild(svgEl("path", { d: posPath, fill: "#4a9a6e", opacity: "0.1" }));
  const negPath = `M${tsbPtsRaw[0].x},${tsbZeroY} ` +
    tsbPtsRaw.map(p => `L${p.x},${p.v < 0 ? tsbY(p.v) : tsbZeroY}`).join(" ") +
    ` L${tsbPtsRaw[tsbPtsRaw.length - 1].x},${tsbZeroY} Z`;
  svg.appendChild(svgEl("path", { d: negPath, fill: "#d94f4f", opacity: "0.08" }));

  // CTL area fill
  const ctlAreaPath = `M${pad.l},${caY(0)} ` +
    data.map((d, i) => `L${pad.l + i / Math.max(data.length - 1, 1) * cw},${caY(d.ctl)}`).join(" ") +
    ` L${pad.l + (data.length - 1) / Math.max(data.length - 1, 1) * cw},${caY(0)} Z`;
  svg.appendChild(svgEl("path", { d: ctlAreaPath, fill: "#4a7fa8", opacity: "0.08" }));

  // Lines
  const line = (color, width, yMap, dash) => {
    const pts = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      y: yMap(d),
      d,
    }));
    const attrs = {
      fill: "none", stroke: color, "stroke-width": width,
      points: pts.map(p => `${p.x},${p.y}`).join(" "),
    };
    if (dash) attrs["stroke-dasharray"] = dash;
    svg.appendChild(svgEl("polyline", attrs));
    return pts;
  };

  const ctlPts = line("#4a7fa8", "2.5", d => caY(d.ctl));
  line("#d94f4f", "1.2", d => caY(d.atl), "4,2");
  line("#4a9a6e", "1.5", d => tsbY(tsbOf(d)));

  // TSB right axis labels
  for (let i = 0; i <= 4; i++) {
    const val = Math.round(minTSB + (maxTSB - minTSB) / 4 * (4 - i));
    const y = pad.t + ch / 4 * i;
    const t = svgEl("text", { x: W - pad.r + 6, y: y + 4, fill: "#4a9a6e", "font-size": "9" });
    t.textContent = val;
    svg.appendChild(t);
  }

  // Dots on CTL
  const step = Math.max(1, Math.floor(ctlPts.length / 25));
  ctlPts.forEach((p, i) => {
    if (i % step !== 0 && i !== ctlPts.length - 1) return;
    const tsb = p.d.tsb != null ? p.d.tsb : Math.round((p.d.ctl - p.d.atl) * 10) / 10;
    const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: "#4a7fa8", stroke: "#0b0e13", "stroke-width": "1.5" });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", e => Tooltip.show(e, `
      <div class="tt">${p.d.dateShort}${p.d.week ? " · " + p.d.week : ""}</div>
      <div class="tv">CTL ${fmt(p.d.ctl)} · ATL ${fmt(p.d.atl)} · TSB ${fmt(tsb)}</div>
      <div class="td">${p.d.name}</div>
    `));
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  // Note
  const lastCTL = data[data.length - 1];
  const noteEl = el("pmc-note");
  if (noteEl && lastCTL) {
    const tsb = lastCTL.tsb != null ? lastCTL.tsb : Math.round((lastCTL.ctl - lastCTL.atl) * 10) / 10;
    noteEl.textContent = `Aktuell: CTL ${fmt(lastCTL.ctl)} · ATL ${fmt(lastCTL.atl)} · TSB ${fmt(tsb)}`;
  }

  // X labels
  const ls = Math.max(1, Math.floor(ctlPts.length / Math.max(12, Math.floor(W / 70))));
  ctlPts.forEach((p, i) => {
    if (i % ls === 0 || i === ctlPts.length - 1)
      xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
  });

  // Auto-scroll to right
  autoScrollRight(svg, W, el("pmc-scroll"));
}

/* ── Aerobe Entkopplung (Decoupling) ─────────────────────────── */
export function renderDecoupling(svgId, rides) {
  const data = rides.filter(r => r.decoupling != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

  const W = 780, H = 200, pad = { l: 50, r: 16, t: 16, b: 36 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const maxV = Math.max(Math.max(...data.map(d => Math.abs(d.decoupling))), 10) + 3;
  const minV = 0;

  gridLines(svg, W, H, pad, maxV, minV);

  // Target line at 5%
  const targetY = pad.t + ch - (5 - minV) / (maxV - minV) * ch;
  svg.appendChild(svgEl("line", {
    x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
    stroke: "#4a9a6e", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.6",
  }));
  const tgt = svgEl("text", { x: W - pad.r + 4, y: targetY + 4, fill: "#4a9a6e", "font-size": "9" });
  tgt.textContent = "5%";
  svg.appendChild(tgt);

  const pts = data.map((d, i) => ({
    x: pad.l + i / Math.max(data.length - 1, 1) * cw,
    y: pad.t + ch - (Math.abs(d.decoupling) - minV) / (maxV - minV) * ch,
    d,
  }));

  svg.appendChild(svgEl("polyline", {
    fill: "none", stroke: "#e08a3c", "stroke-width": "1.8",
    points: pts.map(p => `${p.x},${p.y}`).join(" "),
  }));

  pts.forEach((p) => {
    const color = Math.abs(p.d.decoupling) <= 5 ? "#4a9a6e" : Math.abs(p.d.decoupling) <= 10 ? "#c9a84c" : "#d94f4f";
    const c = svgEl("circle", { cx: p.x, cy: p.y, r: "4", fill: color, stroke: "#0b0e13", "stroke-width": "1.5" });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", e => Tooltip.show(e, `
      <div class="tt">${p.d.dateShort}${p.d.week ? " · " + p.d.week : ""}</div>
      <div class="tv">${fmt(Math.abs(p.d.decoupling))}%</div>
      <div class="td">${p.d.name}</div>
    `));
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });

  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1)
      xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
  });
}
