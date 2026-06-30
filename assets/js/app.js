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

    set("note-cadence", `RPM pro Fahrt`);
    set("note-hrv", `Verlauf über den erfassten Zeitraum`);
    set("note-rhf", `Verlauf über den erfassten Zeitraum`);
    set("note-sleep", `intervals.icu`);
    set("efficiency-note", `Nur Powermeter-Fahrten`);
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
  Charts.renderWeeklyVolume("chart-weekly", weekly, (week) => {
    document.querySelector('[data-tab="table"]').click();
    Table.filterByWeek(week);
  });
  Charts.renderTrimp("chart-trimp", weekly);

  // Charts — Leistung
  Charts.renderPowerCurve("chart-power-curve", Data.powerCurves, ftp, Data.athleteWeight);
  Charts.renderEfficiency("chart-efficiency", rides);
  Charts.renderScatter("chart-scatter", rides);
  Charts.renderSmallMultiples(rides);

  // Charts — Aerobe Gesundheit
  Charts.renderDecoupling("chart-decoupling", rides);
  Charts.renderSleep("chart-sleep", Data.wellness);
  Charts.renderPlanCompareHRV(rides);
  Charts.renderPlanCompareRHF(rides);

  // Charts — Wetterbedingungen
  Charts.renderWeatherWeekly("chart-weather-weekly", rides);

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
  initAthleteToggle();
  Tooltip.init();

  await renderAll();

  // Tab aus URL-Hash aktivieren — NACH allem Rendering damit nichts überschrieben wird
  const hash = location.hash.replace("#", "");
  window._activateTab(hash || "overview");
})();
