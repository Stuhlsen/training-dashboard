/* Tests: trainer-goals-view-model.ts — Fahrplan 43 E7 (Z6, Z8).
 * Die Trainer-Ansicht bekommt Haupt- und Nebenziel mit Datum und den Ziel-Check,
 * aber nie Gewichtswerte: kein Tempo, kein Zielgewicht, kein Defizit. */

import { describe, expect, it } from "vitest";
import type { Goal } from "../../api/types";
import { buildTrainerGoalsView, TRAINER_GOALS_EMPTY_TEXT } from "./trainer-goals-view-model";

const TODAY = "2026-11-05";

function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    kind: "x",
    targetValue: null,
    targetDate: null,
    note: null,
    isActive: true,
    goalKey: null,
    role: null,
    ...over,
  };
}

/** Steigende eFTP über die letzten Wochen — genug Daten für den Check. */
const HISTORY = Array.from({ length: 8 }, (_, i) => ({
  date: `2026-${i < 4 ? "09" : "10"}-${String(1 + (i % 4) * 7).padStart(2, "0")}`,
  eftp: 200 + i * 2,
}));

const ftp = goal({
  id: "g1",
  kind: "FTP",
  goalKey: "ftp",
  role: "main",
  targetValue: 232,
  targetDate: "2026-12-20",
});
const bergauf = goal({ id: "g2", kind: "Besser bergauf", goalKey: "bergauf", role: "side" });

describe("buildTrainerGoalsView", () => {
  it("zeigt Haupt- und Nebenziel mit Datum, Hauptziel zuerst", () => {
    const view = buildTrainerGoalsView({ goals: [bergauf, ftp], current: 214, history: HISTORY, todayISO: TODAY });
    expect(view.emptyText).toBeNull();
    expect(view.cards.map((c) => [c.roleLabel, c.title])).toEqual([
      ["Hauptziel", "FTP steigern"],
      ["Nebenziel", "Besser bergauf"],
    ]);
    expect(view.cards[0].dateText).toBe("20.12.2026");
    expect(view.cards[0].valueText).toBe("232 W");
  });

  it("hängt den Ziel-Check an das FTP-Ziel, nicht an andere Ziele", () => {
    const view = buildTrainerGoalsView({ goals: [ftp, bergauf], current: 214, history: HISTORY, todayISO: TODAY });
    expect(view.cards[0].check).not.toBeNull();
    expect(view.cards[1].check).toBeNull();
  });

  it("ohne aktuelle FTP sagt der Check offen, was fehlt", () => {
    const view = buildTrainerGoalsView({ goals: [ftp], current: null, history: HISTORY, todayISO: TODAY });
    expect(view.cards[0].check?.kind).toBe("needs-current");
  });

  it("zeigt Freitext-Altziele ohne Rolle nicht; ohne Haupt-/Nebenziel steht ein ruhiger Leer-Text", () => {
    const legacy = goal({ id: "g3", kind: "Irgendwas" });
    const view = buildTrainerGoalsView({ goals: [legacy], current: null, history: [], todayISO: TODAY });
    expect(view.cards).toEqual([]);
    expect(view.emptyText).toBe(TRAINER_GOALS_EMPTY_TEXT);
  });

  it("Z6: ein Fett-verlieren-Ziel zeigt keinen Zielwert, auch wenn einer am Ziel hängt", () => {
    const fat = goal({
      id: "g4",
      kind: "Fett verlieren",
      goalKey: "fett_verlieren",
      role: "side",
      targetValue: 70,
    });
    const view = buildTrainerGoalsView({ goals: [ftp, fat], current: 214, history: HISTORY, todayISO: TODAY });
    const card = view.cards[1];
    expect(card.title).toBe("Fett verlieren");
    expect(card.valueText).toBe("");
    expect(card.check).toBeNull();
    expect(JSON.stringify(card)).not.toMatch(/70|kg/);
  });

  it("Z6: die Ansicht enthält nur feste Felder, nie Tempo, Zielgewicht, Defizit oder Boden", () => {
    const view = buildTrainerGoalsView({ goals: [ftp, bergauf], current: 214, history: HISTORY, todayISO: TODAY });
    expect(Object.keys(view).sort()).toEqual(["cards", "emptyText"]);
    for (const card of view.cards) {
      expect(Object.keys(card).sort()).toEqual(["check", "dateText", "id", "roleLabel", "title", "valueText"]);
    }
    expect(JSON.stringify(view)).not.toMatch(/kg|Tempo pro|Zielgewicht|Defizit|Boden|kcal|Ernährung/i);
  });
});
