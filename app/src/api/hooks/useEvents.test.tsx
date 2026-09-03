/* Tests: die Events-Hooks — Auflösung der internen Athleten-Kennung auf die
 * Supabase-Profil-UUID und der type-"other"-Sonderfall beim Anlegen.
 *
 * Verhaltens-Spezifikation ist tests/events-athlete-resolution.test.js
 * (Vanilla). Der Bugreport dahinter: loadEvents()/createEvent() reichten
 * "athlete1" unverändert an die Query weiter, die damit gegen die
 * uuid-Spalte `events.athlete_id` filterte — PostgREST antwortete mit 400
 * ("invalid input syntax for type uuid"). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventInput } from "../types";

let listEventsCalls: string[] = [];
let createEventCalls: Array<{ athleteId: string; event: EventInput }> = [];

vi.mock("../supabase/events", () => ({
  listEvents: async (athleteId: string) => {
    listEventsCalls.push(athleteId);
    return { ok: true, events: [] };
  },
  createEvent: async (athleteId: string, event: EventInput) => {
    createEventCalls.push({ athleteId, event });
    return { ok: true, event: { id: "event-1", ...event } };
  },
  updateEvent: async () => ({ ok: true, event: {} }),
  removeEvent: async () => ({ ok: true }),
}));

vi.mock("../supabase/profiles", () => ({
  findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-stuhlsen" }),
  getProfile: async (id: string) => ({
    ok: true,
    profile: {
      id,
      displayName: "Stuhlsen",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      isAdmin: false,
      ladderProgressionEnabled: false,
    },
  }),
}));

const { createHarness } = await import("../../test/harness");
const { useEvents, useCreateEvent, isUpcomingEvent, nextRaceEvent, raceCountdown } = await import(
  "./useEvents"
);

beforeEach(() => {
  listEventsCalls = [];
  createEventCalls = [];
});

describe("Athleten-Auflösung", () => {
  it("useEvents filtert mit der Profil-UUID, nicht mit 'athlete1'", async () => {
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useEvents("athlete1"), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(listEventsCalls).toEqual(["profile-uuid-stuhlsen"]);
  });

  it("useCreateEvent legt ebenfalls unter der Profil-UUID an", async () => {
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useCreateEvent("athlete1"), { wrapper });
    const result = await view.result.current.create({
      title: "GFNY",
      eventDate: "2026-08-30",
      type: "race",
    });
    expect(result.ok).toBe(true);
    expect(createEventCalls[0].athleteId).toBe("profile-uuid-stuhlsen");
  });

  it("schreibt nicht ohne Login", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useCreateEvent("athlete1"), { wrapper });
    const result = await view.result.current.create({
      title: "GFNY",
      eventDate: "2026-08-30",
      type: "race",
    });
    expect(result.ok).toBe(false);
    expect(createEventCalls).toHaveLength(0);
  });
});

describe("type 'other'", () => {
  it("nullt priority/ftpGoal/isTest UND die result_*-Felder, auch wenn im Payload gesetzt", async () => {
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useCreateEvent("athlete1"), { wrapper });
    await view.result.current.create({
      title: "Trainingslager",
      eventDate: "2026-08-30",
      type: "other",
      priority: "main",
      ftpGoal: 210,
      isTest: true,
      resultTimeS: 11565,
      resultPlaceAg: 42,
    });
    expect(createEventCalls[0].event).toEqual({
      title: "Trainingslager",
      eventDate: "2026-08-30",
      type: "other",
      priority: null,
      ftpGoal: null,
      isTest: false,
      resultTimeS: null,
      resultAvgWatts: null,
      resultPlaceAg: null,
      resultPlaceOverall: null,
    });
  });
});

/* ── Abgeleitete Werte (reine Funktionen, kein Request) ──────────── */

describe("isUpcomingEvent", () => {
  it("zählt das heutige Datum als anstehend", () => {
    expect(isUpcomingEvent({ eventDate: "2026-07-30" }, "2026-07-30")).toBe(true);
  });

  it("zählt ein zukünftiges Datum als anstehend", () => {
    expect(isUpcomingEvent({ eventDate: "2026-08-01" }, "2026-07-30")).toBe(true);
  });

  it("zählt ein vergangenes Datum nicht als anstehend", () => {
    expect(isUpcomingEvent({ eventDate: "2026-07-29" }, "2026-07-30")).toBe(false);
  });
});

describe("nextRaceEvent / raceCountdown", () => {
  const events = [
    { id: "past", eventDate: "2026-07-01", type: "race" },
    { id: "soon", eventDate: "2026-08-30", type: "race" },
    { id: "later", eventDate: "2026-09-19", type: "race" },
    { id: "other", eventDate: "2026-08-01", type: "other" },
  ] as Parameters<typeof nextRaceEvent>[0];

  it("nimmt das nächste zukünftige Rennen, nicht das nächste Event überhaupt", () => {
    expect(nextRaceEvent(events, "2026-07-30")?.id).toBe("soon");
  });

  it("liefert null, wenn kein Rennen mehr aussteht", () => {
    expect(nextRaceEvent(events, "2026-10-01")).toBeNull();
  });

  it("sagt am Renntag 'Heute!' statt 'Noch 0 Tage'", () => {
    expect(raceCountdown(events, "2026-08-30")?.label).toBe("Heute!");
  });

  it("zählt sonst die Tage", () => {
    expect(raceCountdown(events, "2026-08-20")).toMatchObject({ days: 10, label: "Noch 10 Tage" });
  });
});
