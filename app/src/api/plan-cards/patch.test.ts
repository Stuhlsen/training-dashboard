/* Tests: die reinen Regeln der Karten-Anpassungen.
 *
 * Verhaltens-Spezifikation ist tests/plan-cards-move.test.js (Vanilla,
 * Root-Repo) — dort hingen dieselben Zusicherungen an gemocktem
 * Adapter-Geschirr (`--experimental-test-module-mocks`), weil die Regeln
 * im async-Schreibpfad steckten. Hier sind sie herausgelöst und brauchen
 * kein Mock mehr. Die Async-Seite (Optimistik, Rollback, Races) prüft
 * plan-cards.test.ts. */

import { describe, expect, it } from "vitest";
import {
  applyMoveOptimistic,
  buildCancelPatch,
  buildMovePatch,
  buildUndoPatch,
  nextSortOrder,
  sortCards,
} from "./patch";
import type { PlanCard } from "../types";

function card(partial: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: null,
    typ: null,
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...partial,
  };
}

/** Derselbe Bestand wie im SEED der Vanilla-Spec: card-A und card-C liegen
 *  in 2026-KW29, card-B allein in 2026-KW30. card-C ist nötig, damit die
 *  Ursprungswoche nach einem Wegziehen von card-A noch ein Label zu
 *  verleihen hat. */
const CARDS: PlanCard[] = [
  card({ id: "card-A", date: "2026-07-20", name: "Sweet Spot 3×12", typ: "Sweet Spot", week: "2026-KW29", phase: "Sweet Spot" }),
  card({ id: "card-B", date: "2026-07-28", name: "Erholung", typ: "Z1 Recovery", week: "2026-KW30", phase: "Erholung" }),
  card({ id: "card-C", date: "2026-07-21", sortOrder: 1, name: "Z2 Dauer", typ: "Z2 Dauer", week: "2026-KW29", phase: "Sweet Spot" }),
];

const byId = (id: string) => CARDS.find((c) => c.id === id)!;

describe("buildMovePatch", () => {
  it("merkt sich beim ERSTEN Verschieben das Ursprungsdatum", () => {
    const patch = buildMovePatch(CARDS, byId("card-A"), "2026-07-22", "Regen");
    expect(patch.plannedDate).toBe("2026-07-22");
    expect(patch.movedFromDate).toBe("2026-07-20");
    expect(patch.moveReason).toBe("Regen");
  });

  it("lässt movedFromDate beim ZWEITEN Verschieben auf dem Ursprung stehen", () => {
    const alreadyMoved = card({ id: "card-A", date: "2026-07-22", originalDate: "2026-07-20" });
    const patch = buildMovePatch(CARDS, alreadyMoved, "2026-07-24", "Hitze");
    expect(patch.movedFromDate).toBe("2026-07-20");
  });

  it("übernimmt week/phase der Zielwoche", () => {
    // card-A (KW29) in card-Bs Woche (KW30) ziehen
    const patch = buildMovePatch(CARDS, byId("card-A"), "2026-07-29");
    expect(patch.week).toBe("2026-KW30");
    expect(patch.phase).toBe("Erholung");
  });

  it("lässt week/phase unangetastet, wenn die Zielwoche leer ist", () => {
    const patch = buildMovePatch(CARDS, byId("card-A"), "2026-08-19");
    expect(patch.week).toBeUndefined();
    expect(patch.phase).toBeUndefined();
  });

  it("reaktiviert eine ausgefallene Karte als geplant", () => {
    const cancelled = card({ id: "card-A", date: "2026-07-20", cancelled: true, cancelReason: "Krank" });
    const patch = buildMovePatch(CARDS, cancelled, "2026-07-22");
    expect(patch.status).toBe("geplant");
    expect(patch.cancelReason).toBeNull();
  });

  it("schreibt einen leeren Grund statt undefined", () => {
    // "" leert die Spalte, undefined würde sie in updatePlanCard()
    // überhaupt nicht anfassen — ein alter Grund bliebe stehen.
    expect(buildMovePatch(CARDS, byId("card-A"), "2026-07-22").moveReason).toBe("");
  });
});

describe("applyMoveOptimistic", () => {
  it("zeigt dieselbe Verschiebung, die buildMovePatch schreibt", () => {
    const patch = buildMovePatch(CARDS, byId("card-A"), "2026-07-29", "Regen");
    const optimistic = applyMoveOptimistic(CARDS, byId("card-A"), "2026-07-29", "Regen");
    expect(optimistic.date).toBe(patch.plannedDate);
    expect(optimistic.originalDate).toBe(patch.movedFromDate);
    expect(optimistic.week).toBe(patch.week);
    expect(optimistic.phase).toBe(patch.phase);
  });

  it("räumt den Ausfall-Zustand mit weg", () => {
    const cancelled = card({ id: "card-A", date: "2026-07-20", cancelled: true, cancelReason: "Krank" });
    const optimistic = applyMoveOptimistic(CARDS, cancelled, "2026-07-22");
    expect(optimistic.cancelled).toBeUndefined();
    expect(optimistic.cancelReason).toBeUndefined();
  });
});

describe("buildCancelPatch", () => {
  it("löscht Verschiebe-Daten mit, damit Rückgängig ein Klick bleibt", () => {
    const patch = buildCancelPatch("Krank");
    expect(patch.status).toBe("ausgefallen");
    expect(patch.cancelReason).toBe("Krank");
    expect(patch.movedFromDate).toBeNull();
    expect(patch.moveReason).toBeNull();
  });
});

describe("buildUndoPatch", () => {
  it("setzt eine ausgefallene Karte zurück auf geplant", () => {
    const cancelled = card({ id: "card-A", date: "2026-07-20", cancelled: true, cancelReason: "Krank" });
    expect(buildUndoPatch(CARDS, cancelled)).toEqual({ status: "geplant", cancelReason: null });
  });

  it("stellt bei einer verschobenen Karte das Ursprungsdatum wieder her", () => {
    const moved = card({ id: "card-A", date: "2026-07-22", originalDate: "2026-07-20" });
    const patch = buildUndoPatch(CARDS, moved)!;
    expect(patch.plannedDate).toBe("2026-07-20");
    expect(patch.movedFromDate).toBeNull();
    expect(patch.moveReason).toBeNull();
  });

  it("leiht week/phase der Ursprungswoche neu", () => {
    // card-A wurde nach KW30 gezogen und trägt jetzt dessen Label. card-C
    // steht weiter in KW29 — von dort kommt das Label zurück. Ohne das
    // bliebe die Karte nach Rückgängig unter der falschen Wochenüberschrift.
    const moved = card({
      id: "card-A",
      date: "2026-07-29",
      originalDate: "2026-07-20",
      week: "2026-KW30",
      phase: "Erholung",
    });
    const patch = buildUndoPatch([...CARDS, moved], moved)!;
    expect(patch.week).toBe("2026-KW29");
    expect(patch.phase).toBe("Sweet Spot");
  });

  it("liefert null, wenn es nichts rückgängig zu machen gibt", () => {
    expect(buildUndoPatch(CARDS, byId("card-A"))).toBeNull();
  });
});

describe("nextSortOrder", () => {
  it("zählt unter den Karten desselben Tages hoch", () => {
    const sameDay = [card({ id: "x", date: "2026-07-20", sortOrder: 0 }), card({ id: "y", date: "2026-07-20", sortOrder: 3 })];
    expect(nextSortOrder(sameDay, "2026-07-20")).toBe(4);
  });

  it("beginnt bei 0, wenn der Tag noch leer ist", () => {
    expect(nextSortOrder(CARDS, "2026-08-01")).toBe(0);
  });
});

describe("sortCards", () => {
  it("sortiert nach Datum, dann sort_order", () => {
    const unsorted = [
      card({ id: "spät", date: "2026-07-28" }),
      card({ id: "früh-2", date: "2026-07-20", sortOrder: 1 }),
      card({ id: "früh-1", date: "2026-07-20", sortOrder: 0 }),
    ];
    expect(sortCards(unsorted).map((c) => c.id)).toEqual(["früh-1", "früh-2", "spät"]);
  });

  it("lässt die Eingabe unangetastet", () => {
    const input = [card({ id: "b", date: "2026-07-28" }), card({ id: "a", date: "2026-07-20" })];
    sortCards(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
