/* ============================================================
   SPORTS/SWIMMING/INDEX.TS — Das Schwimm-Profil (Fahrplan 10 E5)

   !!! UNKALIBRIERT — 0 Schwimm-Aktivitäten im Account (E0 2026-09-07) !!!
   Reines Wertegerüst nach Lehrbuch (Swim-Smooth CSS / Maglischo). Steht
   bereit, damit alles funktioniert, sobald Athlet 3 Schwimmeinheiten
   loggt; jeder Wert ist bis dahin gegen echte Daten zu prüfen.

   Fügt die vier Wertegruppen zusammen, 1:1 wie sports/cycling/index.ts.
   Noch von niemandem konsumiert.
   ============================================================ */

import type { SportProfile } from "../types.js";
import { swimmingZones } from "./zones.js";
import { swimmingMetrics } from "./metrics.js";
import { swimmingSessionTypes } from "./session-types.js";
import { swimmingClassify } from "./classify.js";

export const SWIMMING_SPORT_ID = "swimming";

export const swimmingProfile: SportProfile = {
  id: SWIMMING_SPORT_ID,
  label: "Schwimmen",
  zones: swimmingZones,
  metrics: swimmingMetrics,
  sessionTypes: swimmingSessionTypes,
  classify: swimmingClassify,
};

export * from "./zones.js";
export * from "./metrics.js";
export * from "./session-types.js";
export * from "./classify.js";
