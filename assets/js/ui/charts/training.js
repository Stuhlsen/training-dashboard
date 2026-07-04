/* ============================================================
   UI/CHARTS/TRAINING.JS — Volumen, TRIMP, Heatmap, Wetter
   Rendering only — Aggregation kommt aus core/aggregate.js.
   ============================================================ */

import { CONFIG } from "../../state/config.js";
import { el, svgEl, Tooltip } from "../dom.js";
import { gridLines, xLabel } from "./base.js";

/* ── Wöchentliches Volumen (Balken) ──────────────────────────── */
export function renderWeeklyVolume(svgId, weeklyData, onBarClick) {
  const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
  if (!weeklyData.length) { svg.innerHTML = `<text x="390" y="135" text-anchor="middle" fill="#5f6878" font-size="11">Keine Wochendaten verfügbar</text>`; return; }
  const W = 780, H = 270, pad = { l: 50, r: 16, t: 16, b: 40 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const ownPlan = weeklyData.some(d => d.phase != null);
  const TARGET_KM = 200;
  const maxKm = Math.max(...weeklyData.map(d => d.km || 0), ownPlan ? TARGET_KM * 1.1 : 0) * 1.15 || 1;
  const bw = Math.min(cw / weeklyData.length * 0.62, 52);
  const gap = cw / weeklyData.length;

  gridLines(svg, W, H, pad, maxKm);

  // Zielzone nur sinnvoll für den eigenen Trainingsplan
  if (ownPlan) {
    const zoneTopY = pad.t + ch - (220 / maxKm * ch);
    const zoneBotY = pad.t + ch - (180 / maxKm * ch);
    svg.appendChild(svgEl("rect", {
      x: pad.l, y: zoneTopY,
      width: cw, height: zoneBotY - zoneTopY,
      fill: "#4a9a6e", opacity: "0.08",
    }));

    const targetY = pad.t + ch - (TARGET_KM / maxKm * ch);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
      stroke: "#4a9a6e", "stroke-width": "1", "stroke-dasharray": "5,3", opacity: "0.5",
    }));
    const tl = svgEl("text", { x: W - pad.r - 4, y: targetY - 4, "text-anchor": "end", fill: "#4a9a6e", "font-size": "9", opacity: "0.8" });
    tl.textContent = "Ziel 200 km"; svg.appendChild(tl);
  }

  weeklyData.forEach((d, i) => {
    const x  = pad.l + i * gap + (gap - bw) / 2;
    const bh = Math.max((d.km || 0) / maxKm * ch, 1);
    const y  = pad.t + ch - bh;
    const color = ownPlan ? CONFIG.phaseColor(d.phase) : "#4a7fa8";

    const rect = svgEl("rect", {
      x, y, width: bw, height: bh, rx: "3",
      fill: color, opacity: "0.75",
    });
    rect.style.cursor = "pointer";
    rect.style.transition = "opacity 0.12s";
    rect.addEventListener("mouseenter", e => {
      rect.setAttribute("opacity", "1");
      Tooltip.show(e, `
        <div class="tt">${d.week || ""}</div>
        <div class="tv">${d.km} km</div>
        <div class="td">${d.rides} Fahrten · ${Math.round(d.min / 60)}h</div>
      `);
    });
    rect.addEventListener("mouseleave", () => {
      rect.setAttribute("opacity", "0.75");
      Tooltip.hide();
    });
    if (onBarClick) rect.addEventListener("click", () => onBarClick(d.week));
    svg.appendChild(rect);

    if (bh > 16) {
      const vt = svgEl("text", {
        x: x + bw / 2, y: y - 4,
        "text-anchor": "middle", fill: "#97a1b3", "font-size": "9",
      });
      vt.textContent = Math.round(d.km);
      svg.appendChild(vt);
    }
    xLabel(svg, x + bw / 2, H - pad.b + 14, d.week);
  });
}

/* ── TRIMP pro Woche ─────────────────────────────────────────── */
export function renderTrimp(svgId, weeklyData) {
  const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
  if (!weeklyData.length) { svg.innerHTML = `<text x="390" y="115" text-anchor="middle" fill="#5f6878" font-size="11">Keine Wochendaten verfügbar</text>`; return; }
  const W = 780, H = 230, pad = { l: 50, r: 16, t: 16, b: 40 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const maxV = Math.max(...weeklyData.map(d => d.trimp || 0)) * 1.15 || 1;
  const bw = Math.min(cw / weeklyData.length * 0.62, 52);
  const gap = cw / weeklyData.length;

  gridLines(svg, W, H, pad, maxV);

  // Absolute Farbskala basierend auf trainingswissenschaftlichen Grenzwerten
  const trimpColor = (v) => {
    if (v < 400)       return "#4a9a6e"; // grün  — Erholung
    if (v < 600)       return "#c9a84c"; // gelb  — moderat
    if (v < 900)       return "#e08a3c"; // orange — hoch
    return "#d94f4f";                    // rot   — sehr hoch
  };

  weeklyData.forEach((d, i) => {
    const x  = pad.l + i * gap + (gap - bw) / 2;
    const bh = Math.max((d.trimp || 0) / maxV * ch, 1);
    const y  = pad.t + ch - bh;
    const color = trimpColor(d.trimp || 0);
    const rect = svgEl("rect", { x, y, width: bw, height: bh, rx: "3", fill: color, opacity: "0.82" });
    rect.style.cursor = "pointer";
    rect.style.transition = "opacity 0.12s";
    rect.addEventListener("mouseenter", e => {
      rect.setAttribute("opacity", "1");
      Tooltip.show(e, `
        <div class="tt">${d.week || ""}${d.plan && d.plan !== "Vergleich" ? " · " + d.plan : ""}</div>
        <div class="tv">TRIMP ${d.trimp}</div>
        <div class="td">${d.rides} Fahrten · ${Math.round(d.min / 6) / 10}h</div>
      `);
    });
    rect.addEventListener("mouseleave", () => { rect.setAttribute("opacity", "0.82"); Tooltip.hide(); });
    svg.appendChild(rect);

    // Value label on top
    if (bh > 15) {
      const vt = svgEl("text", { x: x + bw / 2, y: y - 4, "text-anchor": "middle", fill: color, "font-size": "9", "font-weight": "600" });
      vt.textContent = d.trimp || 0;
      svg.appendChild(vt);
    }

    xLabel(svg, x + bw / 2, H - pad.b + 14, d.week);
  });
}

/* ── Wochentag-Heatmap ───────────────────────────────────────── */
export function renderHeatmap(svgId, rides) {
  const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const dayIdx = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

  const counts = new Array(7).fill(0);
  const kmTotals = new Array(7).fill(0);
  rides.forEach(r => {
    if (!r.dateISO) return;
    const d = new Date(r.dateISO).getDay();
    const idx = dayIdx[d];
    counts[idx]++;
    kmTotals[idx] += r.km || 0;
  });

  const maxCount = Math.max(...counts) || 1;
  const W = 780, cellW = 80, cellH = 64, startX = (W - 7 * cellW) / 2;

  // Grün → Gelb → Orange → Rot basierend auf Intensität
  const heatColor = (t) => {
    if (t < 0.33) {
      // Grün → Gelb
      const f = t / 0.33;
      return `rgb(${Math.round(92 + f * 137)}, ${Math.round(168 - f * 16)}, ${Math.round(110 - f * 110)})`;
    } else if (t < 0.66) {
      // Gelb → Orange
      const f = (t - 0.33) / 0.33;
      return `rgb(${Math.round(229 - f * 5)}, ${Math.round(152 - f * 29)}, ${Math.round(0 + f * 0)})`;
    } else {
      // Orange → Rot
      const f = (t - 0.66) / 0.34;
      return `rgb(${Math.round(224 - f * 28)}, ${Math.round(123 - f * 67)}, ${Math.round(57 - f * 57)})`;
    }
  };

  days.forEach((day, i) => {
    const x = startX + i * cellW;
    const intensity = counts[i] / maxCount;
    const color = heatColor(intensity);
    const isMax = counts[i] === maxCount;

    const rect = svgEl("rect", {
      x: x + 4, y: 20, width: cellW - 8, height: cellH,
      rx: "8", fill: color,
      stroke: isMax ? "#d94f4f" : "#232a37",
      "stroke-width": isMax ? "1.5" : "1",
    });
    rect.addEventListener("mouseenter", e => Tooltip.show(e, `
      <div class="tt">${day}</div>
      <div class="tv">${counts[i]} Fahrten</div>
      <div class="td">${Math.round(kmTotals[i])} km gesamt · Ø ${counts[i] ? Math.round(kmTotals[i] / counts[i]) : 0} km/Fahrt</div>
    `));
    rect.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(rect);

    // Wochentag-Label — größer, heller
    const lbl = svgEl("text", {
      x: x + cellW / 2, y: 14,
      "text-anchor": "middle",
      fill: isMax ? "#d94f4f" : "#97a1b3",
      "font-size": "11",
      "font-weight": isMax ? "700" : "500",
      "letter-spacing": "0.05em",
    });
    lbl.textContent = day;
    svg.appendChild(lbl);

    // Fahrt-Anzahl
    const cnt = svgEl("text", {
      x: x + cellW / 2, y: 57,
      "text-anchor": "middle",
      fill: intensity > 0.35 ? "#e2e7ef" : "#97a1b3",
      "font-size": "20", "font-weight": "700",
    });
    cnt.textContent = counts[i];
    svg.appendChild(cnt);

    // km
    const km = svgEl("text", {
      x: x + cellW / 2, y: 74,
      "text-anchor": "middle",
      fill: intensity > 0.3 ? "rgba(240,235,228,0.75)" : "#5f6878",
      "font-size": "9",
    });
    km.textContent = Math.round(kmTotals[i]) + " km";
    svg.appendChild(km);
  });
}

/* ── Wöchentliche Wetterbedingungen (Temp-Balken + Wind-Linie) ── */
export function renderWeatherWeekly(svgId, rides) {
  // Nur Fahrten mit Wetterdaten, nach Woche gruppieren
  const withWeather = rides.filter(r => r.weather?.temp != null);
  if (!withWeather.length) {
    const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
    const t = svgEl("text", { x: 390, y: 100, "text-anchor": "middle", fill: "#5f6878", "font-size": "12" });
    t.textContent = "Noch keine Wetterdaten verfügbar";
    svg.appendChild(t);
    return;
  }

  // Wochenweise aggregieren
  const weekMap = {};
  for (const r of withWeather) {
    const wk = r.week || "?";
    if (!weekMap[wk]) weekMap[wk] = { week: wk, temps: [], winds: [], precips: [], rides: [] };
    weekMap[wk].temps.push(r.weather.temp);
    weekMap[wk].winds.push(r.weather.windSpeed);
    weekMap[wk].precips.push(r.weather.precip || 0);
    weekMap[wk].rides.push(r);
  }

  // Wochen in Trainingsreihenfolge sortieren — Fallback auf alphabetisch für Monats-Keys
  const rawWeeks = Object.values(weekMap).sort((a, b) => {
    const ia = CONFIG.weekIndex(a.week), ib = CONFIG.weekIndex(b.week);
    if (ia !== 999 || ib !== 999) return ia - ib;
    return a.week.localeCompare(b.week);
  });

  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const data = rawWeeks.map(w => ({
    week: w.week,
    temp: Math.round(mean(w.temps) * 10) / 10,
    wind: Math.round(mean(w.winds) * 10) / 10,
    precip: Math.round(w.precips.reduce((a, b) => a + b, 0) * 10) / 10,
    rides: w.rides,
    isP2: w.week.startsWith("P2-"),
  }));

  // Virtuellen Lücken-Slot zwischen Plan 1 und Plan 2 einrechnen
  const p2Idx = data.findIndex(d => d.isP2);
  const GAP_SLOTS = p2Idx > 0 ? 1.5 : 0; // 1.5 extra Slots als Lücke
  const totalSlots = data.length + GAP_SLOTS;

  const PPW = 52;
  const W = Math.max(780, totalSlots * PPW + 80);
  const H = 240, pad = { l: 50, r: 50, t: 20, b: 40 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.style.minWidth = W + "px";

  const temps = data.map(d => d.temp);
  const winds = data.map(d => d.wind);
  const maxT = Math.max(...temps, 25);
  const minT = Math.min(Math.min(...temps) - 3, 0);
  const maxW = Math.max(...winds, 30) * 1.15;

  // Slot-Index berücksichtigt die Gap zwischen Plan 1 und Plan 2
  const slotIndex = (i) => p2Idx > 0 && i >= p2Idx ? i + GAP_SLOTS : i;
  const xMid  = (i) => pad.l + (slotIndex(i) + 0.5) * (cw / totalSlots);
  const yTemp = (t) => pad.t + ch - ((t - minT) / (maxT - minT)) * ch;
  const yWind = (w) => pad.t + ch - (w / maxW) * ch;
  const barW  = Math.max(10, (cw / totalSlots) - 6);

  // Ampel-Farbe: grün/gelb/rot nach Bedingung
  const condColor = (d) => {
    const hot   = d.temp > 32;   // angehoben: 28→32°C
    const cold  = d.temp < 5;
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
    svg.appendChild(svgEl("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: "#232a37", "stroke-width": "1" }));
    const lbl = svgEl("text", { x: pad.l - 5, y: y + 4, "text-anchor": "end", fill: "#5f6878", "font-size": "9" });
    lbl.textContent = t + "°C";
    svg.appendChild(lbl);
  }

  // Grid Y Wind (rechts)
  const wStep = 10;
  for (let w = 0; w <= maxW; w += wStep) {
    const y = yWind(w);
    if (y < pad.t) break;
    const lbl = svgEl("text", { x: W - pad.r + 5, y: y + 4, "text-anchor": "start", fill: "#4a7fa8", "font-size": "9" });
    lbl.textContent = w + " km/h";
    svg.appendChild(lbl);
  }

  // 0°C-Linie wenn sichtbar
  if (minT < 0 && maxT > 0) {
    const y0 = yTemp(0);
    svg.appendChild(svgEl("line", { x1: pad.l, y1: y0, x2: W - pad.r, y2: y0, stroke: "#4a7fa8", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.4" }));
  }

  // Balken (Temperatur)
  data.forEach((d, i) => {
    const x = xMid(i) - barW / 2;
    const y = yTemp(Math.max(d.temp, minT));
    const bh = Math.abs(yTemp(minT) - y);
    const col = condColor(d);

    svg.appendChild(svgEl("rect", {
      x, y, width: barW, height: Math.max(2, bh),
      fill: col, opacity: "0.75", rx: "2",
    }));

    // Regen-Markierung oben auf Balken
    if (d.precip > 0.5) {
      const rain = svgEl("text", { x: xMid(i), y: y - 3, "text-anchor": "middle", "font-size": "8" });
      rain.textContent = "🌧";
      svg.appendChild(rain);
    }

    // Temp-Label: mittig im Balken, aber Windpunkt ausweichen
    if (bh > 16) {
      const windY = yWind(d.wind);
      let labelY = y + bh / 2 + 4;
      // Wenn Label zu nah am Windpunkt — nach unten verschieben
      if (Math.abs(labelY - windY) < 10) labelY = windY + 12;
      // Nicht aus dem Balken rauslaufen
      labelY = Math.min(labelY, y + bh - 4);
      const tl = svgEl("text", { x: xMid(i), y: labelY, "text-anchor": "middle", fill: "#0b0e13", "font-size": "8", "font-weight": "600" });
      tl.textContent = d.temp + "°";
      svg.appendChild(tl);
    }

    // X-Label (Woche)
    const xl = svgEl("text", { x: xMid(i), y: H - pad.b + 14, "text-anchor": "middle", fill: "#5f6878", "font-size": "8" });
    xl.textContent = d.week.replace("P2-", "");
    svg.appendChild(xl);

    // Unsichtbare Hit-Fläche für Tooltip
    const hit = svgEl("rect", { x: xMid(i) - barW / 2 - 2, y: pad.t, width: barW + 4, height: ch, fill: "transparent" });
    hit.style.cursor = "pointer";
    const icons = [
      d.temp < 5 ? "🥶" : d.temp > 32 ? "🔥" : "🌡️",
      d.precip > 0.5 ? `🌧 ${d.precip}mm` : "",
      d.wind > 30 ? `💨 ${d.wind} km/h` : `🌬 ${d.wind} km/h`,
    ].filter(Boolean).join(" · ");
    const condLabel = condColor(d) === "#4a9a6e" ? "✅ Gute Bedingungen"
      : condColor(d) === "#c9a84c" ? "⚠️ Suboptimal"
      : "❌ Schwierige Bedingungen";
    hit.addEventListener("mouseenter", e => Tooltip.show(e, `
      <div class="tt">${d.week} · ${d.rides.length} Fahrt${d.rides.length > 1 ? "en" : ""}</div>
      <div class="tv">${icons}</div>
      <div class="td">${condLabel}</div>
    `));
    hit.addEventListener("mouseleave", () => Tooltip.hide());
    svg.appendChild(hit);
  });

  // Wind-Linie (blau, zweite Y-Achse)
  const windPoints = data.map((d, i) => `${xMid(i)},${yWind(d.wind)}`).join(" ");
  svg.appendChild(svgEl("polyline", {
    fill: "none", stroke: "#4a7fa8", "stroke-width": "2",
    "stroke-linejoin": "round", "stroke-linecap": "round",
    points: windPoints, opacity: "0.85",
  }));

  // Wind-Punkte
  data.forEach((d, i) => {
    svg.appendChild(svgEl("circle", {
      cx: xMid(i), cy: yWind(d.wind), r: "3",
      fill: "#4a7fa8", stroke: "#0b0e13", "stroke-width": "1",
    }));
  });

  // Plan-Divider: in der Mitte der Lücke zwischen Plan 1 und Plan 2
  const p2Start = data.findIndex(d => d.isP2);
  if (p2Start > 0) {
    // Divider liegt in der Mitte des Gap-Bereichs
    const dx = pad.l + (slotIndex(p2Start) - GAP_SLOTS / 2) * (cw / totalSlots);
    svg.appendChild(svgEl("line", {
      x1: dx, y1: pad.t, x2: dx, y2: pad.t + ch,
      stroke: "#e08a3c", "stroke-width": "1.5", "stroke-dasharray": "4,3", opacity: "0.6",
    }));
    const lp1 = svgEl("text", { x: dx - 6, y: pad.t + 10, "text-anchor": "end", fill: "#5f6878", "font-size": "8", "font-weight": "600" });
    lp1.textContent = "← Plan 1";
    svg.appendChild(lp1);
    const lp2 = svgEl("text", { x: dx + 6, y: pad.t + 10, "text-anchor": "start", fill: "#e08a3c", "font-size": "8", "font-weight": "600" });
    lp2.textContent = "Plan 2 →";
    svg.appendChild(lp2);
  }
}
