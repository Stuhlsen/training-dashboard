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
});
