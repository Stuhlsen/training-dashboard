/* ============================================================
   SPORTS/SWIMMING/CLASSIFY.TS — Ist-Typerkennung Schwimmen (Fahrplan 10 E5)

   !!! UNKALIBRIERT — 0 Schwimm-Aktivitäten im Account (E0 2026-09-07) !!!
   Die Schwellen spiegeln die Form der Radsport-Kalibrierung und sind auf
   die CSS-Zonen (zones.ts) abgestimmt, aber an nichts geprüft.

   Aufbau 1:1 wie sports/cycling/classify.ts. Die `if*`-Werte sind Anteile
   der geschätzten CSS-GESCHWINDIGKEIT (Q2), monoton aufsteigend. Die
   Feldnamen bleiben radsport-geprägt (Fahrplan 10 Q1) — "ftpTest" meint
   hier einen CSS-Test (400 m + 200 m Zeitfahrt), "SweetSpot" die
   Übergangsgrenze zum CSS-Tempo.
   ============================================================ */

import type { SportClassify } from "../types.js";

/** Schwellen der datenbasierten Ist-Typerkennung. Alle IF-Werte = Anteil
 *  der CSS-Geschwindigkeit. UNKALIBRIERT (s. Kopfkommentar). */
export const SWIMMING_SESSION_CLASSIFY = Object.freeze({
  ftpTestMaxMin: 20, // CSS-Test: 400 m + 200 m Zeitfahrt, in Summe kurz
  ftpTestMinIF: 0.98,
  ifLowMax: 0.9, // ≤ : Rekom/Technik/Longswim je nach Dauer
  ifZ2DauerMax: 0.96,
  ifTempoMax: 0.99,
  ifSweetSpotMax: 1.01, // Übergangsgrenze zum CSS-Tempo (Feldname radsport-geprägt)
  ifSchwelleMax: 1.05, // ≥ : Intervalle/VO2max
  longRideMin: 45, // Dauer-Schwelle für "Longswim"
  dauerMin: 25, // Dauer-Schwelle für eine echte Trainingseinheit statt "Rekom"
  langOverrideMin: 75, // sehr lange Einheit trotzdem "Longswim"
  shortRideConfidenceMin: 12, // darunter: Konfidenz höchstens "niedrig" (außer Test)
  // Generisch aus dem Radsport übernommen — keine Schwimm-Datenbasis.
  bandMinShare: Object.freeze({ low: 0.45, mid: 0.35, high: 0.15 }),
  // Blockerkennung, an die kurzen Schwimm-Intervalldauern angepasst.
  blockMinDurationSec: 120,
  blockMinSharePct: 0.08,
});

/** Rückfall-TRIMP für einen Typ ohne Eintrag in `defaultLoad` und ohne
 *  eigene Last-/Workout-Angabe. UNKALIBRIERT. */
export const SWIMMING_FALLBACK_LOAD = 45;

export const swimmingClassify: SportClassify = {
  ...SWIMMING_SESSION_CLASSIFY,
  fallbackLoad: SWIMMING_FALLBACK_LOAD,
};
