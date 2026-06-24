/* ============================================================
   ANALYSIS.JS — Phasenanalyse, Detailkarten, Stärken
   ============================================================ */

const Analysis = {

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
    this._renderPhases(rides, plan);
    this._renderDetails(rides, plan);
    this._renderStrengths(rides, plan);
    this._renderSummary(rides, plan);
  },

  /* ── Phasen ─────────────────────────────────────────────────── */
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
        const pr    = planRides.filter(r => r.phase === phase);
        const km    = sum(pr, "km");
        const avgMin = sum(pr, "min") / pr.length;
        const avgHF  = avg(pr.filter(r => r.hf), "hf");
        const avgKad = avg(pr.filter(r => r.kad), "kad");
        const endCTL = pr.filter(r => r.ctl != null).slice(-1)[0]?.ctl;
        const weeks  = [...new Set(pr.map(r => r.week))]
          .sort((a, b) => CONFIG.weekIndex(a) - CONFIG.weekIndex(b));
        const color  = CONFIG.phaseColor(phase);

        const weekRange = weeks[0] === weeks[weeks.length - 1]
          ? weeks[0]
          : `${weeks[0]} – ${weeks[weeks.length - 1]}`;

        const stats = [
          { v: pr.length,                  l: "Fahrten"  },
          { v: Math.round(km) + " km",     l: "Distanz"  },
          { v: fmt(km / pr.length) + " km", l: "Ø Fahrt"  },
          { v: Math.round(avgMin) + " min", l: "Ø Dauer"  },
          { v: fmtInt(avgHF) + " bpm",      l: "Ø HF"     },
          { v: fmtInt(avgKad) + " RPM",     l: "Ø Kadenz" },
          { v: endCTL != null ? fmt(endCTL) : "–", l: "CTL Ende" },
        ];

        return `
          <div class="phase-block" style="--pb-color:${color}">
            <h3>${phase} · ${weekRange}</h3>
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

  /* ── Detailkarten ───────────────────────────────────────────── */
  _renderDetails(rides) {
    const avgHF   = avg(rides.filter(r => r.hf), "hf");
    const maxHF   = maxVal(rides.filter(r => r.hfMax), "hfMax");
    const ftpVal  = Data.ftpValue();

    // Kadenz: Anfang vs. Ende
    const kadRides = rides.filter(r => r.kad).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const kadStart = avg(kadRides.slice(0, 5), "kad");
    const kadEnd   = avg(kadRides.slice(-5), "kad");

    // Effizienz: Anfang vs. Ende
    const effRides = rides.filter(r => r.efficiency).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    const effStart = avg(effRides.slice(0, 5), "efficiency");
    const effEnd   = avg(effRides.slice(-5), "efficiency");
    const effDelta = effEnd && effStart ? effEnd - effStart : null;

    const cards = [
      {
        t: "❤️  Herzfrequenz",
        x: `Ø-HF über alle Fahrten: ${fmtInt(avgHF)} bpm. HF-Max erreicht: ${fmtInt(maxHF)} bpm (Etappe 1, 01.05). Die Tatsache, dass die Ø-HF konstant blieb während Tempo und Watt stiegen, ist das klassische Zeichen aerober Anpassung.`,
      },
      {
        t: "🦵  Kadenz-Entwicklung",
        x: `Start Ø ${fmtInt(kadStart)} RPM → aktuell Ø ${fmtInt(kadEnd)} RPM. Zielbereich ${CONFIG.cadenceTarget}+ RPM wird ab W9 regelmäßig erreicht. Indoor-Kadenz bleibt ein Entwicklungsfeld durch Setup-Unterschiede.`,
      },
      {
        t: "⚡  Aerobe Effizienz",
        x: effDelta
          ? `Watt/HF-Ratio: ${fmt(effStart, 2)} → ${fmt(effEnd, 2)} W/bpm (+${fmt(effDelta, 2)}). Dieser Wert zeigt wie viel Leistung pro Herzschlag erzeugt wird — ein direkter Fortschrittsindikator der nicht von Tagesbedingungen abhängt.`
          : "Effizienz-Daten erst ab W6 (Powermeter-Installation) verfügbar.",
      },
      {
        t: "🎯  FTP-Progression",
        x: `eFTP-Entwicklung (Intervals.icu): 166 → 175 → 187 → ${CONFIG.eFTP}W. Gemessener Ramp Test: ${ftpVal}W. Beide Werte bestätigen sich gegenseitig. Nächstes Ziel: 220W durch strukturierte Schwellen-Sessions.`,
      },
      {
        t: "👥  Gruppenfahrten",
        x: "Ab W7 regelmäßig integriert. Effekt: +3–5 km/h Schnitt gegenüber Solo, höheres Intensitätsprofil durch Windschatten-Dynamik, längere Distanzen motivationsbedingt. Längste Rides fast ausschließlich in Gruppe.",
      },
    ];

    el("detail-cards").innerHTML = cards.map(c => `
      <div class="card detail-card">
        <h3>${c.t}</h3>
        <p>${c.x}</p>
      </div>`).join("");
  },

  /* ── Stärken & Entwicklungsfelder ───────────────────────────── */
  _renderStrengths(rides) {
    const totalKm = Math.round(sum(rides, "km"));
    const maxCTL  = fmtInt(maxVal(rides.filter(r => r.ctl != null), "ctl"));

    el("strengths-grid").innerHTML = `
      <div class="strength-card" style="border-left:3px solid var(--green)">
        <h3 style="color:var(--green)">Stärken</h3>
        <p>
          <strong>Konsistenz</strong> — ${rides.length} Fahrten in 86 Tagen, jede Woche mindestens 2 Einheiten, nie länger als 5 Tage Pause.<br>
          <strong>Aerobes Fundament</strong> — ${totalKm.toLocaleString("de")} km, 100km-Ride nach 10 Wochen bei subjektiv einfachem Befinden.<br>
          <strong>Datentiefe</strong> — lückenlose Dokumentation, Powermeter ab W6, HRV und Ruhepuls konsistent erfasst.<br>
          <strong>Progression</strong> — CTL von 1 auf ${maxCTL}, FTP von 0 auf ${Data.ftpValue()}W gemessen.
        </p>
      </div>
      <div class="strength-card" style="border-left:3px solid var(--accent)">
        <h3 style="color:var(--accent)">Entwicklungsfelder</h3>
        <p>
          <strong>Strukturierte Intensität</strong> — nur 1 echte Schwellen-Session im Gesamtplan, Sweet Spot systematisch integrieren.<br>
          <strong>Regeneration</strong> — W8 mit 214 km war keine Erholungswoche, strikte Volumen-Limits für Regen-Wochen definieren.<br>
          <strong>Indoor-Kadenz</strong> — systematisch niedriger als Outdoor, dedizierte Hochkadenz-Drills (95+ RPM) einplanen.<br>
          <strong>FTP-Zielwert</strong> — Planwert 215W vs. gemessene ${Data.ftpValue()}W, realistischere Basis für Plan 2.
        </p>
      </div>`;
  },

  /* ── Gesamtbewertung ────────────────────────────────────────── */
  _renderSummary(rides) {
    const totalKm = Math.round(sum(rides, "km")).toLocaleString("de");
    const maxCTL  = fmtInt(maxVal(rides.filter(r => r.ctl != null), "ctl"));
    const ftpVal  = Data.ftpValue();

    el("summary-block").innerHTML = `
      <h3>Gesamtbewertung</h3>
      <p>
        12 Wochen, ${rides.length} Fahrten, ${totalKm} km — von CTL 1 auf CTL ${maxCTL}, FTP von Null auf ${ftpVal}W gemessen.
        Der 100-km-Ride in Woche 10 bei subjektiv „Irgendwie einfach" ist das stärkste Indiz dafür, dass das aerobe Fundament
        wirklich gelegt ist.
      </p>
      <p>
        Plan 2-Empfehlung: 2× Sweet Spot pro Woche, FTP-Ziel ${ftpVal + 22}W, strikte Regenerationswochen unter 150 km,
        mehr Renneinsätze für Rennsportspezifik, Intervals.icu-Integration für automatische TSB-Steuerung.
      </p>`;
  },
};
