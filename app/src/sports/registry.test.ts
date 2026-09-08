/* ============================================================
   Registry — Auflösung + Vertragstreue über ALLE Profile.

   Bis Fahrplan 10 E5 stand hier ein Lauf-FIXTURE: die Etappe-3-Behauptung
   "ein zweites Sportprofil könnte danebenstehen" war sonst ungeprüft. E5
   macht daraus Produkt — running/ und swimming/ sind echte Profile. Das
   Fixture ist damit weg; die Feld- und Index-Gleichheits-Prüfungen laufen
   jetzt über cycling + running + swimming.

   `getSport()` erreicht alle drei; gerechnet wird trotzdem mit cycling
   (DEFAULT_SPORT_ID) — running/swimming haben in E5 noch keinen Konsumenten
   (E6: Default-Lasten · E7: Pace-Zonen).
   ============================================================ */

import { describe, it, expect } from "vitest";

import type { SportProfile } from "./types.js";
import { SPORTS, DEFAULT_SPORT_ID, getSport, defaultSport, sportProfileFor } from "./index.js";
import { cyclingProfile } from "./cycling/index.js";
import { runningProfile } from "./running/index.js";
import { swimmingProfile } from "./swimming/index.js";

const ALLE_PROFILE: readonly SportProfile[] = [cyclingProfile, runningProfile, swimmingProfile];

describe("Registry", () => {
  it("kennt drei Profile — Rad, Laufen, Schwimmen", () => {
    expect(Object.keys(SPORTS)).toEqual(["cycling", "running", "swimming"]);
    expect(DEFAULT_SPORT_ID).toBe("cycling");
    expect(defaultSport()).toBe(cyclingProfile);
  });

  it("getSport löst alle drei auf, unbekannte ID gibt null statt zu werfen", () => {
    expect(getSport("cycling")).toBe(cyclingProfile);
    expect(getSport("running")).toBe(runningProfile);
    expect(getSport("swimming")).toBe(swimmingProfile);
    expect(getSport("triathlon")).toBe(null);
    expect(getSport("")).toBe(null);
  });

  it("sportProfileFor löst den sport-Feldwert auf (Fahrplan 10 V2)", () => {
    // "ride" → bestehende Profil-ID "cycling" (NICHT umbenannt)
    expect(sportProfileFor("ride")).toBe(cyclingProfile);
    // run/swim seit E5 verdrahtet
    expect(sportProfileFor("run")).toBe(runningProfile);
    expect(sportProfileFor("swim")).toBe(swimmingProfile);
    // "other" hat bewusst kein Profil → null, kein Wurf
    expect(sportProfileFor("other")).toBe(null);
    expect(sportProfileFor("")).toBe(null);
    // greift nicht auf geerbte Object-Eigenschaften durch
    expect(sportProfileFor("constructor")).toBe(null);
  });

  it("getSport greift nicht auf geerbte Object-Eigenschaften durch", () => {
    // Ohne Object.freeze/Object.hasOwn-Sorgfalt würde "constructor" oder
    // "toString" hier ein Function-Objekt statt null liefern.
    expect(getSport("constructor")).toBe(null);
    expect(getSport("toString")).toBe(null);
  });
});

describe("Der Vertrag trägt alle drei Sportarten feldgleich", () => {
  const felder = (p: SportProfile) => ({
    top: Object.keys(p).sort(),
    zones: Object.keys(p.zones).sort(),
    metrics: Object.keys(p.metrics).sort(),
    sessionTypes: Object.keys(p.sessionTypes).sort(),
    classify: Object.keys(p.classify).sort(),
  });

  it("running und swimming tragen dieselben Vertragsfelder wie cycling", () => {
    expect(felder(runningProfile)).toEqual(felder(cyclingProfile));
    expect(felder(swimmingProfile)).toEqual(felder(cyclingProfile));
  });

  it("die Zonen-Metadaten bleiben in jedem Profil index-gleich zu den Grenzen", () => {
    for (const p of ALLE_PROFILE) {
      expect(p.zones.meta.length, p.id).toBe(p.zones.upperPct.length);
    }
  });

  it("jede Zonenkette ist lückenlos aufsteigend", () => {
    for (const p of ALLE_PROFILE) {
      const kette = [...p.zones.upperPct];
      expect([...kette].sort((a, b) => a - b), p.id).toEqual(kette);
      expect(new Set(kette).size, p.id).toBe(kette.length);
    }
  });

  it("jedes Profil trägt id und label", () => {
    expect(cyclingProfile.id).toBe("cycling");
    expect(runningProfile.id).toBe("running");
    expect(swimmingProfile.id).toBe("swimming");
    for (const p of ALLE_PROFILE) {
      expect(p.label.length, p.id).toBeGreaterThan(0);
    }
  });
});
