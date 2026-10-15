/* Tests: Zonen-Erklärer-Datenaufbereitung (zone-explainer-view-model.ts).
   Erwartungen kommen aus den echten Quellen (HR_ZONES, buildPowerScale),
   nicht aus verdrahteten Zahlen. */

import { describe, expect, it } from "vitest";
import { HR_ZONES } from "../../sports/cycling/metrics";
import { buildPowerScale } from "./hero-view-model";
import { buildCyclingHrZones, powerExplainerZones, resolveHrMax, zoneRangeText } from "./zone-explainer-view-model";

describe("zoneRangeText", () => {
  it("nennt bei der untersten Zone nur die Obergrenze", () => {
    expect(zoneRangeText(0, 150, "bpm")).toBe("bis 150 bpm");
    expect(zoneRangeText(150, 170, "W")).toBe("150–170 W");
  });
});

describe("powerExplainerZones", () => {
  it("übernimmt Wattgrenzen und Farben der Hero-Segmente unverändert", () => {
    const scale = buildPowerScale(250, 260, 260);
    const zones = powerExplainerZones(scale.segments);
    expect(zones.map((z) => z.id)).toEqual(scale.segments.map((s) => s.id));
    zones.forEach((z, i) => {
      expect(z.color).toBe(scale.segments[i].color);
      expect(z.range).toContain(String(scale.segments[i].toW));
    });
  });
});

describe("resolveHrMax", () => {
  it("bevorzugt den Profilwert vor config und Sync-Schätzung (nicht geschätzt)", () => {
    expect(resolveHrMax({ profileHrMax: 190, configHrMax: 200, payloadHrMax: 185, payloadEstimated: true })).toEqual({
      hrMax: 190,
      estimated: false,
    });
  });
  it("fällt auf config zurück, dann auf die Sync-Schätzung samt Flag", () => {
    expect(resolveHrMax({ profileHrMax: null, configHrMax: 200, payloadHrMax: 185 })).toEqual({ hrMax: 200, estimated: false });
    expect(resolveHrMax({ configHrMax: null, payloadHrMax: 185, payloadEstimated: true })).toEqual({ hrMax: 185, estimated: true });
  });
  it("liefert null, wenn nirgends ein gültiger Wert vorliegt", () => {
    expect(resolveHrMax({ profileHrMax: 0, configHrMax: null, payloadHrMax: null })).toEqual({ hrMax: null, estimated: false });
  });
});

describe("buildCyclingHrZones", () => {
  it("rechnet HR_ZONES × HFmax und liefert Bereichstexte", () => {
    const vm = buildCyclingHrZones(190);
    expect(vm.degraded).toBe(false);
    expect(vm.zones.map((z) => z.id)).toEqual(Object.keys(HR_ZONES));
    for (const z of vm.zones) {
      const [lo, hi] = HR_ZONES[z.id];
      expect(z.vonBpm).toBe(Math.round(190 * lo));
      expect(z.bisBpm).toBe(Math.round(190 * hi));
    }
    expect(vm.explainerZones.every((z) => z.range?.endsWith("bpm"))).toBe(true);
  });
  it("ist ohne HFmax degradiert: keine bpm-Zonen, keine Bereichstexte, Labels bleiben", () => {
    const vm = buildCyclingHrZones(null);
    expect(vm.degraded).toBe(true);
    expect(vm.zones).toEqual([]);
    expect(vm.explainerZones).toHaveLength(Object.keys(HR_ZONES).length);
    expect(vm.explainerZones.every((z) => z.range === null && z.label.length > 0)).toBe(true);
  });
});
