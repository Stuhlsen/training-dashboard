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
