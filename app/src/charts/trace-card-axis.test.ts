/* Tests: TraceCard-Achsen-Ticks bei aufgeweitetem Fenster (MIN_SPAN_DAYS).
 * Die restliche Karte ist reines Rendering über core/trace-lanes.js
 * (dort getestet) — hier nur die Tick-Ableitung. */

import { describe, expect, it } from "vitest";
import { buildAxisTicks, effectiveR1, MIN_SPAN_DAYS } from "./trace-card-axis";

/** Kurz-Datum wie vm.formatDay, klemmt Indizes auf [0, N-1]. */
function makeFormatDay(n: number) {
  return (i: number) => `d${Math.max(0, Math.min(n - 1, i))}`;
}

describe("effectiveR1", () => {
  it("weitet auf, wenn die GESAMTE Historie kürzer als MIN_SPAN_DAYS ist", () => {
    // neuer Athlet: 5 Tage Skelett, Fenster deckt alles ab (0..4)
    expect(effectiveR1(0, 4, 5)).toBe(MIN_SPAN_DAYS);
  });

  it("lässt ein volles langes Fenster unverändert", () => {
    expect(effectiveR1(0, 199, 200)).toBe(199);
  });

  it("lässt einen Brush-Zoom in ein schmales Teilfenster unverändert", () => {
    // 200 Tage Historie, Nutzer zoomt auf die Tage 100..107
    expect(effectiveR1(100, 107, 200)).toBe(107);
    // schmales Fenster am linken Rand, aber NICHT bis ans Datenende
    expect(effectiveR1(0, 7, 200)).toBe(7);
  });
});

describe("buildAxisTicks", () => {
  it("keine doppelten Labels, wenn das Fenster über das Datenende hinausreicht", () => {
    // 5 echte Tage, Fenster künstlich auf MIN_SPAN_DAYS geweitet
    const ticks = buildAxisTicks(0, MIN_SPAN_DAYS, 2, makeFormatDay(5));
    const labels = ticks.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
    // letzter echter Tag ("d4") kommt genau einmal vor
    expect(labels.filter((l) => l === "d4")).toHaveLength(1);
  });

  it("normales Fenster: fünf Ticks, alle verschieden", () => {
    const ticks = buildAxisTicks(0, 40, 20, makeFormatDay(41));
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    const labels = ticks.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
