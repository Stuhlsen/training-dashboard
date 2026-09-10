import { describe, it, expect } from "vitest";
import {
  formatPaceSec,
  parsePaceInput,
  paceSecOf,
  planTypesForSport,
  showSportPicker,
  workoutForSave,
} from "./plan-card-form-view-model";
import { KNOWN_PLAN_TYPES } from "../../core/plan-config.js";
import { RUNNING_KNOWN_TYPES } from "../../sports/running/session-types";
import type { PlanCard } from "../../api/types";

describe("parsePaceInput / formatPaceSec", () => {
  it("mm:ss → Sekunden pro km", () => {
    expect(parsePaceInput("4:30")).toBe(270);
    expect(parsePaceInput("5:00")).toBe(300);
    expect(parsePaceInput("10:05")).toBe(605);
    expect(parsePaceInput(" 4:30 ")).toBe(270);
  });

  it("Sekunden pro km → mm:ss (zweistellige Sekunden)", () => {
    expect(formatPaceSec(270)).toBe("4:30");
    expect(formatPaceSec(300)).toBe("5:00");
    expect(formatPaceSec(605)).toBe("10:05");
  });

  it("Round-Trip parse(format(x)) === x", () => {
    for (const sec of [180, 240, 270, 305, 420, 600]) {
      expect(parsePaceInput(formatPaceSec(sec))).toBe(sec);
    }
  });

  it("ungültige Eingaben ⇒ null", () => {
    expect(parsePaceInput("")).toBeNull();
    expect(parsePaceInput("   ")).toBeNull();
    expect(parsePaceInput("abc")).toBeNull();
    expect(parsePaceInput("4")).toBeNull(); // kein Doppelpunkt
    expect(parsePaceInput("4:5")).toBeNull(); // Sekunden nicht zweistellig
    expect(parsePaceInput("4:60")).toBeNull(); // Sekunden > 59
    expect(parsePaceInput("0:30")).toBeNull(); // Minuten müssen > 0 sein
    expect(parsePaceInput("0:00")).toBeNull();
    expect(parsePaceInput("-4:30")).toBeNull();
    expect(parsePaceInput("4:30:00")).toBeNull();
  });
});

describe("planTypesForSport", () => {
  it("Rad ⇒ KNOWN_PLAN_TYPES", () => {
    expect(planTypesForSport("ride")).toBe(KNOWN_PLAN_TYPES);
    expect(planTypesForSport("ride")).toContain("Sweet Spot");
  });

  it("Lauf ⇒ RUNNING_KNOWN_TYPES", () => {
    expect(planTypesForSport("run")).toBe(RUNNING_KNOWN_TYPES);
    expect(planTypesForSport("run")).toContain("Dauerlauf");
    expect(planTypesForSport("run")).not.toContain("Sweet Spot");
  });
});

describe("showSportPicker", () => {
  it("nur bei Athleten mit > 1 Sportart", () => {
    expect(showSportPicker("athlete3")).toBe(true); // sports: ride/run/swim
    expect(showSportPicker("athlete1")).toBe(false);
    expect(showSportPicker("athlete2")).toBe(false);
    expect(showSportPicker("athlete4")).toBe(false);
    expect(showSportPicker("unbekannt")).toBe(false);
  });
});

describe("workoutForSave", () => {
  const blocks = [{ type: "interval" as const, text: "6×800m @ 3:45" }];

  it("Rad: unverändert — Blöcke ⇒ { blocks }, sonst null", () => {
    expect(workoutForSave("ride", blocks, null)).toEqual({ blocks });
    expect(workoutForSave("ride", [], null)).toBeNull();
    // paceSec wird bei Rad nie geschrieben
    expect(workoutForSave("ride", blocks, 270)).toEqual({ blocks });
  });

  it("Lauf: { blocks?, paceSec? } — paceSec nur wenn gesetzt", () => {
    expect(workoutForSave("run", blocks, 270)).toEqual({ blocks, paceSec: 270 });
    expect(workoutForSave("run", blocks, null)).toEqual({ blocks });
    expect(workoutForSave("run", [], 270)).toEqual({ paceSec: 270 });
    expect(workoutForSave("run", [], null)).toBeNull();
  });

  it("Lauf: nie eine workout_structure", () => {
    const result = workoutForSave("run", blocks, 270);
    expect(result).not.toHaveProperty("workout_structure");
    expect(result).not.toHaveProperty("workoutStructure");
  });
});

describe("paceSecOf", () => {
  it("liest paceSec aus dem workout-JSON, sonst null", () => {
    expect(paceSecOf({ workout: { paceSec: 270 } } as unknown as PlanCard)).toBe(270);
    expect(paceSecOf({ workout: { blocks: [] } } as unknown as PlanCard)).toBeNull();
    expect(paceSecOf({ workout: null } as unknown as PlanCard)).toBeNull();
    expect(paceSecOf(null)).toBeNull();
    expect(paceSecOf(undefined)).toBeNull();
  });
});
