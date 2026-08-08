/* ============================================================
   Etappe 3 — Registry + der eigentliche Nachweis der Etappe:
   dass ein zweites Sportprofil danebenstehen KÖNNTE.

   Das Konzept sagt ausdrücklich "kein zweites Sport-Modul bauen".
   Die Behauptung "eins könnte daneben stehen" bliebe damit ungeprüft —
   deshalb steht das zweite Profil hier als Test-Fixture: es erfüllt den
   Vertrag vollständig, wird von der Registry aufgenommen, und wird
   NICHT ausgeliefert. Erfüllt der Vertrag eines Tages eine echte zweite
   Sportart nicht mehr, fällt es hier auf statt in der UI.
   ============================================================ */

import { describe, it, expect } from "vitest";

import type { SportProfile } from "./types.js";
import { SPORTS, DEFAULT_SPORT_ID, getSport, defaultSport } from "./index.js";
import { cyclingProfile } from "./cycling/index.js";

describe("Registry", () => {
  it("kennt genau ein Profil — Radsport", () => {
    expect(Object.keys(SPORTS)).toEqual(["cycling"]);
    expect(DEFAULT_SPORT_ID).toBe("cycling");
    expect(defaultSport()).toBe(cyclingProfile);
  });

  it("getSport löst auf, unbekannte ID gibt null statt zu werfen", () => {
    expect(getSport("cycling")).toBe(cyclingProfile);
    expect(getSport("running")).toBe(null);
    expect(getSport("")).toBe(null);
  });

  it("getSport greift nicht auf geerbte Object-Eigenschaften durch", () => {
    // Ohne Object.freeze/null-Prototyp-Sorgfalt würde "constructor" oder
    // "toString" hier ein Function-Objekt statt null liefern.
    expect(getSport("constructor")).toBe(null);
    expect(getSport("toString")).toBe(null);
  });
});

describe("Der Vertrag trägt eine zweite Sportart", () => {
  /** Nur ein Fixture, kein Produkt: minimal befülltes Laufsport-Profil,
   *  das zeigt, welche Felder eine zweite Sportart neu setzen müsste.
   *  Die Zahlen sind bewusst Platzhalter und nicht trainingswissenschaftlich
   *  hergeleitet — geprüft wird die Form, nicht der Inhalt. */
  const laufFixture: SportProfile = {
    id: "running-fixture",
    label: "Laufen (nur Test-Fixture)",
    zones: {
      upperPct: [0.6, 0.8, 0.9, 1.0, 1.1],
      meta: [
        { id: "l1", label: "L1", farbe: "var(--z1)" },
        { id: "l2", label: "L2", farbe: "var(--z2)" },
        { id: "l3", label: "L3", farbe: "var(--z3)" },
        { id: "l4", label: "L4", farbe: "var(--thr)" },
        { id: "l5", label: "L5", farbe: "var(--vo2)" },
      ],
      // Laufen kennt kein Sweet-Spot-Overlay — genau der Fall, für den
      // das Feld nullable ist.
      overlayBandPct: null,
      ifBands: { lowMax: 0.8, midMax: 1.0 },
      lowIntensityTarget: 0.8,
    },
    metrics: {
      thresholdMetric: "Schwellenpace",
      thresholdUnit: "min/km",
      loadMetric: "rTSS",
      intensityMetric: "IF",
      normalizedPowerMetric: "GAP",
      cadenceMetric: "Schrittfrequenz",
      cadenceUnit: "spm",
      cadenceTarget: 180,
      hrMax: null,
      hrZones: { z1: [0, 0.7], z2: [0.7, 0.85], z3: [0.85, 1.0] },
      scaleMax: null,
      whatIfScaleHeadroom: 0,
    },
    sessionTypes: {
      known: ["Dauerlauf", "Intervall"],
      defaultLoad: { Dauerlauf: 50, Intervall: 70 },
      defaultLoadApprox: new Set<string>(),
      intensityClass: { Dauerlauf: "locker", Intervall: "hart" },
      expectedBand: { Dauerlauf: "low", Intervall: "high" },
      phaseSignatures: {
        Intervall: { ifMin: 1.0, ifMax: 1.3, types: ["Intervall"] },
      },
      efficiencyComparable: {
        types: ["Dauerlauf"],
        minDurationMin: 40,
        tempRange: [5, 30],
      },
    },
    classify: {
      ftpTestMaxMin: 20,
      ftpTestMinIF: 0.98,
      ifLowMax: 0.8,
      ifZ2DauerMax: 0.88,
      ifTempoMax: 0.92,
      ifSweetSpotMax: 0.96,
      ifSchwelleMax: 1.02,
      longRideMin: 90,
      dauerMin: 40,
      langOverrideMin: 120,
      shortRideConfidenceMin: 15,
      bandMinShare: { low: 0.5, mid: 0.3, high: 0.15 },
      blockMinDurationSec: 180,
      blockMinSharePct: 0.1,
      fallbackLoad: 55,
    },
  };

  it("das Fixture erfüllt den Vertrag und passt in dieselbe Registry", () => {
    const erweitert: Record<string, SportProfile> = {
      ...SPORTS,
      [laufFixture.id]: laufFixture,
    };
    expect(Object.keys(erweitert).sort()).toEqual(["cycling", "running-fixture"]);
    expect(erweitert[laufFixture.id].metrics.thresholdMetric).toBe("Schwellenpace");
  });

  it("beide Profile tragen dieselben Vertragsfelder", () => {
    const felder = (p: SportProfile) => ({
      top: Object.keys(p).sort(),
      zones: Object.keys(p.zones).sort(),
      metrics: Object.keys(p.metrics).sort(),
      sessionTypes: Object.keys(p.sessionTypes).sort(),
      classify: Object.keys(p.classify).sort(),
    });
    expect(felder(laufFixture)).toEqual(felder(cyclingProfile));
  });

  it("die Zonen-Metadaten bleiben index-gleich zu den Grenzen", () => {
    for (const p of [cyclingProfile, laufFixture]) {
      expect(p.zones.meta.length, p.id).toBe(p.zones.upperPct.length);
    }
  });

  it("Radsport ist die Registry-Wahl, das Fixture wird nicht ausgeliefert", () => {
    expect(getSport(laufFixture.id)).toBe(null);
  });
});
