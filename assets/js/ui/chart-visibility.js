/* ============================================================
   UI/CHART-VISIBILITY.JS — datengetriebene Sichtbarkeit der Charts
   Blendet Charts aus, für die der AKTIVE Athlet keine Daten hat,
   und kollabiert Kategorien, deren Charts alle leer sind. Ein
   Umschalter macht die leeren Charts trotzdem sichtbar (als
   gedimmte "keine Daten"-Platzhalter) — damit man weiß, dass es
   sie gibt. Ersetzt den früheren Einzelfall (FTP-Projektion).

   Prädikate prüfen die Rohdaten, die ein Chart braucht. Unbekannte
   Chart-IDs gelten als "immer sichtbar" (fail-open).
   ============================================================ */

import { Data } from "../state/data.js";
import { weightTrend, energyView, hydrationSeries } from "../core/body.js";
import { el } from "./dom.js";

/** Verfügbarkeits-Prädikate je Chart-SVG-ID (aktiver Athlet) */
const AVAILABILITY = {
  "chart-pmc": () => Data.rides.some((r) => r.ctl != null),
  "chart-weekly": () => Data.rides.length > 0,
  "chart-trimp": () => Data.rides.some((r) => r.trimp || r.tss),
  "chart-zones": () => Data.rides.some((r) => r.np != null),
  "chart-power-curve": () => !!Data.powerCurves,
  "chart-ftp-forecast": () => Data.rides.some((r) => r.week), // Plan-2-Retest nur mit eigenem Plan
  "chart-efficiency": () =>
    Data.rides.filter((r) => r.watt && r.hf && (r.min || 0) >= 60).length >= 2,
  "chart-scatter": () => Data.rides.some((r) => r.hf && r.kmh),
  "chart-sm-tempo": () => Data.rides.some((r) => r.kmh),
  "chart-sm-kadenz": () => Data.rides.some((r) => r.kad),
  "chart-sm-hf": () => Data.rides.some((r) => r.hf),
  "chart-decoupling": () => Data.rides.some((r) => r.decoupling != null),
  "chart-hrv-p1": () => Data.wellness.some((w) => w.hrv != null),
  "chart-rhf-p1": () => Data.wellness.some((w) => w.restingHR != null),
  "chart-sleep": () => Data.wellness.some((w) => w.sleepHours != null),
  "chart-weather-weekly": () => Data.rides.some((r) => r.weather || r.wetter),
  "chart-weight": () => weightTrend(Data.wellness) !== null,
  "chart-energy": () => energyView(Data.wellness) !== null,
  "chart-hydration": () => hydrationSeries(Data.wellness) !== null,
};

/** Ist der Chart für den aktiven Athleten mit Daten belegt?
 *  @param {string} id SVG-ID @returns {boolean} */
function isAvailable(id) {
  const pred = AVAILABILITY[id];
  if (!pred) return true; // unbekannt → nicht ausblenden
  try {
    return !!pred();
  } catch {
    return false;
  }
}

export const ChartVisibility = {
  showEmpty: false,

  /** Einmalig: Umschalter verdrahten */
  init() {
    const btn = el("toggle-empty-charts");
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener("click", () => {
      this.showEmpty = !this.showEmpty;
      btn.classList.toggle("active", this.showEmpty);
      btn.setAttribute("aria-pressed", String(this.showEmpty));
      btn.textContent = this.showEmpty ? "Leere Charts ausblenden" : "Leere Charts einblenden";
      this.apply();
    });
  },

  /** Sichtbarkeit auf alle Charts/Kategorien anwenden (nach jedem Render) */
  apply() {
    document.querySelectorAll("#tab-charts .chart-group").forEach((group) => {
      let anyVisible = false;
      group.querySelectorAll(".chart-box").forEach((box) => {
        const svg = box.querySelector("svg.chart");
        const available = svg ? isAvailable(svg.id) : true;
        box.classList.toggle("chart-empty", !available);
        const visible = available || this.showEmpty;
        box.classList.toggle("hidden", !visible);
        if (visible) anyVisible = true;
        this._placeholder(box, !available && visible);
      });
      group.classList.toggle("hidden", !anyVisible);
    });
  },

  /** Platzhalter-Hinweis in leeren, aber sichtbaren Boxen ein-/ausblenden */
  _placeholder(box, show) {
    let ph = box.querySelector(".chart-empty-note");
    if (show && !ph) {
      ph = document.createElement("div");
      ph.className = "chart-empty-note";
      ph.textContent = "Keine Daten für diesen Athleten — erscheint, sobald verfügbar.";
      box.appendChild(ph);
    } else if (!show && ph) {
      ph.remove();
    }
  },
};
