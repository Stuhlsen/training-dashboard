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

  // Rollenfarben (docs/chart-grundlagen.md §2.1, G2) — zusätzlich zu den
  // Zonenfarben oben, ersetzt sie nicht. Zonenfarben bleiben für Kartenrahmen
  // der Plankarten und die Leistungsskala in Gebrauch; Rollenfarben benennen
  // die FUNKTION einer Serie im jeweiligen Chart (Rolle→Serie ist pro Chart
  // zu bestimmen, nicht global).
  role: {
    primary: "#4a9eff", // Hauptmetrik (z.B. CTL)
    secondary: "#e0736b", // Nebenmetrik (z.B. ATL)
    positive: "#6fc48c", // Form/TSB im unkritischen Bereich
    status: "#e8b73f", // Zustand, Schwellenüberschreitung, Events
  },
  surface: {
    plate: "#141619", // Label-Plättchen im Chart (haloLabel), opacity .9
    tooltip: "rgba(24,27,33,0.96)",
  },
  ink: {
    ink: "#f0f2f5", // Zahlen/Überschriften
    soft: "#9aa0a8", // Fließtext
    label: "#6b7178", // Achsen-/Kachel-Labels
    faint: "#565b62", // Achseneinheiten, Randnotizen
  },
};

/**
 * Zweitserien-Konvention (docs/chart-grundlagen.md §2.2, docs/phase-5-
 * konzept-explorer.md §7.1): eine über die Basisserie gelegte zweite Kurve
 * (What-if-Szenario, Schritt 3; Vergleichsmodus, Schritt 4) wird gestrichelt
 * und mit reduzierter Deckkraft gezeichnet — dieselbe Rollenfarbe wie die
 * Basisserie, keine eigene Farbe. Als SVG-Attributwerte gereicht (nicht als
 * Klasse — Charts sind reines SVG ohne gemeinsames Stylesheet-Scoping),
 * damit ein Aufrufer sie direkt in `svgEl("path", {...})` einstreuen kann.
 */
export const SERIES_STYLE = {
  secondary: {
    "stroke-dasharray": "4,3",
    opacity: "0.55",
  },
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

/**
 * Schätzt, ob ein Label (font-size 9, Standard-Zeichenbreite) in eine
 * gegebene Segmentbreite passt. Genutzt um Phasen-/Segment-Labels (z. B.
 * "Übergang" im HRV/RHF-Chart) zu unterdrücken statt sie mit dem
 * Nachbarsegment überlappen zu lassen, wenn das Segment (z. B. eine kurze
 * Übergangswoche) dafür zu schmal ist.
 * @param {number} spanPx Verfügbare Breite in px
 * @param {string} text
 * @param {number} [charPx] geschätzte Breite je Zeichen bei font-size 9
 * @returns {boolean}
 */
export function fitsLabel(spanPx, text, charPx = 5.4) {
  return spanPx >= text.length * charPx + 8;
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

/**
 * Index-basierte x-Skala über ein Fenster [ws, we] (Phase 5, Schritt 0 —
 * docs/phase-5-konzept-explorer.md §2.2). Arbeitet auf Tagesindizes eines
 * dichten Tagesgerüsts (core/days.js::densifyDays), nicht auf Zeitstempeln.
 * `width` ist die bereits um beide Ränder reduzierte Plotbreite (Aufrufer
 * zieht `pad.l`/`pad.r` vorher ab) — `padLeft` verschiebt nur den Ursprung.
 * `invert()` extrapoliert linear über [ws, we] hinaus (keine Klemmung).
 * @param {{ws:number, we:number, padLeft:number, width:number}} args
 * @returns {{x:(i:number)=>number, invert:(px:number)=>number}}
 */
export function makeIndexScale({ ws, we, padLeft, width }) {
  const span = Math.max(1, we - ws);
  return {
    x: (i) => padLeft + ((i - ws) / span) * width,
    invert: (px) => ws + ((px - padLeft) / width) * span,
  };
}

/**
 * d-String aus Punktpaaren — ersetzt das `points`-Attribut von `<polyline>`.
 * Baut zusätzlich geschlossene Flächen (`pathD(pts) + " L… Z"`) und Bänder.
 * @param {Array<[number, number]>} points
 * @returns {string}
 */
export function pathD(points) {
  if (!points.length) return "";
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
}

/**
 * Label-Plättchen (docs/chart-grundlagen.md §3.2): abgerundetes Rechteck in
 * `CHART_THEME.surface.plate` (fill-opacity .9) hinter dem Text — Direkt-
 * beschriftung bleibt so lesbar, auch über Linien/Flächen. Breite wird NICHT
 * geschätzt (`text.length * 6.4` bricht bei Umlauten/anderen Schriftgrößen),
 * sondern per `getComputedTextLength()` nach dem Einfügen gemessen.
 * @param {SVGElement} svg
 * @param {number} x @param {number} y
 * @param {string} text
 * @param {string} fill Textfarbe (i.d.R. die Serienfarbe)
 * @param {string|number} [weight]
 */
export function haloLabel(svg, x, y, text, fill, weight = 600) {
  const t = svgEl("text", {
    x,
    y,
    "text-anchor": "middle",
    fill,
    "font-size": "12",
    "font-weight": String(weight),
  });
  t.textContent = text;
  svg.appendChild(t);
  const tw = t.getComputedTextLength ? t.getComputedTextLength() : text.length * 6.4;
  const plate = svgEl("rect", {
    x: x - tw / 2 - 5,
    y: y - 12,
    width: tw + 10,
    height: 16,
    rx: 4,
    fill: CHART_THEME.surface.plate,
    "fill-opacity": "0.9",
  });
  svg.insertBefore(plate, t);
  return t;
}

/**
 * Findet die flachste Stelle einer Kurve zwischen zwei relativen Positionen
 * — für Direktbeschriftung ohne Legende (docs/chart-grundlagen.md §3.2).
 * Sucht den Index mit der geringsten lokalen Steigung |y[i+1]-y[i]|.
 * @param {Array<number|null>} values Serie in Skelettlänge (Tagesindex)
 * @param {number} ws Fensteranfang (Tagesindex)
 * @param {number} we Fensterende (Tagesindex)
 * @param {(v:number)=>number} yOf Wert → px
 * @param {number} [from] relative Startposition im Fenster (0..1)
 * @param {number} [to] relative Endposition im Fenster (0..1)
 * @returns {number|null} Tagesindex der flachsten Stelle, oder null ohne Kandidaten
 */
export function flattestIndex(values, ws, we, yOf, from = 0, to = 1) {
  const lo = Math.round(ws + (we - ws) * from);
  const hi = Math.round(ws + (we - ws) * to);
  let bestIdx = null;
  let bestSlope = Infinity;
  for (let i = Math.max(lo, ws); i < Math.min(hi, we); i++) {
    const a = values[i];
    const b = values[i + 1];
    if (a == null || b == null) continue;
    const slope = Math.abs(yOf(b) - yOf(a));
    if (slope < bestSlope) {
      bestSlope = slope;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * `feDropShadow`-Filter für Glow auf Hauptserien-Linien (docs/chart-
 * grundlagen.md §6, G8). `id` MUSS pro Chart-Instanz namensräumt werden —
 * SVG-Filter-IDs sind dokumentweit, und die App zeigt viele Charts auf einer
 * Seite. Kein Default: ein Aufrufer ohne eigene, eindeutige ID bekommt einen
 * Fehler statt eines möglicherweise kollidierenden generischen Filters.
 * @param {SVGElement} defs
 * @param {string} id Eindeutig pro Chart-Instanz, z.B. "glow-pmc-ctl"
 * @param {string} color
 * @param {number} [stdDeviation]
 * @returns {string} `url(#id)`
 */
export function glowFilter(defs, id, color, stdDeviation = 2.5) {
  if (!id) throw new Error("glowFilter: id ist pflicht (pro Chart-Instanz namensräumen)");
  const filter = svgEl("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" });
  filter.appendChild(
    svgEl("feDropShadow", {
      dx: "0",
      dy: "0",
      stdDeviation,
      "flood-color": color,
      "flood-opacity": "0.55",
    })
  );
  defs.appendChild(filter);
  return `url(#${id})`;
}

/**
 * Abgestuftes Gitter (docs/chart-grundlagen.md §2.4): wird nach unten hin
 * heller (`rgba(255,255,255, 0.04 + k*0.008)`), hält den oberen Chartbereich
 * ruhig, wo die Kurven meist liegen. Ersetzt `gridLines()`s feste Linie dort,
 * wo ein Chart auf die neue Optik umgestellt wird — `gridLines()` selbst
 * bleibt für Bestandscharts unverändert.
 * @param {SVGElement} svg
 * @param {{x0:number, x1:number, yOf:(v:number)=>number, lo:number, hi:number, steps?:number}} args
 */
export function gradedGrid(svg, { x0, x1, yOf, lo, hi, steps = 4 }) {
  for (let k = 0; k <= steps; k++) {
    const v = lo + ((hi - lo) / steps) * k;
    const y = yOf(v);
    svg.appendChild(
      svgEl("line", {
        x1: x0,
        y1: y,
        x2: x1,
        y2: y,
        stroke: `rgba(255,255,255,${0.04 + k * 0.008})`,
        "stroke-width": "1",
      })
    );
  }
}

/**
 * Achseneinheit über der obersten Achsenzahl, rechtsbündig, in `faint`
 * (docs/chart-grundlagen.md §3.4, G4). Kein rotierter Achsentitel.
 * @param {SVGElement} svg
 * @param {{x:number, y:number, text:string}} args
 */
export function axisUnit(svg, { x, y, text }) {
  const t = svgEl("text", {
    x,
    y,
    "text-anchor": "end",
    fill: CHART_THEME.ink.faint,
    "font-size": "9",
  });
  t.textContent = text;
  svg.appendChild(t);
}

/* ── Cursor-Sync (Phase 5, Schritt 2, Teil B — docs/phase-5-konzept-
   explorer.md §2.2/§3, docs/chart-grundlagen.md §4.1/§4.2) ───────────
   Reine Zeichenfunktionen, kein State: der Aufrufer liest den gehoverten
   Tagesindex aus state/chart-view.js und übergibt hier nur noch fertige
   px-Koordinaten. Beide hängen an einer leeren Hover-`<g>` (Geometrie-
   Objekt jedes Charts, z.B. `svg.__pmcGeometry.hoverLayer`), die vor jedem
   Aufruf geleert wird — das Chart selbst wird dafür nie neu gezeichnet. */

/**
 * Vertikale Fadenkreuz-Linie an einer festen x-Position.
 * @param {SVGElement} parent i.d.R. die Hover-`<g>` eines Charts
 * @param {{x:number, top:number, bottom:number}} args
 */
export function crosshair(parent, { x, top, bottom }) {
  parent.appendChild(
    svgEl("line", {
      x1: x,
      y1: top,
      x2: x,
      y2: bottom,
      stroke: CHART_THEME.ink.label,
      "stroke-width": "1",
      "stroke-dasharray": "3,3",
    })
  );
}

/**
 * Doppelkreis-Markierung am Fadenkreuz-Schnittpunkt einer Serie (chart-
 * grundlagen.md §4.2): Halo (r 9, fill-opacity .16, Serienfarbe) plus
 * Punkt (r 4.2, Kartenfarbe, 2,4px Rand in Serienfarbe) — der Punkt selbst
 * bekommt NICHT die Serienfarbe als Füllung, sonst verschwimmt er mit dem
 * Halo dahinter.
 * @param {SVGElement} parent
 * @param {number} x @param {number} y
 * @param {string} color Serienfarbe
 */
export function hoverDot(parent, x, y, color) {
  parent.appendChild(
    svgEl("circle", { cx: x, cy: y, r: "9", fill: color, "fill-opacity": "0.16" })
  );
  parent.appendChild(
    svgEl("circle", {
      cx: x,
      cy: y,
      r: "4.2",
      fill: CHART_THEME.bg,
      stroke: color,
      "stroke-width": "2.4",
    })
  );
}

/* ── Zeitraum-Brushing (Phase 5, Schritt 1 — docs/phase-5-konzept-
   explorer.md §4, docs/chart-grundlagen.md §4.4) ─────────────────
   presetWindow()/brushHitTest()/nextBrushWindow() sind reine
   Indexarithmetik (kein DOM) — getestet in tests/chart-layout.test.js,
   analog zu makeIndexScale()/pickLabelIndices() im selben File (X3:
   Konsistenz mit dem etablierten Ort schlägt formale core/-Reinheit).
   brushOverlay() ist das DOM-Gegenstück (Zeichnen + Pointer-Bindung) und
   bewusst ungetestet im Unit-Sinn — wie plan-drag.js: die REGELN sind
   pure+getestet, das ZEICHNEN/BINDEN nicht. */

/**
 * Fenster-Indizes für die Brush-Presets (30/90/365 Tage, Plan 2, Alles).
 * "30"/"90"/"365" enden immer am Zukunftshorizont (totalWe) — konsistent
 * mit dem bisherigen festen Default (heute-90 .. horizonEnd), nur die
 * Fensterbreite wird wählbar. "plan2" ohne Daten liefert `null`, damit der
 * Aufrufer den Button datengetrieben ausblenden kann (Athlet 2 hat keine
 * Plan-2-Rides).
 * @param {"30"|"90"|"365"|"plan2"|"all"} preset
 * @param {{totalWs:number, totalWe:number, todayIdx:number,
 *   plan2FromIdx?:number|null, plan2ToIdx?:number|null, minW?:number}} ctx
 * @returns {{ws:number, we:number}|null}
 */
export function presetWindow(preset, ctx) {
  const {
    totalWs,
    totalWe,
    todayIdx,
    plan2FromIdx = null,
    plan2ToIdx = null,
    minW = 7,
  } = ctx;
  const anchor = todayIdx != null && todayIdx >= 0 ? todayIdx : totalWe;
  const trailing = (days) => ({ ws: Math.max(totalWs, anchor - days), we: totalWe });
  switch (preset) {
    case "30":
      return trailing(30);
    case "90":
      return trailing(90);
    case "365":
      return trailing(365);
    case "all":
      return { ws: totalWs, we: totalWe };
    case "plan2": {
      if (plan2FromIdx == null || plan2ToIdx == null) return null;
      let ws = Math.max(totalWs, plan2FromIdx);
      let we = Math.min(totalWe, plan2ToIdx);
      if (we - ws < minW) we = Math.min(totalWe, ws + minW);
      return { ws, we };
    }
    default:
      return null;
  }
}

/**
 * Trifft im Indexraum, welcher Teil des Brush-Fensters unter einem
 * Zeiger-Index liegt. `tolIdx` ist die Grifftoleranz bereits in
 * Indexeinheiten (Umrechnung aus 11px liegt beim Aufrufer, s. brushOverlay).
 * @param {number} idx @param {number} ws @param {number} we @param {number} tolIdx
 * @returns {"left"|"right"|"pan"|"outside"}
 */
export function brushHitTest(idx, ws, we, tolIdx) {
  if (Math.abs(idx - ws) <= tolIdx) return "left";
  if (Math.abs(idx - we) <= tolIdx) return "right";
  if (idx > ws && idx < we) return "pan";
  return "outside";
}

/**
 * Nächstes Fenster für einen laufenden Brush-Drag. `mode` "left"/"right"
 * verschieben nur den jeweiligen Rand (MIN_W-Klemmung gegen den anderen
 * Rand), "pan" verschiebt beide Ränder gleich (Fensterbreite bleibt
 * konstant, an den Gesamtgrenzen geklemmt statt abgeschnitten).
 * @param {"left"|"right"|"pan"} mode
 * @param {{idx:number, startIdx:number, startWs:number, startWe:number,
 *   totalWs:number, totalWe:number, minW?:number}} args
 * @returns {{ws:number, we:number}}
 */
export function nextBrushWindow(mode, args) {
  const { idx, startIdx, startWs, startWe, totalWs, totalWe, minW = 7 } = args;
  const delta = idx - startIdx;
  if (mode === "left") {
    const ws = Math.min(Math.max(totalWs, startWs + delta), startWe - minW);
    return { ws, we: startWe };
  }
  if (mode === "right") {
    const we = Math.max(Math.min(totalWe, startWe + delta), startWs + minW);
    return { ws: startWs, we };
  }
  const width = startWe - startWs;
  let ws = startWs + delta;
  let we = startWe + delta;
  if (ws < totalWs) {
    ws = totalWs;
    we = ws + width;
  }
  if (we > totalWe) {
    we = totalWe;
    ws = we - width;
  }
  return { ws, we };
}

/**
 * Übersichtsleiste: zeichnet Griffe, Auswahl-Rechteck und dimmt den
 * Außenbereich, bindet den Pointer-Handler EINMAL pro <svg>-Knoten
 * (`svg.__brushBound`-Guard, wie `btn._bound` in ui/chart-visibility.js —
 * sonst stapeln sich Listener bei jedem Redraw). Der Handler liest bei
 * jedem Pointer-Event den zuletzt hinterlegten Konfigurationsstand
 * (`svg.__brushConfig`, hier bei jedem Aufruf aktualisiert) statt eine
 * veraltete Closure zu behalten — ein Redraw MITTEN in einem aktiven Drag
 * (z. B. durch den ResizeObserver) ändert dadurch nur die Skala, mit der
 * der NÄCHSTE Event neu umgerechnet wird. Der Drag-Zustand selbst lebt in
 * Tagesindizes, nicht in Pixeln, und bleibt darum über einen Skalenwechsel
 * hinweg konsistent (kein Sprung).
 * @param {SVGElement} svg
 * @param {{scale:{x:(i:number)=>number, invert:(px:number)=>number},
 *   pad:{l:number,t:number}, H:number, plotW:number,
 *   totalWs:number, totalWe:number, ws:number, we:number, minW?:number,
 *   onChange:(ws:number, we:number, meta:{final:boolean})=>void}} config
 */
export function brushOverlay(svg, config) {
  const { scale, pad, H, plotW, totalWs, totalWe, ws, we } = config;
  svg.__brushConfig = config;

  const top = pad.t;
  const bottom = H - pad.t;
  const xWs = scale.x(ws);
  const xWe = scale.x(we);
  const xLo = pad.l;
  const xHi = pad.l + plotW;

  // Außenbereich abdunkeln (Sparkline bleibt darunter sichtbar, nur gedimmt)
  if (xWs > xLo) {
    svg.appendChild(
      svgEl("rect", {
        x: xLo,
        y: top,
        width: xWs - xLo,
        height: bottom - top,
        fill: "#000",
        opacity: "0.45",
        style: "cursor:pointer",
      })
    );
  }
  if (xHi > xWe) {
    svg.appendChild(
      svgEl("rect", {
        x: xWe,
        y: top,
        width: xHi - xWe,
        height: bottom - top,
        fill: "#000",
        opacity: "0.45",
        style: "cursor:pointer",
      })
    );
  }

  // Auswahlfenster — Rand + Pan-Fläche
  svg.appendChild(
    svgEl("rect", {
      x: xWs,
      y: top,
      width: Math.max(0, xWe - xWs),
      height: bottom - top,
      fill: CHART_THEME.role.primary,
      "fill-opacity": "0.08",
      stroke: CHART_THEME.role.primary,
      "stroke-width": "1",
      style: "cursor:grab",
    })
  );

  // Griffe: schmaler sichtbarer Balken + breitere unsichtbare Hit-/Cursor-Fläche
  const GRIP_VISUAL_W = 3;
  const GRIP_HIT_PX = 11;
  for (const x of [xWs, xWe]) {
    svg.appendChild(
      svgEl("rect", {
        x: x - GRIP_HIT_PX,
        y: top,
        width: GRIP_HIT_PX * 2,
        height: bottom - top,
        fill: "transparent",
        style: "cursor:ew-resize",
      })
    );
    svg.appendChild(
      svgEl("rect", {
        x: x - GRIP_VISUAL_W / 2,
        y: top,
        width: GRIP_VISUAL_W,
        height: bottom - top,
        rx: "1.5",
        fill: CHART_THEME.role.primary,
      })
    );
  }

  if (!svg.__brushBound) {
    svg.__brushBound = true;
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (event) => _brushPointerDown(svg, event));
    svg.addEventListener("pointermove", (event) => _brushPointerMove(svg, event));
    svg.addEventListener("pointerup", (event) => _brushPointerUp(svg, event));
    svg.addEventListener("pointercancel", (event) => _brushPointerUp(svg, event));
  }
}

function _pointerIndex(svg, cfg, event) {
  const rect = svg.getBoundingClientRect();
  return cfg.scale.invert(event.clientX - rect.left);
}

function _brushPointerDown(svg, event) {
  if (event.button !== 0) return;
  const cfg = svg.__brushConfig;
  if (!cfg) return;
  const idx = _pointerIndex(svg, cfg, event);
  const tolIdx = Math.max(4, Math.round((11 / cfg.plotW) * (cfg.totalWe - cfg.totalWs)));
  const hit = brushHitTest(idx, cfg.ws, cfg.we, tolIdx);

  let mode = hit === "outside" ? "pan" : hit;
  let ws = cfg.ws;
  let we = cfg.we;
  if (hit === "outside") {
    const width = cfg.we - cfg.ws;
    ws = Math.min(Math.max(cfg.totalWs, idx - width / 2), cfg.totalWe - width);
    we = ws + width;
    cfg.onChange(Math.round(ws), Math.round(we), { final: false });
  }

  svg.__brushDrag = { mode, startIdx: idx, startWs: ws, startWe: we, lastWs: ws, lastWe: we };
  svg.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function _brushPointerMove(svg, event) {
  const drag = svg.__brushDrag;
  const cfg = svg.__brushConfig;
  if (!drag || !cfg) return;
  const idx = _pointerIndex(svg, cfg, event);
  const { ws, we } = nextBrushWindow(drag.mode, {
    idx,
    startIdx: drag.startIdx,
    startWs: drag.startWs,
    startWe: drag.startWe,
    totalWs: cfg.totalWs,
    totalWe: cfg.totalWe,
    minW: cfg.minW,
  });
  drag.lastWs = Math.round(ws);
  drag.lastWe = Math.round(we);
  cfg.onChange(drag.lastWs, drag.lastWe, { final: false });
}

function _brushPointerUp(svg, event) {
  const drag = svg.__brushDrag;
  svg.__brushDrag = null;
  if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  const cfg = svg.__brushConfig;
  if (!drag || !cfg) return;
  cfg.onChange(drag.lastWs, drag.lastWe, { final: true });
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
