/* ============================================================
   UI/CHARTS/BASE.JS — Gemeinsame SVG-Helfer aller Charts
   ============================================================ */

import { svgEl } from "../dom.js";

/* K5-Chart-Palette — zentrale Referenz für alle SVG-Farben.
   Die Chart-Module verwenden diese Werte (teils als Literale in
   Template-Strings gespiegelt — bei Palettenwechsel: Werte hier
   UND per Suchen/Ersetzen in ui/charts/* anpassen, Mapping siehe
   AGENTS.md → Design). Entspricht den CSS-Tokens in main.css. */
export const CHART_THEME = {
  bg: "#0b0e13",        // Dot-Stroke / Chart-Hintergrund (--bg)
  grid: "#232a37",      // Grid-Linien
  axis: "#2a3140",      // Achsen
  label: "#5f6878",     // Achsen-Labels (--dim2)
  labelSoft: "#97a1b3", // sekundäre Labels (--dim)
  text: "#e2e7ef",      // helle Wert-Labels (--text)
  z1: "#4a9a6e",        // Grün / Recovery (--z1)
  z2: "#4a7fa8",        // Blau / Grundlage, Plan 1 (--z2)
  ss: "#e08a3c",        // Sweet Spot / Akzent, Plan 2 (--ss)
  thr: "#d94f4f",       // Rot / Schwelle (--thr)
  vo2: "#a24ad0",       // VO2max (--vo2)
  gold: "#c9a84c",      // Übergang / Hinweise (--gold)
};

/** Horizontale Grid-Linien mit Y-Achsen-Labels */
export function gridLines(svg, W, H, pad, maxV, minV = 0, steps = 4, noLabels = false) {
  for (let i = 0; i <= steps; i++) {
    const y = pad.t + ((H - pad.t - pad.b) / steps) * i;
    const val = Math.round(maxV - ((maxV - minV) / steps) * i);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: y, x2: W - pad.r, y2: y,
      stroke: "#232a37", "stroke-width": "1",
    }));
    if (!noLabels) {
      const t = svgEl("text", {
        x: pad.l - 6, y: y + 4,
        "text-anchor": "end", fill: "#5f6878", "font-size": "10",
      });
      t.textContent = val;
      svg.appendChild(t);
    }
  }
}

/** Zentriertes X-Achsen-Label */
export function xLabel(svg, x, y, text) {
  const t = svgEl("text", {
    x, y, "text-anchor": "middle", fill: "#5f6878", "font-size": "10",
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
