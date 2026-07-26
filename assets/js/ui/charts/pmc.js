/* ============================================================
   UI/CHARTS/PMC.JS — CTL-Progression, PMC, Aerobe Entkopplung
   Rendering only — Interpolation/TSB kommt aus core/pmc.js.
   ============================================================ */

import { fmt, fmtDate, fmtDateFull, localISODate, addDaysISO } from "../../core/format.js";
import { interpolateCtl, tsbOf, currentPmc, projectPmc } from "../../core/pmc.js";
import { densifyDays } from "../../core/days.js";
import { el, svgEl, Tooltip } from "../dom.js";
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
} from "./base.js";
import {
  loadForAthlete as loadChartView,
  getState as getChartViewState,
  setWindow,
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

export function renderPMC(svgId, rides, projection, events, athleteId) {
  const svg = el(svgId);
  if (!svg) return;

  const sorted = (rides || [])
    .filter((r) => r.ctl != null && r.atl != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const draw = () => {
    svg.innerHTML = "";
    if (!sorted.length && !projection?.days?.length) return;

    const today = localISODate();
    const from = addDaysISO(today, -90);
    const lastRideISO = sorted.length ? sorted[sorted.length - 1].dateISO : today;
    const rawTo = projection?.horizonEnd ?? lastRideISO;
    const to = rawTo < from ? from : rawTo;
    const skeleton = densifyDays(from, to);
    if (skeleton.length < 2) return;

    loadChartView(athleteId, { ws: 0, we: skeleton.length - 1 });
    setWindow(0, skeleton.length - 1); // Schritt 0: kein Brush, immer volle Breite
    const { ws, we } = getChartViewState();

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

    const knownVals = [...ctlVals, ...atlVals].filter((v) => v != null);
    const maxCA = knownVals.length ? Math.max(...knownVals) * 1.1 : 10;
    const knownTsb = tsbVals.filter((v) => v != null);
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
    for (let i = Math.max(seamIdx, 0); i <= we; i++) {
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
      const histSeg = segmentsFor(vals, ws, seamIdx >= 0 ? seamIdx : we, scale, caY);
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
        const projSeg = segmentsFor(vals, seamIdx, we, scale, caY);
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

    // TSB — eigene Achse (Punkte statt TSS/Tag), kein Glow (Sekundärserie in
    // diesem Chart, G8: Glow höchstens auf CTL/ATL).
    const tsbHist = segmentsFor(tsbVals, ws, seamIdx >= 0 ? seamIdx : we, scale, tsbY);
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
      const tsbProj = segmentsFor(tsbVals, seamIdx, we, scale, tsbY);
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
    // Bereich, kein Legende-Fallback.
    const labelWindow = seamIdx >= 0 ? seamIdx : we;
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

    // Heute-Marke separat gezeichnet (X5) — nicht über pickLabelIndices' mustKeep.
    if (todayIdx >= 0) {
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
      if (evIdx >= 0) {
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
    const MIN_TICK_PX = 58;
    const todayX = todayIdx >= 0 ? scale.x(todayIdx) : null;
    const tickIdx = skeleton
      .map((s, i) => i)
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

    // Hover-Ebene (§4.1) — in Schritt 0 noch leer, Geometrie für Schritt 1/2
    // (Brush/Crosshair) am SVG-Knoten hinterlegt, damit spätere Schritte sie
    // ohne erneutes Zeichnen finden.
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
    };

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
      c.addEventListener("mouseenter", (e) =>
        Tooltip.show(
          e,
          `<div class="tt">${fmtDateFull(dateISO)}</div>
           <div class="tv">CTL ${fmt(ctlVals[i])} · ATL ${fmt(atlVals[i])} · TSB ${fmt(tsbVals[i])}</div>`
        )
      );
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    }

    // Note — TSB auf heute fortgeschrieben (s. core/pmc.js::currentPmc), sonst
    // widerspricht dieses "Aktuell" der Belastungsempfehlung nach Ruhetagen.
    const noteEl = el("pmc-note");
    const pmcNow = currentPmc(sorted, localISODate());
    if (noteEl && pmcNow) {
      const asOfNote =
        pmcNow.daysProjected > 0 ? ` (Stand ${fmtDate(pmcNow.asOfDate)}, fortgeschrieben)` : "";
      noteEl.textContent = `Aktuell: CTL ${fmt(pmcNow.ctl)} · ATL ${fmt(pmcNow.atl)} · TSB ${fmt(pmcNow.tsb)}${asOfNote}`;
    }
  };

  draw();

  // Gemessene Breite + ResizeObserver statt skaliertem viewBox (G7) — draw()
  // ist idempotent (svg.innerHTML wird am Anfang geleert). Alten Observer
  // trennen, bevor ein neuer registriert wird (renderPMC wird pro Athleten-
  // wechsel/renderAll erneut aufgerufen, sonst stapeln sich Observer auf
  // demselben Knoten).
  if (svg.__pmcResizeObserver) svg.__pmcResizeObserver.disconnect();
  const observer = new ResizeObserver(() => draw());
  observer.observe(svg);
  svg.__pmcResizeObserver = observer;
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
