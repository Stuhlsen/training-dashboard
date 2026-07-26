/* ============================================================
   UI/CHARTS/EXPLORER.JS — Explorer-Hauptchart (Phase 5, Schritt 0)
   Strukturell nach renderFtpForecast (ui/charts/pmc.js) — bislang der
   einzige Chart mit kontinuierlicher Zeitachse: Historie durchgezogen,
   Prognose gestrichelt fortgesetzt, Heute-Marke separat gezeichnet (X5).
   Neu ist die Achse selbst: ein dichtes Tagesgerüst (core/days.js) mit
   Indexskala (ui/charts/base.js::makeIndexScale) statt einer Zeitstempel-
   skala (docs/phase-5-konzept-explorer.md §2.2).

   Bewusst NICHT hier (s. Plan, docs/chart-grundlagen.md §7.4): kein Brush,
   kein Crosshair, kein geteilter HTML-Tooltip, kein path()/halo()/flat()/
   glowDefs(), kein ResizeObserver — das ist ein eigener, separat geplanter
   Schritt. Dieser Chart nutzt bewusst noch CHART_THEME/gridLines()/Tooltip
   aus dem Bestand. */

import { fmtDate } from "../../core/format.js";
import { alignToDays, fillGaps } from "../../core/days.js";
import { el, svgEl, Tooltip } from "../dom.js";
import {
  gridLines,
  xLabel,
  pickLabelIndices,
  axisTitles,
  makeIndexScale,
  CHART_THEME,
} from "./base.js";

/** Montage + Monatserste als Tick-Kandidaten (Kalenderpositionen, keine
 *  Datenpunkte) — Ausdünnung übernimmt pickLabelIndices() (AGENTS.md). */
function calendarTickIndices(days) {
  const idx = [];
  days.forEach((iso, i) => {
    const d = new Date(`${iso}T00:00:00`);
    if (d.getDay() === 1 || d.getDate() === 1) idx.push(i);
  });
  return idx;
}

function drawSeries(svg, scale, yOf, vals, days, color, todayIdx, label, tooltipUnit) {
  const n = vals.length;
  const splitAt = todayIdx >= 0 ? todayIdx : n - 1;

  // vals kann trotz fillGaps() noch durchgehend null sein, wenn die Serie
  // KEINEN einzigen bekannten Wert enthält (z.B. Athlet ganz ohne CTL-Daten
  // im gewählten Bereich) — solche Punkte werden übersprungen statt NaN in
  // die Polyline zu schreiben.
  const histPts = vals
    .slice(0, splitAt + 1)
    .map((v, i) => (v != null ? { x: scale.x(i), y: yOf(v) } : null))
    .filter(Boolean);
  if (histPts.length > 1) {
    svg.appendChild(
      svgEl("polyline", {
        fill: "none",
        stroke: color,
        "stroke-width": "2",
        "stroke-linejoin": "round",
        points: histPts.map((p) => `${p.x},${p.y}`).join(" "),
      })
    );
  }

  if (todayIdx >= 0 && todayIdx < n - 1) {
    const projPts = vals
      .slice(todayIdx)
      .map((v, i) => (v != null ? { x: scale.x(todayIdx + i), y: yOf(v) } : null))
      .filter(Boolean);
    if (projPts.length > 1) {
      svg.appendChild(
        svgEl("polyline", {
          fill: "none",
          stroke: color,
          "stroke-width": "2",
          "stroke-dasharray": "5,4",
          "stroke-linejoin": "round",
          points: projPts.map((p) => `${p.x},${p.y}`).join(" "),
        })
      );
    }
  }

  // Punkte + Tooltip, ausgedünnt (wie renderFtpForecast/renderPMC)
  const step = Math.max(1, Math.floor(n / 30));
  vals.forEach((v, i) => {
    if (v == null) return;
    if (i % step !== 0 && i !== n - 1) return;
    const c = svgEl("circle", {
      cx: scale.x(i),
      cy: yOf(v),
      r: "2.6",
      fill: color,
      stroke: "#0b0e13",
      "stroke-width": "1.2",
    });
    c.style.cursor = "pointer";
    c.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `<div class="tt">${fmtDate(days[i])}</div><div class="tv">${label} ${v}${tooltipUnit}</div>`
      )
    );
    c.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(c);
  });
}

/**
 * @param {string} svgId
 * @param {string[]} days Dichtes Tagesgerüst (core/days.js::densifyDays)
 * @param {import("../../types.js").Ride[]} rides Ist-Fahrten mit ctl/atl (wie renderPMC gefiltert)
 * @param {{days: Array<{date:string, ctl:number, atl:number}>, asOf: string}|null} projection
 */
export function renderExplorerMain(svgId, days, rides, projection) {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";

  if (!days || days.length < 2) {
    const t = svgEl("text", {
      x: 390,
      y: 100,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "12",
    });
    t.textContent = "Noch nicht genug Daten für den Explorer";
    svg.appendChild(t);
    return;
  }

  const W = 780,
    H = 200,
    pad = { l: 46, r: 20, t: 18, b: 36 };
  const scale = makeIndexScale({ ws: 0, we: days.length - 1, pad, width: W });

  // Ist-Fahrten und Prognosetage auf dasselbe Tagesgerüst bringen (X7 — der
  // Explorer rechnet die Historie nie selbst nach). Data.rides enthält nur
  // Aktivitäten, keine Ruhetage — CTL/ATL sind aber ein kontinuierlicher
  // Zustand, der an einem Ruhetag existiert, nur eben ohne eigene Zeile.
  // Deshalb "gap" + fillGaps() statt "zero" (s. core/days.js::alignToDays-
  // Doku): 0 wäre an einem Ruhetag eine Falschaussage, nicht "keine Last".
  const ctlByDate = new Map();
  const atlByDate = new Map();
  for (const r of rides || []) {
    if (r.ctl != null) ctlByDate.set(r.dateISO, r.ctl);
    if (r.atl != null) atlByDate.set(r.dateISO, r.atl);
  }
  // Prognosetage (ab "heute", core/projection.js::projectLoad) liefern
  // echte Werte für jeden Tag im Horizont — kein Auffüllen nötig, die
  // überschreiben ggf. nur den asOf-bis-heute-Zwischenraum, für den es
  // weder eine Ist-Fahrt noch schon eine Prognose gibt.
  for (const d of projection?.days || []) {
    ctlByDate.set(d.date, d.ctl);
    atlByDate.set(d.date, d.atl);
  }

  const ctlVals = fillGaps(alignToDays(days, ctlByDate, "gap"));
  const atlVals = fillGaps(alignToDays(days, atlByDate, "gap"));
  const todayISO = projection?.days?.[0]?.date ?? null;
  const todayIdx = todayISO ? days.indexOf(todayISO) : -1;

  const maxV = Math.max(4, ...ctlVals, ...atlVals) * 1.1;
  const plotH = H - pad.t - pad.b;
  const yOf = (v) => pad.t + plotH - (v / maxV) * plotH;

  gridLines(svg, W, H, pad, Math.round(maxV), 0);
  axisTitles(svg, W, H, pad, { x: "Datum", yLeft: "TSS/Tag" });

  drawSeries(svg, scale, yOf, ctlVals, days, CHART_THEME.z2, todayIdx, "CTL", "");
  drawSeries(svg, scale, yOf, atlVals, days, CHART_THEME.thr, todayIdx, "ATL", "");

  // Heute-Marke separat gezeichnet (X5) — nicht über pickLabelIndices' mustKeep
  if (todayIdx >= 0) {
    const xt = scale.x(todayIdx);
    svg.appendChild(
      svgEl("line", {
        x1: xt,
        y1: pad.t,
        x2: xt,
        y2: H - pad.b,
        stroke: "#5f6878",
        "stroke-width": "1",
        "stroke-dasharray": "2,3",
      })
    );
    xLabel(svg, xt, H - pad.b + 14, `Heute ${fmtDate(todayISO)}`);
  }

  // Kalender-Ticks (Montage/Monatserste), ausgedünnt über pickLabelIndices.
  // Kandidaten zu nah an der separat gezeichneten Heute-Marke ausschließen
  // (sonst kollidiert z.B. "20.07" mit "Heute 26.07" bei enger Tagesdichte).
  const MIN_TICK_PX = 55;
  const todayX = todayIdx >= 0 ? scale.x(todayIdx) : null;
  const tickIdx = calendarTickIndices(days).filter(
    (i) => todayX == null || Math.abs(scale.x(i) - todayX) >= MIN_TICK_PX
  );
  const tickX = tickIdx.map((i) => scale.x(i));
  const picked = pickLabelIndices(tickX, MIN_TICK_PX);
  tickIdx.forEach((i, k) => {
    if (!picked.has(k)) return;
    xLabel(svg, scale.x(i), H - pad.b + 14, fmtDate(days[i]));
  });
  // Ersten Tag immer beschriften (renderFtpForecast-Muster) — pickLabelIndices()
  // garantiert nur den letzten Kandidaten, nicht den ersten.
  xLabel(svg, scale.x(0), H - pad.b + 14, fmtDate(days[0]));
}
