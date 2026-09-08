/* ============================================================
   Fahrplan 10 E5 — Werte-Gleichheit + Vertragstreue des Schwimm-Profils.

   Aufbau wie sports/cycling/profile.test.ts: Literale ein zweites Mal
   ausgeschrieben, unabhängig von den Quelldateien. Das Schwimm-Profil ist
   UNKALIBRIERT (0 Schwimm-Aktivitäten) — dieser Test prüft die FORM
   (Vertragstreue, Monotonie, Index-Gleichheit), nicht die
   trainingswissenschaftliche Richtigkeit der Zahlen.
   ============================================================ */

import { describe, it, expect } from "vitest";

import {
  CSS_ZONE_UPPER_PCT,
  CSS_ZONE_META,
  SWIMMING_IF_BANDS,
  LOW_INTENSITY_TARGET,
} from "./zones.js";
import { SWIMMING_STROKE_RATE_TARGET_SPM, SWIMMING_HR_ZONES } from "./metrics.js";
import {
  SWIMMING_KNOWN_TYPES,
  SWIMMING_TYPE_DEFAULT_LOAD,
  SWIMMING_TYPE_DEFAULT_LOAD_APPROX_TYPES,
  SWIMMING_INTENSITY_CLASS,
  SWIMMING_TYPE_EXPECTED_BAND,
  SWIMMING_PHASE_SIGNATURES,
  SWIMMING_COMPARABLE,
} from "./session-types.js";
import { SWIMMING_SESSION_CLASSIFY, SWIMMING_FALLBACK_LOAD } from "./classify.js";
import { swimmingProfile } from "./index.js";

describe("swimming/zones — Werte", () => {
  it("CSS-Zonengrenzen (Anteil CSS-Geschwindigkeit)", () => {
    expect(CSS_ZONE_UPPER_PCT).toEqual([0.87, 0.95, 1.0, 1.1, 1.25]);
  });

  it("IF-Bänder und Low-Intensity-Richtwert", () => {
    expect(SWIMMING_IF_BANDS).toEqual({ lowMax: 0.9, midMax: 1.05 });
    expect(LOW_INTENSITY_TARGET).toBe(0.8);
  });

  it("Zonenkette ist lückenlos aufsteigend", () => {
    const kette = [...CSS_ZONE_UPPER_PCT];
    expect([...kette].sort((a, b) => a - b)).toEqual(kette);
    expect(new Set(kette).size).toBe(kette.length);
  });

  it("Zonen-Metadaten sind index-gleich zu den Grenzen", () => {
    expect(CSS_ZONE_META.length).toBe(CSS_ZONE_UPPER_PCT.length);
    expect(CSS_ZONE_META.map((z) => z.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(CSS_ZONE_META.map((z) => z.farbe)).toEqual([
      "var(--z1)",
      "var(--z2)",
      "var(--z3)",
      "var(--thr)",
      "var(--vo2)",
    ]);
  });

  it("kein Sweet-Spot-Overlay beim Schwimmen", () => {
    expect(swimmingProfile.zones.overlayBandPct).toBe(null);
  });
});

describe("swimming/metrics — Werte", () => {
  it("Zugfrequenz-Ziel", () => {
    expect(SWIMMING_STROKE_RATE_TARGET_SPM).toBe(55);
  });

  it("HF-Zonen als Anteile von HFmax", () => {
    expect(SWIMMING_HR_ZONES).toEqual({
      z1: [0, 0.6],
      z2: [0.6, 0.7],
      z3: [0.7, 0.8],
      z4: [0.8, 0.9],
      z5: [0.9, 1.0],
    });
  });

  it("Metriknamen — Schwimmen deutet den Vertrag um", () => {
    expect(swimmingProfile.metrics.thresholdMetric).toBe("CSS");
    expect(swimmingProfile.metrics.thresholdUnit).toBe("min/100 m");
    expect(swimmingProfile.metrics.loadMetric).toBe("TRIMP");
    expect(swimmingProfile.metrics.normalizedPowerMetric).toBe("—");
  });

  it("hrMax und scaleMax kommen bewusst nicht von der Sportart", () => {
    expect(swimmingProfile.metrics.hrMax).toBe(null);
    expect(swimmingProfile.metrics.scaleMax).toBe(null);
    expect(swimmingProfile.metrics.whatIfScaleHeadroom).toBe(0);
  });
});

describe("swimming/session-types — Typvokabular vollständig", () => {
  it("bekannte Typen (Fahrplan 10 V4)", () => {
    expect(SWIMMING_KNOWN_TYPES).toEqual(["Technik", "Intervalle", "Longswim", "Rekom"]);
  });

  it("Default-TRIMP je Typ, alle vier Einträge", () => {
    expect(SWIMMING_TYPE_DEFAULT_LOAD).toEqual({
      Technik: 25,
      Intervalle: 55,
      Longswim: 70,
      Rekom: 20,
    });
  });

  it("alle Typen sind Näherungen (keine Schwimm-Datenbasis)", () => {
    expect([...SWIMMING_TYPE_DEFAULT_LOAD_APPROX_TYPES].sort()).toEqual(
      [...SWIMMING_KNOWN_TYPES].sort(),
    );
    for (const t of SWIMMING_TYPE_DEFAULT_LOAD_APPROX_TYPES) {
      expect(t in SWIMMING_TYPE_DEFAULT_LOAD, `${t} fehlt in defaultLoad`).toBeTruthy();
    }
  });

  it("jeder bekannte Typ hat Default-Last und Intensitätsklasse", () => {
    for (const t of SWIMMING_KNOWN_TYPES) {
      expect(t in SWIMMING_TYPE_DEFAULT_LOAD, `${t} fehlt in defaultLoad`).toBeTruthy();
      expect(t in SWIMMING_INTENSITY_CLASS, `${t} fehlt in intensityClass`).toBeTruthy();
    }
  });

  it("Intensitätsklassen", () => {
    expect(SWIMMING_INTENSITY_CLASS).toEqual({
      Intervalle: "hart",
      Technik: "locker",
      Longswim: "locker",
      Rekom: "locker",
    });
  });

  it("erwartete Zonen-Bänder", () => {
    expect(SWIMMING_TYPE_EXPECTED_BAND).toEqual({
      Technik: "low",
      Longswim: "low",
      Rekom: "low",
      Intervalle: "high",
    });
  });

  it("Reizsignaturen — generischer Minimalsatz", () => {
    expect(SWIMMING_PHASE_SIGNATURES).toEqual({
      Grundlage: { ifMin: 0.85, ifMax: 0.97, types: ["Longswim", "Technik"] },
      Schwelle: { ifMin: 0.97, ifMax: 1.03, types: ["Intervalle"] },
      VO2max: { ifMin: 1.0, ifMax: 1.12, types: ["Intervalle"] },
    });
    for (const sig of Object.values(SWIMMING_PHASE_SIGNATURES)) {
      expect(sig.ifMin).toBeLessThan(sig.ifMax);
    }
  });

  it("Vergleichbarkeit für den Effizienz-Trend", () => {
    expect(SWIMMING_COMPARABLE).toEqual({
      types: ["Longswim"],
      minDurationMin: 20,
      tempRange: [18, 32],
    });
  });
});

describe("swimming/classify — Schwellen", () => {
  it("Schwellen der Ist-Typerkennung", () => {
    expect({ ...SWIMMING_SESSION_CLASSIFY }).toEqual({
      ftpTestMaxMin: 20,
      ftpTestMinIF: 0.98,
      ifLowMax: 0.9,
      ifZ2DauerMax: 0.96,
      ifTempoMax: 0.99,
      ifSweetSpotMax: 1.01,
      ifSchwelleMax: 1.05,
      longRideMin: 45,
      dauerMin: 25,
      langOverrideMin: 75,
      shortRideConfidenceMin: 12,
      bandMinShare: { low: 0.45, mid: 0.35, high: 0.15 },
      blockMinDurationSec: 120,
      blockMinSharePct: 0.08,
    });
  });

  it("IF-Grenzen sind monoton aufsteigend", () => {
    const grenzen = [
      SWIMMING_SESSION_CLASSIFY.ifLowMax,
      SWIMMING_SESSION_CLASSIFY.ifZ2DauerMax,
      SWIMMING_SESSION_CLASSIFY.ifTempoMax,
      SWIMMING_SESSION_CLASSIFY.ifSweetSpotMax,
      SWIMMING_SESSION_CLASSIFY.ifSchwelleMax,
    ];
    expect([...grenzen].sort((a, b) => a - b)).toEqual(grenzen);
  });

  it("Rückfall-Last", () => {
    expect(SWIMMING_FALLBACK_LOAD).toBe(45);
  });
});

describe("swimming/index — das Profil bündelt dieselben Objekte", () => {
  it("Referenzgleichheit zu den Einzelmodulen", () => {
    expect(swimmingProfile.zones.upperPct).toBe(CSS_ZONE_UPPER_PCT);
    expect(swimmingProfile.sessionTypes.defaultLoad).toBe(SWIMMING_TYPE_DEFAULT_LOAD);
    expect(swimmingProfile.sessionTypes.phaseSignatures).toBe(SWIMMING_PHASE_SIGNATURES);
    expect(swimmingProfile.classify.fallbackLoad).toBe(SWIMMING_FALLBACK_LOAD);
  });

  it("id und label", () => {
    expect(swimmingProfile.id).toBe("swimming");
    expect(swimmingProfile.label).toBe("Schwimmen");
  });
});
