import { describe, it, expect } from "vitest";
import {
  calculateAngle,
  calculateTorsoAngle,
  computeJointAngles,
  compareToTargets,
  BIKEFIT_TARGET_RANGES,
} from "./bikefit.js";

describe("core/bikefit.js", () => {
  describe("calculateAngle", () => {
    it("returns null for missing or invalid points", () => {
      expect(calculateAngle(null, null, null)).toBeNull();
      expect(calculateAngle({ x: 0, y: 0 }, null, { x: 1, y: 1 })).toBeNull();
      expect(calculateAngle({ x: "a", y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    });

    it("calculates a 90 degree angle accurately", () => {
      // B at (0, 0), A at (0, 10), C at (10, 0) -> 90 degrees
      const angle = calculateAngle({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(angle).toBe(90);
    });

    it("calculates a 180 degree straight line", () => {
      const angle = calculateAngle({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
      expect(angle).toBe(180);
    });

    it("calculates typical knee extension angle (~145 degrees)", () => {
      // Hip (0, 100), Knee (20, 50), Ankle (0, 0)
      const angle = calculateAngle({ x: 0, y: 100 }, { x: 20, y: 50 }, { x: 0, y: 0 });
      expect(angle).toBeGreaterThan(130);
      expect(angle).toBeLessThan(160);
    });
  });

  describe("calculateTorsoAngle", () => {
    it("returns null for missing points", () => {
      expect(calculateTorsoAngle(null, null)).toBeNull();
    });

    it("calculates 45 degrees for equal dx and dy", () => {
      // Hip at (100, 100), Shoulder at (150, 50) -> dx = 50, dy = 50
      const angle = calculateTorsoAngle({ x: 100, y: 100 }, { x: 150, y: 50 });
      expect(angle).toBe(45);
    });

    it("calculates 0 degrees for completely flat back", () => {
      const angle = calculateTorsoAngle({ x: 100, y: 100 }, { x: 200, y: 100 });
      expect(angle).toBe(0);
    });

    it("calculates 90 degrees for upright posture", () => {
      const angle = calculateTorsoAngle({ x: 100, y: 100 }, { x: 100, y: 50 });
      expect(angle).toBe(90);
    });
  });

  describe("computeJointAngles", () => {
    it("handles empty / partial points defensively without throwing", () => {
      const result = computeJointAngles({});
      expect(result).toEqual({
        kneeAngle: null,
        hipAngle: null,
        torsoAngle: null,
        elbowAngle: null,
      });
    });

    it("computes all angles when full point set is supplied", () => {
      const points = {
        legs: {
          hip: { x: 100, y: 120 },
          knee: { x: 110, y: 170 },
          ankle: { x: 105, y: 220 },
        },
        riding: {
          shoulder: { x: 150, y: 70 },
          elbow: { x: 170, y: 90 },
          wrist: { x: 190, y: 80 },
          hip: { x: 100, y: 120 },
          knee: { x: 110, y: 170 },
        },
      };

      const result = computeJointAngles(points);
      expect(typeof result.kneeAngle).toBe("number");
      expect(typeof result.hipAngle).toBe("number");
      expect(typeof result.torsoAngle).toBe("number");
      expect(typeof result.elbowAngle).toBe("number");
    });
  });

  describe("compareToTargets", () => {
    it("identifies values in target as ok", () => {
      const angles = {
        kneeAngle: 145, // in [142, 150] for road balanced
        hipAngle: 60,   // in [55, 68]
        torsoAngle: 44, // in [40, 48]
        elbowAngle: 155 // in [150, 165]
      };

      const compared = compareToTargets(angles, "road", "balanced");
      expect(compared.kneeAngle.direction).toBe("ok");
      expect(compared.kneeAngle.strength).toBe("ok");
      expect(compared.hipAngle.direction).toBe("ok");
      expect(compared.torsoAngle.direction).toBe("ok");
      expect(compared.elbowAngle.direction).toBe("ok");
    });

    it("advises raising saddle when kneeAngle is too low (e.g. 135 deg)", () => {
      const angles = { kneeAngle: 135 };
      const compared = compareToTargets(angles, "road", "balanced");
      expect(compared.kneeAngle.direction).toBe("higher");
      expect(compared.kneeAngle.strength).toBe("strong"); // diff = 7 (142 - 135)
      expect(compared.kneeAngle.advice).toContain("Sattel deutlich höher");
    });

    it("advises lowering saddle when kneeAngle is overextended (e.g. 155 deg)", () => {
      const angles = { kneeAngle: 155 };
      const compared = compareToTargets(angles, "road", "balanced");
      expect(compared.kneeAngle.direction).toBe("lower");
      expect(compared.kneeAngle.strength).toBe("moderate"); // diff = 5 (155 - 150)
      expect(compared.kneeAngle.advice).toContain("Sattel moderat tiefer");
    });

    it("falls back gracefully when angles are null/missing", () => {
      const compared = compareToTargets({}, "gravel", "comfort");
      expect(compared.kneeAngle.direction).toBe("unknown");
      expect(compared.kneeAngle.value).toBeNull();
      expect(compared.kneeAngle.advice).toContain("nicht vollständig markiert");
    });
  });

  describe("BIKEFIT_TARGET_RANGES", () => {
    it("has valid target corridors for road, gravel, tt, mtb", () => {
      for (const bikeType of ["road", "gravel", "tt", "mtb"]) {
        expect(BIKEFIT_TARGET_RANGES[bikeType]).toBeDefined();
        for (const goal of ["comfort", "balanced", "aero"]) {
          const cfg = BIKEFIT_TARGET_RANGES[bikeType][goal];
          expect(cfg.kneeAngle.min).toBeLessThan(cfg.kneeAngle.max);
          expect(cfg.hipAngle.min).toBeLessThan(cfg.hipAngle.max);
          expect(cfg.torsoAngle.min).toBeLessThan(cfg.torsoAngle.max);
          expect(cfg.elbowAngle.min).toBeLessThan(cfg.elbowAngle.max);
        }
      }
    });
  });
});