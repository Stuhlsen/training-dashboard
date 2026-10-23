/* Tests: api/intervals/push.ts — der Workout-Text, der zu intervals.icu
   (und von dort in Zwift/Wahoo) geht. Nur der Beschreibungs-Aufbau ist hier
   interessant; fetch wird gestubbt und die gesendete `description` geprüft. */

import { describe, test, expect, vi, afterEach } from "vitest";
import { pushCardWorkout } from "./push";
import type { PlanCard } from "../types";

const LEGACY_CARD = {
  id: "card-1",
  date: "2026-09-10",
  name: "3×8 Min Tempo",
  details: null,
  workout: { warmup: 15, intervals: 3, duration: 8, rest: 3, cooldown: 10, pct: [83, 90], label: "3×8 @ 83–90%" },
} as unknown as PlanCard;

function stubFetchOk() {
  const spy = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response("{}", { status: 200 })));
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sentEvent(spy: ReturnType<typeof stubFetchOk>): Record<string, unknown> {
  const init = spy.mock.calls[0][1];
  return JSON.parse(init.body as string)[0];
}

function sentDescription(spy: ReturnType<typeof stubFetchOk>): string {
  return sentEvent(spy).description as string;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pushCardWorkout — Kadenz im Workout-Text (Fahrplan 11)", () => {
  test("ohne cadenceTarget-Argument: Default 90 -> 85 / 90 / 80 rpm", async () => {
    const spy = stubFetchOk();
    const res = await pushCardWorkout(LEGACY_CARD, "tok", "i123");
    expect(res.ok).toBe(true);
    const d = sentDescription(spy);
    expect(d).toContain("60% 85rpm"); // Warmup T-5
    expect(d).toContain("83-90% 90rpm"); // Intervall T
    expect(d).toContain("50% 80rpm"); // Pause T-10
    expect(d).toContain("50%-40% 80rpm"); // Cooldown T-10
  });

  test("cadenceTarget 78 -> 73 / 78 / 68 rpm", async () => {
    const spy = stubFetchOk();
    await pushCardWorkout(LEGACY_CARD, "tok", "i123", 78);
    const d = sentDescription(spy);
    expect(d).toContain("60% 73rpm");
    expect(d).toContain("83-90% 78rpm");
    expect(d).toContain("50% 68rpm");
    expect(d).toContain("50%-40% 68rpm");
  });

  test("freie Ein-Block-Fahrt (intervals: 1) -> gar keine rpm-Angabe", async () => {
    const spy = stubFetchOk();
    const card = {
      id: "card-2",
      date: "2026-09-12",
      name: "Z2 50 Min locker",
      details: null,
      workout: { warmup: 5, intervals: 1, duration: 40, rest: 0, cooldown: 5, pct: [60, 70], label: "50 Min locker @ 60–70% FTP" },
    } as unknown as PlanCard;
    await pushCardWorkout(card, "tok", "i123");
    const d = sentDescription(spy);
    expect(d).not.toContain("rpm");
    expect(d).toContain("- 40m 60-70%"); // Power-Ziel bleibt, nur die Kadenz fehlt
  });
});

test("pushCardWorkout: Datum vorne im Eintrags-Titel (ISO, gleicher Präfix wie der .zwo-Export)", async () => {
  const spy = stubFetchOk();
  await pushCardWorkout(LEGACY_CARD, "tok", "i123");
  expect(sentEvent(spy).name).toBe("2026-09-10 · 3×8 Min Tempo");
});

describe("pushCardWorkout — Generator-Karte mit genauer workout_structure", () => {
  afterEach(() => vi.unstubAllGlobals());

  const OVER_UNDER_CARD = {
    ...LEGACY_CARD,
    name: "Over-Under 3×9",
    workout: { warmup: 15, intervals: 3, duration: 9, rest: 3, cooldown: 10, pct: [88, 105], label: "Over-Under 3×9" },
    workoutStructure: {
      version: 1,
      steps: [
        { kind: "warmup", duration_s: 900, target_pct_ftp: 55 },
        {
          kind: "alternating",
          reps: 3,
          cycles: 3,
          duration_s: 540,
          over: { duration_s: 120, target_pct_ftp: 105 },
          under: { duration_s: 60, target_pct_ftp: 88 },
          recovery: { duration_s: 180, target_pct_ftp: 50 },
        },
        { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
      ],
    },
  } as unknown as PlanCard;

  test("Over-Under geht als echte Wechsel raus, nicht als 3× 9m 88-105%", async () => {
    const spy = stubFetchOk();
    await pushCardWorkout(OVER_UNDER_CARD, "token", "i1", 90);
    const description = sentDescription(spy);
    expect(description.startsWith("Over-Under 3×9\n\n")).toBe(true);
    expect(description).toContain("Main Set 3x\n- 2m 105% 90rpm\n- 1m 88% 80rpm");
    expect(description).not.toContain("9m 88-105%");
  });

  test("editierte Karte (Blockform) gewinnt über die alte Struktur", async () => {
    const spy = stubFetchOk();
    const edited = { ...OVER_UNDER_CARD, workout: { blocks: [{ type: "interval", text: "3x10 frei" }] } } as unknown as PlanCard;
    await pushCardWorkout(edited, "token", "i1", 90);
    expect(sentDescription(spy)).toContain("- 3x10 frei");
    expect(sentDescription(spy)).not.toContain("105%");
  });
});

describe("pushCardWorkout — Guide-Text (Fahrplan 34, E5)", () => {
  const GUIDE = "Ziel: Schwelle halten.\nRPE 7–8: hart, aber kontrolliert.";

  test("Legacy-Karte: Guide steht nach details, vor dem Workout-Text", async () => {
    const spy = stubFetchOk();
    const card = { ...LEGACY_CARD, details: "Notiz" } as PlanCard;
    await pushCardWorkout(card, "tok", "i123", 90, GUIDE);
    const d = sentDescription(spy);
    expect(d.startsWith(`3×8 @ 83–90%\nNotiz\n\n${GUIDE}\n\nWarmup\n`)).toBe(true);
  });

  test("Blockform: Guide steht nach details, vor den Blöcken", async () => {
    const spy = stubFetchOk();
    const card = {
      ...LEGACY_CARD,
      details: "Notiz",
      workout: { blocks: [{ type: "interval", text: "3x10 frei" }] },
    } as unknown as PlanCard;
    await pushCardWorkout(card, "tok", "i123", 90, GUIDE);
    expect(sentDescription(spy)).toBe(`Notiz\n\n${GUIDE}\n\nMain Set\n- 3x10 frei`);
  });

  test("Blockform ohne details: Guide steht vorn", async () => {
    const spy = stubFetchOk();
    const card = { ...LEGACY_CARD, workout: { blocks: [{ type: "interval", text: "x" }] } } as unknown as PlanCard;
    await pushCardWorkout(card, "tok", "i123", 90, GUIDE);
    expect(sentDescription(spy)).toBe(`${GUIDE}\n\nMain Set\n- x`);
  });

  test("Strukturkarte: Guide nach Kopf, vor den Segmenten", async () => {
    const spy = stubFetchOk();
    const card = {
      ...LEGACY_CARD,
      details: "Notiz",
      workout: { ...(LEGACY_CARD.workout as object), label: "OU" },
      workoutStructure: {
        version: 1,
        steps: [
          { kind: "warmup", duration_s: 900, target_pct_ftp: 55 },
          { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
        ],
      },
    } as unknown as PlanCard;
    await pushCardWorkout(card, "tok", "i123", 90, GUIDE);
    expect(sentDescription(spy).startsWith(`OU\nNotiz\n\n${GUIDE}\n\n`)).toBe(true);
  });

  test("ohne Guide-Text (fehlt / leer): Beschreibung byte-gleich wie bisher", async () => {
    const spy = stubFetchOk();
    await pushCardWorkout(LEGACY_CARD, "tok", "i123", 90);
    const base = sentDescription(spy);
    for (const g of ["", undefined]) {
      const s = stubFetchOk();
      await pushCardWorkout(LEGACY_CARD, "tok", "i123", 90, g);
      expect(sentDescription(s)).toBe(base);
    }
  });

  test("Karte ohne Workout bleibt NO_DATA, auch mit Guide", async () => {
    stubFetchOk();
    const res = await pushCardWorkout({ ...LEGACY_CARD, workout: null } as unknown as PlanCard, "t", "i", 90, GUIDE);
    expect(res.ok).toBe(false);
  });
});
