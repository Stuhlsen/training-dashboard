import { describe, expect, it } from "vitest";
import {
  fallbackIntervalRows,
  targetBandFromCompliance,
  targetProfileFromCard,
  zoneMixFromRide,
} from "./done-detail-chart-view-model";

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

describe("targetBandFromCompliance — Intervall-Zweig", () => {
  it("liefert min/max/Mittel der plannedWatts über alle matched-Intervalle", () => {
    const band = targetBandFromCompliance(
      compliance([
        interval({ plannedWatts: 200 }),
        interval({ plannedWatts: 260 }),
        interval({ plannedWatts: 230 }),
      ]),
    );
    expect(band).toEqual({ lowW: 200, highW: 260, meanW: 230 });
  });

  it("bei gleichem Ziel über alle Intervalle sind low und high identisch", () => {
    expect(targetBandFromCompliance(compliance([interval({ plannedWatts: 250 }), interval({ plannedWatts: 250 })]))).toEqual({
      lowW: 250,
      highW: 250,
      meanW: 250,
    });
  });

  it("überspringt 0/undefined plannedWatts, statt sie als Bandkante zu nehmen", () => {
    const band = targetBandFromCompliance(
      compliance([interval({ plannedWatts: 0 }), interval({ plannedWatts: 240 })]),
    );
    expect(band).toEqual({ lowW: 240, highW: 240, meanW: 240 });
  });

  it("liefert null ohne Compliance, ohne Intervalle oder ohne gültigen Zielwert", () => {
    expect(targetBandFromCompliance(null)).toBeNull();
    expect(targetBandFromCompliance(undefined)).toBeNull();
    expect(targetBandFromCompliance(compliance([]))).toBeNull();
    expect(targetBandFromCompliance(compliance([interval({ plannedWatts: 0 })]))).toBeNull();
  });
});

describe("targetProfileFromCard — volles geplantes Ziel-Profil", () => {
  const structure = {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: 600, target_pct_ftp: 55 },
      {
        kind: "set",
        reps: 2,
        work: { duration_s: 300, target_pct_ftp: 100 },
        recovery: { duration_s: 180, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: 300, target_pct_ftp: 45 },
    ],
  };

  it("rechnet jede Phase über die FTP in Watt und summiert die Gesamtdauer", () => {
    const profile = targetProfileFromCard({ workoutStructure: structure }, 200);
    expect(profile).not.toBeNull();
    expect(profile!.phases).toEqual([
      { durationS: 600, watts: 110 }, // 55% × 200
      { durationS: 300, watts: 200 }, // 100% × 200
      { durationS: 180, watts: 100 }, // 50% × 200
      { durationS: 300, watts: 200 },
      { durationS: 180, watts: 100 },
      { durationS: 300, watts: 90 }, // 45% × 200
    ]);
    expect(profile!.totalS).toBe(600 + 2 * (300 + 180) + 300);
  });

  it("liefert watts=null für eine Phase ohne relative Intensität (all-out Sprint)", () => {
    const profile = targetProfileFromCard(
      {
        workoutStructure: {
          version: 1,
          steps: [
            { kind: "warmup", duration_s: 300, target_pct_ftp: 50 },
            { kind: "accessory", reps: 1, work: { duration_s: 15, target: "max" }, recovery: { duration_s: 120, target_pct_ftp: 45 } },
          ],
        },
      },
      200,
    );
    expect(profile!.phases[1]).toEqual({ durationS: 15, watts: null });
    expect(profile!.totalS).toBe(435);
  });

  it("liefert null ohne gültige FTP (kein Watt-Bezug → Chart nutzt das flache Band)", () => {
    expect(targetProfileFromCard({ workoutStructure: structure }, null)).toBeNull();
    expect(targetProfileFromCard({ workoutStructure: structure }, 0)).toBeNull();
    expect(targetProfileFromCard({ workoutStructure: structure }, undefined)).toBeNull();
  });

  it("liefert null ohne workout_structure oder ohne Karte", () => {
    expect(targetProfileFromCard(null, 200)).toBeNull();
    expect(targetProfileFromCard({}, 200)).toBeNull();
    expect(targetProfileFromCard({ workoutStructure: { version: 1, steps: [] } }, 200)).toBeNull();
  });
});

describe("fallbackIntervalRows — Soll/Ist-Liste ohne Streams", () => {
  it("baut eine Zeile je matched-Intervall mit gerundeten Watt-Werten und fulfilled", () => {
    const rows = fallbackIntervalRows(
      compliance([interval({ plannedWatts: 250.4, avgWatts: 247.6, fulfilled: true }), interval({ fulfilled: false })]),
    );
    expect(rows).toHaveLength(2);
    expect(rows?.[0]).toMatchObject({ index: 0, plannedWatts: 250, actualWatts: 248, fulfilled: true });
    expect(rows?.[1].fulfilled).toBe(false);
  });

  it("liefert actualWatts=null ohne avgWatts", () => {
    const rows = fallbackIntervalRows(compliance([interval({ avgWatts: null })]))!;
    expect(rows[0].actualWatts).toBeNull();
  });

  it("liefert null ohne Compliance oder ohne Intervalle", () => {
    expect(fallbackIntervalRows(null)).toBeNull();
    expect(fallbackIntervalRows(compliance([]))).toBeNull();
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
