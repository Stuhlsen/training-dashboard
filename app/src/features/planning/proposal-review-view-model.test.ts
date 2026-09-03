import { describe, expect, it } from "vitest";
import { describeProposal, impactDetail, impactSummary, sidesFor } from "./proposal-review-view-model";
import type { EventItem, PlanCard, Proposal } from "../../api/types";

type Ride = import("../../types.js").Ride;

const card = (over: Partial<PlanCard> & { id: string }): PlanCard =>
  ({
    date: "2026-08-10",
    sortOrder: 0,
    name: "Sweet Spot 3×12",
    typ: "Sweet Spot",
    km: null,
    durationMin: null,
    tssPlanned: 70,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "t",
    updatedAt: "t",
    ...over,
  }) as PlanCard;

const proposal = (over: Partial<Proposal> & { id: string; op: Proposal["op"] }): Proposal =>
  ({
    athleteId: "a",
    createdBy: "c",
    source: "trainer",
    groupId: null,
    targetCardId: null,
    targetUpdatedAt: null,
    payload: null,
    reason: null,
    status: "open",
    createdAt: "2026-08-01T00:00:00Z",
    decidedAt: null,
    ...over,
  }) as Proposal;

const CARDS: PlanCard[] = [card({ id: "card-A", date: "2026-08-10", tssPlanned: 70 })];

describe("describeProposal", () => {
  it("add", () => {
    expect(describeProposal(proposal({ id: "p1", op: "add", payload: { title: "Neue Einheit" } }), CARDS)).toBe(
      "Neu anlegen: Neue Einheit",
    );
  });

  it("move nennt Kartenname + Zieldatum", () => {
    const p = proposal({ id: "p2", op: "move", targetCardId: "card-A", payload: { plan_date: "2026-08-12" } });
    expect(describeProposal(p, CARDS)).toBe("Verschieben: Sweet Spot 3×12 → 2026-08-12");
  });

  it("cancel nennt den Kartennamen", () => {
    const p = proposal({ id: "p3", op: "cancel", targetCardId: "card-A" });
    expect(describeProposal(p, CARDS)).toBe("Ausfallen lassen: Sweet Spot 3×12");
  });

  it("unbekannte Zielkarte fällt auf Platzhalter zurück", () => {
    const p = proposal({ id: "p4", op: "move", targetCardId: "missing", payload: { plan_date: "2026-08-12" } });
    expect(describeProposal(p, CARDS)).toBe("Verschieben: (Karte) → 2026-08-12");
  });

  it("replace zeigt Kartenname → neuen Titel", () => {
    const p = proposal({ id: "p5", op: "replace", targetCardId: "card-A", payload: { title: "Entschärft" } });
    expect(describeProposal(p, CARDS)).toBe("Sweet Spot 3×12 → Entschärft");
  });
});

describe("sidesFor", () => {
  it("add hat keine linke Seite", () => {
    const p = proposal({ id: "p1", op: "add", payload: { plan_date: "2026-08-11", title: "Neu", type: "Z2 Dauer" } });
    const { left, right, changed } = sidesFor(p, CARDS);
    expect(left).toBeNull();
    expect(right?.name).toBe("Neu");
    expect(changed).toEqual([]);
  });

  it("replace markiert nur tatsächlich geänderte Felder", () => {
    const p = proposal({
      id: "p2",
      op: "replace",
      targetCardId: "card-A",
      payload: { plan_date: "2026-08-10", title: "Entschärft", type: "Sweet Spot", target_tss: 40 },
    });
    const { left, right, changed } = sidesFor(p, CARDS);
    expect(left?.name).toBe("Sweet Spot 3×12");
    expect(right?.name).toBe("Entschärft");
    expect(right?.tssPlanned).toBe(40);
    expect(changed.sort()).toEqual(["name", "tssPlanned"]);
  });

  it("move markiert nur das Datum", () => {
    const p = proposal({ id: "p3", op: "move", targetCardId: "card-A", payload: { plan_date: "2026-08-12" } });
    const { right, changed } = sidesFor(p, CARDS);
    expect(right?.date).toBe("2026-08-12");
    expect(changed).toEqual(["date"]);
  });

  it("cancel markiert cancelled", () => {
    const p = proposal({ id: "p4", op: "cancel", targetCardId: "card-A" });
    const { right, changed } = sidesFor(p, CARDS);
    expect(right?.cancelled).toBe(true);
    expect(changed).toEqual(["cancelled"]);
  });

  it("replace einer bereits ausgefallenen Karte behält das cancelled-Flag bei", () => {
    const cancelledCards = [card({ id: "card-A", date: "2026-08-10", tssPlanned: 70, cancelled: true })];
    const p = proposal({
      id: "p6",
      op: "replace",
      targetCardId: "card-A",
      payload: { plan_date: "2026-08-10", title: "Entschärft", type: "Sweet Spot", target_tss: 40 },
    });
    const { right } = sidesFor(p, cancelledCards);
    expect(right?.cancelled).toBe(true);
  });
});

describe("impactSummary/impactDetail", () => {
  const events: EventItem[] = [
    {
      id: "e1",
      title: "GFNY",
      eventDate: "2026-08-20",
      type: "race",
      priority: null,
      ftpGoal: null,
      isTest: false,
      note: null,
      resultTimeS: null,
      resultAvgWatts: null,
      resultPlaceAg: null,
      resultPlaceOverall: null,
      createdAt: "t",
      updatedAt: "t",
    },
  ];
  const rides: Ride[] = [];

  it("cancel vor einem Event verändert den TSB-Wert am Eventtag", () => {
    const p = proposal({ id: "p1", op: "cancel", targetCardId: "card-A" });
    const detail = impactDetail(p, { cards: CARDS, rides, events, ftp: 200, today: "2026-08-05" });
    expect(detail.tsb).not.toBeNull();
    expect(detail.tsb!.eventTitle).toBe("GFNY");
    expect(detail.tsb!.before).not.toBe(detail.tsb!.after);
  });

  it("impactSummary liefert für denselben Fall einen TSB-Kurztext", () => {
    const p = proposal({ id: "p1", op: "cancel", targetCardId: "card-A" });
    const text = impactSummary(p, { cards: CARDS, rides, events, ftp: 200, today: "2026-08-05" });
    expect(text).toMatch(/^TSB GFNY: /);
  });

  it("ohne Event im Horizont fällt die Kurzfassung auf einen gelösten Konflikt zurück", () => {
    const p = proposal({ id: "p1", op: "cancel", targetCardId: "card-A" });
    const text = impactSummary(p, { cards: CARDS, rides, events: [], ftp: 200, today: "2026-08-05" });
    expect(text).toBe("löst K-LEER");
  });
});
