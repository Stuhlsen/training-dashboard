/* ============================================================
   APP.JS — Einstiegspunkt, Tab-Navigation, Chart-Gruppen,
   Athleten-Toggle (Vergleich Alex / Siggi)
   ============================================================ */

// Tab Navigation
function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  const validTabs = Array.from(btns).map(b => b.dataset.tab);

  window._activateTab = function(tabId) {
    if (!validTabs.includes(tabId)) tabId = validTabs[0];
    btns.forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
    const target = el("tab-" + tabId);
    if (target) target.classList.remove("hidden");
    history.replaceState(null, "", "#" + tabId);
  };

  btns.forEach(btn => {
    btn.addEventListener("click", () => window._activateTab(btn.dataset.tab));
  });
}

// Chart Group Toggle (inside Charts tab)
function toggleChartGroup(headerEl) {
  const body = headerEl.nextElementSibling;
  const icon = headerEl.querySelector(".toggle-icon");
  const isOpen = body.classList.contains("open");
  body.classList.toggle("open");
  icon.style.transform = isOpen ? "" : "rotate(180deg)";
}

/* ── Athleten-Toggle ─────────────────────────────────────────── */
function initAthleteToggle() {
  const wrap = el("athlete-toggle");
  if (!wrap) return;

  wrap.innerHTML = CONFIG.athletes.map(a => `
    <button class="athlete-btn${a.id === Data.activeAthleteId ? " active" : ""}" data-athlete="${a.id}">${a.name}</button>
  `).join("");

  wrap.querySelectorAll(".athlete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.athlete;
      if (id === Data.activeAthleteId) return;
      wrap.querySelectorAll(".athlete-btn").forEach(b => b.classList.toggle("active", b === btn));
      localStorage.setItem("active_athlete", id);
      await renderAll(id);
    });
  });
}

/* ── Hat der aktive Athlet einen Trainingsplan? ────────────────
   Siggi (Vergleichsdaten) hat keine week/phase-Struktur, also
   keine Planung/Übersicht-Meilensteine. */
function hasOwnPlan() {
  return Data.rides.some(r => r.week);
}

/** Planungs-Tab im UI je nach Datensatz ein-/ausblenden */
function togglePlanningTabVisibility(show) {
  const btn = document.querySelector('.tab-btn[data-tab="planned"]');
  if (btn) btn.classList.toggle("hidden", !show);
  // Falls aktuell aktiver Tab "planned" ist aber nicht mehr verfügbar → zurück zu Übersicht
  if (!show && btn?.classList.contains("active")) {
    window._activateTab("overview");
  }
}

/** Chart-Erklärtexte je Athlet anpassen — generische Vergleichsdaten statt
    personalisierte "du"-Ansprache und Plan-spezifische Begriffe */
function updateChartExplainers(ownPlan, ftp) {
  const set = (id, html) => { const e = el(id); if (e) e.innerHTML = html; };

  if (ownPlan) {
    set("explainer-heatmap", `Anzahl der Fahrten und Gesamtkilometer pro Wochentag über den gesamten Trainingszeitraum. Farbe: grün = wenig aktiv · gelb = moderat · orange = aktiv · rot = sehr aktiv. Samstag ist mit Abstand der aktivste Tag — dort liegen die langen Z2-Einheiten.`);
    set("explainer-pmc", `CTL (blau, Fläche) = aufgebaute Fitness über Wochen. ATL (rot, gestrichelt) = aktuelle Ermüdung der letzten Tage. TSB (grün, rechte Achse) = Form: positiv/grün = frisch, negativ/rot = müde. Die grüne Zone markiert den Sweet Spot (TSB -10 bis -30) — hier trainierst du produktiv ohne Übertraining.`);
    set("explainer-trimp", `TRIMP (Training Impulse) berechnet die Trainingsbelastung aus Dauer und Herzfrequenz-Intensität. Farbe: grün = &lt;400 (Erholung) · gelb = 400–600 (moderat) · orange = 600–900 (hoch) · rot = &gt;900 (sehr hoch). Erholungswochen sind bewusst grün — das ist gewollt und positiv.`);
    set("explainer-power-curve", `Die Power Curve zeigt deine beste gemessene Leistung für jedes Zeitintervall — von 1 Sekunde (Sprintkraft) bis 60 Minuten (Ausdauerleistung). Die goldene Linie markiert deine FTP (${ftp}W). Der rot eingefärbte Bereich über der FTP-Linie ist deine anaerobe Reserve — je größer dieser Bereich, desto mehr Leistung kannst du kurzfristig über deine Dauerschwelle bringen. Mit dem W/kg-Toggle siehst du die gewichtsnormierte Leistung (Körpergewicht aus Apple Health via intervals.icu).`);
    set("explainer-hrv", `Höhere HRV-Werte deuten auf bessere Erholung und geringeren Stress hin. Die goldene Übergangswoche W0 markiert den Wechsel der Messmethode: Plan 1 nutzt Apple Health RMSSD (lila), Plan 2 intervals.icu SDNN Schlafschnitt (orange) — beide Methoden liefern grundsätzlich unterschiedliche absolute Werte, weshalb Trend und Mittelwert pro Plan getrennt berechnet werden statt eine gemeinsame Linie zu bilden.`);
    set("explainer-rhf", `Ein sinkender Ruhepuls über mehrere Wochen ist ein verlässliches Zeichen kardiovaskulärer Anpassung an das Training. Die goldene Übergangswoche W0 trennt Plan 1 (rot) und Plan 2 (orange) visuell, ohne dass die Messmethode hier wechselt — beide Mittelwerte sind direkt vergleichbar.`);

    set("explainer-scatter", `Jeder Punkt zeigt eine Fahrt: Tempo (x-Achse) gegen Durchschnittsherzfrequenz (y-Achse). Punkte oben links sind effizient — schnelles Tempo bei niedriger Herzfrequenz. Die Phasenfarben zeigen wie sich diese Beziehung über die Trainingsphasen verschoben hat.`);
    set("legend-scatter", `
      <div class="legend-item"><div class="legend-dot" style="background:#c9a84c"></div> Vorbereitung</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div> Phase 1</div>
      <div class="legend-item"><div class="legend-dot" style="background:#4a7fa8"></div> Phase 2</div>
      <div class="legend-item"><div class="legend-dot" style="background:#7c5cbf"></div> Phase 3</div>
    `);

    set("note-cadence", `RPM pro Fahrt · gestrichelt = Ziel ${CONFIG.cadenceTarget} RPM`);
    set("note-hrv", `Plan 1 (lila) · W0 (gold) · Plan 2 (orange)`);
    set("note-rhf", `Plan 1 (rot) · W0 (gold) · Plan 2 (orange)`);
    set("note-sleep", `Nur Plan 2 · intervals.icu`);
    set("efficiency-note", `Nur Powermeter-Fahrten (ab W6)`);
  } else {
    set("explainer-heatmap", `Anzahl der Fahrten und Gesamtkilometer pro Wochentag über den erfassten Zeitraum. Farbe: grün = wenig aktiv · gelb = moderat · orange = aktiv · rot = sehr aktiv.`);
    set("explainer-pmc", `CTL (blau, Fläche) = aufgebaute Fitness über Wochen. ATL (rot, gestrichelt) = aktuelle Ermüdung der letzten Tage. TSB (grün, rechte Achse) = Form: positiv/grün = frisch, negativ/rot = müde. Die grüne Zone markiert den Sweet Spot (TSB -10 bis -30) — produktive Trainingsbelastung ohne Übertraining.`);
    set("explainer-trimp", `TRIMP (Training Impulse) berechnet die Trainingsbelastung aus Dauer und Herzfrequenz-Intensität. Farbe: grün = &lt;400 (Erholung) · gelb = 400–600 (moderat) · orange = 600–900 (hoch) · rot = &gt;900 (sehr hoch).`);
    set("explainer-power-curve", `Die Power Curve zeigt die beste gemessene Leistung für jedes Zeitintervall — von 1 Sekunde (Sprintkraft) bis 60 Minuten (Ausdauerleistung).${ftp ? ` Die goldene Linie markiert die FTP (${ftp}W).` : ""} Mit dem W/kg-Toggle wird die gewichtsnormierte Leistung angezeigt.`);
    set("explainer-hrv", `Höhere HRV-Werte deuten auf bessere Erholung und geringeren Stress hin. Da kein eigener Trainingsplan vorliegt, wird hier ein durchgehender Verlauf ohne Plan-Trennung gezeigt.`);
    set("explainer-rhf", `Ein sinkender Ruhepuls über mehrere Wochen ist ein verlässliches Zeichen kardiovaskulärer Anpassung an das Training.`);

    set("explainer-scatter", `Jeder Punkt zeigt eine Fahrt: Tempo (x-Achse) gegen Durchschnittsherzfrequenz (y-Achse). Punkte oben links sind effizient — schnelles Tempo bei niedriger Herzfrequenz.`);
    set("legend-scatter", `<div class="legend-item"><div class="legend-dot" style="background:#4a7fa8"></div> Fahrten</div>`);

    set("note-cadence", `RPM pro Fahrt`);
    set("note-hrv", `Verlauf über den erfassten Zeitraum`);
    set("note-rhf", `Verlauf über den erfassten Zeitraum`);
    set("note-sleep", `intervals.icu`);
    set("efficiency-note", `Nur Powermeter-Fahrten`);
  }
}

/* ── Wochen/Monats-Toggle für Volumen, TRIMP und Wetter ─────── */

/** Aggregiert Rides nach Kalendermonat (YYYY-MM) — analog zu Data.weekly() */
function monthlyData() {
  const grouped = {};
  for (const r of Data.rides) {
    const key = r.dateISO.slice(0, 7); // YYYY-MM
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rides]) => {
      const label = new Date(month + "-01")
        .toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
      return {
        week:   label,          // Chart-Funktionen erwarten "week" als x-Label
        phase:  rides[0]?.phase || null,
        plan:   rides[0]?.plan  || "Vergleich",
        rides:  rides.length,
        km:     Math.round(rides.reduce((s, r) => s + (r.km || 0), 0) * 10) / 10,
        min:    rides.reduce((s, r) => s + (r.min || 0), 0),
        trimp:  Math.round(rides.reduce((s, r) => s + (r.trimp || 0), 0)),
        avgHF:  Math.round(rides.filter(r => r.hf).reduce((s, r) => s + r.hf, 0) / (rides.filter(r => r.hf).length || 1)),
        avgKad: Math.round(rides.filter(r => r.kad).reduce((s, r) => s + r.kad, 0) / (rides.filter(r => r.kad).length || 1)),
        // Wetter: Durchschnitt aller Fahrten mit Wetterdaten
        temp:      (() => { const ws = rides.filter(r => r.weather?.temp != null); return ws.length ? Math.round(ws.reduce((s, r) => s + r.weather.temp, 0) / ws.length * 10) / 10 : null; })(),
        windSpeed: (() => { const ws = rides.filter(r => r.weather?.windSpeed != null); return ws.length ? Math.round(ws.reduce((s, r) => s + r.weather.windSpeed, 0) / ws.length * 10) / 10 : null; })(),
        precip:    (() => { const ws = rides.filter(r => r.weather?.precip != null); return ws.length ? Math.round(ws.reduce((s, r) => s + r.weather.precip, 0) / ws.length * 10) / 10 : null; })(),
        badCount:  rides.filter(r => r.weather && ((r.weather.temp > 32) || (r.weather.temp < 5) || ((r.weather.windSpeed || 0) > 30) || ((r.weather.precip || 0) > 0.5))).length,
      };
    });
}

/** Liest oder setzt den Period-Toggle-Status für den aktuellen Athleten */
function getPeriod(chartId) {
  return localStorage.getItem(`period_${Data.activeAthleteId}_${chartId}`) || "week";
}
function setPeriod(chartId, value) {
  localStorage.setItem(`period_${Data.activeAthleteId}_${chartId}`, value);
}

/** Initialisiert die drei Period-Toggle-Buttons und rendert Charts entsprechend */
function initPeriodToggles(rides, weekly, onBarClick) {
  const charts = [
    { toggleId: "toggle-weekly", titleId: "title-weekly", chartFn: (data) => Charts.renderWeeklyVolume("chart-weekly", data, onBarClick),
      titleWeek: "Wöchentliches Volumen (km)", titleMonth: "Monatliches Volumen (km)" },
    { toggleId: "toggle-trimp",  titleId: "title-trimp",  chartFn: (data) => Charts.renderTrimp("chart-trimp", data),
      titleWeek: "Trainingsbelastung TRIMP pro Woche", titleMonth: "Trainingsbelastung TRIMP pro Monat" },
    { toggleId: "toggle-weather", titleId: "title-weather",
      chartFn: (data, period) => {
        if (period === "month") {
          // Fahrten temporär mit Monat als "week" versehen für die Aggregation in renderWeatherWeekly
          const ridesWithMonth = Data.rides.map(r => ({
            ...r,
            week: r.dateISO ? r.dateISO.slice(0, 7) : (r.week || "?"),
          }));
          Charts.renderWeatherWeekly("chart-weather-weekly", ridesWithMonth);
        } else {
          Charts.renderWeatherWeekly("chart-weather-weekly", Data.rides);
        }
      },
      titleWeek: "Trainingswetter · Temperatur & Wind pro Woche",
      titleMonth: "Trainingswetter · Temperatur & Wind pro Monat" },
  ];

  for (const cfg of charts) {
    const wrap = el(cfg.toggleId);
    if (!wrap) continue;

    // Toggle-Status aus localStorage wiederherstellen
    const saved = getPeriod(cfg.toggleId);
    wrap.querySelectorAll(".unit-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.period === saved);
    });
    if (cfg.titleId) {
      const titleEl = el(cfg.titleId);
      if (titleEl) titleEl.textContent = saved === "month" ? cfg.titleMonth : cfg.titleWeek;
    }

    // Initial rendern mit gespeichertem Wert
    cfg.chartFn(saved === "month" ? monthlyData() : weekly, saved);

    // Click-Handler
    wrap.querySelectorAll(".unit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const period = btn.dataset.period;
        if (btn.classList.contains("active")) return;
        wrap.querySelectorAll(".unit-btn").forEach(b => b.classList.toggle("active", b === btn));
        setPeriod(cfg.toggleId, period);
        const titleEl = el(cfg.titleId);
        if (titleEl) titleEl.textContent = period === "month" ? cfg.titleMonth : cfg.titleWeek;
        cfg.chartFn(period === "month" ? monthlyData() : weekly, period);
      });
    });
  }
}

/* ── Gesamtes Dashboard rendern (initial + bei Athletenwechsel) ─ */
async function renderAll(athleteId) {
  el("loading").classList.remove("hidden");
  el("app").classList.add("hidden");
  el("error").classList.add("hidden");

  const result = athleteId
    ? await Data.switchAthlete(athleteId)
    : await Data.load();

  if (!result.ok) {
    el("loading").classList.add("hidden");
    el("error").classList.remove("hidden");
    el("error-msg").textContent = result.warning || "Unbekannter Fehler";
    return;
  }

  el("loading").classList.add("hidden");
  el("app").classList.remove("hidden");

  const rides = Data.byDate();
  const weekly = Data.weekly();
  const ownPlan = hasOwnPlan();
  const ftp = ownPlan ? CONFIG.ftp : (Data.athleteFtp || Data.rides.find(r => r.np)?.np || null);

  togglePlanningTabVisibility(ownPlan);
  updateChartExplainers(ownPlan, ftp);

  // Overview
  Overview.render(rides);

  // Charts — Fitness & Belastung
  Charts.renderPMC("chart-pmc", rides);
  initPeriodToggles(rides, weekly, (week) => {
    document.querySelector('[data-tab="table"]').click();
    Table.filterByWeek(week);
  });

  // Charts — Leistung
  Charts.renderPowerCurve("chart-power-curve", Data.powerCurves, ftp, Data.athleteWeight);
  Charts.renderEfficiency("chart-efficiency", rides);
  Charts.renderScatter("chart-scatter", rides);
  Charts.renderSmallMultiples(rides);

  // Charts — Aerobe Gesundheit
  Charts.renderDecoupling("chart-decoupling", rides);
  Charts.renderSleep("chart-sleep", Data.wellness, ownPlan);
  Charts.renderPlanCompareHRV(rides);
  Charts.renderPlanCompareRHF(rides);

  // Charts — Aktivität
  Charts.renderHeatmap("chart-heatmap", rides);

  // Table
  Table.init();

  // Planung — nur für den eigenen Plan relevant
  if (ownPlan) {
    await Planned.render(rides);
  }

  // Analysis
  Analysis.render(rides);

  // Footer
  const athleteName = CONFIG.athletes.find(a => a.id === Data.activeAthleteId)?.name || "";
  el("footer").innerHTML = `
    <p>Daten: ${rides.length} Fahrten · ${athleteName} · Quelle: ${ownPlan ? "Notion + intervals.icu" : "intervals.icu"} · Aktualisiert ${new Date().toLocaleDateString("de")}</p>
  `;
}

// Main init
(async function () {
  initTabs();
  Tooltip.init();

  // Gespeicherten Athleten aus localStorage übernehmen, bevor initial gerendert wird
  const savedAthlete = localStorage.getItem("active_athlete");
  const validAthlete = CONFIG.athletes.some(a => a.id === savedAthlete);
  Data.activeAthleteId = validAthlete ? savedAthlete : "alex";

  initAthleteToggle();
  await renderAll(validAthlete ? savedAthlete : null);

  // Tab aus URL-Hash aktivieren — NACH allem Rendering damit nichts überschrieben wird
  const hash = location.hash.replace("#", "");
  window._activateTab(hash || "overview");
})();
