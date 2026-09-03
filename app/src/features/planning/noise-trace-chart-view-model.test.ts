import { describe, expect, it } from "vitest";
import { BUCKET_COUNT, buildNoiseTrace } from "./noise-trace-chart-view-model";

type ActivityStreams = import("../../api/intervals/streams").ActivityStreams;

function streams(overrides: Partial<ActivityStreams> = {}): ActivityStreams {
  return { time: [], watts: [], heartrate: [], ...overrides };
}

describe("buildNoiseTrace", () => {
  it("liefert null ohne Streams", () => {
    expect(buildNoiseTrace(null)).toBeNull();
    expect(buildNoiseTrace(undefined)).toBeNull();
  });

  it("liefert null ohne Zeit-Achse", () => {
    expect(buildNoiseTrace(streams({ watts: [100, 200] }))).toBeNull();
  });

  it("baut je einen Punkt pro Sample, wenn weniger Samples als Buckets vorliegen", () => {
    const trace = buildNoiseTrace(
      streams({ time: [0, 1, 2], watts: [100, 200, 150], heartrate: [120, 130, 125] }),
    );
    expect(trace).not.toBeNull();
    expect(trace!.watts).toHaveLength(3);
    expect(trace!.heartrate).toHaveLength(3);
    // Min-Punkt liegt bei 0%, Max-Punkt bei 100% (eigene Spanne normiert).
    expect(trace!.watts[0].yPct).toBe(0);
    expect(trace!.watts[1].yPct).toBe(100);
  });

  it("mittelt auf höchstens BUCKET_COUNT Punkte bei sehr vielen Samples", () => {
    const n = BUCKET_COUNT * 10;
    const time = Array.from({ length: n }, (_, i) => i);
    const watts = Array.from({ length: n }, (_, i) => 100 + (i % 50));
    const trace = buildNoiseTrace(streams({ time, watts, heartrate: [] }));
    expect(trace!.watts.length).toBeLessThanOrEqual(BUCKET_COUNT);
    expect(trace!.watts.length).toBeGreaterThan(0);
  });

  it("überspringt durchgängige null-Lücken statt sie als 0 zu werten", () => {
    const time = [0, 1, 2, 3, 4];
    const watts = [100, null, null, null, 200];
    const trace = buildNoiseTrace(streams({ time, watts, heartrate: [] }));
    // Nur die beiden echten Werte ergeben Punkte, keine erfundene Null-Linie dazwischen.
    expect(trace!.watts).toHaveLength(2);
  });

  it("liefert leere Punktliste für einen komplett fehlenden Stream (z.B. kein Power Meter)", () => {
    const trace = buildNoiseTrace(streams({ time: [0, 1, 2], watts: [], heartrate: [120, 125, 130] }));
    expect(trace!.watts).toHaveLength(0);
    expect(trace!.avgWatts).toBeNull();
    expect(trace!.maxWatts).toBeNull();
    expect(trace!.heartrate).toHaveLength(3);
  });

  it("berechnet avg/max aus den rohen Werten, nicht aus den Buckets", () => {
    const time = [0, 1, 2, 3];
    const watts = [100, 200, 300, null];
    const trace = buildNoiseTrace(streams({ time, watts, heartrate: [] }));
    expect(trace!.avgWatts).toBeCloseTo(200);
    expect(trace!.maxWatts).toBe(300);
  });

  describe("mit opts.targetBand", () => {
    it("zeichnet die Watt-Kurve auf einer absoluten Skala (Min/Max inkl. Bandkanten) und gibt band-yPcts zurück", () => {
      const trace = buildNoiseTrace(
        streams({ time: [0, 1, 2], watts: [150, 160, 155], heartrate: [] }),
        { targetBand: { lowW: 100, highW: 200 } },
      );
      // Skala 100..200 → Bandkanten am unteren/oberen Rand.
      expect(trace!.band).toEqual({ yLowPct: 0, yHighPct: 100 });
      // Watt-Punkte auf DERSELBEN Skala, nicht mehr eigen-normiert (sonst wäre 150 → 0%).
      expect(trace!.watts[0].yPct).toBe(50); // (150-100)/100
      expect(trace!.watts[1].yPct).toBe(60); // (160-100)/100
    });

    it("weitet die Skala auf, wenn die gefahrenen Watt über die Bandkanten hinausgehen", () => {
      const trace = buildNoiseTrace(
        streams({ time: [0, 1, 2], watts: [100, 300, 200], heartrate: [] }),
        { targetBand: { lowW: 180, highW: 220 } },
      );
      // Skala 100..300 (Kurve dominiert), Band liegt dazwischen.
      expect(trace!.band!.yLowPct).toBeCloseTo(40); // (180-100)/200
      expect(trace!.band!.yHighPct).toBeCloseTo(60); // (220-100)/200
      expect(trace!.watts.map((p) => p.yPct)).toEqual([0, 100, 50]);
    });

    it("lässt band weg, wenn keine targetBand-Option übergeben wird (Rückwärtskompatibilität)", () => {
      const trace = buildNoiseTrace(streams({ time: [0, 1, 2], watts: [150, 160, 155], heartrate: [] }));
      expect(trace!.band).toBeUndefined();
      expect(trace!.watts[0].yPct).toBe(0); // wieder eigen-normiert
    });
  });

  describe("mit opts.targetProfile — zeit-ausgerichtete Ziel-Treppe", () => {
    // Zeit 0..100 → rideSpanS = 100, xOf(sec) === sec.
    const time100 = Array.from({ length: 101 }, (_, i) => i);

    it("legt die Treppe an die echte Fahrtlänge — endet der Plan früher, endet die Treppe vor dem rechten Rand", () => {
      const trace = buildNoiseTrace(
        streams({ time: time100, watts: time100.map(() => 150), heartrate: [] }),
        {
          targetProfile: {
            phases: [
              { watts: 100, durationS: 20 },
              { watts: 200, durationS: 20 },
            ],
            totalS: 40,
          },
        },
      );
      expect(trace!.stepRuns).toHaveLength(1);
      expect(trace!.stepRuns![0]).toEqual([
        { xStartPct: 0, xEndPct: 20, yPct: 0 }, // 100 W am Skalenboden (lo = 100)
        { xStartPct: 20, xEndPct: 40, yPct: 100 }, // 200 W am Skalendach (hi = 200)
      ]);
    });

    it("schneidet die Treppe am rechten Rand ab, wenn der Plan länger als die Fahrt ist", () => {
      const trace = buildNoiseTrace(
        streams({ time: time100, watts: time100.map(() => 150), heartrate: [] }),
        {
          targetProfile: {
            phases: [
              { watts: 150, durationS: 60 },
              { watts: 150, durationS: 60 },
              { watts: 150, durationS: 60 },
            ],
            totalS: 180,
          },
        },
      );
      const run = trace!.stepRuns![0];
      expect(run).toHaveLength(2); // dritte Phase beginnt jenseits der Fahrt → fällt weg
      expect(run[1].xEndPct).toBe(100); // zweite Phase am Rand gekappt
    });

    it("bricht den Lauf an einer Phase ohne Ziel-Watt (all-out) auf, lässt die Uhr aber weiterlaufen", () => {
      const trace = buildNoiseTrace(
        streams({ time: time100, watts: time100.map(() => 150), heartrate: [] }),
        {
          targetProfile: {
            phases: [
              { watts: 120, durationS: 20 },
              { watts: null, durationS: 10 },
              { watts: 180, durationS: 20 },
            ],
            totalS: 50,
          },
        },
      );
      expect(trace!.stepRuns).toHaveLength(2);
      expect(trace!.stepRuns![0][0].xStartPct).toBe(0);
      expect(trace!.stepRuns![1][0].xStartPct).toBe(30); // 20 + 10 Lücke — nicht 20
    });

    it("legt Watt-Kurve UND Treppe auf dieselbe absolute Skala (Min/Max inkl. aller Ziel-Watt)", () => {
      const trace = buildNoiseTrace(streams({ time: [0, 1, 2], watts: [150, 160, 155], heartrate: [] }), {
        targetProfile: {
          phases: [
            { watts: 100, durationS: 1 },
            { watts: 200, durationS: 1 },
          ],
          totalS: 2,
        },
      });
      // Skala 100..200 → Watt-Punkte relativ dazu, nicht mehr eigen-normiert.
      expect(trace!.watts.map((p) => Math.round(p.yPct))).toEqual([50, 60, 55]);
      expect(trace!.band).toBeUndefined(); // kein flaches Band mehr
    });

    it("ignoriert targetProfile ohne einzige Ziel-Watt-Phase (fällt auf eigen-normiert zurück)", () => {
      const trace = buildNoiseTrace(streams({ time: [0, 1, 2], watts: [150, 160, 155], heartrate: [] }), {
        targetProfile: { phases: [{ watts: null, durationS: 2 }], totalS: 2 },
      });
      expect(trace!.stepRuns).toBeUndefined();
      expect(trace!.watts[0].yPct).toBe(0); // eigen-normiert
    });

    it("hat Vorrang vor targetBand, wenn beide übergeben werden", () => {
      const trace = buildNoiseTrace(streams({ time: time100, watts: time100.map(() => 150), heartrate: [] }), {
        targetBand: { lowW: 90, highW: 110 },
        targetProfile: { phases: [{ watts: 200, durationS: 50 }], totalS: 50 },
      });
      expect(trace!.stepRuns).toHaveLength(1);
      expect(trace!.band).toBeUndefined();
    });
  });
});
