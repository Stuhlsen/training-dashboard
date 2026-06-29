/* ============================================================
   APP.JS — Einstiegspunkt, Tab-Navigation, Chart-Gruppen
   ============================================================ */

// Tab Navigation
function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  const validTabs = Array.from(btns).map(b => b.dataset.tab);

  window._activateTab = function(tabId) {
    if (!validTabs.includes(tabId)) tabId = validTabs[0];
    btns.forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
    el("tab-" + tabId).classList.remove("hidden");
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

// Main init
(async function () {
  const { ok, source, warning } = await Data.load();

  if (!ok) {
    el("loading").classList.add("hidden");
    el("error").classList.remove("hidden");
    el("error-msg").textContent = warning || "Unbekannter Fehler";
    return;
  }

  el("loading").classList.add("hidden");
  el("app").classList.remove("hidden");

  const rides = Data.byDate();
  const weekly = Data.weekly();

  // Init tabs
  initTabs();
  Tooltip.init();

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
  Charts.renderPowerCurve("chart-power-curve", Data.powerCurves, 193, Data.athleteWeight);
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

  // Planung — await weil async (Forecast-Load + Listener-Setup)
  await Planned.render(rides);

  // Analysis
  Analysis.render(rides);

  // Footer
  el("footer").innerHTML = `
    <p>Daten: ${rides.length} Fahrten · Quelle: Notion + intervals.icu · Aktualisiert ${new Date().toLocaleDateString("de")}</p>
  `;

  // Tab aus URL-Hash aktivieren — NACH allem Rendering damit nichts überschrieben wird
  const hash = location.hash.replace("#", "");
  window._activateTab(hash || "overview");
})();
