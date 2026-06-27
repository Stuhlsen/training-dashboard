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

    const W = 780, H = 200;
    const pad = { l: 12, r: 16, t: 12, b: 32 };
    const timelineY = H - pad.b;
    const cw = W - pad.l - pad.r;

    const startDate = new Date("2026-03-24");
    const endDate   = new Date("2026-09-20");
    const totalMs   = endDate - startDate;

    const xOf = (dateStr) => {
      const ms = new Date(dateStr) - startDate;
      return pad.l + (ms / totalMs) * cw;
    };

    // Phasen-Hintergründe
    const phases = [
      { label: "Vorbereitung", start: "2026-03-24", end: "2026-03-30", color: "#c9a84c" },
      { label: "Plan 1",       start: "2026-03-31", end: "2026-06-21", color: "#4a7fa8" },
      { label: "Plan 2",       start: "2026-06-22", end: "2026-09-20", color: "#e07b39" },
    ];

    phases.forEach(ph => {
      const x1 = xOf(ph.start), x2 = xOf(ph.end);
      svg.appendChild(svgEl("rect", {
        x: x1, y: pad.t, width: x2 - x1, height: timelineY - pad.t,
        fill: ph.color, opacity: "0.06",
      }));
      const lbl = svgEl("text", {
        x: x1 + (x2 - x1) / 2, y: pad.t + 11,
        "text-anchor": "middle", fill: ph.color,
        "font-size": "9", "font-weight": "700", opacity: "0.75",
      });
      lbl.textContent = ph.label;
      svg.appendChild(lbl);
    });

    // Plan-Divider
    const divX = xOf("2026-06-22");
    svg.appendChild(svgEl("line", {
      x1: divX, y1: pad.t + 16, x2: divX, y2: timelineY,
      stroke: "#e07b39", "stroke-width": "1.5",
      "stroke-dasharray": "4,3", opacity: "0.5",
    }));

    // Zeitachse
    svg.appendChild(svgEl("line", {
      x1: pad.l, y1: timelineY,
      x2: W - pad.r - 4, y2: timelineY,
      stroke: "#3a342c", "stroke-width": "1.5",
    }));
    // Pfeil rechts
    svg.appendChild(svgEl("polygon", {
      points: `${W - pad.r},${timelineY} ${W - pad.r - 6},${timelineY - 3} ${W - pad.r - 6},${timelineY + 3}`,
      fill: "#3a342c",
    }));

    // Monats-Ticks
    [
      ["2026-04-01","Apr"],["2026-05-01","Mai"],["2026-06-01","Jun"],
      ["2026-07-01","Jul"],["2026-08-01","Aug"],["2026-09-01","Sep"],
    ].forEach(([d, l]) => {
      const x = xOf(d);
      svg.appendChild(svgEl("line", {
        x1: x, y1: timelineY, x2: x, y2: timelineY + 4,
        stroke: "#3a342c", "stroke-width": "1",
      }));
      const t = svgEl("text", {
        x, y: timelineY + 13,
        "text-anchor": "middle", fill: "#6b6158", "font-size": "9",
      });
      t.textContent = l;
      svg.appendChild(t);
    });

    // Kurze Labels pro Meilenstein — Details im Tooltip
    const SHORT_LABELS = {
      "2026-03-31": "Start",
      "2026-05-12": "Criterium",
      "2026-06-05": "100 km",
      "2026-06-12": "FTP 193W",
      "2026-06-17": "PB 200W NP",
      "2026-06-19": "138 km",
      "2026-06-29": "Plan 2 ▶",
    };

    // Option B: Ebenen-Zuweisung mit Mindestabstand
    const LEVELS = 3;
    const LEVEL_Y = [
      timelineY - 100,
      timelineY - 62,
      timelineY - 26,
    ];
    const MIN_DIST = 72;
    const lastX = new Array(LEVELS).fill(-999);

    milestones.forEach((m) => {
      const x = xOf(m.dateISO);
      // Farbe basiert auf Hintergrundbereich, nicht nur Datum
      const isPlan2 = m.dateISO >= "2026-06-22";
      const color = isPlan2 ? "#e07b39" : "#4a7fa8";

      // Freie Ebene finden
      let level = -1;
      for (let l = 0; l < LEVELS; l++) {
        if (x - lastX[l] >= MIN_DIST) { level = l; break; }
      }
      if (level === -1) level = 0;
      lastX[level] = x;
      const labelY = LEVEL_Y[level];

      // Verbindungslinie
      svg.appendChild(svgEl("line", {
        x1: x, y1: labelY + 20,
        x2: x, y2: timelineY - 6,
        stroke: color, "stroke-width": "1",
        "stroke-dasharray": "2,2", opacity: "0.4",
      }));

      // Pfeilspitze zur Zeitlinie
      svg.appendChild(svgEl("polygon", {
        points: `${x},${timelineY - 3} ${x - 3},${timelineY - 9} ${x + 3},${timelineY - 9}`,
        fill: color, opacity: "0.7",
      }));

      // Icon
      const icon = svgEl("text", {
        x, y: labelY,
        "text-anchor": "middle", "font-size": "14",
      });
      icon.textContent = m.icon;
      svg.appendChild(icon);

      // Kurzlabel
      const shortLabel = SHORT_LABELS[m.dateISO] || m.text.slice(0, 10);
      const lbl = svgEl("text", {
        x, y: labelY + 12,
        "text-anchor": "middle", fill: color,
        "font-size": "8", "font-weight": "600",
      });
      lbl.textContent = shortLabel;
      svg.appendChild(lbl);

      // Datum
      const dlbl = svgEl("text", {
        x, y: labelY + 21,
        "text-anchor": "middle", fill: "#6b6158", "font-size": "7.5",
      });
      dlbl.textContent = m.date.slice(0, 5);
      svg.appendChild(dlbl);

      // Hit-Area für Tooltip
      const hit = svgEl("rect", {
        x: x - 38, y: labelY - 16,
        width: 76, height: 44,
        fill: "transparent",
      });
      hit.style.cursor = "pointer";
      hit.addEventListener("mouseenter", e => Tooltip.show(e, `
        <div class="tt">${m.date} · ${m.week}</div>
        <div class="tv">${m.icon} ${m.text}</div>
        <div class="td">${isPlan2 ? "Plan 2" : "Plan 1"}</div>
      `));
      hit.addEventListener("mouseleave", () => Tooltip.hide());
      svg.appendChild(hit);
    });
  },
};
