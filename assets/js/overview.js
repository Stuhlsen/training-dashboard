/* ============================================================
   OVERVIEW.JS — Hero, Metriken, Meilensteine
   ============================================================ */

const Overview = {

  render(rides) {
    this._renderHero(rides);
    this._renderMetrics(rides);
    this._renderMilestones();
  },

  /* ── Hero ───────────────────────────────────────────────────── */
  _renderHero(rides) {
    const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    if (!sorted.length) return;

    const first = sorted[0], last = sorted[sorted.length - 1];
    el("hero-sub").textContent =
      `${first.dateShort} – ${last.dateShort} · ${CONFIG.planVersion}`;

    const totalKm  = Math.round(sum(rides, "km"));
    const ftpVal   = Data.ftpValue();
    const totalMin = sum(rides, "min");

    el("hero-kpis").innerHTML = [
      { v: totalKm.toLocaleString("de"), l: "Kilometer",   c: "var(--accent)" },
      { v: rides.length,                 l: "Fahrten",     c: "var(--text)"   },
      { v: ftpVal ? `${ftpVal}W` : "–", l: "FTP",         c: "var(--gold)"   },
      { v: fmtDuration(totalMin),        l: "Trainingszeit",  c: "var(--dim)"    },
    ].map(k => `
      <div class="hero-kpi">
        <div class="kpi-value" style="color:${k.c}">${k.v}</div>
        <div class="kpi-label">${k.l}</div>
      </div>
    `).join("");
  },

  /* ── Metriken ───────────────────────────────────────────────── */
  _renderMetrics(rides) {
    const totalKm  = sum(rides, "km");
    const totalMin = sum(rides, "min");
    const avgKmh   = avg(rides.filter(r => r.kmh), "kmh");
    const maxCTL   = maxVal(rides.filter(r => r.ctl != null), "ctl");
    const maxKm    = maxVal(rides, "km");
    const avgHF    = avg(rides.filter(r => r.hf), "hf");
    const ftpVal   = Data.ftpValue();
    const avgKad = avg(rides.filter(r => r.kad), "kad");

    const metrics = [
      {
        v: Math.round(totalKm).toLocaleString("de") + " km",
        l: "Gesamtdistanz",
        d: "Summierte Streckenlänge aller Fahrten",
        c: "var(--accent)",
      },
      {
        v: rides.length,
        l: "Fahrten",
        d: "Anzahl absolvierter Trainingseinheiten",
        c: "var(--text)",
      },
      {
        v: fmtDuration(totalMin),
        l: "Trainingszeit",
        d: "Gesamte Fahrtdauer ohne Pausen",
        c: "var(--blue)",
      },
      {
        v: fmt(avgKmh) + " km/h",
        l: "Ø Tempo",
        d: "Durchschnittliche Geschwindigkeit aller Fahrten",
        c: "var(--gold)",
      },
      {
        v: ftpVal ? ftpVal + "W" : "–",
        l: "FTP (Ramp Test)",
        d: "Gemessene Functional Threshold Power, 12.06.2026",
        c: "var(--gold)",
      },
      {
        v: CONFIG.eFTP + "W",
        l: "eFTP (Intervals.icu)",
        d: "Geschätzte FTP aus den besten Leistungen über verschiedene Zeitfenster",
        c: "var(--green)",
      },
      {
        v: fmtInt(maxCTL),
        l: "CTL Peak",
        d: "Höchster Chronic Training Load — erreichte Fitnessstufe",
        c: "var(--green)",
      },
      {
        v: fmt(maxKm) + " km",
        l: "Längste Fahrt",
        d: "Die längste einzelne Ausfahrt im Trainingsplan",
        c: "var(--blue)",
      },
      {
        v: fmtInt(avgHF) + " bpm",
        l: "Ø Herzfrequenz",
        d: "Durchschnittliche HF über alle Fahrten mit HF-Daten",
        c: "var(--red)",
      },
      {
        v: fmtInt(avgKad) + " RPM",
        l: "Ø Kadenz",
        d: "Durchschnittliche Trittfrequenz über alle Fahrten",
        c: "var(--gold)",
      },
    ];

    el("metrics-grid").innerHTML = metrics.map(m => `
      <div class="metric-card" style="--mc-color:${m.c}">
        <div class="mc-value">${m.v}</div>
        <div class="mc-label">${m.l}</div>
        <div class="mc-desc">${m.d}</div>
      </div>
    `).join("");
  },

  /* ── Meilensteine Gantt ─────────────────────────────────────── */
  _renderMilestones() {
    const svg = el("milestones-gantt");
    if (!svg) return;
    svg.innerHTML = "";

    const milestones = [...CONFIG.manualMilestones]
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    const W = 780, H = 160;
    const pad = { l: 12, r: 12, t: 16, b: 36 };
    const timelineY = H - pad.b;

    // Zeitraum: Plan 1 Start bis Plan 2 Ende
    const startDate = new Date("2026-03-24");
    const endDate   = new Date("2026-09-20");
    const totalMs   = endDate - startDate;
    const plan2Date = new Date("2026-06-22");

    const cw = W - pad.l - pad.r;
    const xOf = (dateStr) => {
      const ms = new Date(dateStr) - startDate;
      return pad.l + (ms / totalMs) * cw;
    };

    // Phasen-Blöcke im Hintergrund
    const phases = [
      { label: "Vorbereitung", start: "2026-03-24", end: "2026-03-30", color: "#c9a84c" },
      { label: "Plan 1",       start: "2026-03-31", end: "2026-06-21", color: "#4a7fa8" },
      { label: "Plan 2",       start: "2026-06-22", end: "2026-09-20", color: "#e07b39" },
    ];

    phases.forEach(ph => {
      const x1 = xOf(ph.start);
      const x2 = xOf(ph.end);
      // Hintergrund-Band
      const rect = svgEl("rect", {
        x: x1, y: pad.t, width: x2 - x1, height: timelineY - pad.t,
        fill: ph.color, opacity: "0.06",
      });
      svg.appendChild(rect);

      // Phasen-Label oben
      const lbl = svgEl("text", {
        x: x1 + (x2 - x1) / 2, y: pad.t + 10,
        "text-anchor": "middle", fill: ph.color,
        "font-size": "9", "font-weight": "600", opacity: "0.7",
      });
      lbl.textContent = ph.label;
      svg.appendChild(lbl);
    });

    // Plan-Divider
    const divX = xOf("2026-06-22");
    svg.appendChild(svgEl("line", {
      x1: divX, y1: pad.t, x2: divX, y2: timelineY,
      stroke: "#e07b39", "stroke-width": "1.5", "stroke-dasharray": "4,3", opacity: "0.6",
    }));

    // Zeitachse
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: timelineY, x2: W - pad.r, y2: timelineY,
      stroke: "#3a342c", "stroke-width": "1.5",
    }));

    // Monats-Ticks
    const months = [
      "2026-03-01","2026-04-01","2026-05-01","2026-06-01",
      "2026-07-01","2026-08-01","2026-09-01",
    ];
    const monthLabels = ["Mär","Apr","Mai","Jun","Jul","Aug","Sep"];
    months.forEach((m, i) => {
      const x = xOf(m);
      if (x < pad.l || x > W - pad.r) return;
      svg.appendChild(svgEl("line", {
        x1: x, y1: timelineY, x2: x, y2: timelineY + 4,
        stroke: "#3a342c", "stroke-width": "1",
      }));
      const t = svgEl("text", {
        x, y: timelineY + 13,
        "text-anchor": "middle", fill: "#6b6158", "font-size": "9",
      });
      t.textContent = monthLabels[i];
      svg.appendChild(t);
    });

    // Meilensteine — Labels abwechselnd oben/unten
    milestones.forEach((m, i) => {
      const x = xOf(m.dateISO);
      const isPlan2 = m.dateISO >= "2026-06-22";
      const color = isPlan2 ? "#e07b39" : "#4a7fa8";
      const above = i % 2 === 0;

      // Verbindungslinie Pin → Label
      const labelY = above ? timelineY - 18 : timelineY - 60;
      svg.appendChild(svgEl("line", {
        x1: x, y1: timelineY - 6,
        x2: x, y2: labelY + (above ? -2 : 14),
        stroke: color, "stroke-width": "1", opacity: "0.5",
        "stroke-dasharray": "2,2",
      }));

      // Pfeilspitze
      const arrowY = timelineY - 8;
      const arrow = svgEl("polygon", {
        points: `${x},${arrowY} ${x-3},${arrowY-5} ${x+3},${arrowY-5}`,
        fill: color, opacity: "0.7",
      });
      svg.appendChild(arrow);

      // Icon + Text Label
      const textY = above ? timelineY - 22 : timelineY - 62;
      const icon = svgEl("text", {
        x, y: textY,
        "text-anchor": "middle", "font-size": "14",
      });
      icon.textContent = m.icon;
      svg.appendChild(icon);

      const lbl = svgEl("text", {
        x, y: textY + 12,
        "text-anchor": "middle", fill: color,
        "font-size": "8", "font-weight": "600",
      });
      // Kurzes Label
      const shortText = m.text.length > 22 ? m.text.slice(0, 20) + "…" : m.text;
      lbl.textContent = shortText;
      svg.appendChild(lbl);

      const dateLbl = svgEl("text", {
        x, y: textY + 21,
        "text-anchor": "middle", fill: "#6b6158", "font-size": "7.5",
      });
      dateLbl.textContent = m.date.slice(0, 5); // DD.MM
      svg.appendChild(dateLbl);

      // Tooltip mit vollem Text
      const hitArea = svgEl("rect", {
        x: x - 40, y: textY - 18, width: 80, height: 45,
        fill: "transparent",
      });
      hitArea.style.cursor = "pointer";
      hitArea.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${m.date} · ${m.week}</div>
        <div class="tv">${m.icon} ${m.text}</div>
        <div class="td">${isPlan2 ? "Plan 2" : "Plan 1"}</div>
      `));
      hitArea.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(hitArea);
    });

    // Pfeil am Ende der Zeitachse
    svg.appendChild(svgEl("polygon", {
      points: `${W - pad.r + 6},${timelineY} ${W - pad.r},${timelineY - 3} ${W - pad.r},${timelineY + 3}`,
      fill: "#3a342c",
    }));
  },
};
