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
  bg: "#0b0e13", // Dot-Stroke / Chart-Hintergrund (--bg)
  grid: "#232a37", // Grid-Linien
  axis: "#2a3140", // Achsen
  label: "#5f6878", // Achsen-Labels (--dim2)
  labelSoft: "#97a1b3", // sekundäre Labels (--dim)
  text: "#e2e7ef", // helle Wert-Labels (--text)
  z1: "#4a9a6e", // Grün / Recovery (--z1)
  z2: "#4a7fa8", // Blau / Grundlage, Plan 1 (--z2)
  ss: "#e08a3c", // Sweet Spot / Akzent, Plan 2 (--ss)
  thr: "#d94f4f", // Rot / Schwelle (--thr)
  vo2: "#a24ad0", // VO2max (--vo2)
  gold: "#c9a84c", // Übergang / Hinweise (--gold)
};

/** Horizontale Grid-Linien mit Y-Achsen-Labels */
export function gridLines(svg, W, H, pad, maxV, minV = 0, steps = 4, noLabels = false) {
  for (let i = 0; i <= steps; i++) {
    const y = pad.t + ((H - pad.t - pad.b) / steps) * i;
    const val = Math.round(maxV - ((maxV - minV) / steps) * i);
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
    if (!noLabels) {
      const t = svgEl("text", {
        x: pad.l - 6,
        y: y + 4,
        "text-anchor": "end",
        fill: "#5f6878",
        "font-size": "10",
      });
      t.textContent = val;
      svg.appendChild(t);
    }
  }
}

/** Zentriertes X-Achsen-Label */
/* ── Label-Layout (pure Funktionen, getestet in tests/chart-layout) ──
   Charts dürfen X-/Wert-Labels nie pro Datenpunkt ohne Ausdünnung
   zeichnen — bei Athlet 2 (viele Kalenderwochen) überlappen sie sonst. */

/**
 * Wählt Label-Indizes mit Mindestabstand (px). Greedy von links,
 * der LETZTE Punkt ist immer dabei — Kandidaten, die mit ihm
 * kollidieren würden, werden übersprungen.
 * @param {number[]} xs Aufsteigende X-Positionen (Balken-/Punktmitten)
 * @param {number} [minPx]
 * @returns {Set<number>}
 */
export function pickLabelIndices(xs, minPx = 38) {
  const n = xs.length;
  const picked = new Set();
  if (!n) return picked;
  const lastX = xs[n - 1];
  let prev = -Infinity;
  for (let i = 0; i < n - 1; i++) {
    if (xs[i] - prev >= minPx && lastX - xs[i] >= minPx) {
      picked.add(i);
      prev = xs[i];
    }
  }
  picked.add(n - 1);
  return picked;
}

/**
 * Kompakte Anzeige-Labels für Wochen-Keys. Kalenderwochen verlieren
 * das Jahrespräfix ("2026-KW27" → "KW27"); bei Jahreswechsel innerhalb
 * der Reihe wird das neue Jahr einmal markiert ("KW01 ’27").
 * Monats-Keys werden zu "MM/JJ", Plan-Wochen bleiben unverändert.
 * @param {string[]} weeks
 * @returns {string[]}
 */
export function weekDisplayLabels(weeks) {
  let prevYear = null;
  return (weeks || []).map((w) => {
    const kw = /^(\d{4})-KW(\d{2})$/.exec(w || "");
    if (kw) {
      const [, year, num] = kw;
      const label = prevYear && year !== prevYear ? `KW${num} ’${year.slice(2)}` : `KW${num}`;
      prevYear = year;
      return label;
    }
    const mo = /^(\d{4})-(\d{2})$/.exec(w || "");
    if (mo) return `${mo[2]}/${mo[1].slice(2)}`;
    return w;
  });
}

export function xLabel(svg, x, y, text) {
  const t = svgEl("text", {
    x,
    y,
    "text-anchor": "middle",
    fill: "#5f6878",
    "font-size": "10",
  });
  t.textContent = text;
  svg.appendChild(t);
}

/**
 * Achsentitel (Einheit/Bedeutung) — X unten mittig, Y-Achsen links/rechts
 * rotiert. Einheitliche Konvention für alle Charts (klein, gedämpfte
 * Farbe wie die übrigen Achsen-Labels) statt handgestrickt pro Chart.
 * Nutzt den vorhandenen Rand (pad) — Charts mit sehr knappem pad.b/pad.l/
 * pad.r sollten das beim Aufruf berücksichtigen.
 * @param {SVGElement} svg
 * @param {number} W @param {number} H
 * @param {{l:number,r:number,t:number,b:number}} pad
 * @param {{x?:string, yLeft?:string, yRight?:string}} labels
 */
export function axisTitles(svg, W, H, pad, { x, yLeft, yRight } = {}) {
  const midY = pad.t + (H - pad.t - pad.b) / 2;
  if (x) {
    const t = svgEl("text", {
      x: pad.l + (W - pad.l - pad.r) / 2,
      y: H - 2,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "9",
    });
    t.textContent = x;
    svg.appendChild(t);
  }
  if (yLeft) {
    const t = svgEl("text", {
      x: 10,
      y: midY,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "9",
      transform: `rotate(-90, 10, ${midY})`,
    });
    t.textContent = yLeft;
    svg.appendChild(t);
  }
  if (yRight) {
    const t = svgEl("text", {
      x: W - 8,
      y: midY,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "9",
      transform: `rotate(90, ${W - 8}, ${midY})`,
    });
    t.textContent = yRight;
    svg.appendChild(t);
  }
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

/* ── Breite scrollbarer Charts (.chart-scroll + .chart-wide) ────
   Diese Charts setzen ihre SVG-Breite datengetrieben (mehr Datenpunkte
   → breiter, damit alles Platz hat) mit einem festen Minimum von 780px.
   Auf breiten Desktop-Karten (bis zu ~1200px) ist das Minimum oft
   kleiner als die Karte selbst → Lücke rechts, obwohl die Karte laut
   Design die volle Breite füllen soll (Mobile ist unauffällig, weil
   dort ohnehin gescrollt wird). #app wird vor jedem Chart-Rendering
   sichtbar geschaltet (siehe app.js::renderAll) und ist NIE per
   Tab-Wechsel versteckt — anders als die Chart-Karte selbst, die beim
   allerersten Rendern noch im unsichtbaren Charts-Tab stecken kann
   (clientWidth 0). Darum hier über #app schätzen statt den Chart-
   Container selbst zu messen. */
const CHART_BOX_PADDING = 36; // .chart-box padding: 18px links + rechts

/**
 * Verfügbare Kartenbreite für scrollbare Charts (Floor statt fixer 780px),
 * damit die Karte auf breiten Screens gefüllt wird statt eine Lücke zu
 * lassen — Mehr-Daten-Fall bleibt unverändert (Math.max mit dem Aufrufer).
 * @param {number} [fallback] Minimum, falls #app nicht messbar ist
 * @returns {number}
 */
export function cardContentWidth(fallback = 780) {
  const app = document.getElementById("app");
  if (!app) return fallback;
  const w = app.clientWidth - CHART_BOX_PADDING;
  return w > fallback ? w : fallback;
}
