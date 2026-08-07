import { describe, expect, it } from "vitest";
import { buildPlanningSections, isRestDay, typeColor, typeIcon } from "./planning-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

const TODAY = "2026-07-22";

function card(overrides: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: "Session",
    typ: "Z2 Dauer",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: "2026-KW30",
    phase: "Sweet Spot",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function ride(dateISO: string): Ride {
  return { dateISO } as Ride;
}

describe("typeColor/typeIcon", () => {
  it("liefert für einen bekannten Typ dessen Farbe/Icon", () => {
    expect(typeColor("Sweet Spot")).toBe("#e08a3c");
    expect(typeIcon("Sweet Spot")).toBe("⚡");
  });

  it("fällt für einen unbekannten/fehlenden Typ auf den Default zurück", () => {
    expect(typeColor("Unbekannt")).toBe("#6b7280");
    expect(typeIcon(null)).toBe("📅");
  });
});

describe("isRestDay", () => {
  it("erkennt nur typ 'Ruhetag'", () => {
    expect(isRestDay(card({ id: "a", date: "2026-07-22", typ: "Ruhetag" }))).toBe(true);
    expect(isRestDay(card({ id: "b", date: "2026-07-22", typ: "Z2 Dauer" }))).toBe(false);
  });
});

describe("buildPlanningSections", () => {
  it("teilt Karten in ausstehend/absolviert/verpasst/ausgefallen", () => {
    const cards = [
      card({ id: "future", date: "2026-07-25" }), // ausstehend
      card({ id: "done", date: "2026-07-20" }), // hat einen Ride → absolviert
      card({ id: "missed", date: "2026-07-18" }), // vergangen, kein Ride → verpasst
      card({ id: "cancelled", date: "2026-07-19", cancelled: true }), // ausgefallen
    ];
    const sections = buildPlanningSections(cards, [ride("2026-07-20")], TODAY);

    expect(sections.weeks.flatMap((w) => w.cards.map((c) => c.id))).toEqual(["future"]);
    expect(sections.done.map((c) => c.id)).toEqual(["done"]);
    expect(sections.missed.map((c) => c.id)).toEqual(["missed"]);
    expect(sections.cancelled.map((c) => c.id)).toEqual(["cancelled"]);
  });

  it("zählt eine verpasste Ruhetag-Karte nie als 'verpasst'", () => {
    const cards = [card({ id: "rest", date: "2026-07-18", typ: "Ruhetag" })];
    expect(buildPlanningSections(cards, [], TODAY).missed).toEqual([]);
  });

  it("hält eine verschobene Karte ausstehend, auch wenn originalDate < heute", () => {
    const cards = [card({ id: "moved", date: "2026-07-30", originalDate: "2026-07-10" })];
    const sections = buildPlanningSections(cards, [], TODAY);
    expect(sections.weeks.flatMap((w) => w.cards.map((c) => c.id))).toEqual(["moved"]);
  });

  it("zählt Ruhetage weder im Zähler noch im Nenner der Fortschrittsquote", () => {
    const cards = [
      card({ id: "done1", date: "2026-07-20", typ: "Sweet Spot" }),
      card({ id: "done-rest", date: "2026-07-21", typ: "Ruhetag" }), // gefahrener Ruhetag
      card({ id: "pending", date: "2026-07-25", typ: "Schwelle" }),
    ];
    const { stats } = buildPlanningSections(cards, [ride("2026-07-20"), ride("2026-07-21")], TODAY);
    expect(stats.totalSessions).toBe(2); // nur done1 + pending, kein Ruhetag
    expect(stats.doneCount).toBe(1);
    expect(stats.pct).toBe(50);
  });

  it("gruppiert ausstehende Karten nach Woche und erkennt Erholungswochen", () => {
    const cards = [
      card({ id: "a", date: "2026-07-27", week: "2026-KW31", phase: "Erholung", typ: "Ruhetag" }),
      card({ id: "b", date: "2026-07-28", week: "2026-KW31", phase: "Erholung", typ: "Z1 Recovery" }),
      card({ id: "c", date: "2026-08-03", week: "2026-KW32", phase: "Sweet Spot", typ: "Sweet Spot" }),
    ];
    const { weeks } = buildPlanningSections(cards, [], TODAY);
    expect(weeks.find((w) => w.week === "2026-KW31")?.isRecoveryWeek).toBe(true);
    expect(weeks.find((w) => w.week === "2026-KW32")?.isRecoveryWeek).toBe(false);
  });

  it("liefert bei leerer Kartenliste leere Sektionen und pct 0", () => {
    const { weeks, done, missed, cancelled, stats } = buildPlanningSections([], [], TODAY);
    expect(weeks).toEqual([]);
    expect(done).toEqual([]);
    expect(missed).toEqual([]);
    expect(cancelled).toEqual([]);
    expect(stats.pct).toBe(0);
    expect(stats.totalSessions).toBe(0);
  });
});
