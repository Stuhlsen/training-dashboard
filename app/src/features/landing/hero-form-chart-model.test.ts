import { describe, expect, it } from "vitest";
import { buildHeroFormChart, FORM_H } from "./hero-form-chart-model";
import type { DemoFormTrend } from "./landing-demo-model";

/** 57 Tage Verlauf (2026-01-05 … 2026-03-02), heute an Index 40. */
function trend(overrides: Partial<DemoFormTrend> = {}): DemoFormTrend {
  const n = 57;
  const dates = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 5 + i));
    return d.toISOString().slice(0, 10);
  });
  return {
    dates,
    todayIdx: 40,
    ctlVals: dates.map((_, i) => 50 + i * 0.3),
    atlVals: dates.map((_, i) => 55 + (i % 7)),
    tsbVals: dates.map((_, i) => -10 + (i % 5)),
    ...overrides,
  };
}

describe("buildHeroFormChart", () => {
  it("zeichnet Fitness/Ermüdung durchgezogen bis heute und gestrichelt danach", () => {
    const { lines } = buildHeroFormChart(trend()).fitness;
    expect(lines.some((l) => l.role === "primary" && l.dash === "0")).toBe(true);
    expect(lines.some((l) => l.role === "primary" && l.dash !== "0")).toBe(true);
    expect(lines.some((l) => l.role === "secondary")).toBe(true);
  });

  it("färbt die Form-Linie je Zone ein", () => {
    // Pendelt zwischen Aufbau (-15) und Frische (+10) → beide Zonenfarben
    const tsbVals = trend().tsbVals.map((_, i) => (Math.floor(i / 6) % 2 === 0 ? -15 : 10));
    const roles = new Set(buildHeroFormChart(trend({ tsbVals })).form.lines.map((l) => l.role));
    expect(roles.has("build")).toBe(true);
    expect(roles.has("fresh")).toBe(true);
  });

  it("beschriftet die Form-Bänder innerhalb der Kurvenbreite", () => {
    const { labels, zones } = buildHeroFormChart(trend()).form;
    expect(zones.map((z) => z.band)).toEqual(["overload", "build", "fresh"]);
    // "Überlast" beschriftet buildTsbLane nur, wenn das Band hoch genug ist
    // (hier nicht, weil die Werte weit darüber liegen) — wie im Analyse-Tab.
    expect(labels.map((l) => l.role)).toEqual(["fresh", "build"]);
    for (const l of labels) {
      expect(l.xPct).toBeGreaterThan(90);
      expect(l.xPct).toBeLessThanOrEqual(100);
      expect(l.y).toBeLessThanOrEqual(FORM_H);
    }
  });

  it("liefert die Werte von heute für die Kopfzahlen", () => {
    const chart = buildHeroFormChart(trend());
    expect(chart.current.ctl).toBeCloseTo(62, 5);
    expect(chart.current.tsb).toBe(-10);
  });

  it("beschriftet 'Heute' und lässt kein Datum direkt daneben kollidieren", () => {
    const { axisLabels, todayPct } = buildHeroFormChart(trend());
    const today = axisLabels.find((l) => l.text === "Heute");
    expect(today?.pct).toBe(todayPct);
    const others = axisLabels.filter((l) => l.text !== "Heute");
    expect(others.length).toBeGreaterThan(1);
    // 60 px Mindestabstand bei angenommenen 480 px → 12,5 % der Breite
    for (const l of others) expect(Math.abs(l.pct - todayPct)).toBeGreaterThanOrEqual(12.5);
  });
});
