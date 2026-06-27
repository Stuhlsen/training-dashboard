/* ============================================================
   CHARTS.JS — Alle Chart-Render-Funktionen
   Neue Charts: Effizienz, Scatterplot, Heatmap, TSB
   ============================================================ */

const Charts = {

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
    const W = 780, H = 270, pad = { l: 50, r: 16, t: 16, b: 40 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const TARGET_KM = 200;
    const maxKm = Math.max(...weeklyData.map(d => d.km), TARGET_KM * 1.1) * 1.15 || 1;
    const bw = Math.min(cw / weeklyData.length * 0.62, 52);
    const gap = cw / weeklyData.length;

    this._gridLines(svg, W, H, pad, maxKm);

    // Zielzone: 180–220 km als grünes Band
    const zoneTopY = pad.t + ch - (220 / maxKm * ch);
    const zoneBotY = pad.t + ch - (180 / maxKm * ch);
    svg.appendChild(svgEl("rect", {
      x: pad.l, y: zoneTopY,
      width: cw, height: zoneBotY - zoneTopY,
      fill: "#5c9e6e", opacity: "0.08",
    }));

    // Ziellinie bei 200km
    const targetY = pad.t + ch - (TARGET_KM / maxKm * ch);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
      stroke: "#5c9e6e", "stroke-width": "1", "stroke-dasharray": "5,3", opacity: "0.5",
    }));
    const tl = svgEl("text", { x: W - pad.r - 4, y: targetY - 4, "text-anchor": "end", fill: "#5c9e6e", "font-size": "9", opacity: "0.8" });
    tl.textContent = "Ziel 200 km"; svg.appendChild(tl);

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
    _render("chart-sm-kadenz", _filterOutliers(sorted.filter(r => r.kad), "kad"), "kad", "#c9a84c", "RPM",  CONFIG.cadenceTarget);
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
    // p1 = das untere SVG (immer zuerst im DOM)
    const bottomSvg = container ? container.querySelector(".plan-compare-layer:not(.plan-compare-top)") : null;
    if (!container || !slider || !topSvg) return;

    let dragging = false;

    const setPosition = (clientX) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = (x / rect.width) * 100;
      slider.style.left = pct + "%";
      // Plan 2 (oben): von links ab pct sichtbar
      topSvg.style.clipPath = `inset(0 0 0 ${pct}%)`;
      // Plan 1 (unten): bis pct sichtbar, rechts abgeschnitten
      if (bottomSvg) bottomSvg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    };

    // Default: 50% wenn beide Pläne Daten haben, 100% wenn nur Plan 1
    const hasP2 = topSvg.childNodes.length > 0;
    const defaultPct = hasP2 ? 50 : 100;
    slider.style.left = defaultPct + "%";
    topSvg.style.clipPath = `inset(0 0 0 ${defaultPct}%)`;
    if (bottomSvg) bottomSvg.style.clipPath = `inset(0 ${100 - defaultPct}% 0 0)`;

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
  renderSleep(svgId, wellness) {
    const data = wellness.filter(w => w.sleepHours != null || w.avgSleepingHR != null);
    const svg = el(svgId);
    if (!svg) return;
    if (!data.length) {
      svg.innerHTML = "";
      const t = svgEl("text", { x: 390, y: 100, "text-anchor": "middle", fill: "#6b6158", "font-size": "12" });
      t.textContent = "Schlafdaten ab Plan 2 verfügbar";
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

    // 7h Ziel-Linie — Gold statt Blau (kein Overlap mit Balkenfarbe)
    const targetY = pad.t + ch - (7 / maxSleep * ch);
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: targetY, x2: W - pad.r, y2: targetY,
      stroke: "#c9a84c", "stroke-width": "1", "stroke-dasharray": "5,3", opacity: "0.6",
    }));
    const tl = svgEl("text", { x: pad.l + 4, y: targetY - 4, fill: "#c9a84c", "font-size": "9", opacity: "0.9" });
    tl.textContent = "7h Ziel"; svg.appendChild(tl);

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
  renderPowerCurve(svgId, powerCurves, ftp) {
    const svg = el(svgId);
    if (!svg) return;
    svg.innerHTML = "";

    if (!powerCurves) {
      const t = svgEl("text", { x: 390, y: 120, "text-anchor": "middle", fill: "#6b6158", "font-size": "12" });
      t.textContent = "Power-Curve-Daten werden beim nächsten Sync geladen";
      svg.appendChild(t);
      return;
    }

    // intervals.icu gibt { secs: [...], watts: [...] } zurück
    // Wir wollen nur die Standard-Zeitpunkte
    const STANDARD_SECS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
    const LABELS = ["1s", "5s", "10s", "30s", "1min", "2min", "5min", "10min", "20min", "30min", "60min"];

    // intervals.icu Format: { list: [{ id, label, secs: [...], watts: [...] }] }
    // Wir nehmen den ersten Eintrag (längster Zeitraum = "1 year" oder ähnlich)
    let secsArr, wattsArr;
    let curveData = [];
    if (powerCurves.list && Array.isArray(powerCurves.list) && powerCurves.list.length > 0) {
      // Eintrag mit den meisten Daten nehmen (längster Zeitraum)
      const best = powerCurves.list[0];
      secsArr = best.secs || [];
      wattsArr = best.watts || [];
    } else if (powerCurves.secs && powerCurves.watts) {
      secsArr = powerCurves.secs;
      wattsArr = powerCurves.watts;
    } else {
      secsArr = []; wattsArr = [];
    }

    // Lookup-Map aufbauen: Sekunde → Watt
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


    const ZONES = [
      { from: 0,    to: 0.55, color: "#6b6158", label: "Z1 · Aktive Erholung"  },
      { from: 0.55, to: 0.75, color: "#4a7fa8", label: "Z2 · Grundlage"        },
      { from: 0.75, to: 0.87, color: "#5c9e6e", label: "Z3 · Tempo"            },
      { from: 0.87, to: 0.95, color: "#c9a84c", label: "Sweet Spot"            },
      { from: 0.95, to: 1.05, color: "#e07b39", label: "Z4 · Schwelle"         },
      { from: 1.05, to: 999,  color: "#c45c5c", label: "Z5+ · VO2max & Sprint" },
    ];

    const getZone = (watts) => {
      if (!ftp) return ZONES[ZONES.length - 1];
      const pct = watts / ftp;
      return ZONES.find(z => pct >= z.from && pct < z.to) || ZONES[ZONES.length - 1];
    };

    const W = 780, H = 260, pad = { l: 56, r: 16, t: 20, b: 44 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const maxW = Math.max(...curveData.map(d => d.watts)) * 1.1;
    const xScale = (i) => pad.l + (i / (curveData.length - 1)) * cw;
    const yScale = (w) => pad.t + ch - (w / maxW) * ch;

    // Grid-Linien Y
    const wStep = Math.ceil(maxW / 5 / 50) * 50;
    for (let w = 0; w <= maxW; w += wStep) {
      const y = yScale(w);
      if (y < pad.t) break;
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: y, x2: W - pad.r, y2: y,
        stroke: "#2e2923", "stroke-width": "1",
      }));
      const t = svgEl("text", { x: pad.l - 6, y: y + 4, "text-anchor": "end", fill: "#6b6158", "font-size": "9" });
      t.textContent = w + "W";
      svg.appendChild(t);
    }

    // FTP-Linie
    if (ftp) {
      const ftpY = yScale(ftp);
      svg.appendChild(svgEl("line", {
        x1: pad.l, y1: ftpY, x2: W - pad.r, y2: ftpY,
        stroke: "#c9a84c", "stroke-width": "1.5", "stroke-dasharray": "6,3", opacity: "0.8",
      }));
      const ft = svgEl("text", {
        x: pad.l + 6, y: ftpY - 5,
        fill: "#c9a84c", "font-size": "9", "font-weight": "600",
      });
      ft.textContent = `FTP ${ftp}W`;
      svg.appendChild(ft);
    }

    // Area fill
    const areaPath = `M${xScale(0)},${pad.t + ch} ` +
      curveData.map((d, i) => `L${xScale(i)},${yScale(d.watts)}`).join(" ") +
      ` L${xScale(curveData.length - 1)},${pad.t + ch} Z`;
    svg.appendChild(svgEl("path", { d: areaPath, fill: "#e07b39", opacity: "0.06" }));

    // Kurve (grau, neutral)
    svg.appendChild(svgEl("polyline", {
      fill: "none", stroke: "#6b6158", "stroke-width": "1.5",
      "stroke-linejoin": "round",
      points: curveData.map((d, i) => `${xScale(i)},${yScale(d.watts)}`).join(" "),
    }));

    // Punkte — zonenbasierte Farbe + Watt-Labels abwechselnd
    curveData.forEach((d, i) => {
      const x = xScale(i), y = yScale(d.watts);
      const zone = getZone(d.watts);
      const above = i % 2 === 0;

      // Punkt in Zonenfarbe
      svg.appendChild(svgEl("circle", {
        cx: x, cy: y, r: "5",
        fill: zone.color, stroke: "#141210", "stroke-width": "1.5",
      }));

      // Invisible größerer Kreis für besseres Hover-Target
      const hit = svgEl("circle", { cx: x, cy: y, r: "10", fill: "transparent" });
      hit.style.cursor = "pointer";
      hit.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${d.label}</div>
        <div class="tv" style="color:${zone.color}">${Math.round(d.watts)} W</div>
        <div class="td">${zone.label}${ftp ? ` · ${(d.watts / ftp).toFixed(2)}× FTP` : ""}</div>
      `));
      hit.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(hit);

      // Watt-Label — abwechselnd oben/unten, in Zonenfarbe
      const labelY = above ? y - 10 : y + 18;
      // Clamp damit Labels nicht aus dem SVG fallen
      const clampedY = Math.max(pad.t + 10, Math.min(pad.t + ch - 4, labelY));
      const wl = svgEl("text", {
        x, y: clampedY, "text-anchor": "middle",
        fill: zone.color, "font-size": "9", "font-weight": "600",
      });
      wl.textContent = Math.round(d.watts) + "W";
      svg.appendChild(wl);

      // X-Label
      const xl = svgEl("text", { x, y: H - pad.b + 16, "text-anchor": "middle", fill: "#6b6158", "font-size": "9" });
      xl.textContent = d.label;
      svg.appendChild(xl);
    });
  },

  // Nächsten verfügbaren Watt-Wert für eine Sekunden-Anzahl finden
  _nearestWatts(map, targetSecs) {
    const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
    const nearest = keys.reduce((prev, curr) =>
      Math.abs(curr - targetSecs) < Math.abs(prev - targetSecs) ? curr : prev, keys[0]);
    return nearest ? map[nearest] : null;
  },
};
