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

    this._gridLines(svg, W, H, pad, maxV);

    weeklyData.forEach((d, i) => {
      const x  = pad.l + i * gap + (gap - bw) / 2;
      const bh = Math.max(d.trimp / maxV * ch, 1);
      const y  = pad.t + ch - bh;
      const rect = svgEl("rect", { x, y, width: bw, height: bh, rx: "3", fill: "#c45c5c", opacity: "0.72" });
      rect.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${d.week}</div>
        <div class="tv">TRIMP ${d.trimp}</div>
        <div class="td">${d.rides} Fahrten</div>
      `));
      rect.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(rect);
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

      const km = svgEl("text", { x: x + cellW / 2, y: 62, "text-anchor": "middle", fill: "#6b6158", "font-size": "9" });
      km.textContent = Math.round(kmTotals[i]) + " km"; svg.appendChild(km);
    });
  },

  /* ── 8. HRV-Entwicklung ─────────────────────────────────────── */
  renderHRV(svgId, rides) {
    const data = rides.filter(r => r.hrv != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 200, pad = { l: 50, r: 16, t: 16, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const minV = Math.max(0, Math.min(...data.map(d => d.hrv)) - 5);
    const maxV = Math.max(...data.map(d => d.hrv)) + 5;

    this._gridLines(svg, W, H, pad, maxV, minV);

    // Gestrichelte Durchschnittslinie
    const avgHRV = data.reduce((s, d) => s + d.hrv, 0) / data.length;
    const avgY = pad.t + ch - (avgHRV - minV) / (maxV - minV) * ch;
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: avgY, x2: W - pad.r, y2: avgY,
      stroke: "#6b6158", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.6",
    }));

    const pts = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      y: pad.t + ch - (d.hrv - minV) / (maxV - minV) * ch,
      d,
    }));

    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#7c5cbf", "stroke-width": "1.8",
      points: pts.map(p => `${p.x},${p.y}`).join(" "),
    }));

    const step = Math.max(1, Math.floor(pts.length / 20));
    pts.forEach((p, i) => {
      if (i % step !== 0 && i !== pts.length - 1) return;
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: "#7c5cbf", stroke: "#141210", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week}</div>
        <div class="tv">${p.d.hrv} ms</div>
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
  renderRHF(svgId, rides) {
    // Ein sinkender Ruhepuls zeigt kardiovaskuläre Anpassung — nach unten = positiv
    const data = rides.filter(r => r.ruhepuls != null)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const svg = el(svgId); if (!svg || !data.length) return; svg.innerHTML = "";

    const W = 780, H = 200, pad = { l: 50, r: 16, t: 16, b: 36 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const minV = Math.max(0, Math.min(...data.map(d => d.ruhepuls)) - 3);
    const maxV = Math.max(...data.map(d => d.ruhepuls)) + 3;

    this._gridLines(svg, W, H, pad, maxV, minV);

    // Gestrichelte Durchschnittslinie
    const avgRHF = data.reduce((s, d) => s + d.ruhepuls, 0) / data.length;
    const avgY = pad.t + ch - (avgRHF - minV) / (maxV - minV) * ch;
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: avgY, x2: W - pad.r, y2: avgY,
      stroke: "#6b6158", "stroke-width": "1", "stroke-dasharray": "4,3", opacity: "0.6",
    }));

    const pts = data.map((d, i) => ({
      x: pad.l + i / Math.max(data.length - 1, 1) * cw,
      y: pad.t + ch - (d.ruhepuls - minV) / (maxV - minV) * ch,
      d,
    }));

    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#c45c5c", "stroke-width": "1.8",
      points: pts.map(p => `${p.x},${p.y}`).join(" "),
    }));

    const step = Math.max(1, Math.floor(pts.length / 20));
    pts.forEach((p, i) => {
      if (i % step !== 0 && i !== pts.length - 1) return;
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: "3", fill: "#c45c5c", stroke: "#141210", "stroke-width": "1.5" });
      c.style.cursor = "pointer";
      c.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${p.d.dateShort} · ${p.d.week}</div>
        <div class="tv">${p.d.ruhepuls} bpm</div>
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
};
