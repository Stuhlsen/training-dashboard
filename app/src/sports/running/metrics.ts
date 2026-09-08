/* ============================================================
   SPORTS/RUNNING/METRICS.TS — Metrik-Vokabular Laufen (Fahrplan 10 E5)

   Aufbau 1:1 wie sports/cycling/metrics.ts. Genau der Teil, den das
   Laufen gegenüber dem Rad umbenennt: keine FTP in Watt, sondern eine
   Schwellenpace in min/km; statt TSS eine HF-basierte TRIMP-Last
   (Fahrplan 10 V3).

   Die Vertrags-Feldnamen bleiben radsport-geprägt (Fahrplan 10 Q1:
   kein Rename in E5) — `normalizedPowerMetric` heißt hier "GAP"
   (steigungsangepasste Pace), `whatIfScaleHeadroom` ist 0 (kein
   Watt-Analogon). Athletenwerte (`hrMax`) gehören nicht hierher,
   sondern in app/src/config.ts (s. sports/README.md).
   ============================================================ */

import type { SportMetrics } from "../types.js";

/** Ziel-Schrittfrequenz in Schritten pro Minute (beide Füße).
 *  Quelle: Daniels beobachtete bei Eliteläufern ~180 spm; gängiger
 *  Zielkorridor 170–185. Wert dient nur als Vorgabe für einen
 *  künftigen Kadenz-Coach (analog core/cadence.js beim Rad). */
export const RUNNING_CADENCE_TARGET_SPM = 180;

/** Herzfrequenzzonen als Anteil der maximalen Herzfrequenz.
 *  Modell: klassisches 5-Zonen-%HFmax-Raster (Z1 50–60 · Z2 60–70 ·
 *  Z3 70–80 · Z4 80–90 · Z5 90–100) — das am breitesten publizierte
 *  %HFmax-Schema. Joe Friels eigenes Laufzonen-System ist an der
 *  Schwellen-HF (LTHR) verankert, nicht an HFmax; eine athletenspezifische
 *  LTHR-Verfeinerung ist E7-Thema. UNKALIBRIERT. */
export const RUNNING_HR_ZONES: Readonly<Record<string, readonly [number, number]>> = {
  z1: [0, 0.6],
  z2: [0.6, 0.7],
  z3: [0.7, 0.8],
  z4: [0.8, 0.9],
  z5: [0.9, 1.0],
};

export const runningMetrics: SportMetrics = {
  thresholdMetric: "Schwellenpace",
  thresholdUnit: "min/km",
  loadMetric: "TRIMP",
  intensityMetric: "IF",
  /** Steigungsangepasste Pace (Grade Adjusted Pace) — das Lauf-Pendant
   *  zur geglätteten Leistungsgröße "NP" beim Rad. */
  normalizedPowerMetric: "GAP",
  cadenceMetric: "Schrittfrequenz",
  cadenceUnit: "spm",
  cadenceTarget: RUNNING_CADENCE_TARGET_SPM,
  /** Kommt vom Athleten, nicht von der Sportart (s. Kopfkommentar). */
  hrMax: null,
  hrZones: RUNNING_HR_ZONES,
  /** Kein fester Wert: die Skala wächst dynamisch aus der geschätzten
   *  Schwellenpace (E7), analog scaleMaxWatts beim Rad. */
  scaleMax: null,
  /** Kein Watt-Analogon fürs Laufen — die What-if-Pace-Skala in E7
   *  braucht keinen additiven Puffer. */
  whatIfScaleHeadroom: 0,
};
