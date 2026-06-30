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
  const ftp = ownPlan ? CONFIG.ftp : (Data.rides.find(r => r.np)?.np || null);

  togglePlanningTabVisibility(ownPlan);

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
