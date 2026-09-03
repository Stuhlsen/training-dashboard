/* ============================================================
   Etappe 3 — Werte-Gleichheit nach dem Umzug.

   Die 742 bestehenden Tests beweisen bereits, dass die Rechenlogik
   unverändert arbeitet. Was sie NICHT abdecken: Werte, die kein Test
   je einzeln anfasst (die selteneren TYPE_DEFAULT_TSS-Einträge etwa).
   Ein Zahlendreher beim Kopieren fiele dort nicht auf — deshalb sind
   die Literale hier ein zweites Mal ausgeschrieben, unabhängig von der
   Quelldatei, so wie sie vor dem Umzug im Code standen.

   Zweiter Zweck: sicherstellen, dass die core-Re-Exports auf DIESELBEN
   Objekte zeigen. Eine versehentlich zweite Definition in core/ würde
   sonst still danebenherlaufen.
   ============================================================ */

import { describe, it, expect } from "vitest";

import {
  COGGAN_ZONE_UPPER_PCT,
  SWEET_SPOT_PCT,
  IF_BANDS,
  LOW_INTENSITY_TARGET,
  COGGAN_ZONE_META,
} from "./zones.js";
import { CADENCE_TARGET_RPM, HR_ZONES, WHATIF_SCALE_HEADROOM_W } from "./metrics.js";
import {
  TYPE_DEFAULT_TSS,
  TYPE_DEFAULT_TSS_APPROX_TYPES,
  KNOWN_PLAN_TYPES,
  INTENSITY_CLASS,
  TYPE_EXPECTED_BAND,
  PHASE_SIGNATURES,
  COMPARABLE,
} from "./session-types.js";
import { SESSION_CLASSIFY, FALLBACK_TSS } from "./classify.js";
import { cyclingProfile } from "./index.js";

import * as coreZones from "../../core/zones.js";
import * as corePlanConfig from "../../core/plan-config.js";
import * as corePeriodization from "../../core/periodization.js";
import * as coreEfficiency from "../../core/efficiency.js";

describe("cycling/zones — Werte unverändert", () => {
  it("Coggan-Prozentgrenzen", () => {
    expect(COGGAN_ZONE_UPPER_PCT).toEqual([0.55, 0.75, 0.9, 1.05, 1.2]);
  });

  it("Sweet-Spot-Band und IF-Bänder", () => {
    expect(SWEET_SPOT_PCT).toEqual([0.88, 0.94]);
    expect(IF_BANDS).toEqual({ lowMax: 0.75, midMax: 1.05 });
    expect(LOW_INTENSITY_TARGET).toBe(0.8);
  });

  it("Zonen-Metadaten sind index-gleich zu den Prozentgrenzen", () => {
    expect(COGGAN_ZONE_META.length).toBe(COGGAN_ZONE_UPPER_PCT.length);
    expect(COGGAN_ZONE_META.map((z) => z.id)).toEqual(["z1", "z2", "z3", "z4", "z5"]);
    expect(COGGAN_ZONE_META.map((z) => z.farbe)).toEqual(["var(--z1)", "var(--z2)", "var(--z3)", "var(--thr)", "var(--vo2)"]);
  });
});

describe("cycling/metrics", () => {
  it("Kadenzziel und What-if-Puffer", () => {
    expect(CADENCE_TARGET_RPM).toBe(90);
    expect(WHATIF_SCALE_HEADROOM_W).toBe(80);
  });

  it("HF-Zonen als Anteile von hrMax", () => {
    expect(HR_ZONES).toEqual({
      z1: [0, 0.68],
      z2: [0.68, 0.83],
      z3: [0.83, 0.88],
      z4: [0.88, 0.95],
      z5: [0.95, 1.0],
    });
  });

  it("hrMax und scaleMax kommen bewusst nicht von der Sportart", () => {
    expect(cyclingProfile.metrics.hrMax).toBe(null);
    expect(cyclingProfile.metrics.scaleMax).toBe(null);
  });
});

describe("cycling/session-types — Typvokabular vollständig", () => {
  it("TYPE_DEFAULT_TSS, alle 23 Einträge", () => {
    expect(TYPE_DEFAULT_TSS).toEqual({
      Ausrollen: 5,
      Einrollen: 5,
      Ausserplanmaessig: 55,
      Außerplanmäßig: 42,
      Etappe: 155,
      Freestyle: 76,
      "FTP-Test": 45,
      Gruppenfahrt: 186,
      NLS: 44,
      Notiz: 0,
      Race: 221,
      Rennen: 75,
      Ruhetag: 0,
      Schwelle: 57,
      "Sweet Spot": 72,
      Tempo: 46,
      VO2max: 50,
      "Z1 Recovery": 37,
      Z2: 33,
      "Z2 Dauer": 57,
      "Z2 Erholung": 58,
      "Z2 Kadenz": 63,
      "Z2 Lang": 146,
    });
  });

  it("Näherungstypen — genau die sechs ohne leistungsbasierten Beleg", () => {
    expect([...TYPE_DEFAULT_TSS_APPROX_TYPES].sort()).toEqual(["Ausserplanmaessig", "Etappe", "Freestyle", "Race", "Z2 Erholung", "Z2 Kadenz"]);
    // Jeder Näherungstyp muss auch einen Default haben, sonst zeigt die
    // Markierung "tss-approx" auf einen Wert, den es gar nicht gibt.
    for (const t of TYPE_DEFAULT_TSS_APPROX_TYPES) {
      expect(t in TYPE_DEFAULT_TSS, `${t} fehlt in TYPE_DEFAULT_TSS`).toBeTruthy();
    }
  });

  it("Dialog-Typenliste", () => {
    expect(KNOWN_PLAN_TYPES).toEqual([
      "Sweet Spot",
      "Schwelle",
      "VO2max",
      "Z2 Lang",
      "Z2 Dauer",
      "Z1 Recovery",
      "Gruppenfahrt",
      "FTP-Test",
      "Ruhetag",
    ]);
    // Jeder wählbare Typ braucht einen Default-Wert und eine
    // Intensitätsklasse — sonst fällt er in die stillen Fallbacks.
    for (const t of KNOWN_PLAN_TYPES) {
      expect(t in TYPE_DEFAULT_TSS, `${t} fehlt in TYPE_DEFAULT_TSS`).toBeTruthy();
      expect(t in INTENSITY_CLASS, `${t} fehlt in INTENSITY_CLASS`).toBeTruthy();
    }
  });

  it("Intensitätsklassen, inkl. Ruhetag als eigene Kategorie", () => {
    expect(INTENSITY_CLASS["Sweet Spot"]).toBe("hart");
    expect(INTENSITY_CLASS["Schwelle"]).toBe("hart");
    expect(INTENSITY_CLASS["VO2max"]).toBe("hart");
    expect(INTENSITY_CLASS["FTP-Test"]).toBe("hart");
    expect(INTENSITY_CLASS["Rennen"]).toBe("hart");
    expect(INTENSITY_CLASS["Etappe"]).toBe("hart");
    expect(INTENSITY_CLASS["Tempo"]).toBe("moderat");
    expect(INTENSITY_CLASS["Gruppenfahrt"]).toBe("moderat");
    expect(INTENSITY_CLASS["Z1 Recovery"]).toBe("locker");
    expect(INTENSITY_CLASS["NLS"]).toBe("locker");
    // D6.2: Ruhetag ist weder hart noch locker.
    expect(INTENSITY_CLASS["Ruhetag"]).toBe("ruhe");
    // Athlet 2 (GFNY Bremen 2026) nutzt zusätzlich die Kurzform "Z1" und
    // "Race" (Renntag, eigenes Wort neben "Rennen" für Rennsimulationen) —
    // ohne diese zwei Einträge fällt intensityClass() für sie auf den
    // Default "moderat" zurück (falsches Signal für den Soll/Ist-
    // Typvergleich im Planungstab, s. DoneCompareBlock.tsx).
    expect(INTENSITY_CLASS["Z1"]).toBe("locker");
    expect(INTENSITY_CLASS["Race"]).toBe("hart");
    // Fahrplan 6 (RUH3): reine Notiz-Karte (Athlet 2 "Ausrüstung checken")
    // zählt wie ein Ruhetag — kein harter Tag, keine Planungslücke.
    expect(INTENSITY_CLASS["Notiz"]).toBe("ruhe");
    // "Einrollen" (Spiegel zu "Ausrollen", map-activity.js::classifyCooldowns)
    expect(INTENSITY_CLASS["Einrollen"]).toBe("locker");
    expect(Object.keys(INTENSITY_CLASS).length).toBe(24);
  });

  it("erwartete Zonen-Bänder", () => {
    expect(TYPE_EXPECTED_BAND).toEqual({
      "Z1 Recovery": "low",
      "Z2 Dauer": "low",
      "Z2 Lang": "low",
      Ausrollen: "low",
      Einrollen: "low",
      Tempo: "mid",
      "Sweet Spot": "mid",
      Schwelle: "mid",
      VO2max: "high",
      "FTP-Test": "high",
    });
  });

  it("Reizsignaturen der Blöcke", () => {
    expect(PHASE_SIGNATURES).toEqual({
      "Sweet Spot": { ifMin: 0.8, ifMax: 0.97, types: ["Sweet Spot"] },
      Schwelle: { ifMin: 0.9, ifMax: 1.05, types: ["Schwelle"] },
      VO2max: { ifMin: 1.0, ifMax: 1.4, types: ["VO2max"] },
    });
  });

  it("Vergleichbarkeit für den Effizienz-Trend", () => {
    expect(COMPARABLE).toEqual({
      types: ["Z2 Lang", "Z2 Dauer"],
      minDurationMin: 60,
      tempRange: [5, 30],
    });
  });
});

describe("cycling/classify", () => {
  it("Schwellen der Ist-Typerkennung", () => {
    expect({ ...SESSION_CLASSIFY }).toEqual({
      ftpTestMaxMin: 30,
      ftpTestMinIF: 0.95,
      ifLowMax: 0.75,
      ifZ2DauerMax: 0.85,
      ifTempoMax: 0.9,
      ifSweetSpotMax: 0.95,
      ifSchwelleMax: 1.05,
      longRideMin: 120,
      dauerMin: 60,
      langOverrideMin: 180,
      shortRideConfidenceMin: 20,
      bandMinShare: { low: 0.45, mid: 0.35, high: 0.15 },
      blockMinDurationSec: 300,
      blockMinSharePct: 0.08,
    });
  });

  it("IF-Grenzen sind monoton aufsteigend", () => {
    const grenzen = [
      SESSION_CLASSIFY.ifLowMax,
      SESSION_CLASSIFY.ifZ2DauerMax,
      SESSION_CLASSIFY.ifTempoMax,
      SESSION_CLASSIFY.ifSweetSpotMax,
      SESSION_CLASSIFY.ifSchwelleMax,
    ];
    expect([...grenzen].sort((a, b) => a - b)).toEqual(grenzen);
  });

  it("Rückfall-TSS", () => {
    expect(FALLBACK_TSS).toBe(70);
  });
});

describe("core re-exportiert genau diese Objekte", () => {
  it("zones.js", () => {
    expect(coreZones.COGGAN_ZONE_UPPER_PCT).toBe(COGGAN_ZONE_UPPER_PCT);
    expect(coreZones.SWEET_SPOT_PCT).toBe(SWEET_SPOT_PCT);
    expect(coreZones.IF_BANDS).toBe(IF_BANDS);
    expect(coreZones.LOW_INTENSITY_TARGET).toBe(LOW_INTENSITY_TARGET);
    expect(coreZones.WHATIF_SCALE_HEADROOM_W).toBe(WHATIF_SCALE_HEADROOM_W);
  });

  it("plan-config.js", () => {
    expect(corePlanConfig.TYPE_DEFAULT_TSS).toBe(TYPE_DEFAULT_TSS);
    expect(corePlanConfig.TYPE_DEFAULT_TSS_APPROX_TYPES).toBe(TYPE_DEFAULT_TSS_APPROX_TYPES);
    expect(corePlanConfig.KNOWN_PLAN_TYPES).toBe(KNOWN_PLAN_TYPES);
    expect(corePlanConfig.INTENSITY_CLASS).toBe(INTENSITY_CLASS);
    expect(corePlanConfig.TYPE_EXPECTED_BAND).toBe(TYPE_EXPECTED_BAND);
    expect(corePlanConfig.SESSION_CLASSIFY).toBe(SESSION_CLASSIFY);
    expect(corePlanConfig.FALLBACK_TSS).toBe(FALLBACK_TSS);
  });

  it("periodization.js / efficiency.js", () => {
    expect(corePeriodization.PHASE_SIGNATURES).toBe(PHASE_SIGNATURES);
    expect(coreEfficiency.COMPARABLE).toBe(COMPARABLE);
  });

  it("das Profil bündelt dieselben Objekte", () => {
    expect(cyclingProfile.zones.upperPct).toBe(COGGAN_ZONE_UPPER_PCT);
    expect(cyclingProfile.sessionTypes.defaultLoad).toBe(TYPE_DEFAULT_TSS);
    expect(cyclingProfile.sessionTypes.phaseSignatures).toBe(PHASE_SIGNATURES);
    expect(cyclingProfile.classify.fallbackLoad).toBe(FALLBACK_TSS);
  });
});
