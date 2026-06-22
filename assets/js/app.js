/* ============================================================
   APP.JS — Einstiegspunkt, Initialisierung, Orchestrierung
   ============================================================ */

const App = {

  async init() {
    Tooltip.init();

    // Daten laden
    const result = await Data.load();

    // Loading ausblenden, App einblenden
    el("loading").classList.add("hidden");
    el("app").classList.remove("hidden");

    if (result.warning) {
      console.warn("Datenquelle:", result.source, "|", result.warning);
    }

    // Tabs initialisieren
    Tabs.init((tabName) => {
      if (tabName === "charts") this._renderCharts();
    });

    // Alle Tabs rendern
    this._renderAll();

    // Footer
    this._renderFooter();
  },

  /* ── Alle Tabs rendern ──────────────────────────────────────── */
  _renderAll() {
    const rides = Data.byDate();
    Overview.render(rides);
    this._renderCharts();
    Table.render();
    Analysis.render(rides);
  },

  /* ── Charts ─────────────────────────────────────────────────── */
  _renderCharts() {
    const rides  = Data.byDate();
    const weekly = Data.weekly();

    Charts.renderWeeklyVolume("chart-weekly", weekly, (week) => {
      Table.filterByWeek(week);
      Tabs.switch("table");
    });

    Charts.renderCTL("chart-ctl", rides);
    Charts.renderTrimp("chart-trimp", weekly);
    Charts.renderEfficiency("chart-efficiency", rides);
    Charts.renderScatter("chart-scatter", rides);
    Charts.renderHRV("chart-hrv", rides);
    Charts.renderRHF("chart-rhf", rides);
    Charts.renderSmallMultiples(rides);
    Charts.renderHeatmap("chart-heatmap", rides);

    const ctlRides = rides.filter(r => r.ctl != null);
    if (ctlRides.length) {
      const first = ctlRides[0].ctl, last = ctlRides[ctlRides.length - 1].ctl;
      el("ctl-note").textContent = `CTL ${first} → ${last} in ${rides.length} Fahrten`;
    }

    const effRides = rides.filter(r => r.efficiency);
    if (effRides.length) {
      const eStart = avg(effRides.slice(0, 5), "efficiency");
      const eEnd   = avg(effRides.slice(-5), "efficiency");
      if (eStart && eEnd) {
        const delta = eEnd - eStart;
        el("efficiency-note").textContent =
          `${fmt(eStart, 2)} → ${fmt(eEnd, 2)} W/bpm (${delta > 0 ? "+" : ""}${fmt(delta, 2)})`;
      }
    }
  },

  /* ── Footer ─────────────────────────────────────────────────── */
  _renderFooter() {
    const now = new Date().toLocaleDateString("de-DE", {
      day: "2-digit", month: "long", year: "numeric",
    });
    el("footer").innerHTML = `
      <span>${CONFIG.planName} · ${now}</span>
      <button class="btn-refresh" onclick="location.reload()">↻ Aktualisieren</button>`;
  },
};

// ── Start ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => App.init());
