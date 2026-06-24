/* ============================================================
   APP.JS — Einstiegspunkt, Orchestrierung, Collapsible Sections
   ============================================================ */

// Collapsible section toggle
function toggleSection(headerEl) {
  const body = headerEl.nextElementSibling;
  const isOpen = body.classList.contains("open");
  body.classList.toggle("open");
  headerEl.querySelector(".toggle-icon").style.transform = isOpen ? "" : "rotate(180deg)";
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

  // Weekly with TSS aggregation
  const weeklyWithTSS = weekly.map(w => {
    const wr = rides.filter(r => r.week === w.week);
    return {
      ...w,
      tss: Math.round(wr.reduce((s, r) => s + (r.tss || 0), 0)),
      hours: Math.round(w.min / 6) / 10,
    };
  });

  // Overview (Hero, Metrics, Milestones)
  Overview.render(rides);

  // Fitness & Belastung
  Charts.renderPMC("chart-pmc", rides);
  Charts.renderWeeklyVolume("chart-weekly", weekly);
  Charts.renderWeeklyTSS("chart-weekly-tss", weeklyWithTSS);
  Charts.renderTRIMP("chart-trimp", weekly);

  // Leistung
  Charts.renderEfficiency("chart-efficiency", rides);
  Charts.renderScatter("chart-scatter", rides);
  Charts.renderSmallMultiples(rides);

  // Aerobe Gesundheit
  Charts.renderDecoupling("chart-decoupling", rides);
  Charts.renderHRV("chart-hrv", rides);
  Charts.renderRHF("chart-rhf", rides);

  // Fahrtenbuch
  Table.render(rides);

  // Analyse
  Analysis.render(rides);

  // Footer
  el("footer").innerHTML = `
    <p>Daten: ${rides.length} Fahrten · Quelle: Notion + intervals.icu · Aktualisiert ${new Date().toLocaleDateString("de")}</p>
  `;
})();
