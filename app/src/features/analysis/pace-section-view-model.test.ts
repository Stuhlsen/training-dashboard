import { describe, expect, it } from "vitest";
import { buildPaceSection } from "./pace-section-view-model";

type Ride = import("../../types.js").Ride;

function ride(overrides: Partial<Ride>): Ride {
  return {
    dateISO: "2026-06-01",
    dateShort: "01.06",
    name: "Test",
    typ: "Dauerlauf",
    km: 10,
    min: 60,
    dataSource: "intervals",
    sport: "run",
    ...overrides,
  } as Ride;
}

describe("buildPaceSection", () => {
  it("Lauf mit zwei erschöpfenden Efforts → Pace-Zonen-Kette, nicht degradiert", () => {
    const rides = [
      ride({ km: 5, min: 20 }), // 15 km/h, Bucket 5
      ride({ km: 15, min: 75 }), // 12 km/h, Bucket 15 (langsamer pro km → D' > 0)
      // Radfahrt: muss vom Sport-Gate (Guardrail 4) ausgeschlossen werden
      ride({ km: 40, min: 80, sport: "ride", typ: "Z2 Dauer" }),
    ];
    const vm = buildPaceSection({ rides, sport: "run" });

    expect(vm.sport).toBe("run");
    expect(vm.nActivities).toBe(2); // die Radfahrt zählt nicht
    expect(vm.emptySport).toBe(false);
    expect(vm.thresholdSpeed).not.toBeNull();
    expect(vm.thresholdSpeed as number).toBeGreaterThan(0);
    expect(vm.degraded).toBe(false);
    expect(vm.zones).toHaveLength(5);
    expect(vm.scaleMaxSpeed).toBeGreaterThan(0);
    expect(vm.thresholdPaceSec as number).toBeGreaterThan(0);
    expect(vm.curve).toHaveLength(2);
    expect(vm.thresholdUnit).toBe("min/km");
  });

  it("Lauf ohne erschöpfenden Effort (längerer Lauf schneller) → degradiert, Kurve bleibt", () => {
    const rides = [
      ride({ km: 5, min: 30 }), // 10 km/h
      ride({ km: 15, min: 60 }), // 15 km/h — längerer Effort schneller ⇒ D' ≤ 0
    ];
    const vm = buildPaceSection({ rides, sport: "run" });

    expect(vm.thresholdSpeed).toBeNull();
    expect(vm.degraded).toBe(true);
    expect(vm.zones).toHaveLength(0);
    expect(vm.scaleMaxSpeed).toBe(0);
    expect(vm.degradedReason).toBeTypeOf("string");
    expect(vm.emptySport).toBe(false);
    expect(vm.curve.length).toBeGreaterThanOrEqual(1);
  });

  it("Schwimmen ohne Aktivitäten → Leerzustand + degradiert", () => {
    const rides = [ride({ km: 10, min: 55, sport: "run" })];
    const vm = buildPaceSection({ rides, sport: "swim" });

    expect(vm.sport).toBe("swim");
    expect(vm.nActivities).toBe(0);
    expect(vm.emptySport).toBe(true);
    expect(vm.degraded).toBe(true);
    expect(vm.zones).toHaveLength(0);
    expect(vm.curve).toHaveLength(0);
    expect(vm.thresholdUnit).toBe("min/100 m");
  });

  it("Sport-Gate: reine Radliste unter sport=run → nichts durchgelassen", () => {
    const rides = [
      ride({ km: 40, min: 80, sport: "ride", typ: "Z2 Dauer" }),
      ride({ km: 60, min: 120, sport: "ride", typ: "Z2 Lang" }),
    ];
    const vm = buildPaceSection({ rides, sport: "run" });

    expect(vm.nActivities).toBe(0);
    expect(vm.emptySport).toBe(true);
    expect(vm.degraded).toBe(true);
  });

  describe("HF-bpm-Zonen (Fahrplan 12 E7)", () => {
    it("Lauf mit hrMax → fünf bpm-Zonen, aufsteigend, geschätzt-Flag durchgereicht", () => {
      const rides = [ride({ km: 5, min: 20 })];
      const vm = buildPaceSection({ rides, sport: "run", hrMax: 180, hrEstimated: true });

      expect(vm.hrDegraded).toBe(false);
      expect(vm.hrZones).toHaveLength(5);
      expect(vm.hrEstimated).toBe(true);
      // aufsteigend und lückenlos verkettet (Zone n.bis === Zone n+1.von)
      for (let i = 1; i < vm.hrZones.length; i++) {
        expect(vm.hrZones[i].vonBpm).toBe(vm.hrZones[i - 1].bisBpm);
        expect(vm.hrZones[i].bisBpm).toBeGreaterThan(vm.hrZones[i].vonBpm);
      }
      expect(vm.hrZones[vm.hrZones.length - 1].bisBpm).toBe(180);
    });

    it("Lauf ohne hrMax → degradiert, leere hrZones", () => {
      const rides = [ride({ km: 5, min: 20 })];
      const vm = buildPaceSection({ rides, sport: "run" });

      expect(vm.hrDegraded).toBe(true);
      expect(vm.hrZones).toHaveLength(0);
      expect(vm.hrEstimated).toBe(false);
    });

    it("Schwimmen mit hrMax → trotzdem keine HF-Zonen (nur Lauf, G19)", () => {
      const rides = [ride({ km: 5, min: 20, sport: "swim" })];
      const vm = buildPaceSection({ rides, sport: "swim", hrMax: 180, hrEstimated: true });

      expect(vm.hrDegraded).toBe(true);
      expect(vm.hrZones).toHaveLength(0);
    });

    it("Regressionsschutz: Athlet-1/2/4-Fixtures (kein hrMax im Payload) bleiben degradiert", () => {
      // Simuliert den Aufruf, wie ihn PaceSection.tsx für Single-Sport-Athleten
      // macht — hrMax/hrEstimated fehlen im Payload, Default null/false greift.
      const rides = [ride({ km: 5, min: 20 })];
      const vm = buildPaceSection({ rides, sport: "run" });

      expect(vm.hrZones).toHaveLength(0);
      expect(vm.hrDegraded).toBe(true);
      expect(vm.hrEstimated).toBe(false);
    });
  });
});
