/* ============================================================
   Fahrplan 10 E5 — Werte-Gleichheit + Vertragstreue des Lauf-Profils.

   Aufbau wie sports/cycling/profile.test.ts: die Literale sind hier ein
   zweites Mal ausgeschrieben, unabhängig von den Quelldateien — ein
   Zahlendreher in einem selten genutzten Wert (etwa einem einzelnen
   defaultLoad-Eintrag) fiele sonst nirgends auf. Es gibt keine
   core-Re-Exports fürs Laufen (noch kein Konsument), deshalb fehlt der
   entsprechende Block aus dem Radsport-Test.
   ============================================================ */

import { describe, it, expect } from "vitest";

import {
  DANIELS_ZONE_UPPER_PCT,
  DANIELS_ZONE_META,
  RUNNING_IF_BANDS,
  LOW_INTENSITY_TARGET,
} from "./zones.js";
import { RUNNING_CADENCE_TARGET_SPM, RUNNING_HR_ZONES } from "./metrics.js";
import {
  RUNNING_KNOWN_TYPES,
  RUNNING_TYPE_DEFAULT_LOAD,
  RUNNING_TYPE_DEFAULT_LOAD_APPROX_TYPES,
  RUNNING_INTENSITY_CLASS,
  RUNNING_TYPE_EXPECTED_BAND,
  RUNNING_PHASE_SIGNATURES,
  RUNNING_COMPARABLE,
} from "./session-types.js";
import { RUNNING_SESSION_CLASSIFY, RUNNING_FALLBACK_LOAD } from "./classify.js";
import { runningProfile } from "./index.js";

describe("running/zones — Werte", () => {
  it("Daniels-Zonengrenzen (Anteil Schwellengeschwindigkeit)", () => {
    expect(DANIELS_ZONE_UPPER_PCT).toEqual([0.89, 0.97, 1.04, 1.13, 1.2]);
  });

  it("IF-Bänder und Low-Intensity-Richtwert", () => {
    expect(RUNNING_IF_BANDS).toEqual({ lowMax: 0.88, midMax: 1.08 });
    expect(LOW_INTENSITY_TARGET).toBe(0.8);
  });

  it("Zonenkette ist lückenlos aufsteigend", () => {
    const kette = [...DANIELS_ZONE_UPPER_PCT];
    expect([...kette].sort((a, b) => a - b)).toEqual(kette);
    expect(new Set(kette).size).toBe(kette.length);
  });

  it("Zonen-Metadaten sind index-gleich zu den Grenzen", () => {
    expect(DANIELS_ZONE_META.length).toBe(DANIELS_ZONE_UPPER_PCT.length);
    expect(DANIELS_ZONE_META.map((z) => z.id)).toEqual(["e", "m", "t", "i", "r"]);
    expect(DANIELS_ZONE_META.map((z) => z.farbe)).toEqual([
      "var(--z1)",
      "var(--z2)",
      "var(--z3)",
      "var(--thr)",
      "var(--vo2)",
    ]);
  });

  it("kein Sweet-Spot-Overlay beim Laufen", () => {
    expect(runningProfile.zones.overlayBandPct).toBe(null);
  });
});

describe("running/metrics — Werte", () => {
  it("Schrittfrequenz-Ziel", () => {
    expect(RUNNING_CADENCE_TARGET_SPM).toBe(180);
  });

  it("HF-Zonen als Anteile von HFmax (klassisches 5-Zonen-Raster)", () => {
    expect(RUNNING_HR_ZONES).toEqual({
      z1: [0, 0.6],
      z2: [0.6, 0.7],
      z3: [0.7, 0.8],
      z4: [0.8, 0.9],
      z5: [0.9, 1.0],
    });
  });

  it("Metriknamen — Lauf deutet den Vertrag um, benennt ihn nicht um", () => {
    expect(runningProfile.metrics.thresholdMetric).toBe("Schwellenpace");
    expect(runningProfile.metrics.thresholdUnit).toBe("min/km");
    expect(runningProfile.metrics.loadMetric).toBe("TRIMP");
    expect(runningProfile.metrics.normalizedPowerMetric).toBe("GAP");
  });

  it("hrMax und scaleMax kommen bewusst nicht von der Sportart", () => {
    expect(runningProfile.metrics.hrMax).toBe(null);
    expect(runningProfile.metrics.scaleMax).toBe(null);
    expect(runningProfile.metrics.whatIfScaleHeadroom).toBe(0);
  });
});

describe("running/session-types — Typvokabular vollständig", () => {
  it("bekannte Typen (Fahrplan 10 V4)", () => {
    expect(RUNNING_KNOWN_TYPES).toEqual([
      "Dauerlauf",
      "Intervalle",
      "Longrun",
      "Tempolauf",
      "Rekom",
    ]);
  });

  it("Default-TRIMP je Typ, alle fünf Einträge", () => {
    expect(RUNNING_TYPE_DEFAULT_LOAD).toEqual({
      Dauerlauf: 55,
      Intervalle: 80,
      Longrun: 120,
      Tempolauf: 75,
      Rekom: 25,
    });
  });

  it("alle Typen sind Näherungen (keine Lauf-Datenbasis)", () => {
    expect([...RUNNING_TYPE_DEFAULT_LOAD_APPROX_TYPES].sort()).toEqual(
      [...RUNNING_KNOWN_TYPES].sort(),
    );
    for (const t of RUNNING_TYPE_DEFAULT_LOAD_APPROX_TYPES) {
      expect(t in RUNNING_TYPE_DEFAULT_LOAD, `${t} fehlt in defaultLoad`).toBeTruthy();
    }
  });

  it("jeder bekannte Typ hat Default-Last und Intensitätsklasse", () => {
    for (const t of RUNNING_KNOWN_TYPES) {
      expect(t in RUNNING_TYPE_DEFAULT_LOAD, `${t} fehlt in defaultLoad`).toBeTruthy();
      expect(t in RUNNING_INTENSITY_CLASS, `${t} fehlt in intensityClass`).toBeTruthy();
    }
  });

  it("Intensitätsklassen", () => {
    expect(RUNNING_INTENSITY_CLASS).toEqual({
      Tempolauf: "hart",
      Intervalle: "hart",
      Dauerlauf: "locker",
      Longrun: "locker",
      Rekom: "locker",
    });
  });

  it("erwartete Zonen-Bänder", () => {
    expect(RUNNING_TYPE_EXPECTED_BAND).toEqual({
      Dauerlauf: "low",
      Longrun: "low",
      Rekom: "low",
      Tempolauf: "mid",
      Intervalle: "high",
    });
  });

  it("Reizsignaturen — generischer Minimalsatz", () => {
    expect(RUNNING_PHASE_SIGNATURES).toEqual({
      Grundlage: { ifMin: 0.7, ifMax: 0.9, types: ["Dauerlauf", "Longrun"] },
      Schwelle: { ifMin: 0.95, ifMax: 1.05, types: ["Tempolauf"] },
      VO2max: { ifMin: 1.05, ifMax: 1.2, types: ["Intervalle"] },
    });
    for (const sig of Object.values(RUNNING_PHASE_SIGNATURES)) {
      expect(sig.ifMin).toBeLessThan(sig.ifMax);
    }
  });

  it("Vergleichbarkeit für den Effizienz-Trend", () => {
    expect(RUNNING_COMPARABLE).toEqual({
      types: ["Dauerlauf", "Longrun"],
      minDurationMin: 40,
      tempRange: [5, 25],
    });
  });
});

describe("running/classify — Schwellen", () => {
  it("Schwellen der Ist-Typerkennung", () => {
    expect({ ...RUNNING_SESSION_CLASSIFY }).toEqual({
      ftpTestMaxMin: 20,
      ftpTestMinIF: 0.98,
      ifLowMax: 0.88,
      ifZ2DauerMax: 0.96,
      ifTempoMax: 1.0,
      ifSweetSpotMax: 1.03,
      ifSchwelleMax: 1.08,
      longRideMin: 90,
      dauerMin: 45,
      langOverrideMin: 150,
      shortRideConfidenceMin: 15,
      bandMinShare: { low: 0.45, mid: 0.35, high: 0.15 },
      blockMinDurationSec: 240,
      blockMinSharePct: 0.08,
    });
  });

  it("IF-Grenzen sind monoton aufsteigend", () => {
    const grenzen = [
      RUNNING_SESSION_CLASSIFY.ifLowMax,
      RUNNING_SESSION_CLASSIFY.ifZ2DauerMax,
      RUNNING_SESSION_CLASSIFY.ifTempoMax,
      RUNNING_SESSION_CLASSIFY.ifSweetSpotMax,
      RUNNING_SESSION_CLASSIFY.ifSchwelleMax,
    ];
    expect([...grenzen].sort((a, b) => a - b)).toEqual(grenzen);
  });

  it("Rückfall-Last", () => {
    expect(RUNNING_FALLBACK_LOAD).toBe(60);
  });
});

describe("running/index — das Profil bündelt dieselben Objekte", () => {
  it("Referenzgleichheit zu den Einzelmodulen", () => {
    expect(runningProfile.zones.upperPct).toBe(DANIELS_ZONE_UPPER_PCT);
    expect(runningProfile.sessionTypes.defaultLoad).toBe(RUNNING_TYPE_DEFAULT_LOAD);
    expect(runningProfile.sessionTypes.phaseSignatures).toBe(RUNNING_PHASE_SIGNATURES);
    expect(runningProfile.classify.fallbackLoad).toBe(RUNNING_FALLBACK_LOAD);
  });

  it("id und label", () => {
    expect(runningProfile.id).toBe("running");
    expect(runningProfile.label).toBe("Laufen");
  });
});
