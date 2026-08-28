import { describe, it, expect } from "vitest";
import { ATHLETES, athleteConfig, isReadOnlyAthlete, PHASES, WEEK_ORDER } from "./config";

describe("ATHLETES", () => {
  it("führt athlete1, athlete2 und athlete4 (athlete3 ist reserviert)", () => {
    expect(ATHLETES.map((a) => a.id)).toEqual(["athlete1", "athlete2", "athlete4"]);
  });

  it("Athlet 4 ('bentastiic') ist wattlos angelegt — FTP-Felder null", () => {
    const a4 = athleteConfig("athlete4");
    expect(a4).not.toBeNull();
    expect(a4?.name).toBe("bentastiic");
    expect(a4?.endpoint).toBe("data/rides-4.json");
    expect(a4?.ftpMeasured).toBeNull();
    expect(a4?.eFTP).toBeNull();
    expect(a4?.ftpGoal).toBeNull();
    expect(a4?.seasonStartFtp).toBeNull();
  });
});

describe("isReadOnlyAthlete", () => {
  it("nur Athlet 2 ist read-only", () => {
    expect(isReadOnlyAthlete("athlete1")).toBe(false);
    expect(isReadOnlyAthlete("athlete2")).toBe(true);
    expect(isReadOnlyAthlete("athlete4")).toBe(false);
  });

  it("unbekannte ID → false (kein Wurf)", () => {
    expect(isReadOnlyAthlete("athlete99")).toBe(false);
  });
});

describe("PHASES / WEEK_ORDER — Athlet-4-Vorlage", () => {
  it("kennt die Einsteiger-Phasen und teilt sich 'Erholung'", () => {
    for (const key of ["Einstieg", "Grundlagen", "Steigerung", "Test", "Erholung"]) {
      expect(PHASES[key]?.color, key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("WEEK_ORDER deckt KW36–KW47 lückenlos ab", () => {
    for (let kw = 36; kw <= 47; kw++) {
      expect(WEEK_ORDER).toContain(`KW${kw}`);
    }
  });
});
