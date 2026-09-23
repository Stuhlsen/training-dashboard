import { describe, expect, it } from "vitest";
import type { DemoPlanCard, DemoRide } from "../../api/types";
import { buildDemoFormTrend, countDemoWeeks, toPlanCard, toRide, withDemoPmc } from "./landing-demo-model";

type Ride = import("../../types.js").Ride;

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

/** Tägliche Rad-Fahrten mit fester TSS ab einem Startdatum. */
function steadyRides(startISO: string, days: number, tss: number): Ride[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(`${startISO}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { dateISO: d.toISOString().slice(0, 10), sport: "ride", tss };
  });
}

describe("withDemoPmc", () => {
  it("startet beim Tagesschnitt statt bei null — konstante Last bleibt konstant", () => {
    const rides = withDemoPmc(steadyRides("2026-01-05", 28, 60));
    expect(rides[0].ctl).toBe(60);
    expect(rides[27].ctl).toBe(60);
    expect(rides[27].atl).toBe(60);
  });

  it("Müdigkeit reagiert schneller als Fitness auf einen Lastsprung", () => {
    const rides = [...steadyRides("2026-01-05", 14, 50), ...steadyRides("2026-01-19", 7, 120)];
    const last = withDemoPmc(rides).at(-1)!;
    expect(last.atl!).toBeGreaterThan(last.ctl!);
    expect(last.ctl!).toBeGreaterThan(50);
  });

  it("zählt Ruhetage als Last null und verändert die Eingabe nicht", () => {
    const input: Ride[] = [
      ...steadyRides("2026-01-05", 14, 50),
      { dateISO: "2026-01-25", sport: "ride", tss: 50 },
    ];
    const out = withDemoPmc(input);
    expect(out.at(-1)!.ctl!).toBeLessThan(50);
    expect(input[0].ctl).toBeUndefined();
  });

  it("gibt bei leerer Liste eine leere Liste zurück", () => {
    expect(withDemoPmc([])).toEqual([]);
  });
});

describe("buildDemoFormTrend", () => {
  const rides = withDemoPmc(steadyRides("2026-01-05", 28, 60));
  const today = "2026-02-01";

  it("reicht vom ersten Demo-Tag bis heute + Prognosetage, heute an der richtigen Stelle", () => {
    const trend = buildDemoFormTrend(rides, [], today, 28)!;
    expect(trend.dates[0]).toBe("2026-01-05");
    expect(trend.dates.at(-1)).toBe("2026-03-01");
    expect(trend.dates[trend.todayIdx]).toBe(today);
    expect(trend.ctlVals).toHaveLength(trend.dates.length);
  });

  it("ohne Plan bleibt die Zeit nach heute leer, mit Plan gibt es eine Prognose", () => {
    const planned = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i + 1);
      return { date: d.toISOString().slice(0, 10), tssPlanned: 60, typ: "Ausdauer" };
    });
    const withPlan = buildDemoFormTrend(rides, planned, today, 28)!;
    const withoutPlan = buildDemoFormTrend(rides, [], today, 28)!;
    const idx = withPlan.dates.length - 1;
    expect(withoutPlan.ctlVals[idx]).toBeNull();
    // Gleiche Last wie bisher geplant → Fitness bleibt ungefähr beim Niveau
    // der Demo-Last (60). Heute selbst kommt aus der Projektion (Tag ohne
    // Karte, leichter Zerfall) — deshalb Toleranz statt exaktem Wert.
    expect(Math.abs(withPlan.ctlVals[idx]! - 60)).toBeLessThan(2);
  });

  it("gibt null ohne Fahrten mit Fitnesswerten", () => {
    expect(buildDemoFormTrend([], [], today, 28)).toBeNull();
  });
});
