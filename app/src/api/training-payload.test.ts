/* Tests: api/training-payload.ts — das Zusammensetzen der Payload aus den
 * Tabellen ist die Umkehrung von splitPayload() (scripts/lib/training-store.js,
 * Fahrplan 26 E2). Der Rundlauf-Test importiert die ECHTE Aufteilung des
 * Syncs, damit eine Änderung dort hier rot wird. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingProfileDataRow } from "./supabase/training-profile-data";

/** Form der Aufteilung aus scripts/lib/training-store.js (JSDoc dort). */
interface Split {
  rides: Array<{ ride_key: string; ride_date: string; start_time: string | null; data: unknown }>;
  wellness: Array<{ day: string; data: unknown }>;
  profileData: {
    power_curves?: unknown;
    forecast?: unknown;
    athlete_weight?: unknown;
    wellness_meta?: unknown;
    meta: Record<string, unknown>;
    extra: Record<string, unknown>;
  };
}
// import.meta.glob statt direktem Import: der Container-Build (docker, nur
// app/ im Kontext) typprüft diese Datei mit, scripts/ gibt es dort nicht —
// dasselbe Muster wie config.demo.test.ts. Die Tests selbst laufen nur im Repo.
const storeModules = import.meta.glob<{ splitPayload: (payload: object) => Split }>(
  "../../../scripts/lib/training-store.js",
  { eager: true },
);
const splitPayload = (payload: object): Split => {
  const fn = Object.values(storeModules)[0]?.splitPayload;
  if (!fn) throw new Error("scripts/lib/training-store.js nicht gefunden");
  return fn(payload);
};

const mocks = vi.hoisted(() => ({
  getTrainingRides: vi.fn(),
  getTrainingWellness: vi.fn(),
  getTrainingProfileData: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock("./supabase/training-rides", () => ({ getTrainingRides: mocks.getTrainingRides }));
vi.mock("./supabase/training-wellness", () => ({ getTrainingWellness: mocks.getTrainingWellness }));
vi.mock("./supabase/training-profile-data", () => ({
  getTrainingProfileData: mocks.getTrainingProfileData,
}));
vi.mock("./supabase/profiles", () => ({ getProfile: mocks.getProfile }));

const { assemblePayload, loadProfileTrainingData } = await import("./training-payload");

/** Synthetische Payload in der Form einer rides*.json (keine echten Daten). */
function samplePayload() {
  return {
    athleteName: "demo.person",
    updated: "2026-10-01T06:00:00.000Z",
    source: "intervals.icu",
    count: 3,
    ftp: 220,
    ftpPublic: true,
    ftpGoal: 235,
    dataSources: ["Wahoo", "Garmin"],
    hrMax: 186,
    hrRest: 48,
    hrEstimated: true,
    rides: [
      { date: "2026-09-28", startTime: "07:30", activityId: "i100", km: 40, min: 90, sport: "ride" },
      { date: "2026-09-29", startTime: "06:15", activityId: "i101", km: 12, min: 60, sport: "run" },
      { date: "2026-09-29", startTime: "18:00", dataSource: "alt", km: 55, min: 120, sport: "ride" },
    ],
    wellness: [
      { date: "2026-09-28", hrv: 62, restingHR: 48 },
      { date: "2026-09-29", hrv: 58, restingHR: 50 },
    ],
    powerCurves: { "2026-09": { "5": 640, "60": 380 } },
    forecast: { "2026-10-02": { temp: 14, precipProb: 20 } },
    athleteWeight: 71.5,
    wellnessMeta: { restingHrBase: 49 },
    ftpHistory: [{ id: "ramp-2026-03-01", ftpWatt: 210, validFrom: "2026-03-01", source: "ramp-test" }],
    plannedSessions: [{ date: "2026-10-02", typ: "Z2 Dauer" }],
    adjustments: { "2026-10-02": { reason: "müde" } },
    powerCurveBlocks: [{ from: "2026-09-01", to: "2026-09-30" }],
  };
}

/** Was die DB-Adapter aus den Zeilen zurückgeben würden: Fahrten nach
 *  (ride_date, start_time, ride_key) sortiert, nur `data`. */
function rowsFromSplit(split: Split) {
  const rides = [...split.rides]
    .sort(
      (a, b) =>
        a.ride_date.localeCompare(b.ride_date) ||
        (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
        a.ride_key.localeCompare(b.ride_key),
    )
    .map((r) => r.data);
  const wellness = [...split.wellness].sort((a, b) => a.day.localeCompare(b.day)).map((w) => w.data);
  const p = split.profileData;
  const profileData: TrainingProfileDataRow = {
    powerCurves: p.power_curves ?? null,
    forecast: p.forecast ?? null,
    athleteWeight: p.athlete_weight ?? null,
    wellnessMeta: p.wellness_meta ?? null,
    meta: p.meta,
    extra: p.extra,
  };
  return { rides, wellness, profileData };
}

describe("assemblePayload — Rundlauf mit splitPayload", () => {
  it("Payload → aufteilen → zusammensetzen ergibt dieselbe Payload", () => {
    const payload = samplePayload();
    const { rides, wellness, profileData } = rowsFromSplit(splitPayload(payload));

    const rebuilt = assemblePayload({ rides, wellness, profileData, athleteName: payload.athleteName });

    expect(rebuilt).toEqual(payload);
  });

  it("jedes Payload-Feld landet an genau einer Stelle (keins geht verloren)", () => {
    const payload = samplePayload();
    const rebuilt = assemblePayload({
      ...rowsFromSplit(splitPayload(payload)),
      athleteName: payload.athleteName,
    });
    expect(Object.keys(rebuilt).sort()).toEqual(Object.keys(payload).sort());
  });

  it("ein neues Payload-Feld läuft über meta durch, ohne dass hier etwas geändert werden muss", () => {
    const payload = { ...samplePayload(), someFutureField: { a: 1 } };
    const rebuilt = assemblePayload({ ...rowsFromSplit(splitPayload(payload)), athleteName: payload.athleteName });
    expect(rebuilt).toMatchObject({ someFutureField: { a: 1 } });
  });

  it("Spalten ohne Wert (null) erscheinen nicht als Feld", () => {
    const payload: Record<string, unknown> = samplePayload();
    delete payload.athleteWeight;
    delete payload.forecast;
    const rebuilt = assemblePayload({
      ...rowsFromSplit(splitPayload(payload)),
      athleteName: payload.athleteName as string,
    });
    expect(rebuilt).not.toHaveProperty("athleteWeight");
    expect(rebuilt).not.toHaveProperty("forecast");
    expect(rebuilt).toEqual(payload);
  });

  it("ohne Profil-Zeile (Sync lief nie) bleibt eine leere Payload mit rides/wellness", () => {
    expect(assemblePayload({ rides: [], wellness: [], profileData: null })).toEqual({
      rides: [],
      wellness: [],
    });
  });
});

describe("loadProfileTrainingData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProfile.mockResolvedValue({ ok: true, profile: { displayName: "demo.person" } });
  });

  it("baut aus den Zeilen AthleteData und markiert sie als befüllt", async () => {
    const payload = samplePayload();
    const rows = rowsFromSplit(splitPayload(payload));
    mocks.getTrainingRides.mockResolvedValue({ ok: true, rides: rows.rides });
    mocks.getTrainingWellness.mockResolvedValue({ ok: true, wellness: rows.wellness });
    mocks.getTrainingProfileData.mockResolvedValue({ ok: true, row: rows.profileData });

    const result = await loadProfileTrainingData("p1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rides).toHaveLength(3);
    expect(result.data.wellness).toHaveLength(2);
    expect(result.data.athleteFtp).toBe(220);
    expect(result.data.athleteFtpGoal).toBe(235);
    expect(result.data.hrMax).toBe(186);
    expect(result.data.ftpHistory).toHaveLength(1);
    expect(result.data.trainingDataEmpty).toBe(false);
  });

  it("keine Zeilen, keine Profil-Zeile → leer markiert, aber kein Fehler", async () => {
    mocks.getTrainingRides.mockResolvedValue({ ok: true, rides: [] });
    mocks.getTrainingWellness.mockResolvedValue({ ok: true, wellness: [] });
    mocks.getTrainingProfileData.mockResolvedValue({ ok: true, row: null });

    const result = await loadProfileTrainingData("p1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.trainingDataEmpty).toBe(true);
    expect(result.data.rides).toEqual([]);
  });

  it("Profil-Zeile da, aber noch keine Fahrten (Einsteiger) → nicht leer", async () => {
    mocks.getTrainingRides.mockResolvedValue({ ok: true, rides: [] });
    mocks.getTrainingWellness.mockResolvedValue({ ok: true, wellness: [] });
    mocks.getTrainingProfileData.mockResolvedValue({
      ok: true,
      row: { powerCurves: null, forecast: null, athleteWeight: null, wellnessMeta: null, meta: {}, extra: {} },
    });

    const result = await loadProfileTrainingData("p1");

    expect(result.ok && result.data.trainingDataEmpty).toBe(false);
  });

  it.each([
    ["Fahrten", "getTrainingRides"],
    ["Wellness", "getTrainingWellness"],
    ["Profil-Zeile", "getTrainingProfileData"],
  ] as const)("Lesefehler bei %s → ok:false, keine halbe Payload", async (_label, failing) => {
    mocks.getTrainingRides.mockResolvedValue({ ok: true, rides: [] });
    mocks.getTrainingWellness.mockResolvedValue({ ok: true, wellness: [] });
    mocks.getTrainingProfileData.mockResolvedValue({ ok: true, row: null });
    mocks[failing].mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "permission denied" } });

    const result = await loadProfileTrainingData("p1");

    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "permission denied" } });
  });

  it("ein Fehler beim Anzeigenamen kippt die Daten nicht", async () => {
    mocks.getProfile.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    mocks.getTrainingRides.mockResolvedValue({ ok: true, rides: [] });
    mocks.getTrainingWellness.mockResolvedValue({ ok: true, wellness: [] });
    mocks.getTrainingProfileData.mockResolvedValue({ ok: true, row: null });

    expect((await loadProfileTrainingData("p1")).ok).toBe(true);
  });
});
