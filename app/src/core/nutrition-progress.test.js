import { describe, expect, it } from "vitest";
import { dayProgress } from "./nutrition-progress.js";

describe("dayProgress", () => {
  it("Anteil geplant / Ziel", () => {
    expect(dayProgress(1770, 2855)).toEqual({ ratio: 1770 / 2855, percent: 62, over: false });
  });

  it("genau am Ziel: voller Balken, nicht 'über'", () => {
    expect(dayProgress(2300, 2300)).toEqual({ ratio: 1, percent: 100, over: false });
  });

  it("über dem Ziel: Balken bleibt bei 1, Prozent läuft weiter, over = true", () => {
    expect(dayProgress(2645, 2300)).toEqual({ ratio: 1, percent: 115, over: true });
  });

  it("leerer Tag: 0", () => {
    expect(dayProgress(0, 2300)).toEqual({ ratio: 0, percent: 0, over: false });
  });

  it("kein gültiges Ziel: 0 statt NaN/Infinity", () => {
    for (const target of [0, -5, NaN, Infinity, null, undefined]) {
      expect(dayProgress(1000, target)).toEqual({ ratio: 0, percent: 0, over: false });
    }
  });

  it("ungültige Summe: 0", () => {
    for (const planned of [NaN, -10, null, undefined]) {
      expect(dayProgress(planned, 2300)).toEqual({ ratio: 0, percent: 0, over: false });
    }
  });
});
