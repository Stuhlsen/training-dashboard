/* ============================================================
   APP.JS — Einstiegspunkt, Tab-Navigation, Chart-Gruppen
   ============================================================ */

// Tab Navigation
function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach(btn => {
    btn.addEventListener("click", () => {
      btns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
      el("tab-" + btn.dataset.tab).classList.remove("hidden");
    });
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
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('[data-tab="table"]').classList.add("active");
    document.querySelectorAll(".tab-content").forEach(s => s.classList.add("hidden"));
    el("tab-table").classList.remove("hidden");
    Table.filterByWeek(week);
  });
  Charts.renderTrimp("chart-trimp", weekly);

  // Charts — Leistung
  Charts.renderEfficiency("chart-efficiency", rides);
  Charts.renderScatter("chart-scatter", rides);
  Charts.renderSmallMultiples(rides);

  // Charts — Aerobe Gesundheit
  Charts.renderDecoupling("chart-decoupling", rides);
  Charts.renderPlanCompareHRV(rides);
  Charts.renderPlanCompareRHF(rides);

  // Charts — Aktivität
  Charts.renderHeatmap("chart-heatmap", rides);

  // Table
  Table.render(rides);

  // Analysis
  Analysis.render(rides);

  // Footer
  el("footer").innerHTML = `
    <p>Daten: ${rides.length} Fahrten · Quelle: Notion + intervals.icu · Aktualisiert ${new Date().toLocaleDateString("de")}</p>
  `;
})();
