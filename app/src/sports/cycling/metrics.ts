/* ============================================================
   SPORTS/CYCLING/METRICS.TS — Metrik-Vokabular Radsport (Etappe 3)

   Die Namen, unter denen der Radsport seine Kennzahlen führt, plus die
   sportgebundenen Referenzwerte. Genau der Teil, den eine zweite
   Sportart umbenennen müsste: Laufen kennt keine FTP in Watt, sondern
   eine Schwellenpace in min/km, und statt TSS eine laufspezifische
   Lastgröße.

   Athletenwerte gehören NICHT hierher (s. README): `hrMax` ist eine
   Eigenschaft der Person, nicht der Sportart, und steht deshalb
   weiterhin aus. Die HF-Zonen unten sind reine Anteile von hrMax —
   das Zonenmodell ist sportgebunden, sein Bezugswert nicht.
   ============================================================ */

import type { SportMetrics } from "../types.js";

/** Ziel-Kadenz in RPM. Bekannte Baustelle des Primärathleten (80 → 90+),
 *  siehe core/cadence.js — die Funktion nimmt den Zielwert bereits als
 *  Parameter entgegen, hier steht nur noch die Quelle dieses Werts. */
export const CADENCE_TARGET_RPM = 90;

/** Herzfrequenzzonen als Anteil der maximalen Herzfrequenz.
 *  Unverändert aus state/config.js::CONFIG.hrZones übernommen. */
export const HR_ZONES: Readonly<Record<string, readonly [number, number]>> = {
  z1: [0, 0.68],
  z2: [0.68, 0.83],
  z3: [0.83, 0.88],
  z4: [0.88, 0.95],
  z5: [0.95, 1.0],
};

/** Fester Watt-Puffer für core/zones.js::whatIfScaleMax() — die
 *  Begründung (Selbstkürzung des Skalierungsfaktors) steht dort. */
export const WHATIF_SCALE_HEADROOM_W = 80;

export const cyclingMetrics: SportMetrics = {
  thresholdMetric: "FTP",
  thresholdUnit: "W",
  loadMetric: "TSS",
  intensityMetric: "IF",
  normalizedPowerMetric: "NP",
  cadenceMetric: "Kadenz",
  cadenceUnit: "rpm",
  cadenceTarget: CADENCE_TARGET_RPM,
  /** Kommt vom Athleten, nicht von der Sportart (s. Kopfkommentar). */
  hrMax: null,
  hrZones: HR_ZONES,
  /** Kein fester Wert: die Skala wächst dynamisch mit der FTP
   *  (core/zones.js::scaleMaxWatts), siehe README. */
  scaleMax: null,
  whatIfScaleHeadroom: WHATIF_SCALE_HEADROOM_W,
};
