/* ============================================================
   SPORTS/SWIMMING/METRICS.TS — Metrik-Vokabular Schwimmen (Fahrplan 10 E5)

   !!! UNKALIBRIERT — 0 Schwimm-Aktivitäten im Account (E0 2026-09-07) !!!

   Aufbau 1:1 wie sports/cycling/metrics.ts. Schwimmen ersetzt die
   Watt-Welt des Rads durch CSS (Critical Swim Speed) in min/100 m und
   eine HF-basierte TRIMP-Last (Fahrplan 10 V3). Wo Schwimmen ohne HF
   geloggt wird, greift in E6 der RPE-Ersatzpfad (Pflichtpfad, OF-3).

   Vertrags-Feldnamen bleiben radsport-geprägt (Fahrplan 10 Q1): es gibt
   kein Schwimm-Analogon zur geglätteten Leistung → `normalizedPowerMetric`
   ist "—"; `whatIfScaleHeadroom` ist 0.
   ============================================================ */

import type { SportMetrics } from "../types.js";

/** Ziel-Zugfrequenz in Zügen pro Minute (beide Arme gezählt, wie die
 *  Lauf-Schrittfrequenz beide Füße zählt). Quelle: Distanzschwimmer
 *  (400 m+) fahren überwiegend 50–65 SPM (hüftbetonte Technik); Swim-Smooth
 *  arbeitet mit dem Tempo-Trainer in genau diesem Bereich. 55 als Mitte.
 *  UNKALIBRIERT. */
export const SWIMMING_STROKE_RATE_TARGET_SPM = 55;

/** Herzfrequenzzonen als Anteil der maximalen Herzfrequenz. Modell wie
 *  beim Laufen (klassisches 5-Zonen-%HFmax-Raster). Hinweis: die HF liegt
 *  im Wasser typisch ~10 bpm unter dem Landäquivalent (Wasserdruck,
 *  Horizontallage, Abkühlung) — die Struktur ist trotzdem 1:1 übernommen,
 *  eine schwimmspezifische Korrektur ist nachzuziehen, sobald echte
 *  Schwimm-HF-Daten vorliegen. UNKALIBRIERT. */
export const SWIMMING_HR_ZONES: Readonly<Record<string, readonly [number, number]>> = {
  z1: [0, 0.6],
  z2: [0.6, 0.7],
  z3: [0.7, 0.8],
  z4: [0.8, 0.9],
  z5: [0.9, 1.0],
};

export const swimmingMetrics: SportMetrics = {
  thresholdMetric: "CSS",
  thresholdUnit: "min/100 m",
  loadMetric: "TRIMP",
  intensityMetric: "IF",
  /** Kein Schwimm-Analogon zur geglätteten Leistungsgröße "NP" beim Rad. */
  normalizedPowerMetric: "—",
  cadenceMetric: "Zugfrequenz",
  cadenceUnit: "SPM",
  cadenceTarget: SWIMMING_STROKE_RATE_TARGET_SPM,
  /** Kommt vom Athleten, nicht von der Sportart. */
  hrMax: null,
  hrZones: SWIMMING_HR_ZONES,
  /** Kein fester Wert: die Skala wächst dynamisch aus der geschätzten
   *  CSS (E7). */
  scaleMax: null,
  /** Kein Watt-Analogon fürs Schwimmen. */
  whatIfScaleHeadroom: 0,
};
