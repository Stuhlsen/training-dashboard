import { describe, expect, it } from "vitest";
import { flattenPlanCards, trainingPlanDraft } from "./plan-persist";
import type {
  GeneratedPlan,
  NewPlanFormState,
  PlanGeneratorInput,
} from "./new-plan-dialog-view-model";

function card(over: Partial<GeneratedPlan["weeks"][number]["cards"][number]> = {}) {
  return {
    date: "2026-09-07",
    name: "Sweet Spot 3×12",
    typ: "SS Intervalle",
    phase: "Sweet Spot",
    isoWeek: "2026-KW37",
    tssPlanned: 78,
    durationMin: 75,
    km: null,
    workout: { pct: [88, 94] },
    workoutStructure: { version: 1, steps: [] },
    isQuality: true,
    isTest: false,
    ...over,
  };
}

function week(over: Partial<GeneratedPlan["weeks"][number]> = {}): GeneratedPlan["weeks"][number] {
  return {
    index: 0,
    isoWeek: "2026-KW37",
    start: "2026-09-07",
    end: "2026-09-13",
    phase: "Sweet Spot",
    targetTss: 320,
    isRecovery: false,
    cards: [card()],
    ...over,
  };
}

const PLAN: GeneratedPlan = {
  weeks: [
    week({
      index: 0,
      cards: [
        card({ date: "2026-09-08", name: "Q1", isoWeek: "2026-KW37" }),
        card({ date: "2026-09-08", name: "Q1 Zusatz", isQuality: false }),
        card({ date: "2026-09-10", name: "Q2" }),
      ],
    }),
    week({
      index: 1,
      isoWeek: "2026-KW38",
      start: "2026-09-14",
      end: "2026-09-20",
      cards: [card({ date: "2026-09-15", name: "W2 Q1", isoWeek: "2026-KW38" })],
    }),
  ],
  weekModel: [{ week: "2026-KW37", phase: "Sweet Spot" }],
  ftpTarget: 210,
  warnings: ["Woche 2: CTL-Rampe am oberen Limit (7.6)"],
};

const FORM: NewPlanFormState = {
  mode: "open",
  eventId: "",
  newEventDate: "",
  newEventName: "",
  weeks: 12,
  startDate: "2026-09-07",
  trainingWeekdays: [2, 4, 6],
  weeklyHours: 6,
  currentFtp: 193,
  ftpMeasuredDate: "2026-06-01",
  ftpTarget: null,
  indoorPct: 40,
  focus: "allgemein",
  level: "fortgeschritten",
  model: "pyramidal",
};

const INPUT: PlanGeneratorInput = {
  startDate: "2026-09-07",
  mode: "open",
  weeks: 12,
  trainingWeekdays: [2, 4, 6],
  weeklyHours: 6,
  currentFtp: 193,
  ftpMeasuredDate: "2026-06-01",
  ftpTarget: null,
  indoorShare: 0.4,
  focus: "allgemein",
  level: "fortgeschritten",
  model: "pyramidal",
  history: { weeklyActualTss: [300, 320], currentCtl: 45 },
};

describe("flattenPlanCards", () => {
  it("flacht alle Karten aller Wochen ab", () => {
    expect(flattenPlanCards(PLAN)).toHaveLength(4);
  });

  it("vergibt sortOrder je Tag 0-basiert und beginnt an jedem neuen Datum wieder bei 0", () => {
    const rows = flattenPlanCards(PLAN);
    const byDate = (d: string) => rows.filter((r) => r.date === d).map((r) => r.sortOrder);
    expect(byDate("2026-09-08")).toEqual([0, 1]);
    expect(byDate("2026-09-10")).toEqual([0]);
    expect(byDate("2026-09-15")).toEqual([0]);
  });

  it("mappt isoWeek -> week und reicht workout/phase/tss durch", () => {
    const [first] = flattenPlanCards(PLAN);
    expect(first.week).toBe("2026-KW37");
    expect(first.phase).toBe("Sweet Spot");
    expect(first.tssPlanned).toBe(78);
    expect(first.durationMin).toBe(75);
    expect(first.km).toBeNull();
    expect(first.workout).toEqual({ pct: [88, 94] });
    expect(first.workoutStructure).toEqual({ version: 1, steps: [] });
  });
});

describe("trainingPlanDraft", () => {
  it("nimmt Wochenzahl und Enddatum aus den erzeugten Wochen", () => {
    const d = trainingPlanDraft(INPUT, FORM, PLAN, null);
    expect(d.weeks).toBe(2);
    expect(d.endDate).toBe("2026-09-20");
    expect(d.startDate).toBe("2026-09-07");
  });

  it("übernimmt FTP-Werte und das Ziel-Event, hält das Formular in params", () => {
    const d = trainingPlanDraft(INPUT, FORM, PLAN, "event-123");
    expect(d.ftpAtCreation).toBe(193);
    expect(d.ftpTarget).toBe(210);
    expect(d.goalEventId).toBe("event-123");
    expect(d.indoorShare).toBe(0.4);
    expect((d.params.form as NewPlanFormState).trainingWeekdays).toEqual([2, 4, 6]);
    expect(d.params.history).toEqual({ weeklyActualTss: [300, 320], currentCtl: 45 });
    expect(d.params.warnings).toEqual(PLAN.warnings);
    expect(d.weekModel).toEqual([{ week: "2026-KW37", phase: "Sweet Spot" }]);
  });

  it("fällt bei leeren Wochen auf das Event-Datum zurück", () => {
    const d = trainingPlanDraft(
      { ...INPUT, mode: "event", eventDate: "2026-12-06" },
      FORM,
      { ...PLAN, weeks: [] },
      "e1",
    );
    expect(d.weeks).toBe(0);
    expect(d.endDate).toBe("2026-12-06");
  });

  it("nimmt trainingWeekdays aus dem weekModel des Generators (nicht dem Rohformular)", () => {
    // Generator hat bei schwacher Planerfüllung einen Tag rausgeworfen:
    // weekModel trägt [2, 4], das Formular noch [2, 4, 6].
    const d = trainingPlanDraft(
      INPUT,
      FORM,
      { ...PLAN, weekModel: [{ week: "2026-KW37", trainingWeekdays: [2, 4] }] },
      null,
    );
    expect(d.trainingWeekdays).toEqual([2, 4]);
    // Rohformular bleibt in params erhalten (Reproduzierbarkeit).
    expect((d.params.form as NewPlanFormState).trainingWeekdays).toEqual([2, 4, 6]);
  });

  it("fällt auf die Formular-Wochentage zurück, wenn das weekModel keine trägt", () => {
    const d = trainingPlanDraft(INPUT, FORM, PLAN, null);
    expect(d.trainingWeekdays).toEqual([2, 4, 6]);
  });
});
