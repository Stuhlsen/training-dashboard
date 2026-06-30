/* ============================================================
   CHARTS.JS — Alle Chart-Render-Funktionen
   Neue Charts: Effizienz, Scatterplot, Heatmap, TSB
   ============================================================ */

window.Charts = {

  /* ── Gemeinsame SVG-Helfer ──────────────────────────────────── */

  _gridLines(svg, W, H, pad, maxV, minV = 0, steps = 4, noLabels = false) {
    for (let i = 0; i <= steps; i++) {
      const y   = pad.t + (H - pad.t - pad.b) / steps * i;
      const val = Math.round(maxV - (maxV - minV) / steps * i);
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
  },

  _xLabel(svg, x, y, text) {
    const t = svgEl("text", {
      x, y, "text-anchor": "middle", fill: "#6b6158", "font-size": "10",
    });
    t.textContent = text;
    svg.appendChild(t);
  },

  /* ── 1. Wöchentliches Volumen (Balken) ──────────────────────── */
  renderWeeklyVolume(svgId, weeklyData, onBarClick) {
    const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
    if (!weeklyData.length) { svg.innerHTML = `<text x="390" y="135" text-anchor="middle" fill="#6b6158" font-size="11">Keine Wochendaten verfügbar</text>`; return; }
    const W = 780, H = 270, pad = { l: 50, r: 16, t: 16, b: 40 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const ownPlan = weeklyData.some(d => d.phase != null);
    const TARGET_KM = 200;
    const maxKm = Math.max(...weeklyData.map(d => d.km || 0), ownPlan ? TARGET_KM * 1.1 : 0) * 1.15 || 1;
    const bw = Math.min(cw / weeklyData.length * 0.62, 52);
    const gap = cw / weeklyData.length;

    this._gridLines(svg, W, H, pad, maxKm);

    // Zielzone nur sinnvoll für den eigenen Trainingsplan
    if (ownPlan) {
      const zoneTopY = pad.t + ch - (220 / maxKm * ch);
      const zoneBotY = pad.t + ch - (180 / maxKm * ch);
      svg.appendChild(svgEl("rect", {
        x: pad.l, y: zoneTopY,
        width: cw, height: zoneBotY - zoneTopY,
        fill: "#5c9e6e", opacity: "0.08",
      }));

      const targetY = pad.t + ch - (TARGET_KM / maxKm * ch);
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
        stroke: "#5c9e6e", "stroke-width": "1", "stroke-dasharray": "5,3", opacity: "0.5",
      }));
      const tl = svgEl("text", { x: W - pad.r - 4, y: targetY - 4, "text-anchor": "end", fill: "#5c9e6e", "font-size": "9", opacity: "0.8" });
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
          <div class="tt">${d.week}</div>
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
          "text-anchor": "middle", fill: "#9a8f84", "font-size": "9",
        });
        vt.textContent = Math.round(d.km);
        svg.appendChild(vt);
      }
      this._xLabel(svg, x + bw / 2, H - pad.b + 14, d.week);
    });
  },

  /* ── 2. CTL-Progression mit Interpolation ──────────────────── */
  renderCTL(svgId, rides) {
    const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
    const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    if (!sorted.some(r => r.ctl != null)) return;

    // Fehlende CTL-Werte linear zwischen bekannten Punkten interpolieren
    const data = sorted.map((r, i) => {
      if (r.ctl != null) return { ...r, ctlVal: r.ctl, interpolated: false };
      const prev = sorted.slice(0, i).reverse().find(x => x.ctl != null);
      const next = sorted.slice(i + 1).find(x => x.ctl != null);
      if (prev && next) {
        const pi = sorted.indexOf(prev), ni = sorted.indexOf(next);
        const t = (i - pi) / (ni - pi);
        return { ...r, ctlVal: prev.ctl + t * (next.ctl - prev.ctl), interpolated: true };
      }
      if (prev) return { ...r, ctlVal: prev.ctl, interpolated: true };
      if (next) return { ...r, ctlVal: next.ctl, interpolated: true };
      return null;
    }).filter(Boolean);

    const W = 780, H = 210, pad = { l: 50, r: 16, t: 16, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const maxV = Math.max(...data.map(d => d.ctlVal)) * 1.12;

    this._gridLines(svg, W, H, pad, maxV);

    const pts = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      y: pad.t + ch - d.ctlVal / maxV * ch,
      d,
    }));

    const defs = svgEl("defs", {});
    const grad = svgEl("linearGradient", { id: "ctl-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0%",   "stop-color": "#e07b39", "stop-opacity": "0.2" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#e07b39", "stop-opacity": "0"   }));
    defs.appendChild(grad); svg.appendChild(defs);

    const areaPath = "M" + pts.map(p => `${p.x},${p.y}`).join(" L") +
      ` L${pts[pts.length - 1].x},${pad.t + ch} L${pts[0].x},${pad.t + ch} Z`;
    svg.appendChild(svgEl("path", { d: areaPath, fill: "url(#ctl-grad)" }));
    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#e07b39", "stroke-width": "2",
      points: pts.map(p => `${p.x},${p.y}`).join(" "),
    }));

    const step = Math.max(1, Math.floor(pts.length / 20));
    pts.forEach((p, i) => {
      if (i % step !== 0 && i !== pts.length - 1) return;
      const interp = p.d.interpolated;
      const c = svgEl("circle", {
        cx: p.x, cy: p.y,
        r: interp ? "2" : "3",
        fill: interp ? "#6b6158" : "#e07b39",
        stroke: "#141210", "stroke-width": "1.5",
        opacity: interp ? "0.5" : "1",
      });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week}</div>
        <div class="tv">CTL ${Math.round(p.d.ctlVal)}${interp ? " (interpoliert)" : ""}</div>
        <div class="td">${p.d.name}</div>
      `));
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });

    const ls = Math.max(1, Math.floor(pts.length / 10));
    pts.forEach((p, i) => {
      if (i % ls === 0 || i === pts.length - 1)
        this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });
  },

  /* ── 3. TRIMP pro Woche ─────────────────────────────────────── */
  renderTrimp(svgId, weeklyData) {
    const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
    if (!weeklyData.length) { svg.innerHTML = `<text x="390" y="115" text-anchor="middle" fill="#6b6158" font-size="11">Keine Wochendaten verfügbar</text>`; return; }
    const W = 780, H = 230, pad = { l: 50, r: 16, t: 16, b: 40 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const maxV = Math.max(...weeklyData.map(d => d.trimp || 0)) * 1.15 || 1;
    const bw = Math.min(cw / weeklyData.length * 0.62, 52);
    const gap = cw / weeklyData.length;

    this._gridLines(svg, W, H, pad, maxV);

    // Absolute Farbskala basierend auf trainingswissenschaftlichen Grenzwerten
    const _trimpColor = (v) => {
      if (v < 400)       return "#5c9e6e"; // grün  — Erholung
      if (v < 600)       return "#c9a84c"; // gelb  — moderat
      if (v < 900)       return "#e07b39"; // orange — hoch
      return "#c45c5c";                    // rot   — sehr hoch
    };

    weeklyData.forEach((d, i) => {
      const x  = pad.l + i * gap + (gap - bw) / 2;
      const bh = Math.max((d.trimp || 0) / maxV * ch, 1);
      const y  = pad.t + ch - bh;
      const color = _trimpColor(d.trimp || 0);
      const rect = svgEl("rect", { x, y, width: bw, height: bh, rx: "3", fill: color, opacity: "0.82" });
      rect.style.cursor = "pointer";
      rect.style.transition = "opacity 0.12s";
      rect.addEventListener("mouseenter", e => {
        rect.setAttribute("opacity", "1");
        Tooltip.show(e, `
          <div class="tt">${d.week} · ${d.plan || "Plan 1"}</div>
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

      this._xLabel(svg, x + bw / 2, H - pad.b + 14, d.week);
    });
  },

  /* ── 5. NEU: Aerobe Effizienz (Watt/HF über Zeit) ──────────── */
  renderEfficiency(svgId, rides) {
    const data = rides
      .filter(r => r.efficiency)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 210, pad = { l: 50, r: 16, t: 16, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const vals = data.map(d => d.efficiency);
    const minV = Math.max(0, Math.min(...vals) - 0.1);
    const maxV = Math.max(...vals) + 0.1;

    this._gridLines(svg, W, H, pad, maxV, minV);

    const pts = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      y: pad.t + ch - (d.efficiency - minV) / (maxV - minV) * ch,
      d,
    }));

    // Trendlinie (einfache lineare Regression)
    const n = pts.length;
    if (n > 2) {
      const mx = pts.reduce((s, p) => s + p.x, 0) / n;
      const my = pts.reduce((s, p) => s + p.y, 0) / n;
      const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) /
                    pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
      const intercept = my - slope * mx;
      const x1 = pts[0].x, x2 = pts[n - 1].x;
      svg.appendChild(svgEl("line", {
        x1, y1: slope * x1 + intercept,
        x2, y2: slope * x2 + intercept,
        stroke: "#5c9e6e", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.6",
      }));
    }

    // Datenpunkte
    data.forEach((d, i) => {
      const p = pts[i];
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "4", fill: "#4a7fa8", opacity: "0.8", stroke: "#141210", "stroke-width": "1" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${d.dateShort} · ${d.week}</div>
        <div class="tv">Effizienz: ${fmt(d.efficiency, 2)} W/bpm</div>
        <div class="td">${fmtInt(d.watt)}W · ${fmtInt(d.hf)} bpm</div>
        <div class="td">${d.name}</div>
      `));
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });

    const ls = Math.max(1, Math.floor(pts.length / 8));
    pts.forEach((p, i) => {
      if (i % ls === 0 || i === pts.length - 1)
        this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });
  },

  /* ── 6. NEU: Tempo vs. HF Scatterplot ──────────────────────── */
  renderScatter(svgId, rides) {
    const data = rides.filter(r => r.kmh && r.hf)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 260, pad = { l: 54, r: 20, t: 16, b: 44 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const minX = Math.min(...data.map(d => d.kmh)) - 1;
    const maxX = Math.max(...data.map(d => d.kmh)) + 1;
    const minY = Math.min(...data.map(d => d.hf)) - 5;
    const maxY = Math.max(...data.map(d => d.hf)) + 5;

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ch / 4 * i;
      const yVal = Math.round(maxY - (maxY - minY) / 4 * i);
      svg.appendChild(svgEl("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: "#2e2923", "stroke-width": "1" }));
      const t = svgEl("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", fill: "#6b6158", "font-size": "10" });
      t.textContent = yVal; svg.appendChild(t);
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.l + cw / 4 * i;
      const xVal = (minX + (maxX - minX) / 4 * i).toFixed(1);
      const t = svgEl("text", { x, y: H - pad.b + 14, "text-anchor": "middle", fill: "#6b6158", "font-size": "10" });
      t.textContent = xVal; svg.appendChild(t);
    }

    // Achsen-Labels
    const xLbl = svgEl("text", { x: W / 2, y: H - 2, "text-anchor": "middle", fill: "#6b6158", "font-size": "10" });
    xLbl.textContent = "Tempo (km/h)"; svg.appendChild(xLbl);
    const yLbl = svgEl("text", { x: 12, y: H / 2, "text-anchor": "middle", fill: "#6b6158", "font-size": "10",
      transform: `rotate(-90, 12, ${H / 2})` });
    yLbl.textContent = "Ø HF (bpm)"; svg.appendChild(yLbl);

    // Koordinaten vorberechnen
    const pts = data.map(d => ({
      px: pad.l + (d.kmh - minX) / (maxX - minX) * cw,
      py: pad.t + ch - (d.hf - minY) / (maxY - minY) * ch,
      d,
    }));


    // Punkte — Farbe nach Phase
    pts.forEach(({ px, py, d }) => {
      const color = CONFIG.phaseColor(d.phase);
      const c = svgEl("circle", { cx: px, cy: py, r: "5", fill: color, opacity: "0.75", stroke: "#141210", "stroke-width": "1" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${d.dateShort} · ${d.week}</div>
        <div class="tv">${fmt(d.kmh)} km/h · ${fmtInt(d.hf)} bpm</div>
        <div class="td">${d.name}</div>
      `));
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });
  },

  /* ── 7. NEU: Wochentag-Heatmap ──────────────────────────────── */
  renderHeatmap(svgId, rides) {
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
    const W = 780, H = 110, cellW = 80, cellH = 64, startX = (W - 7 * cellW) / 2;

    // Grün → Gelb → Orange → Rot basierend auf Intensität
    const _heatColor = (t) => {
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
      const color = _heatColor(intensity);
      const isMax = counts[i] === maxCount;

      const rect = svgEl("rect", {
        x: x + 4, y: 20, width: cellW - 8, height: cellH,
        rx: "8", fill: color,
        stroke: isMax ? "#c45c5c" : "#2e2923",
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
        fill: isMax ? "#c45c5c" : "#9a8f84",
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
        fill: intensity > 0.35 ? "#f0ebe4" : "#9a8f84",
        "font-size": "20", "font-weight": "700",
      });
      cnt.textContent = counts[i];
      svg.appendChild(cnt);

      // km
      const km = svgEl("text", {
        x: x + cellW / 2, y: 74,
        "text-anchor": "middle",
        fill: intensity > 0.3 ? "rgba(240,235,228,0.75)" : "#6b6158",
        "font-size": "9",
      });
      km.textContent = Math.round(kmTotals[i]) + " km";
      svg.appendChild(km);
    });
  },

  /* ── 9. Small Multiples (Tempo · HF · Kadenz pro Fahrt) ────── */
  renderSmallMultiples(rides) {
    const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const ownPlan = rides.some(r => r.week);
    const PPT = 16;
    const H = 180, pad = { l: 50, r: 24, t: 16, b: 36 };

    const _render = (svgId, data, field, color, unit, targetLine) => {
      const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

      const W = Math.max(780, data.length * PPT + 74);
      const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);

      const vals = data.map(d => d[field]);
      const minV = Math.max(0, Math.min(...vals) - 2);
      const maxV = Math.max(...vals) + 2;

      this._gridLines(svg, W, H, pad, maxV, minV);

      // Plan divider + Labels
      const plan2Start = data.findIndex(d => d.plan === "Plan 2");
      if (plan2Start > 0) {
        const divX = pad.l + (plan2Start - 0.5) / Math.max(data.length - 1, 1) * cw;
        svg.appendChild(svgEl("rect", {
          x: divX - 0.5, y: pad.t, width: 1, height: ch,
          fill: "#6b6158", opacity: "0.5",
        }));
        const lbl1 = svgEl("text", { x: divX - 8, y: pad.t + 12, "text-anchor": "end", fill: "#6b6158", "font-size": "9", "font-weight": "600" });
        lbl1.textContent = "Plan 1"; svg.appendChild(lbl1);
        const lbl2 = svgEl("text", { x: divX + 8, y: pad.t + 12, "text-anchor": "start", fill: "#e07b39", "font-size": "9", "font-weight": "600" });
        lbl2.textContent = "Plan 2"; svg.appendChild(lbl2);
      }

      if (targetLine != null) {
        const ty = pad.t + ch - (targetLine - minV) / (maxV - minV) * ch;
        svg.appendChild(svgEl("line", {
          x1: pad.l, y1: ty, x2: W - pad.r, y2: ty,
          stroke: "#c9a84c", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.5",
        }));
        // Label oberhalb der Linie, nicht rechts daneben — kein Overlap mit Plan-Label
        const lt = svgEl("text", { x: W - pad.r - 4, y: ty - 5, "text-anchor": "end", fill: "#c9a84c", "font-size": "9", opacity: "0.85" });
        lt.textContent = `Ziel ${targetLine}`;
        svg.appendChild(lt);
      }

      const pts = data.map((d, i) => ({
        x: pad.l + i / Math.max(data.length - 1, 1) * cw,
        y: pad.t + ch - (d[field] - minV) / (maxV - minV) * ch,
        d,
      }));

      svg.appendChild(svgEl("polyline", {
        fill: "none", stroke: color, "stroke-width": "1.8",
        points: pts.map(p => `${p.x},${p.y}`).join(" "),
      }));

      const n = pts.length;
      if (n > 2) {
        const mx = pts.reduce((s, p) => s + p.x, 0) / n;
        const my = pts.reduce((s, p) => s + p.y, 0) / n;
        const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) /
                      pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
        const intercept = my - slope * mx;
        const x1 = pts[0].x, x2 = pts[n - 1].x;
        svg.appendChild(svgEl("line", {
          x1, y1: slope * x1 + intercept, x2, y2: slope * x2 + intercept,
          stroke: "#5c9e6e", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.6",
        }));
      }

      pts.forEach((p, i) => {
        const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: color, stroke: "#141210", "stroke-width": "1.5" });
        c.style.cursor = "pointer";
        c.addEventListener("mouseenter", e => Tooltip.show(e, `
          <div class="tt">${p.d.dateShort} · ${p.d.week}</div>
          <div class="tv">${Math.round(p.d[field] * 10) / 10} ${unit}</div>
          <div class="td">${p.d.name}</div>
        `));
        c.addEventListener("mouseleave", () => Tooltip.hide());
        svg.appendChild(c);
      });

      // X-Labels: mindestens 55px Abstand zwischen Labels
      let lastLabelX = -999;
      pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        if (i % Math.max(1, Math.floor(pts.length / 15)) === 0 || isLast) {
          if (p.x - lastLabelX >= 55 || isLast) {
            this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
            lastLabelX = p.x;
          }
        }
      });

      // Scroll: Container-Breite explizit setzen damit Browser scrollt
      const scrollContainer = svg.parentElement;
      if (scrollContainer && scrollContainer.classList.contains("chart-scroll")) {
        scrollContainer.style.overflowX = "auto";
        svg.style.minWidth = W + "px";
        requestAnimationFrame(() => { scrollContainer.scrollLeft = scrollContainer.scrollWidth; });
      }
    };

    const _filterOutliers = (arr, field) => {
      const vals = arr.map(d => d[field]).filter(v => v != null).sort((a, b) => a - b);
      if (vals.length < 4) return arr;
      const q1 = vals[Math.floor(vals.length * 0.25)];
      const q3 = vals[Math.floor(vals.length * 0.75)];
      const iqr = q3 - q1;
      const lo = q1 - 2.5 * iqr;
      const hi = q3 + 2.5 * iqr;
      return arr.filter(d => d[field] == null || (d[field] >= lo && d[field] <= hi));
    };

    _render("chart-sm-tempo",  _filterOutliers(sorted.filter(r => r.kmh), "kmh"), "kmh", "#4a7fa8", "km/h", null);
    _render("chart-sm-hf",     _filterOutliers(sorted.filter(r => r.hf),  "hf"),  "hf",  "#c45c5c", "bpm",  null);
    _render("chart-sm-kadenz", _filterOutliers(sorted.filter(r => r.kad), "kad"), "kad", "#c9a84c", "RPM",  ownPlan ? CONFIG.cadenceTarget : null);
  },

  /* ── 10. Ruhepuls-Entwicklung ────────────────────────────────── */
  renderHRV(svgId, rides) {
    // Delegiert an Plan-Compare-Slider
    // Legacy-Aufruf ignorieren — wird jetzt über renderPlanCompareHRV gesteuert
  },

  /* ── HRV / Ruhepuls — durchgehende Linie mit Plan-Divider ───── */
  _renderHrvRhfChart(svgId, data, color1, color2, unit, field, methodNote) {
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 250, pad = { l: 50, r: 16, t: 28, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const allVals = data.map(d => d[field]);
    const minV = Math.max(0, Math.min(...allVals) - 5);
    const maxV = Math.max(...allVals) + 5;

    this._gridLines(svg, W, H, pad, maxV, minV);

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
        ` L${segment[segment.length-1].x},${H - pad.b} Z`;
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
      const n = segment.length;
      if (n < 3) return;
      const mx = segment.reduce((s, p) => s + p.x, 0) / n;
      const my = segment.reduce((s, p) => s + p.y, 0) / n;
      const denom = segment.reduce((s, p) => s + (p.x - mx) ** 2, 0);
      if (denom === 0) return;
      const slope = segment.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / denom;
      const intercept = my - slope * mx;
      svg.appendChild(svgEl("line", {
        x1: segment[0].x, y1: slope * segment[0].x + intercept,
        x2: segment[n-1].x, y2: slope * segment[n-1].x + intercept,
        stroke: "#5c9e6e", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.7",
      }));
    };
    drawTrend(pts.slice(0, plan2Start > 0 ? plan2Start : pts.length));
    if (seg2.length >= 3) drawTrend(seg2);

    // Dots — Farbe je Segment
    const step = Math.max(1, Math.floor(pts.length / 24));
    pts.forEach((p, i) => {
      if (i % step !== 0 && i !== pts.length - 1) return;
      const dotColor = p.d.week === "P2-W0" ? colorW0 : p.d.plan === "Plan 2" ? color2 : color1;
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3.5", fill: dotColor, stroke: "#141210", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week || ""} · ${p.d.plan || "Plan 1"}</div>
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
        this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });

    // Divider-Linien: Plan1→W0 und W0→Plan2 (falls W0 existiert), sonst nur ein Divider
    const diviAt = (idx, label1, label2, c1, c2) => {
      const divX = pad.l + (idx - 0.5) / Math.max(data.length - 1, 1) * cw;
      svg.appendChild(svgEl("rect", {
        x: divX - 1, y: pad.t, width: 2, height: ch,
        fill: "#6b6158", opacity: "0.6",
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
      const lines = this._wrapText(methodNote, 92);
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
      const mean1 = vals1.reduce((s,v)=>s+v,0)/vals1.length;
      const mean2 = vals2.reduce((s,v)=>s+v,0)/vals2.length;
      const closeMeans = Math.abs(mean1 - mean2) < (maxV - minV) * 0.08;
      meanFor(vals2, color2, p2StartIdx, data.length - 1, !closeMeans);
    }
  },

  /** Bricht einen Text an Wortgrenzen auf mehrere Zeilen um (max. ~maxChars pro Zeile) */
  _wrapText(text, maxChars) {
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    words.forEach(w => {
      if ((cur + " " + w).trim().length > maxChars) {
        lines.push(cur.trim());
        cur = w;
      } else {
        cur = (cur + " " + w).trim();
      }
    });
    if (cur) lines.push(cur);
    return lines;
  },

  /* ── HRV Plan Compare ──────────────────────────────────────── */
  renderPlanCompareHRV(rides) {
    const data = rides.filter(r => r.hrv != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    this._renderHrvRhfChart("chart-hrv-p1", data, "#7c5cbf", "#e07b39", "ms", "hrv",
      "⚠ Methodenwechsel: Plan 1 = RMSSD (Apple Health), Plan 2 = SDNN Schlafschnitt (intervals.icu) — Niveau nicht direkt vergleichbar, Trend pro Segment getrennt berechnet.");
  },

  renderRHF(svgId, rides) {
    // Delegiert an Plan-Compare
  },

  /* ── RHF Plan Compare ──────────────────────────────────────── */
  renderPlanCompareRHF(rides) {
    const data = rides.filter(r => r.ruhepuls != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    this._renderHrvRhfChart("chart-rhf-p1", data, "#c45c5c", "#e07b39", "bpm", "ruhepuls", null);
  },

  /* ── PMC — Performance Management Chart ─────────────────────── */
  renderPMC(svgId, rides) {
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
    const tsbVals = data.map(d => (d.tsb != null ? d.tsb : d.ctl - d.atl));

    const maxCA = Math.max(...ctlVals, ...atlVals) * 1.1;
    const minTSB = Math.min(...tsbVals) - 5;
    const maxTSB = Math.max(...tsbVals) + 5;

    const tsbY = (v) => pad.t + ch - (v - minTSB) / (maxTSB - minTSB) * ch;
    const caY = (v) => pad.t + ch - v / maxCA * ch;

    this._gridLines(svg, W, H, pad, Math.round(maxCA), 0);

    // Plan divider
    const plan2Start = data.findIndex(d => d.plan === "Plan 2");
    if (plan2Start > 0) {
      const divX = pad.l + (plan2Start - 0.5) / Math.max(data.length - 1, 1) * cw;
      svg.appendChild(svgEl("rect", {
        x: divX - 0.5, y: pad.t, width: 1, height: ch,
        fill: "#6b6158", opacity: "0.6",
      }));
      const lbl1 = svgEl("text", { x: divX - 8, y: pad.t + 12, "text-anchor": "end", fill: "#6b6158", "font-size": "9", "font-weight": "600" });
      lbl1.textContent = "Plan 1"; svg.appendChild(lbl1);
      const lbl2 = svgEl("text", { x: divX + 8, y: pad.t + 12, "text-anchor": "start", fill: "#e07b39", "font-size": "9", "font-weight": "600" });
      lbl2.textContent = "Plan 2"; svg.appendChild(lbl2);
    }

    // TSB sweet spot zone (-10 to -30)
    const zoneTop = tsbY(-10);
    const zoneBot = tsbY(-30);
    svg.appendChild(svgEl("rect", {
      x: pad.l, y: Math.min(zoneTop, zoneBot),
      width: cw, height: Math.abs(zoneBot - zoneTop),
      fill: "#5c9e6e", opacity: "0.06", rx: "2",
    }));
    const zoneLabel = svgEl("text", {
      x: pad.l + 4, y: Math.min(zoneTop, zoneBot) + 10,
      fill: "#5c9e6e", "font-size": "8", opacity: "0.5",
    });
    zoneLabel.textContent = "Sweet Spot Zone";
    svg.appendChild(zoneLabel);

    // TSB zero line
    const tsbZeroY = tsbY(0);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: tsbZeroY, x2: W - pad.r, y2: tsbZeroY,
      stroke: "#5c9e6e", "stroke-width": "0.5", "stroke-dasharray": "4,4", opacity: "0.4",
    }));

    // TSB area fill
    const tsbPtsRaw = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      v: d.tsb != null ? d.tsb : d.ctl - d.atl,
    }));
    const posPath = `M${tsbPtsRaw[0].x},${tsbZeroY} ` +
      tsbPtsRaw.map(p => `L${p.x},${p.v >= 0 ? tsbY(p.v) : tsbZeroY}`).join(" ") +
      ` L${tsbPtsRaw[tsbPtsRaw.length-1].x},${tsbZeroY} Z`;
    svg.appendChild(svgEl("path", { d: posPath, fill: "#5c9e6e", opacity: "0.1" }));
    const negPath = `M${tsbPtsRaw[0].x},${tsbZeroY} ` +
      tsbPtsRaw.map(p => `L${p.x},${p.v < 0 ? tsbY(p.v) : tsbZeroY}`).join(" ") +
      ` L${tsbPtsRaw[tsbPtsRaw.length-1].x},${tsbZeroY} Z`;
    svg.appendChild(svgEl("path", { d: negPath, fill: "#c45c5c", opacity: "0.08" }));

    // CTL area fill
    const ctlAreaPath = `M${pad.l},${caY(0)} ` +
      data.map((d, i) => `L${pad.l + i / Math.max(data.length - 1, 1) * cw},${caY(d.ctl)}`).join(" ") +
      ` L${pad.l + (data.length - 1) / Math.max(data.length - 1, 1) * cw},${caY(0)} Z`;
    svg.appendChild(svgEl("path", { d: ctlAreaPath, fill: "#4a7fa8", opacity: "0.08" }));

    // Lines
    const _line = (color, width, yMap, dash) => {
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

    const ctlPts = _line("#4a7fa8", "2.5", d => caY(d.ctl));
    _line("#c45c5c", "1.2", d => caY(d.atl), "4,2");
    _line("#5c9e6e", "1.5", d => tsbY(d.tsb != null ? d.tsb : d.ctl - d.atl));

    // TSB right axis labels
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(minTSB + (maxTSB - minTSB) / 4 * (4 - i));
      const y = pad.t + ch / 4 * i;
      const t = svgEl("text", { x: W - pad.r + 6, y: y + 4, fill: "#5c9e6e", "font-size": "9" });
      t.textContent = val;
      svg.appendChild(t);
    }

    // Dots on CTL
    const step = Math.max(1, Math.floor(ctlPts.length / 25));
    ctlPts.forEach((p, i) => {
      if (i % step !== 0 && i !== ctlPts.length - 1) return;
      const tsb = p.d.tsb != null ? p.d.tsb : Math.round((p.d.ctl - p.d.atl) * 10) / 10;
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: "#4a7fa8", stroke: "#141210", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week}</div>
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
        this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });

    // Auto-scroll to right
    const scrollContainer = el("pmc-scroll");
    if (scrollContainer) {
      scrollContainer.style.overflowX = "auto";
      svg.style.minWidth = W + "px";
      requestAnimationFrame(() => { scrollContainer.scrollLeft = scrollContainer.scrollWidth; });
    }
  },

  /* ── Aerobe Entkopplung (Decoupling) ─────────────────────────── */
  renderDecoupling(svgId, rides) {
    const data = rides.filter(r => r.decoupling != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 200, pad = { l: 50, r: 16, t: 16, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const maxV = Math.max(Math.max(...data.map(d => Math.abs(d.decoupling))), 10) + 3;
    const minV = 0;

    this._gridLines(svg, W, H, pad, maxV, minV);

    // Target line at 5%
    const targetY = pad.t + ch - (5 - minV) / (maxV - minV) * ch;
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
      stroke: "#5c9e6e", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.6",
    }));
    const tgt = svgEl("text", { x: W - pad.r + 4, y: targetY + 4, fill: "#5c9e6e", "font-size": "9" });
    tgt.textContent = "5%";
    svg.appendChild(tgt);

    const pts = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      y: pad.t + ch - (Math.abs(d.decoupling) - minV) / (maxV - minV) * ch,
      d,
    }));

    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#e07b39", "stroke-width": "1.8",
      points: pts.map(p => `${p.x},${p.y}`).join(" "),
    }));

    pts.forEach((p) => {
      const color = Math.abs(p.d.decoupling) <= 5 ? "#5c9e6e" : Math.abs(p.d.decoupling) <= 10 ? "#c9a84c" : "#c45c5c";
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "4", fill: color, stroke: "#141210", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week}</div>
        <div class="tv">${fmt(Math.abs(p.d.decoupling))}%</div>
        <div class="td">${p.d.name}</div>
      `));
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });

    pts.forEach((p, i) => {
      if (i === 0 || i === pts.length - 1)
        this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });
  },

  /* ── Schlaf — Dauer & Schlaf-HF ─────────────────────────────── */
  renderSleep(svgId, wellness, ownPlan = true) {
    const data = wellness.filter(w => w.sleepHours != null || w.avgSleepingHR != null);
    const svg = el(svgId);
    if (!svg) return;
    if (!data.length) {
      svg.innerHTML = "";
      const t = svgEl("text", { x: 390, y: 100, "text-anchor": "middle", fill: "#6b6158", "font-size": "12" });
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

    this._gridLines(svg, W, H, pad, maxSleep, 0, 4, true);

    const bw = Math.min(cw / data.length * 0.6, 20);
    const gap = cw / data.length;

    // Balken: Schlafdauer
    data.forEach((d, i) => {
      if (!d.sleepHours) return;
      const x = pad.l + i * gap + (gap - bw) / 2;
      const bh = Math.max(d.sleepHours / maxSleep * ch, 1);
      const y = pad.t + ch - bh;
      const color = d.sleepHours >= 7 ? "#4a7fa8" : d.sleepHours >= 6 ? "#c9a84c" : "#c45c5c";
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
      const t = svgEl("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", fill: "#6b6158", "font-size": "9" });
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
        fill: "none", stroke: "#c45c5c", "stroke-width": "1.8",
        points: hrPts.map(p => `${p.x},${p.y}`).join(" "),
      }));

      hrPts.forEach(p => {
        const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: "#c45c5c", stroke: "#141210", "stroke-width": "1.5" });
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
        const t = svgEl("text", { x: W - pad.r + 6, y: y + 4, fill: "#c45c5c", "font-size": "9" });
        t.textContent = v; svg.appendChild(t);
      }
    }

    // X Labels mit Mindestabstand
    let lastLabelX = -999;
    data.forEach((d, i) => {
      const x = pad.l + i * gap + gap / 2;
      const isLast = i === data.length - 1;
      if (x - lastLabelX >= 55 || isLast) {
        this._xLabel(svg, x, H - pad.b + 14, d.dateShort);
        lastLabelX = x;
      }
    });

    // Auto-scroll
    const scrollContainer = svg.parentElement;
    if (scrollContainer && scrollContainer.classList.contains("chart-scroll")) {
      scrollContainer.style.overflowX = "auto";
      svg.style.minWidth = W + "px";
      requestAnimationFrame(() => { scrollContainer.scrollLeft = scrollContainer.scrollWidth; });
    }
  },

  /* ── Power Curve ─────────────────────────────────────────────── */
  renderPowerCurve(svgId, powerCurves, ftp, weight) {
    // Daten einmal parsen und cachen für Toggle
    this._pcCache = { svgId, powerCurves, ftp, weight };
    this._pcUnit = "w";
    this._drawPowerCurve("w");

    // Toggle-Buttons verdrahten
    const toggle = document.getElementById("power-curve-unit-toggle");
    if (toggle) {
      const btns = toggle.querySelectorAll(".unit-btn");
      const wkgBtn = toggle.querySelector('[data-unit="wkg"]');

      // W/kg deaktivieren wenn kein Gewicht
      if (!weight && wkgBtn) {
        wkgBtn.disabled = true;
        wkgBtn.title = "Kein Gewicht in intervals.icu verfügbar";
      }

      btns.forEach(btn => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          btns.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          this._pcUnit = btn.dataset.unit;
          this._drawPowerCurve(btn.dataset.unit);
        });
      });
    }
  },

  _drawPowerCurve(unit) {
    const { svgId, powerCurves, ftp, weight } = this._pcCache;
    const isWkg = unit === "wkg" && weight > 0;

    const svg = el(svgId);
    if (!svg) return;
    svg.innerHTML = "";

    if (!powerCurves) {
      const t = svgEl("text", { x: 390, y: 120, "text-anchor": "middle", fill: "#6b6158", "font-size": "12" });
      t.textContent = "Power-Curve-Daten werden beim nächsten Sync geladen";
      svg.appendChild(t);
      return;
    }

    const STANDARD_SECS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
    const LABELS = ["1s", "5s", "10s", "30s", "1min", "2min", "5min", "10min", "20min", "30min", "60min"];

    let secsArr, wattsArr;
    let curveData = [];
    if (powerCurves.list && Array.isArray(powerCurves.list) && powerCurves.list.length > 0) {
      const best = powerCurves.list[0];
      secsArr = best.secs || [];
      wattsArr = best.watts || [];
    } else if (powerCurves.secs && powerCurves.watts) {
      secsArr = powerCurves.secs;
      wattsArr = powerCurves.watts;
    } else {
      secsArr = []; wattsArr = [];
    }

    const wattsMap = {};
    for (let i = 0; i < secsArr.length; i++) {
      if (wattsArr[i] != null && wattsArr[i] > 0) wattsMap[secsArr[i]] = wattsArr[i];
    }

    curveData = STANDARD_SECS.map((s, i) => ({
      secs: s,
      watts: this._nearestWatts(wattsMap, s),
      label: LABELS[i],
    })).filter(d => d.watts && d.watts > 0);

    if (!curveData.length) {
      const t = svgEl("text", { x: 390, y: 120, "text-anchor": "middle", fill: "#6b6158", "font-size": "12" });
      t.textContent = "Noch keine Power-Curve-Daten verfügbar";
      svg.appendChild(t);
      return;
    }

    // Werte konvertieren wenn W/kg
    const toVal = (w) => isWkg ? w / weight : w;
    const fmtVal = (v) => isWkg ? v.toFixed(2) + " W/kg" : Math.round(v) + "W";
    const fmtAxis = (v) => isWkg ? v.toFixed(1) : v + "W";
    const ftpVal = ftp ? toVal(ftp) : null;

    const W = 780, H = 260, pad = { l: 56, r: 16, t: 20, b: 44 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const vals = curveData.map(d => toVal(d.watts));
    const maxV = Math.max(...vals) * 1.1;
    const xScale = (i) => pad.l + (i / (curveData.length - 1)) * cw;
    const yScale = (v) => pad.t + ch - (v / maxV) * ch;

    // Grid Y
    const step = isWkg
      ? (maxV > 10 ? 2 : maxV > 5 ? 1 : 0.5)
      : Math.ceil(maxV / 5 / 50) * 50;
    for (let v = 0; v <= maxV; v += step) {
      const y = yScale(v);
      if (y < pad.t) break;
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: y, x2: W - pad.r, y2: y,
        stroke: "#2e2923", "stroke-width": "1",
      }));
      const t = svgEl("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", fill: "#6b6158", "font-size": "9" });
      t.textContent = fmtAxis(v);
      svg.appendChild(t);
    }

    // FTP-Linie
    if (ftpVal != null) {
      const ftpY = yScale(ftpVal);
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: ftpY, x2: W - pad.r, y2: ftpY,
        stroke: "#c9a84c", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.8",
      }));
      const ft = svgEl("text", {
        x: pad.l + 6, y: ftpY - 5,
        fill: "#c9a84c", "font-size": "9", "font-weight": "600",
      });
      ft.textContent = isWkg ? `FTP ${(ftp / weight).toFixed(2)} W/kg` : `FTP ${ftp}W`;
      svg.appendChild(ft);
    }

    // Fläche unter der Kurve
    const areaPath = `M${xScale(0)},${pad.t + ch} ` +
      curveData.map((d, i) => `L${xScale(i)},${yScale(toVal(d.watts))}`).join(" ") +
      ` L${xScale(curveData.length - 1)},${pad.t + ch} Z`;
    svg.appendChild(svgEl("path", { d: areaPath, fill: "#e07b39", opacity: "0.04" }));

    // Fläche über FTP — anaerobe Reserve
    if (ftpVal != null) {
      const ftpY = yScale(ftpVal);
      const aboveFtpPath = `M${xScale(0)},${Math.min(yScale(toVal(curveData[0].watts)), ftpY)} ` +
        curveData.map((d, i) => {
          const y = yScale(toVal(d.watts));
          return `L${xScale(i)},${Math.min(y, ftpY)}`;
        }).join(" ") +
        ` L${xScale(curveData.length - 1)},${ftpY} L${xScale(0)},${ftpY} Z`;
      svg.appendChild(svgEl("path", { d: aboveFtpPath, fill: "#c45c5c", opacity: "0.15" }));
    }

    // Kurve
    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#e07b39", "stroke-width": "2",
      "stroke-linejoin": "round",
      points: curveData.map((d, i) => `${xScale(i)},${yScale(toVal(d.watts))}`).join(" "),
    }));

    // Punkte + Labels
    curveData.forEach((d, i) => {
      const v = toVal(d.watts);
      const x = xScale(i), y = yScale(v);
      const above = i % 2 === 0;
      const overFtp = ftp && d.watts > ftp;

      svg.appendChild(svgEl("circle", {
        cx: x, cy: y, r: "5",
        fill: "#e07b39", stroke: "#141210", "stroke-width": "1.5",
      }));

      // Tooltip — zeigt immer beide Einheiten
      const hit = svgEl("circle", { cx: x, cy: y, r: "10", fill: "transparent" });
      hit.style.cursor = "pointer";
      const wkgInfo = weight ? `${(d.watts / weight).toFixed(2)} W/kg` : "";
      hit.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${d.label}</div>
        <div class="tv">${Math.round(d.watts)} W${wkgInfo ? " · " + wkgInfo : ""}</div>
        <div class="td">${ftp ? `${(d.watts / ftp).toFixed(2)}× FTP · ${overFtp ? "über FTP" : "unter FTP"}` : ""}</div>
      `));
      hit.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(hit);

      // Wert-Label abwechselnd oben/unten
      const labelY = above ? y - 10 : y + 18;
      const clampedY = Math.max(pad.t + 10, Math.min(pad.t + ch - 4, labelY));
      const wl = svgEl("text", {
        x, y: clampedY, "text-anchor": "middle",
        fill: "#e07b39", "font-size": "9", "font-weight": "600",
      });
      wl.textContent = fmtVal(v);
      svg.appendChild(wl);

      // X-Label
      const xl = svgEl("text", { x, y: H - pad.b + 16, "text-anchor": "middle", fill: "#6b6158", "font-size": "9" });
      xl.textContent = d.label;
      svg.appendChild(xl);
    });
  },

  /* ── Wöchentliche Wetterbedingungen (Temp-Balken + Wind-Linie) ── */
  renderWeatherWeekly(svgId, rides) {
    // Nur Fahrten mit Wetterdaten, nach Woche gruppieren
    const withWeather = rides.filter(r => r.weather?.temp != null);
    if (!withWeather.length) {
      const svg = el(svgId); if (!svg) return; svg.innerHTML = "";
      const t = svgEl("text", { x: 390, y: 100, "text-anchor": "middle", fill: "#6b6158", "font-size": "12" });
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

    // Wochen in Trainingsreihenfolge sortieren, mit Lücke zwischen Plan 1 und Plan 2
    const rawWeeks = Object.values(weekMap).sort((a, b) =>
      CONFIG.weekIndex(a.week) - CONFIG.weekIndex(b.week)
    );

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
      if (bad >= 2 || hot || (windy && rainy)) return "#c45c5c";
      if (bad === 1) return "#c9a84c";
      return "#5c9e6e";
    };

    // Grid Y Temp (links)
    const tStep = Math.ceil((maxT - minT) / 5 / 5) * 5;
    for (let t = Math.ceil(minT / 5) * 5; t <= maxT; t += tStep) {
      const y = yTemp(t);
      svg.appendChild(svgEl("line", { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: "#2e2923", "stroke-width": "1" }));
      const lbl = svgEl("text", { x: pad.l - 5, y: y + 4, "text-anchor": "end", fill: "#6b6158", "font-size": "9" });
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
        const tl = svgEl("text", { x: xMid(i), y: labelY, "text-anchor": "middle", fill: "#141210", "font-size": "8", "font-weight": "600" });
        tl.textContent = d.temp + "°";
        svg.appendChild(tl);
      }

      // X-Label (Woche)
      const xl = svgEl("text", { x: xMid(i), y: H - pad.b + 14, "text-anchor": "middle", fill: "#6b6158", "font-size": "8" });
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
      const condLabel = condColor(d) === "#5c9e6e" ? "✅ Gute Bedingungen"
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
        fill: "#4a7fa8", stroke: "#141210", "stroke-width": "1",
      }));
    });

    // Plan-Divider: in der Mitte der Lücke zwischen Plan 1 und Plan 2
    const p2Start = data.findIndex(d => d.isP2);
    if (p2Start > 0) {
      // Divider liegt in der Mitte des Gap-Bereichs
      const dx = pad.l + (slotIndex(p2Start) - GAP_SLOTS / 2) * (cw / totalSlots);
      svg.appendChild(svgEl("line", {
        x1: dx, y1: pad.t, x2: dx, y2: pad.t + ch,
        stroke: "#e07b39", "stroke-width": "1.5", "stroke-dasharray": "4,3", opacity: "0.6",
      }));
      const lp1 = svgEl("text", { x: dx - 6, y: pad.t + 10, "text-anchor": "end", fill: "#6b6158", "font-size": "8", "font-weight": "600" });
      lp1.textContent = "← Plan 1";
      svg.appendChild(lp1);
      const lp2 = svgEl("text", { x: dx + 6, y: pad.t + 10, "text-anchor": "start", fill: "#e07b39", "font-size": "8", "font-weight": "600" });
      lp2.textContent = "Plan 2 →";
      svg.appendChild(lp2);
    }
  },

  // Nächsten verfügbaren Watt-Wert für eine Sekunden-Anzahl finden
  _nearestWatts(map, targetSecs) {
    const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
    const nearest = keys.reduce((prev, curr) =>
      Math.abs(curr - targetSecs) < Math.abs(prev - targetSecs) ? curr : prev, keys[0]);
    return nearest ? map[nearest] : null;
  },
};
