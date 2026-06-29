/* ============================================================
   ANALYSIS.JS — Dynamische Trainingsanalyse
   Plan-Toggle, KPIs, Phasen, Typ-Verteilung,
   Plan-Vergleich, Stärken/Entwicklung
   ============================================================ */

window.Analysis = {

  _allRides: [],

  render(rides) {
    this._allRides = rides;
    this._initToggle();
    this._renderForPlan("all");
  },

  _initToggle() {
    const btns = document.querySelectorAll(".plan-btn");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        btns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this._renderForPlan(btn.dataset.plan);
      });
    });
  },

  _renderForPlan(plan) {
    const rides = plan === "all"
      ? this._allRides
      : this._allRides.filter(r => (r.plan || "Plan 1") === plan);
    this._renderKPIs(rides, plan);
    this._renderPhases(rides, plan);
    this._renderTypDistribution(rides, plan);
    this._renderComparison(plan);
    this._renderStrengths(rides, plan);
  },

  /* ── KPI Hero ─────────────────────────────────────────────── */
  _renderKPIs(rides, plan) {
    const totalKm    = Math.round(sum(rides, "km"));
    const totalMin   = Math.round(sum(rides, "min"));
    const totalH     = (totalMin / 60).toFixed(0);
    const avgKm      = rides.length ? fmt(totalKm / rides.length) : "–";
    const maxCTL     = fmtInt(maxVal(rides.filter(r => r.ctl != null), "ctl"));
    const avgHF      = fmtInt(avg(rides.filter(r => r.hf), "hf"));
    const avgKad     = fmtInt(avg(rides.filter(r => r.kad), "kad"));
    const ftpVal     = Data.ftpValue();
    const totalTSS   = Math.round(sum(rides.filter(r => r.tss), "tss"));

    // TSB (aktuellster Wert)
    const lastTSB    = rides.filter(r => r.tsb != null).slice(-1)[0]?.tsb;

    const plan1Rides = this._allRides.filter(r => (r.plan || "Plan 1") === "Plan 1");
    const plan2Rides = this._allRides.filter(r => r.plan === "Plan 2");

    const kpis = [
      { v: rides.length,                    l: "Fahrten",        sub: plan === "all" ? `${plan1Rides.length} P1 · ${plan2Rides.length} P2` : null },
      { v: totalKm.toLocaleString("de") + " km", l: "Distanz",  sub: `Ø ${avgKm} km/Fahrt` },
      { v: totalH + " h",                   l: "Trainingszeit",  sub: `${totalMin.toLocaleString("de")} min gesamt` },
      { v: ftpVal + "W",                    l: "FTP",            sub: `eFTP ${CONFIG.eFTP}W`, color: "var(--accent)" },
      { v: maxCTL,                           l: "Peak CTL",       sub: lastTSB != null ? `TSB heute: ${lastTSB > 0 ? "+" : ""}${fmt(lastTSB)}` : null },
      { v: avgHF + " bpm",                  l: "Ø Herzfrequenz", sub: null },
      { v: avgKad + " RPM",                 l: "Ø Kadenz",       sub: `Ziel: ${CONFIG.cadenceTarget}+ RPM` },
      { v: totalTSS.toLocaleString("de"),   l: "Gesamt TSS",     sub: null },
    ];

    el("analysis-kpis").innerHTML = kpis.map(k => `
      <div class="analysis-kpi">
        <div class="analysis-kpi-val" ${k.color ? `style="color:${k.color}"` : ""}>${k.v}</div>
        <div class="analysis-kpi-lbl">${k.l}</div>
        ${k.sub ? `<div class="analysis-kpi-sub">${k.sub}</div>` : ""}
      </div>`).join("");
  },

  /* ── Phasenübersicht ──────────────────────────────────────── */
  _renderPhases(rides, planFilter) {
    const plans = [
      {
        label: "Plan 1 — Basisaufbau (Mär–Jun 2026)",
        phases: ["Vorbereitung", "Phase 1", "Phase 2", "Phase 3"],
        filter: r => (r.plan || "Plan 1") === "Plan 1",
      },
      {
        label: "Plan 2 — FTP & Fitness (Jun–Sep 2026)",
        phases: ["Übergang", "Sweet Spot", "Schwelle", "VO2max", "Erholung", "Taper"],
        filter: r => r.plan === "Plan 2",
      },
    ];

    el("phase-blocks").innerHTML = plans.map(plan => {
      const planRides = rides.filter(plan.filter);
      if (!planRides.length) return "";
      const present = plan.phases.filter(p => planRides.some(r => r.phase === p));
      if (!present.length) return "";

      const blocks = present.map(phase => {
        const pr     = planRides.filter(r => r.phase === phase);
        const km     = sum(pr, "km");
        const avgMin = sum(pr, "min") / pr.length;
        const avgHF  = avg(pr.filter(r => r.hf), "hf");
        const avgKad = avg(pr.filter(r => r.kad), "kad");
        const avgNP  = avg(pr.filter(r => r.np), "np");
        const endCTL = pr.filter(r => r.ctl != null).slice(-1)[0]?.ctl;
        const weeks  = [...new Set(pr.map(r => r.week))]
          .sort((a, b) => CONFIG.weekIndex(a) - CONFIG.weekIndex(b));
        const color  = CONFIG.phaseColor(phase);
        const weekRange = weeks[0] === weeks[weeks.length - 1]
          ? weeks[0] : `${weeks[0]} – ${weeks[weeks.length - 1]}`;

        const stats = [
          { v: pr.length,                        l: "Fahrten"  },
          { v: Math.round(km) + " km",            l: "Distanz"  },
          { v: fmt(km / pr.length) + " km",       l: "Ø Fahrt"  },
          { v: Math.round(avgMin) + " min",        l: "Ø Dauer"  },
          { v: fmtInt(avgHF) + " bpm",             l: "Ø HF"     },
          { v: fmtInt(avgKad) + " RPM",            l: "Ø Kadenz" },
          { v: avgNP ? fmtInt(avgNP) + "W" : "–", l: "Ø NP"     },
          { v: endCTL != null ? fmt(endCTL) : "–", l: "CTL Ende" },
        ];

        return `
          <div class="phase-block" style="--pb-color:${color}">
            <h3>${phase} · <span style="color:${color}">${weekRange}</span></h3>
            <div class="phase-stats">
              ${stats.map(s => `
                <div class="phase-stat">
                  <div class="ps-val" style="color:${color}">${s.v}</div>
                  <div class="ps-lbl">${s.l}</div>
                </div>`).join("")}
            </div>
          </div>`;
      }).join("");

      return `<h2 class="section-label" style="margin-top:2rem">📊 ${plan.label}</h2>${blocks}`;
    }).join("");
  },

  /* ── Trainingstyp-Verteilung ──────────────────────────────── */
  _renderTypDistribution(rides, plan) {
    const typColors = {
      "Z2 Lang":        "#4a7fa8",
      "Z2 Dauer":       "#5a8fb8",
      "Z1 Recovery":    "#5c9e6e",
      "Sweet Spot":     "#e07b39",
      "Schwelle":       "#d94f4f",
      "VO2max":         "#b83dba",
      "Gruppenfahrt":   "#c9a84c",
      "Etappe":         "#c9a84c",
      "Ausserplanmaessig": "#6b7280",
      "Freestyle":      "#6b7280",
      "FTP-Test":       "#c9a84c",
    };

    const typMap = {};
    for (const r of rides) {
      const t = r.typ || "Sonstige";
      if (!typMap[t]) typMap[t] = { count: 0, km: 0, min: 0 };
      typMap[t].count++;
      typMap[t].km  += r.km  || 0;
      typMap[t].min += r.min || 0;
    }

    const totalKm = sum(rides, "km");
    const sorted = Object.entries(typMap).sort((a, b) => b[1].km - a[1].km);

    el("typ-distribution").innerHTML = `
      <div class="typ-dist-bars">
        ${sorted.map(([typ, d]) => {
          const pct = totalKm > 0 ? (d.km / totalKm * 100) : 0;
          const col = typColors[typ] || "#6b7280";
          return `
            <div class="typ-dist-row">
              <span class="typ-dist-label">${typ}</span>
              <div class="typ-dist-bar-wrap">
                <div class="typ-dist-bar" style="width:${pct.toFixed(1)}%; background:${col}"></div>
              </div>
              <span class="typ-dist-pct" style="color:${col}">${pct.toFixed(0)}%</span>
              <span class="typ-dist-meta">${d.count} Fahrten · ${Math.round(d.km)} km</span>
            </div>`;
        }).join("")}
      </div>`;
  },

  /* ── Plan 1 vs Plan 2 Vergleich ───────────────────────────── */
  _renderComparison(planFilter) {
    const p1 = this._allRides.filter(r => (r.plan || "Plan 1") === "Plan 1");
    const p2 = this._allRides.filter(r => r.plan === "Plan 2");

    if (!p1.length || !p2.length) {
      el("plan-comparison").innerHTML = `<p class="analysis-empty">Vergleich verfügbar sobald beide Pläne Daten haben.</p>`;
      return;
    }

    const metrics = [
      {
        label: "Fahrten",
        p1: p1.length,
        p2: p2.length,
        fmt: v => v,
        unit: "",
        higherIsBetter: true,
      },
      {
        label: "Gesamtdistanz",
        p1: Math.round(sum(p1, "km")),
        p2: Math.round(sum(p2, "km")),
        fmt: v => v.toLocaleString("de"),
        unit: " km",
        higherIsBetter: true,
      },
      {
        label: "Ø Kadenz",
        p1: avg(p1.filter(r => r.kad), "kad"),
        p2: avg(p2.filter(r => r.kad), "kad"),
        fmt: v => fmtInt(v),
        unit: " RPM",
        higherIsBetter: true,
      },
      {
        label: "Ø HF",
        p1: avg(p1.filter(r => r.hf), "hf"),
        p2: avg(p2.filter(r => r.hf), "hf"),
        fmt: v => fmtInt(v),
        unit: " bpm",
        higherIsBetter: false,
      },
      {
        label: "Ø NP",
        p1: avg(p1.filter(r => r.np), "np"),
        p2: avg(p2.filter(r => r.np), "np"),
        fmt: v => fmtInt(v),
        unit: "W",
        higherIsBetter: true,
      },
      {
        label: "Peak CTL",
        p1: maxVal(p1.filter(r => r.ctl), "ctl"),
        p2: maxVal(p2.filter(r => r.ctl), "ctl"),
        fmt: v => fmt(v),
        unit: "",
        higherIsBetter: true,
      },
      {
        label: "Ø TSS/Woche",
        p1: sum(p1, "tss") / Math.max(1, [...new Set(p1.map(r => r.week))].length),
        p2: sum(p2, "tss") / Math.max(1, [...new Set(p2.map(r => r.week))].length),
        fmt: v => Math.round(v),
        unit: "",
        higherIsBetter: true,
      },
    ];

    el("plan-comparison").innerHTML = `
      <div class="comparison-table">
        <div class="comparison-header">
          <span></span>
          <span class="comparison-plan">Plan 1</span>
          <span class="comparison-plan">Plan 2</span>
          <span class="comparison-plan">Δ</span>
        </div>
        ${metrics.map(m => {
          if (m.p1 == null || m.p2 == null) return "";
          const delta = m.p2 - m.p1;
          const better = m.higherIsBetter ? delta > 0 : delta < 0;
          const deltaCol = Math.abs(delta) < 0.5 ? "var(--dim)" : better ? "var(--green)" : "var(--red)";
          const deltaStr = (delta > 0 ? "+" : "") + m.fmt(delta) + m.unit;
          return `
            <div class="comparison-row">
              <span class="comparison-label">${m.label}</span>
              <span class="comparison-val">${m.fmt(m.p1)}${m.unit}</span>
              <span class="comparison-val">${m.fmt(m.p2)}${m.unit}</span>
              <span class="comparison-delta" style="color:${deltaCol}">${deltaStr}</span>
            </div>`;
        }).join("")}
      </div>`;
  },

  /* ── Stärken & Entwicklungsfelder ────────────────────────── */
  _renderStrengths(rides, plan) {
    const p1 = this._allRides.filter(r => (r.plan || "Plan 1") === "Plan 1");
    const p2 = this._allRides.filter(r => r.plan === "Plan 2");

    const kadRides  = rides.filter(r => r.kad).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const kadStart  = avg(kadRides.slice(0, 5), "kad");
    const kadEnd    = avg(kadRides.slice(-5), "kad");
    const kadDelta  = kadStart && kadEnd ? (kadEnd - kadStart).toFixed(1) : null;

    const effRides  = rides.filter(r => r.efficiency).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const effStart  = avg(effRides.slice(0, 5), "efficiency");
    const effEnd    = avg(effRides.slice(-5), "efficiency");
    const effDelta  = effEnd && effStart ? (effEnd - effStart).toFixed(2) : null;

    const totalKm   = Math.round(sum(rides, "km"));
    const ftpVal    = Data.ftpValue();
    const maxCTL    = fmtInt(maxVal(rides.filter(r => r.ctl != null), "ctl"));

    // Kadenz >90 RPM Anteil
    const kadOver90 = rides.filter(r => r.kad >= 90).length;
    const kadPct    = rides.length ? Math.round(kadOver90 / rides.length * 100) : 0;

    // Z2-Anteil
    const z2Rides   = rides.filter(r => r.typ === "Z2 Lang" || r.typ === "Z2 Dauer");
    const z2Pct     = rides.length ? Math.round(z2Rides.length / rides.length * 100) : 0;

    // Dynamische Stärken
    const strengths = [];
    if (rides.length >= 30) strengths.push(`<strong>Konsistenz</strong> — ${rides.length} Fahrten, ${totalKm.toLocaleString("de")} km konsequent dokumentiert`);
    if (kadDelta && parseFloat(kadDelta) > 2) strengths.push(`<strong>Kadenzentwicklung</strong> — +${kadDelta} RPM von ${fmtInt(kadStart)} auf ${fmtInt(kadEnd)} RPM`);
    if (effDelta && parseFloat(effDelta) > 0) strengths.push(`<strong>Aerobe Effizienz</strong> — W/HF-Ratio um +${effDelta} W/bpm verbessert`);
    if (z2Pct >= 50) strengths.push(`<strong>Polarisierung</strong> — ${z2Pct}% Z2-Anteil, aerobes Fundament klar priorisiert`);
    if (maxCTL && parseFloat(maxCTL) >= 40) strengths.push(`<strong>Fitnessaufbau</strong> — Peak CTL ${maxCTL}, solide Belastungstoleranz aufgebaut`);
    if (p2.length > 0 && p1.length > 0) {
      const p2NP = avg(p2.filter(r => r.np), "np");
      const p1NP = avg(p1.filter(r => r.np), "np");
      if (p2NP && p1NP && p2NP > p1NP) strengths.push(`<strong>Leistungssteigerung</strong> — Ø NP von ${fmtInt(p1NP)}W auf ${fmtInt(p2NP)}W (+${fmtInt(p2NP - p1NP)}W)`);
    }

    // Dynamische Entwicklungsfelder
    const developments = [];
    if (kadEnd && kadEnd < CONFIG.cadenceTarget) developments.push(`<strong>Kadenz</strong> — aktuell Ø ${fmtInt(kadEnd)} RPM, Ziel ${CONFIG.cadenceTarget}+ RPM noch nicht erreicht`);
    if (kadPct < 50) developments.push(`<strong>Kadenz-Konsistenz</strong> — nur ${kadPct}% der Fahrten über 90 RPM`);
    if (z2Pct < 40) developments.push(`<strong>Z2-Anteil</strong> — ${z2Pct}% unter dem empfohlenen Wert von 70–80%`);

    const intensityRides = rides.filter(r => ["Sweet Spot","Schwelle","VO2max"].includes(r.typ));
    if (intensityRides.length < 5 && p2.length > 5) developments.push(`<strong>Strukturierte Intensität</strong> — erst ${intensityRides.length} Intervall-Sessions, Potenzial für mehr`);

    el("strengths-grid").innerHTML = `
      <div class="strength-card" style="border-left:3px solid var(--green)">
        <h3 style="color:var(--green)">✅ Stärken</h3>
        <ul class="strength-list">
          ${strengths.map(s => `<li>${s}</li>`).join("") || "<li>Noch zu wenig Daten für Auswertung</li>"}
        </ul>
      </div>
      <div class="strength-card" style="border-left:3px solid var(--accent)">
        <h3 style="color:var(--accent)">🎯 Entwicklungsfelder</h3>
        <ul class="strength-list">
          ${developments.map(d => `<li>${d}</li>`).join("") || "<li>Keine kritischen Entwicklungsfelder erkannt</li>"}
        </ul>
      </div>`;
  },
};
