/* ============================================================
   SPORTS/CYCLING/INDEX.TS — Das Radsport-Profil (Etappe 3)

   Fügt die vier Wertegruppen zu einem SportProfile zusammen. Die
   Einzelmodule bleiben zusätzlich direkt importierbar — core/ zieht
   seine Konstanten von dort, nicht über das Profil, damit die
   Re-Export-Zeilen dort schmal bleiben.
   ============================================================ */

import type { SportProfile } from "../types.js";
import { cyclingZones } from "./zones.js";
import { cyclingMetrics } from "./metrics.js";
import { cyclingSessionTypes } from "./session-types.js";
import { cyclingClassify } from "./classify.js";

export const CYCLING_SPORT_ID = "cycling";

export const cyclingProfile: SportProfile = {
  id: CYCLING_SPORT_ID,
  label: "Radsport",
  zones: cyclingZones,
  metrics: cyclingMetrics,
  sessionTypes: cyclingSessionTypes,
  classify: cyclingClassify,
};

export * from "./zones.js";
export * from "./metrics.js";
export * from "./session-types.js";
export * from "./classify.js";
