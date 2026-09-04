/* Tests: features/planning/recompute-plan-view-model.ts — Fahrplan 8 E13.
   Reine Ableitung des `PlanGeneratorInput` für „Rest neu berechnen": Startwoche
   = Montag der laufenden KW, baseWeekModel durchgereicht, „nichts mehr zu
   rechnen"-Fälle. */

import { describe, expect, it } from "vitest";
import { buildRecomputeInput } from "./recompute-plan-view-model";
import type { TrainingPlan, WeekModelEntry } from "../../api/types";

function wm(start: string, phase: string, targetTss: number): WeekModelEntry {
  return { week: start, phase, start, end: start, trainingWeekdays: [2, 4, 6], targetTss };
}

function plan(over: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: "tp1",
    athleteId: "prof-a",
    createdBy: "prof-a",
    isActive: true,
    mode: "open",
    goalEventId: null,
    startDate: "2026-09-07",
    endDate: "2026-11-15",
    weeks: 8,
    model: "pyramidal",
    focus: "allgemein",
    level: "fortgeschritten",
    trainingWeekdays: [2, 4, 6],
    weeklyHours: 6,
    indoorShare: 0.4,
    ftpAtCreation: 190,
    ftpTarget: 210,
    params: {},
    weekModel: [
      wm("2026-09-07", "Grundlage", 300),
      wm("2026-09-14", "Grundlage", 330),
      wm("2026-09-21", "Sweet Spot", 360),
      wm("2026-09-28", "Erholung", 180),
      wm("2026-10-05", "Schwelle", 380),
      wm("2026-10-12", "Schwelle", 400),
      wm("2026-10-19", "VO2max", 410),
      wm("2026-10-26", "VO2max", 420),
    ],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const defaults = { ftpMeasured: 205, ftpMeasuredDate: "2026-09-30", eFTP: 200 };

describe("buildRecomputeInput", () => {
  it("Startwoche = Montag der laufenden KW, baseWeekModel + regenerateFrom gesetzt", () => {
    const res = buildRecomputeInput({
      plan: plan(),
      history: { weeklyActualTss: [] },
      todayISO: "2026-10-07", // Mittwoch
      athleteDefaults: defaults,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.regenerateFromISO).toBe("2026-10-05");
    expect(res.affectedWeeks).toBe(4); // Wochen ab 2026-10-05
    expect(res.input.regenerateFrom).toBe("2026-10-05");
    expect(res.input.baseWeekModel).toHaveLength(8);
    expect(res.input.startDate).toBe("2026-09-07");
    // aktuelle FTP schlägt den Erstell-Stand
    expect(res.input.currentFtp).toBe(205);
    expect(res.input.ftpMeasuredDate).toBe("2026-09-30");
    // Ziel-FTP des Ur-Plans bleibt
    expect(res.input.ftpTarget).toBe(210);
  });

  it("event-Modus: eventDate = plan.endDate", () => {
    const res = buildRecomputeInput({
      plan: plan({ mode: "event", endDate: "2026-10-26" }),
      history: {},
      todayISO: "2026-10-07",
      athleteDefaults: defaults,
    });
    expect(res.ok && res.input.eventDate).toBe("2026-10-26");
  });

  it("fällt auf ftpAtCreation zurück, wenn keine aktuelle FTP vorliegt", () => {
    const res = buildRecomputeInput({
      plan: plan(),
      history: {},
      todayISO: "2026-10-07",
      athleteDefaults: { ftpMeasured: null, ftpMeasuredDate: null, eFTP: null },
    });
    expect(res.ok && res.input.currentFtp).toBe(190);
  });

  it("kein Wochenmodell → ok:false", () => {
    const res = buildRecomputeInput({
      plan: plan({ weekModel: [] }),
      history: {},
      todayISO: "2026-10-07",
      athleteDefaults: defaults,
    });
    expect(res.ok).toBe(false);
  });

  it("alle Wochen vor der laufenden KW → ok:false (nichts zu rechnen)", () => {
    const res = buildRecomputeInput({
      plan: plan(),
      history: {},
      todayISO: "2027-01-06",
      athleteDefaults: defaults,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/Restwochen/);
  });
});
