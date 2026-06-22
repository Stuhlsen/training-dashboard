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

  /* ── Meilensteine ───────────────────────────────────────────── */
  _renderMilestones() {
    const sorted = [...CONFIG.manualMilestones]
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    el("milestones-grid").innerHTML = sorted.map(m => `
      <div class="milestone-card">
        <span class="ms-icon">${m.icon}</span>
        <div>
          <div class="ms-title">${m.text}</div>
          <div class="ms-date">${m.date} · ${m.week}</div>
        </div>
      </div>
    `).join("");
  },
};
