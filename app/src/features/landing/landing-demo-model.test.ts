import { describe, expect, it } from "vitest";
import type { DemoPlanCard, DemoRide } from "../../api/types";
import { countDemoWeeks, toPlanCard, toRide } from "./landing-demo-model";

const baseRide: DemoRide = {
  date: "2026-01-05",
  sport: "ride",
  durationMinutes: 60,
  distanceKm: 30,
  elevationGain: 200,
  avgWatts: 180,
  npWatts: 200,
  avgHr: 140,
  zoneTimesSec: [600, 1800, 600, 300, 300],
  eftpWatts: 210,
  feel: 4,
};

const basePlanCard: DemoPlanCard = {
  date: "2026-01-06",
  sport: "ride",
  label: "Sweet Spot",
  durationMinutes: 75,
  type: "workout",
};

describe("toRide", () => {
  it("setzt beim Rad tss aus NP und Dauer, trimp bleibt leer", () => {
    const ride = toRide(baseRide);
    // 1 h bei NP = Referenzleistung → genau 100 TSS
    expect(ride.tss).toBe(100);
    expect(ride.trimp).toBeNull();
    expect(ride.dateISO).toBe("2026-01-05");
    expect(ride.feel).toBe("4");
  });

  it("setzt beim Laufen trimp statt tss", () => {
    const ride = toRide({ ...baseRide, sport: "run", durationMinutes: 50, avgHr: 150 });
    expect(ride.tss).toBeNull();
    expect(ride.trimp).toBe(75);
  });
});

describe("toPlanCard", () => {
  it("übersetzt den Einheitstyp in den Dashboard-Typ", () => {
    expect(toPlanCard(basePlanCard).typ).toBe("Intervall");
    expect(toPlanCard({ ...basePlanCard, type: "endurance" }).typ).toBe("Ausdauer");
    expect(toPlanCard({ ...basePlanCard, type: "recovery" }).typ).toBe("Erholung");
    expect(toPlanCard({ ...basePlanCard, type: "rest", sport: "rest" }).typ).toBe("Ruhetag");
  });

  it("macht aus Sportart rest eine Rad-Karte und baut eine eindeutige ID", () => {
    const card = toPlanCard({ ...basePlanCard, sport: "rest", type: "rest", label: "Pause" });
    expect(card.sport).toBe("ride");
    expect(card.id).toBe("demo-2026-01-06-Pause");
  });
});

describe("countDemoWeeks", () => {
  it("zählt ISO-Wochen, Sonntag gehört noch zur alten Woche", () => {
    const rides = ["2026-01-05", "2026-01-11", "2026-01-12"].map((date) => ({ ...baseRide, date }));
    expect(countDemoWeeks(rides)).toBe(2);
  });

  it("gibt 0 bei leerer Liste", () => {
    expect(countDemoWeeks([])).toBe(0);
  });
});
