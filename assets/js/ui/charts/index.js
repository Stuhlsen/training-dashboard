/* ============================================================
   UI/CHARTS/INDEX.JS — Charts-Fassade
   Bündelt die vier Chart-Module unter dem gewohnten
   Charts.renderXxx-Interface, damit Aufrufstellen stabil bleiben.
   ============================================================ */

import * as training from "./training.js";
import * as pmc from "./pmc.js";
import * as power from "./power.js";
import * as wellness from "./wellness.js";

export const Charts = {
  ...training, // renderWeeklyVolume, renderTrimp (Belastungswächter), renderConsistency, renderZoneWeekly, renderWeatherWeekly
  ...pmc, // renderCTL, renderPMC, renderDecoupling, renderFtpForecast
  ...power, // renderPowerCurve (+Blöcke), renderEfficiency (+EF-Trend), renderScatter, renderSmallMultiples, renderCadenceCoach
  ...wellness, // renderSleep, renderPlanCompareHRV, renderPlanCompareRHF
};
