import { describe, it, expect } from "vitest";
import { shiftPreview } from "./shift-plan-dialog-view-model";

const TODAY = "2026-09-03";
const CARDS = [
  { id: "past", date: "2026-09-01" },
  { id: "a", date: "2026-09-06", name: "Lange Ausfahrt" },
  { id: "b", date: "2026-09-13" },
  { id: "cx", date: "2026-09-20", cancelled: true },
];

describe("shiftPreview", () => {
  it("später +1: betroffene Karten + neuer Start, anwendbar", () => {
    const p = shiftPreview({ storedOffset: 0, direction: "later", weeks: 1, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.targetOffset).toBe(1);
    expect(p.deltaWeeks).toBe(1);
    expect(p.affectedCount).toBe(2); // past + cx raus
    expect(p.newStartDate).toBe("2026-09-13"); // 2026-09-06 + 7
    expect(p.canApply).toBe(true);
    expect(p.error).toBeNull();
  });

  it("0 Wochen → nicht anwendbar, kein Fehler", () => {
    const p = shiftPreview({ storedOffset: 2, direction: "later", weeks: 0, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.canApply).toBe(false);
    expect(p.error).toBeNull();
  });

  it("früher, sodass eine Karte vor heute läge → blockiert mit Grund", () => {
    const p = shiftPreview({ storedOffset: 0, direction: "earlier", weeks: 1, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.canApply).toBe(false);
    expect(p.error).toMatch(/vor heute/);
  });

  it("Ziel außerhalb -8…12 → blockiert", () => {
    const p = shiftPreview({ storedOffset: 10, direction: "later", weeks: 5, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.targetOffset).toBe(15);
    expect(p.canApply).toBe(false);
    expect(p.error).toMatch(/zulässigen Bereich/);
  });

  it("keine künftigen Karten → blockiert mit Grund", () => {
    const p = shiftPreview({ storedOffset: 0, direction: "later", weeks: 1, cards: [{ id: "past", date: "2026-01-01" }], todayISO: TODAY, athleteId: "athlete4" });
    expect(p.canApply).toBe(false);
    expect(p.error).toMatch(/Keine künftigen/);
  });
});
