import { describe, expect, it } from "vitest";
import { buildStepChart, zoneMixFromRide } from "./done-detail-chart-view-model";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;
type ComplianceInterval = import("../../types.js").ComplianceInterval;

function interval(overrides: Partial<ComplianceInterval> = {}): ComplianceInterval {
  return {
    kind: "set",
    fulfilled: true,
    plannedDurationS: 300,
    actualDurationS: 300,
    plannedWatts: 250,
    avgWatts: 248,
    ...overrides,
  };
}

function compliance(matched: ComplianceInterval[]): RideCompliance {
  return {
    matchedCardId: "card-1",
    plannedZoneTime_s: 0,
    actualZoneTime_s: 0,
    intervalsPlanned: matched.length,
    intervalsCompleted: matched.filter((m) => m.fulfilled).length,
    fadePct: 0,
    rating: "green",
    rule: "alle-intervalle-erfuellt",
    matched,
  };
}

function ride(overrides: Partial<Ride> = {}): Ride {
  return { dateISO: "2026-08-06", ...overrides } as Ride;
}

describe("buildStepChart — Intervall-Zweig", () => {
  it("baut einen Balken je matched-Intervall, mit fulfilled durchgereicht", () => {
    const bars = buildStepChart(compliance([interval({ fulfilled: true }), interval({ fulfilled: false })]));
    expect(bars).toHaveLength(2);
    expect(bars?.[0].fulfilled).toBe(true);
    expect(bars?.[1].fulfilled).toBe(false);
  });

  it("skaliert die Höhe relativ zum höchsten Watt-Wert (Soll ODER Ist) unter allen Balken", () => {
    const bars = buildStepChart(
      compliance([
        interval({ plannedWatts: 200, avgWatts: 190 }),
        interval({ plannedWatts: 250, avgWatts: 260 }), // 260 ist der Max-Wert
      ]),
    )!;
    expect(bars[1].actualHeightPct).toBe(100); // 260/260
    expect(bars[0].plannedHeightPct).toBe(Math.round((200 / 260) * 100));
  });

  it("liefert actualHeightPct=null ohne avgWatts, statt eine erfundene Null zu zeigen", () => {
    const bars = buildStepChart(compliance([interval({ avgWatts: null })]))!;
    expect(bars[0].actualWatts).toBeNull();
    expect(bars[0].actualHeightPct).toBeNull();
    expect(bars[0].plannedHeightPct).toBe(100); // einziger Watt-Wert ist der Max
  });

  it("skaliert die Breite relativ zur Summe aller plannedDurationS", () => {
    const bars = buildStepChart(
      compliance([interval({ plannedDurationS: 300 }), interval({ plannedDurationS: 900 })]),
    )!;
    expect(bars[0].widthPct).toBe(25); // 300/1200
    expect(bars[1].widthPct).toBe(75); // 900/1200
  });

  it("liefert null ohne Compliance oder ohne Intervalle (kein Chart statt leerer Balkenreihe)", () => {
    expect(buildStepChart(null)).toBeNull();
    expect(buildStepChart(undefined)).toBeNull();
    expect(buildStepChart(compliance([]))).toBeNull();
  });
});

describe("zoneMixFromRide — Zonen-Mix-Zweig", () => {
  it("mappt das numerische zoneTimes-Format auf die 5 COGGAN_ZONE_META-Zonen", () => {
    const mix = zoneMixFromRide(ride({ zoneTimes: [600, 300, 600, 0, 0] }));
    expect(mix).toHaveLength(5);
    expect(mix?.map((z) => z.id)).toEqual(["z1", "z2", "z3", "z4", "z5"]);
    expect(mix?.[0].secs).toBe(600);
    expect(mix?.[0].pct).toBe(40); // 600/1500
  });

  it("mappt das Objektformat ({id,secs}) genauso wie das numerische", () => {
    const mix = zoneMixFromRide(
      ride({
        zoneTimes: [
          { id: "Z1", secs: 600 },
          { id: "Z2", secs: 600 },
        ],
      }),
    );
    expect(mix?.[0].secs).toBe(600);
    expect(mix?.[0].pct).toBe(50);
    expect(mix?.[1].secs).toBe(600);
  });

  it("fasst Index ≥4 (Z6/Z7) wie last7DayZoneTimes in Z5+ zusammen", () => {
    const mix = zoneMixFromRide(ride({ zoneTimes: [0, 0, 0, 0, 100, 50, 25] }));
    expect(mix?.[4].secs).toBe(175);
  });

  it("liefert null bei fehlenden zoneTimes (kein Zonen-Mix statt einer leeren Leiste)", () => {
    expect(zoneMixFromRide(ride({ zoneTimes: undefined }))).toBeNull();
    expect(zoneMixFromRide(ride({ zoneTimes: null }))).toBeNull();
  });

  it("liefert null bei einer Summe von 0 (nur Nullen in zoneTimes)", () => {
    expect(zoneMixFromRide(ride({ zoneTimes: [0, 0, 0, 0, 0] }))).toBeNull();
  });
});
