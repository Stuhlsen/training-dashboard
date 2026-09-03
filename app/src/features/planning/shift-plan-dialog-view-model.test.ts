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
  it("+1: betroffene Karten + neuer Start, anwendbar", () => {
    const p = shiftPreview({ storedOffset: 0, weeks: 1, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.targetOffset).toBe(1);
    expect(p.deltaWeeks).toBe(1);
    expect(p.affectedCount).toBe(2); // past + cx raus
    expect(p.newStartDate).toBe("2026-09-13"); // 2026-09-06 + 7
    expect(p.canApply).toBe(true);
    expect(p.error).toBeNull();
  });

  it("0 Wochen → nicht anwendbar, kein Fehler", () => {
    const p = shiftPreview({ storedOffset: 2, weeks: 0, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.canApply).toBe(false);
    expect(p.error).toBeNull();
  });

  it("addiert auf den bereits gespeicherten Offset", () => {
    const p = shiftPreview({ storedOffset: 3, weeks: 2, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.targetOffset).toBe(5);
    expect(p.deltaWeeks).toBe(2);
  });

  it("Gesamt-Offset über dem Maximum → blockiert", () => {
    const p = shiftPreview({ storedOffset: 10, weeks: 5, cards: CARDS, todayISO: TODAY, athleteId: "athlete4" });
    expect(p.targetOffset).toBe(15);
    expect(p.canApply).toBe(false);
    expect(p.error).toMatch(/maximal/);
  });

  it("keine künftigen Karten → blockiert mit Grund", () => {
    const p = shiftPreview({ storedOffset: 0, weeks: 1, cards: [{ id: "past", date: "2026-01-01" }], todayISO: TODAY, athleteId: "athlete4" });
    expect(p.canApply).toBe(false);
    expect(p.error).toMatch(/Keine künftigen/);
  });
});
