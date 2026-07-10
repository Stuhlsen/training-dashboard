/* ============================================================
   UI/CHARTS/TRAINING.JS — Volumen, Belastungswächter,
   Intensitätsverteilung, Konsistenzkalender, Wetter
   Rendering only — Berechnung in core/aggregate.js,
   core/loadguard.js, core/zones.js, core/consistency.js.
   ============================================================ */

import { fmt } from "../../core/format.js";
import { RAMP_OK_MIN, RAMP_OK_MAX, MONOTONY_WARN } from "../../core/loadguard.js";
import { LOW_INTENSITY_TARGET } from "../../core/zones.js";
import { rideWeekKey } from "../../core/aggregate.js";
import { CONFIG } from "../../state/config.js";
import { el, svgEl, Tooltip } from "../dom.js";
import { log } from "../log.js";
import {
  gridLines,
  xLabel,
  pickLabelIndices,
  weekDisplayLabels,
  autoScrollRight,
  cardContentWidth,
  axisTitles,
} from "./base.js";

/* ── Wöchentliches Volumen (Balken) ──────────────────────────── */
export function renderWeeklyVolume(svgId, weeklyData, onBarClick, period = "week") {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";
  if (!weeklyData.length) {
    svg.innerHTML = `<text x="390" y="135" text-anchor="middle" fill="#5f6878" font-size="11">Keine Wochendaten verfügbar</text>`;
    return;
  }
  const W = 780,
    H = 270,
    pad = { l: 50, r: 16, t: 16, b: 40 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const ownPlan = weeklyData.some((d) => d.phase != null);
  const TARGET_KM = 200;
  const maxKm =
    Math.max(...weeklyData.map((d) => d.km || 0), ownPlan ? TARGET_KM * 1.1 : 0) * 1.15 || 1;
  const bw = Math.min((cw / weeklyData.length) * 0.62, 52);
  const gap = cw / weeklyData.length;
  const labels = weekDisplayLabels(weeklyData.map((d) => d.week));
  const labelIdx = pickLabelIndices(
    weeklyData.map((_, i) => pad.l + i * gap + gap / 2),
    40
  );
  const denseValues = gap < 22; // Wert-Labels ausdünnen, sobald es eng wird

  gridLines(svg, W, H, pad, maxKm);
  axisTitles(svg, W, H, pad, { x: period === "month" ? "Monat" : "Woche", yLeft: "Distanz (km)" });

  // Zielzone nur sinnvoll für den eigenen Trainingsplan
  if (ownPlan) {
    const zoneTopY = pad.t + ch - (220 / maxKm) * ch;
    const zoneBotY = pad.t + ch - (180 / maxKm) * ch;
    svg.appendChild(
      svgEl("rect", {
        x: pad.l,
        y: zoneTopY,
        width: cw,
        height: zoneBotY - zoneTopY,
        fill: "#4a9a6e",
        opacity: "0.08",
      })
    );

    const targetY = pad.t + ch - (TARGET_KM / maxKm) * ch;
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: targetY,
        x2: W - pad.r,
        y2: targetY,
        stroke: "#4a9a6e",
        "stroke-width": "1",
        "stroke-dasharray": "5,3",
        opacity: "0.5",
      })
    );
    const tl = svgEl("text", {
      x: W - pad.r - 4,
      y: targetY - 4,
      "text-anchor": "end",
      fill: "#4a9a6e",
      "font-size": "9",
      opacity: "0.8",
    });
    tl.textContent = "Ziel 200 km";
    svg.appendChild(tl);
  }

  weeklyData.forEach((d, i) => {
    const x = pad.l + i * gap + (gap - bw) / 2;
    const bh = Math.max(((d.km || 0) / maxKm) * ch, 1);
    const y = pad.t + ch - bh;
    const color = ownPlan ? CONFIG.phaseColor(d.phase) : "#4a7fa8";

    const rect = svgEl("rect", {
      x,
      y,
      width: bw,
      height: bh,
      rx: "3",
      fill: color,
      opacity: "0.75",
    });
    rect.style.cursor = "pointer";
    rect.style.transition = "opacity 0.12s";
    rect.addEventListener("mouseenter", (e) => {
      rect.setAttribute("opacity", "1");
      Tooltip.show(
        e,
        `
        <div class="tt">${d.week || ""}</div>
        <div class="tv">${d.km} km</div>
        <div class="td">${d.rides} Fahrten · ${Math.round(d.min / 60)}h</div>
      `
      );
    });
    rect.addEventListener("mouseleave", () => {
      rect.setAttribute("opacity", "0.75");
      Tooltip.hide();
    });
    if (onBarClick) rect.addEventListener("click", () => onBarClick(d.week));
    svg.appendChild(rect);

    if (bh > 16 && (!denseValues || labelIdx.has(i))) {
      const vt = svgEl("text", {
        x: x + bw / 2,
        y: y - 4,
        "text-anchor": "middle",
        fill: "#97a1b3",
        "font-size": "9",
      });
      vt.textContent = Math.round(d.km);
      svg.appendChild(vt);
    }
    if (labelIdx.has(i)) xLabel(svg, x + bw / 2, H - pad.b + 14, labels[i]);
  });
}

/* ── Belastungswächter: TRIMP/TSS-Wochen + Ramp & Monotonie ──── */
export function renderTrimp(svgId, weeklyData, guard, period = "week") {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";
  if (!weeklyData.length) {
    svg.innerHTML = `<text x="390" y="115" text-anchor="middle" fill="#5f6878" font-size="11">Keine Wochendaten verfügbar</text>`;
    return;
  }
  const guardByWeek = {};
  if (guard) for (const g of guard) guardByWeek[g.week] = g;
  const hasGuard = guard && guard.some((g) => g.ramp != null || g.monotony != null);
  const W = 780,
    H = 230,
    pad = { l: 50, r: hasGuard ? 46 : 16, t: 16, b: 40 };
  const labels = weekDisplayLabels(weeklyData.map((d) => d.week));
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const maxV = Math.max(...weeklyData.map((d) => d.trimp || 0)) * 1.15 || 1;
  const bw = Math.min((cw / weeklyData.length) * 0.62, 52);
  const gap = cw / weeklyData.length;

  gridLines(svg, W, H, pad, maxV);
  axisTitles(svg, W, H, pad, {
    x: period === "month" ? "Monat" : "Woche",
    yLeft: "TRIMP",
    yRight: hasGuard ? "ΔCTL / Woche" : undefined,
  });

  // Absolute Farbskala basierend auf trainingswissenschaftlichen Grenzwerten
  const trimpColor = (v) => {
    if (v < 400) return "#4a9a6e"; // grün  — Erholung
    if (v < 600) return "#c9a84c"; // gelb  — moderat
    if (v < 900) return "#e08a3c"; // orange — hoch
    return "#d94f4f"; // rot   — sehr hoch
  };

  const labelIdx = pickLabelIndices(
    weeklyData.map((_, i) => pad.l + i * gap + gap / 2),
    40
  );
  const denseValues = gap < 22;
  weeklyData.forEach((d, i) => {
    const x = pad.l + i * gap + (gap - bw) / 2;
    const bh = Math.max(((d.trimp || 0) / maxV) * ch, 1);
    const y = pad.t + ch - bh;
    const color = trimpColor(d.trimp || 0);
    const g = guardByWeek[d.week];
    const rect = svgEl("rect", {
      x,
      y,
      width: bw,
      height: bh,
      rx: "3",
      fill: color,
      opacity: "0.82",
    });
    rect.style.cursor = "pointer";
    rect.style.transition = "opacity 0.12s";
    rect.addEventListener("mouseenter", (e) => {
      rect.setAttribute("opacity", "1");
      const guardInfo = g
        ? `
        <div class="td">Ramp ${g.ramp != null ? (g.ramp > 0 ? "+" : "") + fmt(g.ramp) + " CTL" : "–"} · Monotonie ${g.monotony != null ? fmt(g.monotony, 2) : "–"}</div>
        <div class="td">${g.risk === "high" ? "🔴 Überlastungsrisiko" : g.risk === "caution" ? "🟡 Erhöht — beobachten" : "🟢 Im sicheren Bereich"}</div>`
        : "";
      Tooltip.show(
        e,
        `
        <div class="tt">${d.week || ""}${d.plan && d.plan !== "Vergleich" ? " · " + d.plan : ""}</div>
        <div class="tv">TRIMP ${d.trimp}${g?.total ? " · TSS " + g.total : ""}</div>
        <div class="td">${d.rides} Fahrten · ${Math.round(d.min / 6) / 10}h</div>${guardInfo}
      `
      );
    });
    rect.addEventListener("mouseleave", () => {
      rect.setAttribute("opacity", "0.82");
      Tooltip.hide();
    });
    svg.appendChild(rect);

    // Monotonie-Warnmarker über dem Balken (Foster ≥ 2,0 = zu eintönig)
    if (g?.monotony != null && g.monotony >= MONOTONY_WARN) {
      const warn = svgEl("text", {
        x: x + bw / 2,
        y: y - 16,
        "text-anchor": "middle",
        "font-size": "11",
      });
      warn.textContent = "⚠";
      svg.appendChild(warn);
    } else if (bh > 15 && (!denseValues || labelIdx.has(i))) {
      // Dunkle Outline (paint-order: stroke hinter die Füllung) statt reiner
      // Flächenfarbe — sonst verschwindet z.B. ein rotes Wert-Label bei
      // Spitzenwochen im gleichfarbigen Ramp-Linienpunkt darüber/dahinter.
      const vt = svgEl("text", {
        x: x + bw / 2,
        y: y - 6,
        "text-anchor": "middle",
        fill: color,
        stroke: "#0b0e13",
        "stroke-width": "3",
        "paint-order": "stroke",
        "font-size": "9",
        "font-weight": "600",
      });
      vt.textContent = d.trimp || 0;
      svg.appendChild(vt);
    }

    if (labelIdx.has(i)) xLabel(svg, x + bw / 2, H - pad.b + 14, labels[i]);
  });

  // Ramp-Overlay: CTL-Anstieg/Woche als Linie auf zweiter Achse,
  // sicherer Korridor +3…+6 als grüne Zone
  if (hasGuard) {
    const ramps = weeklyData
      .map((d) => guardByWeek[d.week]?.ramp)
      .map((v) => (v == null ? null : v));
    const vals = ramps.filter((v) => v != null);
    if (vals.length >= 2) {
      const rMax = Math.max(...vals, RAMP_OK_MAX + 2, 8);
      const rMin = Math.min(...vals, 0) - 1;
      const rY = (v) => pad.t + ch - ((v - rMin) / (rMax - rMin)) * ch;

      // Korridor
      svg.appendChild(
        svgEl("rect", {
          x: pad.l,
          y: rY(RAMP_OK_MAX),
          width: W - pad.l - pad.r,
          height: Math.max(1, rY(RAMP_OK_MIN) - rY(RAMP_OK_MAX)),
          fill: "#4a9a6e",
          opacity: "0.08",
        })
      );

      const pts = [];
      weeklyData.forEach((d, i) => {
        const v = ramps[i];
        if (v == null) return;
        pts.push({ x: pad.l + i * gap + gap / 2, y: rY(v), v, week: d.week });
      });
      svg.appendChild(
        svgEl("polyline", {
          fill: "none",
          stroke: "#e2e7ef",
          "stroke-width": "1.6",
          "stroke-dasharray": "5,3",
          points: pts.map((p) => `${p.x},${p.y}`).join(" "),
          opacity: "0.85",
        })
      );
      pts.forEach((p) => {
        const c = svgEl("circle", {
          cx: p.x,
          cy: p.y,
          r: "3",
          fill: p.v > 8 ? "#d94f4f" : p.v > RAMP_OK_MAX ? "#c9a84c" : "#e2e7ef",
          stroke: "#0b0e13",
          "stroke-width": "1",
        });
        c.style.cursor = "pointer";
        c.addEventListener("mouseenter", (e) =>
          Tooltip.show(
            e,
            `<div class="tt">${p.week}</div><div class="tv">Ramp ${p.v > 0 ? "+" : ""}${fmt(p.v)} CTL/Woche</div><div class="td">Korridor: +${RAMP_OK_MIN} bis +${RAMP_OK_MAX}</div>`
          )
        );
        c.addEventListener("mouseleave", () => Tooltip.hide());
        svg.appendChild(c);
      });

      // Rechte Achse
      [rMin, 0, RAMP_OK_MAX, rMax].forEach((v) => {
        const t = svgEl("text", {
          x: W - pad.r + 6,
          y: rY(v) + 3,
          fill: "#97a1b3",
          "font-size": "9",
        });
        t.textContent = (v > 0 ? "+" : "") + Math.round(v);
        svg.appendChild(t);
      });
    }
  }
}

/* ── Konsistenz-Wochenstreifen (Trainingstage pro Woche) ─────── */
const CONSISTENCY_RAMP = [
  "rgba(255,255,255,0.05)", "#21402f", "#285939", "#327049",
  "#3d8a5b", "#4a9a6e", "#63b184", "#82c69f",
];
const CONSISTENCY_MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function renderConsistency(svgId, wc) {
  const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
  if (!wc || !wc.weeks || !wc.weeks.length) {
    const t = svgEl("text", { x: 410, y: 70, "text-anchor": "middle", fill: "#5f6878", "font-size": "12" });
    t.textContent = "Keine Trainingstage erfasst";
    svg.appendChild(t);
    return;
  }

  const W = 820, padL = 6, padR = 6, yTop = 34, cellH = 44;
  const n = wc.weeks.length;
  const gap = n > 30 ? 2 : 3;
  let cellW = (W - padL - padR - (n - 1) * gap) / n;
  if (cellW > 60) cellW = 60;
  const stepX = cellW + gap;
  const showNum = cellW >= 20;
  const H = yTop + cellH + 58;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  // Kopfzeile: aktuelle & längste Serie, Ø Tage/Woche
  const kpi = svgEl("text", { x: padL, y: 18, "font-size": "13", fill: "#97a1b3", "font-family": "IBM Plex Mono, monospace" });
  const seg = (txt, fill, weight) => {
    const s = svgEl("tspan", { fill });
    if (weight) s.setAttribute("font-weight", weight);
    s.textContent = txt;
    return s;
  };
  kpi.appendChild(document.createTextNode("serie aktuell "));
  kpi.appendChild(seg(`${wc.streakCurrent} Wochen`, "#82c69f", "500"));
  kpi.appendChild(document.createTextNode("   ·   längste "));
  kpi.appendChild(seg(`${wc.streakLongest}`, "#82c69f", "500"));
  kpi.appendChild(document.createTextNode("   ·   Ø "));
  kpi.appendChild(seg(String(wc.avgDays).replace(".", ","), "#e2e7ef", "500"));
  kpi.appendChild(document.createTextNode(" Tage/Woche"));
  svg.appendChild(kpi);

  // Zellen + Monatslabels
  let lastMonth = -1;
  wc.weeks.forEach((w, i) => {
    const x = padL + i * stepX;
    const days = Math.max(0, Math.min(7, w.days));
    const rect = svgEl("rect", { x, y: yTop, width: cellW, height: cellH, rx: "4", fill: CONSISTENCY_RAMP[days] });
    if (w.days > 0) {
      rect.style.cursor = "pointer";
      rect.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">Woche ab ${w.monday.split("-").reverse().join(".")}</div>
        <div class="tv">${w.days} Trainingstag${w.days === 1 ? "" : "e"} · ${w.km} km</div>
      `));
      rect.addEventListener("mouseleave", () => Tooltip.hide());
    }
    svg.appendChild(rect);

    if (showNum && w.days > 0) {
      const t = svgEl("text", { x: x + cellW / 2, y: yTop + cellH / 2 + 5, "text-anchor": "middle", "font-size": "13", "font-weight": "500", fill: days >= 6 ? "#123a24" : "#eaf6ee" });
      t.textContent = String(w.days);
      svg.appendChild(t);
    }

    const m = new Date(w.monday + "T00:00:00").getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      const t = svgEl("text", { x, y: yTop + cellH + 20, fill: "#5f6878", "font-size": "10.5", "font-family": "IBM Plex Mono, monospace" });
      t.textContent = CONSISTENCY_MONTHS[m];
      svg.appendChild(t);
    }
  });

  // Fußzeile: aktive Wochen + grüne Legende
  const foot = svgEl("text", { x: padL, y: H - 8, fill: "#97a1b3", "font-size": "11", "font-family": "IBM Plex Mono, monospace" });
  foot.textContent = `${wc.activeWeeks} von ${wc.totalWeeks} Wochen trainiert · ${wc.activeDays} aktive Tage`;
  svg.appendChild(foot);

  const legend = [1, 2, 4, 5, 7];
  legend.forEach((lvl, i) => {
    svg.appendChild(svgEl("rect", { x: W - padR - (legend.length - i) * 16, y: H - 20, width: 13, height: 13, rx: "3", fill: CONSISTENCY_RAMP[lvl] }));
  });
  const legLbl = svgEl("text", { x: W - padR - legend.length * 16 - 8, y: H - 9, "text-anchor": "end", fill: "#5f6878", "font-size": "10.5", "font-family": "IBM Plex Mono, monospace" });
  legLbl.textContent = "wenig → viel Tage";
  svg.appendChild(legLbl);
}

/* ── Intensitätsverteilung: Zeit in Zonen pro Woche ──────────── */
export function renderZoneWeekly(svgId, weeks) {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";
  if (!weeks || !weeks.length) {
    const t = svgEl("text", {
      x: 390,
      y: 100,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "12",
    });
    t.textContent = "Zonendaten werden ab dem nächsten Sync aufgebaut";
    svg.appendChild(t);
    return;
  }

  const W = 780,
    H = 230,
    pad = { l: 50, r: 16, t: 20, b: 40 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;
  const COLORS = { low: "#4a7fa8", mid: "#e08a3c", high: "#d94f4f" };

  // Y-Achse: Anteile 0–100 %
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ch / 4) * i;
    svg.appendChild(svgEl("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: "#232a37" }));
    const t = svgEl("text", {
      x: pad.l - 6,
      y: y + 3,
      "text-anchor": "end",
      fill: "#5f6878",
      "font-size": "10",
    });
    t.textContent = `${100 - i * 25}%`;
    svg.appendChild(t);
  }
  axisTitles(svg, W, H, pad, { x: "Woche", yLeft: "Anteil Trainingszeit (%)" });

  // 80%-Richtwert (Seiler): Ziel-Anteil niedriger Intensität
  const targetY = pad.t + ch * (1 - LOW_INTENSITY_TARGET);
  svg.appendChild(
    svgEl("line", {
      x1: pad.l,
      y1: targetY,
      x2: W - pad.r,
      y2: targetY,
      stroke: "#4a9a6e",
      "stroke-width": "1",
      "stroke-dasharray": "5,3",
      opacity: "0.7",
    })
  );
  const tl = svgEl("text", {
    x: W - pad.r - 4,
    y: targetY - 4,
    "text-anchor": "end",
    fill: "#4a9a6e",
    "font-size": "9",
  });
  tl.textContent = "Ziel ≥80% Grundlage";
  svg.appendChild(tl);

  const gap = cw / weeks.length,
    bw = Math.min(gap * 0.6, 48);
  const labels = weekDisplayLabels(weeks.map((w) => w.week));
  const labelIdx = pickLabelIndices(
    weeks.map((_, i) => pad.l + i * gap + gap / 2),
    40
  );
  const denseValues = gap < 24; // %-Labels brauchen etwas mehr Platz
  weeks.forEach((wk, i) => {
    const total = wk.low + wk.mid + wk.high;
    const x = pad.l + i * gap + (gap - bw) / 2;
    let yCursor = pad.t + ch;
    for (const band of ["low", "mid", "high"]) {
      const h = total ? (wk[band] / total) * ch : 0;
      if (h <= 0) continue;
      yCursor -= h;
      svg.appendChild(
        svgEl("rect", { x, y: yCursor, width: bw, height: h, fill: COLORS[band], opacity: "0.85" })
      );
    }
    // Low-Share-Label + Zielstatus (bei dichten Wochen nur ausgedünnt)
    if (!denseValues || labelIdx.has(i)) {
      const lbl = svgEl("text", {
        x: x + bw / 2,
        y: pad.t + ch * (1 - wk.lowShare) - 5,
        "text-anchor": "middle",
        fill: wk.onTarget ? "#4a9a6e" : "#c9a84c",
        "font-size": "9",
        "font-weight": "600",
      });
      lbl.textContent = `${Math.round(wk.lowShare * 100)}%`;
      svg.appendChild(lbl);
    }

    const hit = svgEl("rect", { x, y: pad.t, width: bw, height: ch, fill: "transparent" });
    hit.style.cursor = "pointer";
    hit.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `
      <div class="tt">${wk.week} · ${wk.hours}h mit Powerdaten</div>
      <div class="tv">${Math.round(wk.lowShare * 100)}% Grundlage (Z1–Z2)</div>
      <div class="td">Mitte (Z3–Z4): ${Math.round((wk.mid / total) * 100)}% · Hoch (Z5+): ${Math.round((wk.high / total) * 100)}%</div>
      <div class="td">${wk.onTarget ? "✅ Pyramidal im Soll" : "⚠️ Zu viel Intensität — Z2 schützen"}</div>
    `
      )
    );
    hit.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(hit);

    if (labelIdx.has(i)) xLabel(svg, x + bw / 2, H - pad.b + 14, labels[i]);
  });
}

/* ── Wöchentliche Wetterbedingungen (Temp-Balken + Wind-Linie) ── */
export function renderWeatherWeekly(svgId, rides, period = "week") {
  // Nur Fahrten mit Wetterdaten, nach Woche gruppieren
  const withWeather = rides.filter((r) => r.weather?.temp != null);
  if (!withWeather.length) {
    const svg = el(svgId);
    if (!svg) return;
    svg.innerHTML = "";
    const t = svgEl("text", {
      x: 390,
      y: 100,
      "text-anchor": "middle",
      fill: "#5f6878",
      "font-size": "12",
    });
    t.textContent = "Noch keine Wetterdaten verfügbar";
    svg.appendChild(t);
    return;
  }

  // Wochenweise aggregieren — Plan-Woche wenn vorhanden, sonst ISO-Kalenderwoche
  // (core/aggregate.js::rideWeekKey). Fahrten ohne verwertbares Datum werden
  // übersprungen und geloggt statt in einen falschen Sammel-Bucket zu fallen.
  const weekMap = {};
  for (const r of withWeather) {
    const wk = rideWeekKey(r);
    if (!wk) {
      log.warn("Wetter-Chart: Fahrt ohne Woche/Datum übersprungen", r.name || r.dateISO);
      continue;
    }
    if (!weekMap[wk]) weekMap[wk] = { week: wk, temps: [], winds: [], precips: [], rides: [] };
    weekMap[wk].temps.push(r.weather.temp);
    weekMap[wk].winds.push(r.weather.windSpeed);
    weekMap[wk].precips.push(r.weather.precip || 0);
    weekMap[wk].rides.push(r);
  }

  // Wochen in Trainingsreihenfolge sortieren — Fallback auf alphabetisch für Monats-Keys
  const rawWeeks = Object.values(weekMap).sort((a, b) => {
    const ia = CONFIG.weekIndex(a.week),
      ib = CONFIG.weekIndex(b.week);
    if (ia !== 999 || ib !== 999) return ia - ib;
    return a.week.localeCompare(b.week);
  });

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const data = rawWeeks.map((w) => ({
    week: w.week,
    temp: Math.round(mean(w.temps) * 10) / 10,
    wind: Math.round(mean(w.winds) * 10) / 10,
    precip: Math.round(w.precips.reduce((a, b) => a + b, 0) * 10) / 10,
    rides: w.rides,
    isP2: w.week.startsWith("P2-"),
  }));

  // Virtuellen Lücken-Slot zwischen Plan 1 und Plan 2 einrechnen
  const p2Idx = data.findIndex((d) => d.isP2);
  const GAP_SLOTS = p2Idx > 0 ? 1.5 : 0; // 1.5 extra Slots als Lücke
  const totalSlots = data.length + GAP_SLOTS;

  const PPW = 52;
  const W = Math.max(cardContentWidth(), totalSlots * PPW + 80);
  const H = 240,
    pad = { l: 50, r: 50, t: 20, b: 40 };
  const cw = W - pad.l - pad.r,
    ch = H - pad.t - pad.b;

  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);

  const temps = data.map((d) => d.temp);
  const winds = data.map((d) => d.wind);
  const maxT = Math.max(...temps, 25);
  const minT = Math.min(Math.min(...temps) - 3, 0);
  const maxW = Math.max(...winds, 30) * 1.15;

  // Slot-Index berücksichtigt die Gap zwischen Plan 1 und Plan 2
  const slotIndex = (i) => (p2Idx > 0 && i >= p2Idx ? i + GAP_SLOTS : i);
  const xMid = (i) => pad.l + (slotIndex(i) + 0.5) * (cw / totalSlots);
  const yTemp = (t) => pad.t + ch - ((t - minT) / (maxT - minT)) * ch;
  const yWind = (w) => pad.t + ch - (w / maxW) * ch;
  const barW = Math.max(10, cw / totalSlots - 6);

  // Ampel-Farbe: grün/gelb/rot nach Bedingung
  const condColor = (d) => {
    const hot = d.temp > 32; // angehoben: 28→32°C
    const cold = d.temp < 5;
    const windy = d.wind > 30;
    const rainy = d.precip > 0.5;
    const bad = (hot ? 1 : 0) + (cold ? 1 : 0) + (windy ? 1 : 0) + (rainy ? 1 : 0);
    if (bad >= 2 || hot || (windy && rainy)) return "#d94f4f";
    if (bad === 1) return "#c9a84c";
    return "#4a9a6e";
  };

  // Grid Y Temp (links)
  const tStep = Math.ceil((maxT - minT) / 5 / 5) * 5;
  for (let t = Math.ceil(minT / 5) * 5; t <= maxT; t += tStep) {
    const y = yTemp(t);
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
    const lbl = svgEl("text", {
      x: pad.l - 5,
      y: y + 4,
      "text-anchor": "end",
      fill: "#5f6878",
      "font-size": "9",
    });
    lbl.textContent = t + "°C";
    svg.appendChild(lbl);
  }

  // Grid Y Wind (rechts)
  const wStep = 10;
  for (let w = 0; w <= maxW; w += wStep) {
    const y = yWind(w);
    if (y < pad.t) break;
    const lbl = svgEl("text", {
      x: W - pad.r + 5,
      y: y + 4,
      "text-anchor": "start",
      fill: "#4a7fa8",
      "font-size": "9",
    });
    lbl.textContent = w + " km/h";
    svg.appendChild(lbl);
  }
  axisTitles(svg, W, H, pad, {
    x: period === "month" ? "Monat" : "Woche",
    yLeft: "Temperatur (°C)",
    yRight: "Wind (km/h)",
  });

  // 0°C-Linie wenn sichtbar
  if (minT < 0 && maxT > 0) {
    const y0 = yTemp(0);
    svg.appendChild(
      svgEl("line", {
        x1: pad.l,
        y1: y0,
        x2: W - pad.r,
        y2: y0,
        stroke: "#4a7fa8",
        "stroke-width": "1",
        "stroke-dasharray": "4,3",
        opacity: "0.4",
      })
    );
  }

  // Balken (Temperatur)
  const wLabels = weekDisplayLabels(data.map((d) => d.week));
  const wLabelIdx = pickLabelIndices(
    data.map((_, i) => xMid(i)),
    34
  );
  data.forEach((d, i) => {
    const x = xMid(i) - barW / 2;
    const y = yTemp(Math.max(d.temp, minT));
    const bh = Math.abs(yTemp(minT) - y);
    const col = condColor(d);

    svg.appendChild(
      svgEl("rect", {
        x,
        y,
        width: barW,
        height: Math.max(2, bh),
        fill: col,
        opacity: "0.75",
        rx: "2",
      })
    );

    // Regen-Markierung oben auf Balken
    if (d.precip > 0.5) {
      const rain = svgEl("text", {
        x: xMid(i),
        y: y - 3,
        "text-anchor": "middle",
        "font-size": "8",
      });
      rain.textContent = "🌧";
      svg.appendChild(rain);
    }

    // Temp-Label: mittig im Balken, aber Windpunkt ausweichen —
    // nur wenn der Balken breit genug für "xx.x°" ist (Überlappungsschutz)
    if (bh > 16 && barW >= 24) {
      const windY = yWind(d.wind);
      let labelY = y + bh / 2 + 4;
      // Wenn Label zu nah am Windpunkt — nach unten verschieben
      if (Math.abs(labelY - windY) < 10) labelY = windY + 12;
      // Nicht aus dem Balken rauslaufen
      labelY = Math.min(labelY, y + bh - 4);
      const tl = svgEl("text", {
        x: xMid(i),
        y: labelY,
        "text-anchor": "middle",
        fill: "#0b0e13",
        "font-size": "8",
        "font-weight": "600",
      });
      tl.textContent = d.temp + "°";
      svg.appendChild(tl);
    }

    // X-Label (Woche) — ausgedünnt, kompakte KW-Schreibweise
    if (wLabelIdx.has(i)) {
      const xl = svgEl("text", {
        x: xMid(i),
        y: H - pad.b + 14,
        "text-anchor": "middle",
        fill: "#5f6878",
        "font-size": "8",
      });
      xl.textContent = wLabels[i].replace("P2-", "");
      svg.appendChild(xl);
    }

    // Unsichtbare Hit-Fläche für Tooltip
    const hit = svgEl("rect", {
      x: xMid(i) - barW / 2 - 2,
      y: pad.t,
      width: barW + 4,
      height: ch,
      fill: "transparent",
    });
    hit.style.cursor = "pointer";
    const icons = [
      d.temp < 5 ? "🥶" : d.temp > 32 ? "🔥" : "🌡️",
      d.precip > 0.5 ? `🌧 ${d.precip}mm` : "",
      d.wind > 30 ? `💨 ${d.wind} km/h` : `🌬 ${d.wind} km/h`,
    ]
      .filter(Boolean)
      .join(" · ");
    const condLabel =
      condColor(d) === "#4a9a6e"
        ? "✅ Gute Bedingungen"
        : condColor(d) === "#c9a84c"
          ? "⚠️ Suboptimal"
          : "❌ Schwierige Bedingungen";
    hit.addEventListener("mouseenter", (e) =>
      Tooltip.show(
        e,
        `
      <div class="tt">${d.week} · ${d.rides.length} Fahrt${d.rides.length > 1 ? "en" : ""}</div>
      <div class="tv">${icons}</div>
      <div class="td">${condLabel}</div>
    `
      )
    );
    hit.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(hit);
  });

  // Wind-Linie (blau, zweite Y-Achse)
  const windPoints = data.map((d, i) => `${xMid(i)},${yWind(d.wind)}`).join(" ");
  svg.appendChild(
    svgEl("polyline", {
      fill: "none",
      stroke: "#4a7fa8",
      "stroke-width": "2",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      points: windPoints,
      opacity: "0.85",
    })
  );

  // Wind-Punkte
  data.forEach((d, i) => {
    svg.appendChild(
      svgEl("circle", {
        cx: xMid(i),
        cy: yWind(d.wind),
        r: "3",
        fill: "#4a7fa8",
        stroke: "#0b0e13",
        "stroke-width": "1",
      })
    );
  });

  // Plan-Divider: in der Mitte der Lücke zwischen Plan 1 und Plan 2
  const p2Start = data.findIndex((d) => d.isP2);
  if (p2Start > 0) {
    // Divider liegt in der Mitte des Gap-Bereichs
    const dx = pad.l + (slotIndex(p2Start) - GAP_SLOTS / 2) * (cw / totalSlots);
    svg.appendChild(
      svgEl("line", {
        x1: dx,
        y1: pad.t,
        x2: dx,
        y2: pad.t + ch,
        stroke: "#e08a3c",
        "stroke-width": "1.5",
        "stroke-dasharray": "4,3",
        opacity: "0.6",
      })
    );
    const lp1 = svgEl("text", {
      x: dx - 6,
      y: pad.t + 10,
      "text-anchor": "end",
      fill: "#5f6878",
      "font-size": "8",
      "font-weight": "600",
    });
    lp1.textContent = "← Plan 1";
    svg.appendChild(lp1);
    const lp2 = svgEl("text", {
      x: dx + 6,
      y: pad.t + 10,
      "text-anchor": "start",
      fill: "#e08a3c",
      "font-size": "8",
      "font-weight": "600",
    });
    lp2.textContent = "Plan 2 →";
    svg.appendChild(lp2);
  }

  // Auto-scroll ans aktuelle Ende (rechts = neueste Woche)
  const scrollContainer = svg.parentElement;
  if (scrollContainer && scrollContainer.classList.contains("chart-scroll")) {
    autoScrollRight(svg, W, scrollContainer);
  }
}
