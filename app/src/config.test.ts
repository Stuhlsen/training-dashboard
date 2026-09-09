import { describe, it, expect } from "vitest";
import { ATHLETES, athleteConfig, PHASES, WEEK_ORDER } from "./config";

describe("ATHLETES", () => {
  it("führt athlete1, athlete2, athlete3, athlete4 in numerischer Reihenfolge", () => {
    expect(ATHLETES.map((a) => a.id)).toEqual(["athlete1", "athlete2", "athlete3", "athlete4"]);
  });

  it("Athlet 3 ('Hendrik') ist der Multi-Sport-Athlet — Rad/Lauf/Schwimm, wattlos", () => {
    const a3 = athleteConfig("athlete3");
    expect(a3).not.toBeNull();
    expect(a3?.name).toBe("Hendrik");
    expect(a3?.endpoint).toBe("data/rides-3.json");
    expect(a3?.sports).toEqual(["ride", "run", "swim"]);
    expect(a3?.ftpMeasured).toBeNull();
    expect(a3?.eFTP).toBeNull();
    expect(a3?.ftpGoal).toBeNull();
    expect(a3?.seasonStartFtp).toBeNull();
    expect(a3?.hrMax).toBeNull();
    expect(a3?.hrRest).toBeNull();
  });

  it("nur Athlet 3 trägt eine sports-Liste mit > 1 Eintrag (Sport-Umschalter-Gate)", () => {
    for (const a of ATHLETES) {
      const multi = (a.sports?.length ?? 1) > 1;
      expect(multi, a.id).toBe(a.id === "athlete3");
    }
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
