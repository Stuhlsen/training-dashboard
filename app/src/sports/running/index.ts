/* ============================================================
   SPORTS/RUNNING/INDEX.TS — Das Lauf-Profil (Fahrplan 10 E5)

   Fügt die vier Wertegruppen zu einem SportProfile zusammen, 1:1 wie
   sports/cycling/index.ts. Die Einzelmodule bleiben zusätzlich direkt
   importierbar (Re-Export unten) — profile.test.ts zieht seine
   Konstanten von dort.

   Noch von niemandem konsumiert: E6 nutzt sessionTypes.defaultLoad,
   E7 zones + metrics für die Pace-Analyse.
   ============================================================ */

import type { SportProfile } from "../types.js";
import { runningZones } from "./zones.js";
import { runningMetrics } from "./metrics.js";
import { runningSessionTypes } from "./session-types.js";
import { runningClassify } from "./classify.js";

export const RUNNING_SPORT_ID = "running";

export const runningProfile: SportProfile = {
  id: RUNNING_SPORT_ID,
  label: "Laufen",
  zones: runningZones,
  metrics: runningMetrics,
  sessionTypes: runningSessionTypes,
  classify: runningClassify,
};

export * from "./zones.js";
export * from "./metrics.js";
export * from "./session-types.js";
export * from "./classify.js";
