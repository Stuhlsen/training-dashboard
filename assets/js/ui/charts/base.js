/* ============================================================
   UI/CHARTS/BASE.JS — Gemeinsame SVG-Helfer aller Charts
   ============================================================ */

import { svgEl } from "../dom.js";

/** Horizontale Grid-Linien mit Y-Achsen-Labels */
export function gridLines(svg, W, H, pad, maxV, minV = 0, steps = 4, noLabels = false) {
  for (let i = 0; i <= steps; i++) {
    const y = pad.t + ((H - pad.t - pad.b) / steps) * i;
    const val = Math.round(maxV - ((maxV - minV) / steps) * i);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: y, x2: W - pad.r, y2: y,
      stroke: "#2e2923", "stroke-width": "1",
    }));
    if (!noLabels) {
      const t = svgEl("text", {
        x: pad.l - 6, y: y + 4,
        "text-anchor": "end", fill: "#6b6158", "font-size": "10",
      });
      t.textContent = val;
      svg.appendChild(t);
    }
  }
}

/** Zentriertes X-Achsen-Label */
export function xLabel(svg, x, y, text) {
  const t = svgEl("text", {
    x, y, "text-anchor": "middle", fill: "#6b6158", "font-size": "10",
  });
  t.textContent = text;
  svg.appendChild(t);
}

/** Horizontales Auto-Scroll für breite Charts: Container scrollbar machen
 *  und ganz nach rechts (neueste Daten) scrollen */
export function autoScrollRight(svg, W, container) {
  const scrollContainer = container || svg.parentElement;
  if (scrollContainer) {
    scrollContainer.style.overflowX = "auto";
    svg.style.minWidth = W + "px";
    requestAnimationFrame(() => {
      scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    });
  }
}
