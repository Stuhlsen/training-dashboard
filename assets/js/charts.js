/* ============================================================
   CHARTS.JS — Alle Chart-Render-Funktionen
   Neue Charts: Effizienz, Scatterplot, Heatmap, TSB
   ============================================================ */

const Charts = {

  /* ── Gemeinsame SVG-Helfer ──────────────────────────────────── */

  _gridLines(svg, W, H, pad, maxV, minV = 0, steps = 4) {
    for (let i = 0; i <= steps; i++) {
      const y   = pad.t + (H - pad.t - pad.b) / steps * i;
      const val = Math.round(maxV - (maxV - minV) / steps * i);
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: y, x2: W - pad.r, y2: y,
        stroke: "#2e2923", "stroke-width": "1",
      }));
      const t = svgEl("text", {
        x: pad.l - 6, y: y + 4,
        "text-anchor": "end", fill: "#6b6158", "font-size": "10",
      });
      t.textContent = val;
      svg.appendChild(t);
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
    const W = 780, H = 270, pad = { l: 50, r: 16, t: 16, b: 40 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const maxKm = Math.max(...weeklyData.map(d => d.km)) * 1.15 || 1;
    const bw = Math.min(cw / weeklyData.length * 0.62, 52);
    const gap = cw / weeklyData.length;

    this._gridLines(svg, W, H, pad, maxKm);

    weeklyData.forEach((d, i) => {
      const x  = pad.l + i * gap + (gap - bw) / 2;
      const bh = Math.max(d.km / maxKm * ch, 1);
      const y  = pad.t + ch - bh;
      const color = CONFIG.phaseColor(d.phase);

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
    const W = 780, H = 230, pad = { l: 50, r: 16, t: 16, b: 40 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const maxV = Math.max(...weeklyData.map(d => d.trimp)) * 1.15 || 1;
    const bw = Math.min(cw / weeklyData.length * 0.62, 52);
    const gap = cw / weeklyData.length;
    const maxTrimp = Math.max(...weeklyData.map(d => d.trimp)) || 1;

    this._gridLines(svg, W, H, pad, maxV);

    // Warm color interpolation based on relative TRIMP
    const _trimpColor = (v) => {
      const t = Math.min(v / maxTrimp, 1);
      const r = Math.round(140 + t * 84);  // 140→224
      const g = Math.round(106 + t * 17);  // 106→123
      const b = Math.round(74 - t * 17);   // 74→57
      return `rgb(${r},${g},${b})`;
    };

    weeklyData.forEach((d, i) => {
      const x  = pad.l + i * gap + (gap - bw) / 2;
      const bh = Math.max(d.trimp / maxV * ch, 1);
      const y  = pad.t + ch - bh;
      const color = _trimpColor(d.trimp);
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
        vt.textContent = d.trimp;
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

    // Fahrten pro Wochentag zählen
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
    const W = 780, H = 100, cellW = 80, cellH = 56, startX = (W - 7 * cellW) / 2;

    days.forEach((day, i) => {
      const x = startX + i * cellW;
      const intensity = counts[i] / maxCount;
      const color = `rgba(224, 123, 57, ${0.1 + intensity * 0.8})`;

      const rect = svgEl("rect", {
        x: x + 4, y: 16, width: cellW - 8, height: cellH,
        rx: "6", fill: color, stroke: "#2e2923", "stroke-width": "1",
      });
      rect.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${day}</div>
        <div class="tv">${counts[i]} Fahrten</div>
        <div class="td">${Math.round(kmTotals[i])} km gesamt</div>
      `));
      rect.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(rect);

      const lbl = svgEl("text", { x: x + cellW / 2, y: 11, "text-anchor": "middle", fill: "#6b6158", "font-size": "10" });
      lbl.textContent = day; svg.appendChild(lbl);

      const cnt = svgEl("text", { x: x + cellW / 2, y: 48, "text-anchor": "middle", fill: intensity > 0.4 ? "#f0ebe4" : "#9a8f84", "font-size": "16", "font-weight": "700" });
      cnt.textContent = counts[i]; svg.appendChild(cnt);

      const km = svgEl("text", { x: x + cellW / 2, y: 62, "text-anchor": "middle", fill: intensity > 0.3 ? "rgba(240,235,228,0.7)" : "#9a8f84", "font-size": "9" });
      km.textContent = Math.round(kmTotals[i]) + " km"; svg.appendChild(km);
    });
  },

  /* ── 9. Small Multiples (Tempo · HF · Kadenz pro Fahrt) ────── */
  renderSmallMultiples(rides) {
    const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const W = 780, H = 180, pad = { l: 50, r: 24, t: 16, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

    const _render = (svgId, data, field, color, unit, targetLine) => {
      const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";
      const vals = data.map(d => d[field]);
      const minV = Math.max(0, Math.min(...vals) - 2);
      const maxV = Math.max(...vals) + 2;

      this._gridLines(svg, W, H, pad, maxV, minV);

      if (targetLine != null) {
        const ty = pad.t + ch - (targetLine - minV) / (maxV - minV) * ch;
        svg.appendChild(svgEl("line", {
          x1: pad.l, y1: ty, x2: W - pad.r, y2: ty,
          stroke: "#c9a84c", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.5",
        }));
        const lt = svgEl("text", { x: W - pad.r + 4, y: ty + 4, fill: "#c9a84c", "font-size": "9" });
        lt.textContent = `${targetLine}`;
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

      const step = Math.max(1, Math.floor(pts.length / 20));
      pts.forEach((p, i) => {
        if (i % step !== 0 && i !== pts.length - 1) return;
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

      const ls = Math.max(1, Math.floor(pts.length / 10));
      pts.forEach((p, i) => {
        if (i % ls === 0 || i === pts.length - 1)
          this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
      });
    };

    _render("chart-sm-tempo",  sorted.filter(r => r.kmh), "kmh", "#4a7fa8", "km/h", null);
    _render("chart-sm-hf",     sorted.filter(r => r.hf),  "hf",  "#c45c5c", "bpm",  null);
    _render("chart-sm-kadenz", sorted.filter(r => r.kad), "kad", "#c9a84c", "RPM",  CONFIG.cadenceTarget);
  },

  /* ── 10. Ruhepuls-Entwicklung ────────────────────────────────── */
  renderHRV(svgId, rides) {
    // Delegiert an Plan-Compare-Slider
    // Legacy-Aufruf ignorieren — wird jetzt über renderPlanCompareHRV gesteuert
  },

  /* ── Plan-Compare: einzelnen Plan in SVG rendern ───────────── */
  _renderPlanSeries(svgId, data, color, unit, planLabel, field) {
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 220, pad = { l: 50, r: 16, t: 28, b: 36 };
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

    // Area fill
    const areaPath = `M${pts[0].x},${H - pad.b} ` +
      pts.map(p => `L${p.x},${p.y}`).join(" ") +
      ` L${pts[pts.length-1].x},${H - pad.b} Z`;
    svg.appendChild(svgEl("path", {
      d: areaPath, fill: color, opacity: "0.08",
    }));

    // Line
    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: color, "stroke-width": "1.8",
      points: pts.map(p => `${p.x},${p.y}`).join(" "),
    }));

    // Trend line
    const n = pts.length;
    if (n > 2) {
      const mx = pts.reduce((s, p) => s + p.x, 0) / n;
      const my = pts.reduce((s, p) => s + p.y, 0) / n;
      const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) /
                    pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
      const intercept = my - slope * mx;
      svg.appendChild(svgEl("line", {
        x1: pts[0].x, y1: slope * pts[0].x + intercept,
        x2: pts[n-1].x, y2: slope * pts[n-1].x + intercept,
        stroke: "#5c9e6e", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.7",
      }));
    }

    // Dots
    const step = Math.max(1, Math.floor(pts.length / 20));
    pts.forEach((p, i) => {
      if (i % step !== 0 && i !== pts.length - 1) return;
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3.5", fill: color, stroke: "#141210", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week} · ${planLabel}</div>
        <div class="tv">${p.d[field]} ${unit}</div>
        <div class="td">${p.d.name}</div>
      `));
      c.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(c);
    });

    // X labels — smart spacing
    const labelStep = Math.max(1, Math.floor(pts.length / 8));
    pts.forEach((p, i) => {
      if (i % labelStep === 0 || i === pts.length - 1)
        this._xLabel(svg, p.x, H - pad.b + 14, p.d.dateShort);
    });

    // Mean line
    const mean = allVals.reduce((s, v) => s + v, 0) / allVals.length;
    const meanY = pad.t + ch - (mean - minV) / (maxV - minV) * ch;
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: meanY, x2: W - pad.r, y2: meanY,
      stroke: color, "stroke-width": "0.8", "stroke-dasharray": "3,4", opacity: "0.4",
    }));
    const meanLabel = svgEl("text", { x: W - pad.r - 2, y: meanY - 5, "text-anchor": "end", fill: color, "font-size": "9", opacity: "0.7" });
    meanLabel.textContent = `Ø ${fmt(mean, 0)}`;
    svg.appendChild(meanLabel);
  },

  /* ── Plan-Compare Slider Setup ─────────────────────────────── */
  _initPlanCompareSlider(containerId, sliderId, topSvgId) {
    const container = el(containerId);
    const slider = el(sliderId);
    const topSvg = el(topSvgId);
    if (!container || !slider || !topSvg) return;

    let dragging = false;

    const setPosition = (clientX) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = (x / rect.width) * 100;
      slider.style.left = pct + "%";
      topSvg.style.clipPath = `inset(0 0 0 ${pct}%)`;
    };

    // Default: 50% for both plans visible, or 100% if only Plan 1 has data
    const topSvgEl = el(topSvgId);
    const hasP2 = topSvgEl && topSvgEl.childNodes.length > 0;
    const defaultPct = hasP2 ? 50 : 100;
    slider.style.left = defaultPct + "%";
    topSvg.style.clipPath = `inset(0 0 0 ${defaultPct}%)`;

    const onStart = (e) => {
      dragging = true;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      setPosition(clientX);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      setPosition(clientX);
    };
    const onEnd = () => { dragging = false; };

    slider.addEventListener("mousedown", onStart);
    slider.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchend", onEnd);

    // Click anywhere on container to jump slider
    container.addEventListener("click", (e) => {
      if (e.target.closest(".plan-compare-slider")) return;
      setPosition(e.clientX);
    });
  },

  /* ── HRV Plan Compare ──────────────────────────────────────── */
  renderPlanCompareHRV(rides) {
    const plan1 = rides.filter(r => r.hrv != null && (r.plan || "Plan 1") === "Plan 1")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const plan2 = rides.filter(r => r.hrv != null && r.plan === "Plan 2")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    if (plan1.length) this._renderPlanSeries("chart-hrv-p1", plan1, "#7c5cbf", "ms", "Plan 1", "hrv");
    if (plan2.length) this._renderPlanSeries("chart-hrv-p2", plan2, "#e07b39", "ms", "Plan 2", "hrv");

    this._initPlanCompareSlider("hrv-compare", "hrv-slider", "chart-hrv-p2");
  },

  renderRHF(svgId, rides) {
    // Delegiert an Plan-Compare-Slider
  },

  /* ── RHF Plan Compare ──────────────────────────────────────── */
  renderPlanCompareRHF(rides) {
    const plan1 = rides.filter(r => r.ruhepuls != null && (r.plan || "Plan 1") === "Plan 1")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const plan2 = rides.filter(r => r.ruhepuls != null && r.plan === "Plan 2")
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    if (plan1.length) this._renderPlanSeries("chart-rhf-p1", plan1, "#c45c5c", "bpm", "Plan 1", "ruhepuls");
    if (plan2.length) this._renderPlanSeries("chart-rhf-p2", plan2, "#e07b39", "bpm", "Plan 2", "ruhepuls");

    this._initPlanCompareSlider("rhf-compare", "rhf-slider", "chart-rhf-p2");
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
    svg.style.width = W + "px";
    svg.style.minWidth = W + "px";

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
};
