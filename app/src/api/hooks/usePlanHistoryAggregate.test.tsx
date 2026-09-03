/* Tests: usePlanHistoryAggregate — Fahrplan 8 E4. Der Hook trägt keine
   Logik (die steckt in core/plan-history.js, dort getestet) — hier nur:
   verdrahtet er Rides/Wellness/Karten + config-Alter/eFTP korrekt, und
   liefert er auch im Ladezustand ein vollständiges Aggregat?

   `localISODate` ist auf ein festes Datum gemockt, damit die Wochen-
   Fensterung deterministisch ist (Rest von format.js bleibt echt). */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let ridesReturn: { data: unknown; isLoading: boolean };
let planCardsReturn: { data: unknown; isLoading: boolean };

vi.mock("./useRides", () => ({ useRides: () => ridesReturn }));
vi.mock("./usePlanCards", () => ({ usePlanCards: () => planCardsReturn }));
vi.mock("../../core/format.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/format.js")>();
  return { ...actual, localISODate: () => "2026-09-10" }; // Do; laufende Woche ab Mo 2026-09-07
});

const { createHarness } = await import("../../test/harness");
const { usePlanHistoryAggregate } = await import("./usePlanHistoryAggregate");

beforeEach(() => {
  ridesReturn = { data: undefined, isLoading: true };
  planCardsReturn = { data: undefined, isLoading: true };
});

describe("usePlanHistoryAggregate", () => {
  it("liefert im Ladezustand ein vollständiges Aggregat mit config-Alter/eFTP", () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePlanHistoryAggregate("athlete2"), { wrapper });

    expect(result.current.isLoading).toBe(true);
    // athlete2 in config.ts: bmr.age 40, eFTP 261
    expect(result.current.aggregate).toEqual({
      weeklyActualTss: [],
      currentCtl: null,
      currentEftp: 261,
      planAdherence: null,
      ageYears: 40,
      powerCurveWeakness: null,
    });
  });

  it("reicht Rides + Wellness + Karten an die Aggregation durch", () => {
    ridesReturn = {
      data: {
        rides: [
          { dateISO: "2026-08-25", tss: 100, eftp: 248 },
          { dateISO: "2026-09-01", tss: 60, eftp: 252 },
          { dateISO: "2026-09-08", tss: 999 }, // laufende Woche → nicht in weeklyActualTss
        ],
        wellness: [],
      },
      isLoading: false,
    };
    planCardsReturn = {
      data: [
        { date: "2026-08-25", name: "Intervalle" }, // erfüllt
        { date: "2026-09-01", name: "Sweet Spot" }, // erfüllt
        { date: "2026-09-04", name: "VO2max" }, // offen
      ],
      isLoading: false,
    };

    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePlanHistoryAggregate("athlete2"), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.aggregate.weeklyActualTss).toEqual([100, 60]);
    expect(result.current.aggregate.currentEftp).toBe(252); // aus den Rides, nicht Fallback 261
    expect(result.current.aggregate.ageYears).toBe(40);
    expect(result.current.aggregate.planAdherence).toBe(Math.round((2 / 3) * 100) / 100);
  });
});
