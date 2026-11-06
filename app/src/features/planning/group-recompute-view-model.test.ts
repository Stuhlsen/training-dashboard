/* Tests: features/planning/group-recompute-view-model.ts — Fahrplan 44 E6.
   „Plan anpassen" für verknüpfte Pläne: Verteilung über allocateWeek, wer
   betroffen ist, Stunden, Ziel-FTP nur fürs Rad, Rechenfehler. generatePlan()
   ist ersetzt (deterministische Karten je Trainingstag); die Verteilung
   (allocateWeek) läuft echt. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanCard, TrainingPlan, WeekModelEntry } from "../../api/types";

const generateMock = vi.fn();
vi.mock("../../core/plan-generator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/plan-generator.js")>()),
  generatePlan: (input: unknown) => generateMock(input),
}));

const { buildGroupRecompute, isGroupRecompute } = await import("./group-recompute-view-model");

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function fakeGenerate(input: {
  sport?: string;
  regenerateFrom: string;
  trainingWeekdays: number[];
  ftpTarget?: number | null;
}) {
  const start = input.regenerateFrom;
  return {
    weeks: [
      {
        index: 0,
        isoWeek: "2026-KW41",
        start,
        end: addDays(start, 6),
        phase: "Grundlage",
        targetTss: 100,
        isRecovery: false,
        cards: input.trainingWeekdays.map((d) => ({
          date: addDays(start, d - 1),
          name: `${input.sport}-${d}`,
          typ: "Z2",
          phase: "Grundlage",
          isoWeek: "2026-KW41",
          tssPlanned: 50,
          durationMin: 60,
          km: null,
          workout: null,
          workoutStructure: null,
          isQuality: false,
          isTest: false,
        })),
      },
    ],
    weekModel: [
      {
        week: "2026-KW41",
        phase: "Grundlage",
        start,
        end: addDays(start, 6),
        trainingWeekdays: input.trainingWeekdays,
        targetTss: 100,
      },
    ],
    ftpTarget: input.ftpTarget ?? null,
    warnings: [],
  };
}

beforeEach(() => {
  generateMock.mockReset();
  generateMock.mockImplementation(fakeGenerate);
});

const wm = (start: string, days: number[]): WeekModelEntry => ({
  week: start,
  phase: "Grundlage",
  start,
  end: addDays(start, 6),
  trainingWeekdays: days,
  targetTss: 100,
});

function plan(sport: "ride" | "run" | "swim", days: number[], over: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: `plan-${sport}`,
    athleteId: "prof-a",
    createdBy: "prof-a",
    isActive: true,
    mode: "open",
    goalEventId: null,
    startDate: "2026-09-28",
    endDate: "2026-11-22",
    weeks: 8,
    model: "pyramidal",
    focus: "allgemein",
    level: "fortgeschritten",
    trainingWeekdays: days,
    weeklyHours: sport === "ride" ? 6 : 3,
    indoorShare: null,
    ftpAtCreation: sport === "ride" ? 190 : null,
    ftpTarget: sport === "ride" ? 210 : null,
    sport,
    thresholdSpeedAtCreation: sport === "ride" ? null : 10,
    thresholdSpeedTarget: null,
    planGroupId: "grp-1",
    params: {},
    weekModel: [wm("2026-09-28", days), wm("2026-10-05", days), wm("2026-10-12", days), wm("2026-10-19", days)],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

const ride = () => plan("ride", [2, 4, 6]);
const run = () => plan("run", [1, 3, 7]);

const card = (sport: "ride" | "run", date: string, tss: number): PlanCard =>
  ({ id: `${sport}-${date}`, date, sport, name: "x", typ: "Z2", durationMin: 60, tssPlanned: tss }) as PlanCard;

const base = {
  todayISO: "2026-10-07", // Mittwoch; Rest-Start Montag 2026-10-05
  athleteDefaults: { ftpMeasured: 205, ftpMeasuredDate: "2026-09-30", eFTP: 200 },
  history: {},
  currentThresholdSpeed: { run: 10 },
  goalProfiles: {},
  formats: [],
  existingCards: [] as PlanCard[],
  edits: {},
};

function build(over: Record<string, unknown> = {}) {
  return buildGroupRecompute({
    plans: [ride(), run()],
    callerSport: "ride",
    selected: ["ride", "run"],
    ...base,
    ...over,
  } as Parameters<typeof buildGroupRecompute>[0]);
}

const sentTo = (sport: string) =>
  generateMock.mock.calls
    .map((c) => c[0] as { sport: string; trainingWeekdays: number[]; weeklyHours: number })
    .filter((i) => i.sport === sport);

describe("isGroupRecompute", () => {
  it("gilt erst ab zwei aktiven Plänen — ein Plan verhält sich wie ohne Gruppe", () => {
    expect(isGroupRecompute([ride()])).toBe(false);
    expect(isGroupRecompute([ride(), run()])).toBe(true);
    expect(isGroupRecompute([])).toBe(false);
    expect(isGroupRecompute([ride(), { ...run(), isActive: false }])).toBe(false);
  });
});

describe("buildGroupRecompute — Reihenfolge und Betroffene", () => {
  it("setzt die Sportart des aufrufenden Plans nach vorn", () => {
    const res = build({ callerSport: "run" });
    expect(res.ok && res.items.map((i) => i.sport)).toEqual(["run", "ride"]);
  });

  it("ohne Änderung werden alle gewählten Sportarten neu gerechnet (Auffrischen wie heute)", () => {
    const res = build();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.refreshMode).toBe(true);
    expect([...res.affectedSports].sort()).toEqual(["ride", "run"]);
  });

  it("eine Änderung nur am Laufen lässt das Rad unangetastet — nicht einmal gerechnet", () => {
    const res = build({ edits: { run: { weekdays: [1, 3, 5] } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.refreshMode).toBe(false);
    expect(res.affectedSports).toEqual(["run"]);
    expect(sentTo("ride")).toHaveLength(0);
    const rideItem = res.items.find((i) => i.sport === "ride");
    expect(rideItem?.affected).toBe(false);
    expect(rideItem?.patch).toBeUndefined();
  });

  it("Rad-Tage ändern: Laufen passt sich an, der harte Tag bleibt allein (M3, M4)", () => {
    const res = build({ edits: { ride: { weekdays: [2, 4, 7] } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("ride")[0].trainingWeekdays).toEqual([2, 4, 7]);
    // Laufen wollte Mo/Mi/So; der Sonntag ist ein harter Radtag und bleibt dem Rad.
    expect(sentTo("run")[0].trainingWeekdays).toEqual([1, 3]);
    expect(res.hints.some((h) => h.sport === "run" && h.code === "DAYS_SHORT")).toBe(true);
    expect([...res.affectedSports].sort()).toEqual(["ride", "run"]);
  });
});

describe("buildGroupRecompute — Abwählen", () => {
  it("eine abgewählte Sportart wird weder gerechnet noch geschrieben", () => {
    const res = build({ selected: ["ride"], edits: { ride: { ftpTarget: 230 } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("run")).toHaveLength(0);
    const runItem = res.items.find((i) => i.sport === "run");
    expect(runItem).toMatchObject({ selected: false, affected: false });
    expect(runItem?.patch).toBeUndefined();
    expect(res.affectedSports).toEqual(["ride"]);
  });

  it("die Tage einer abgewählten Sportart gelten als belegt", () => {
    // Rad (abgewählt) liegt auf Di/Do/Sa; sein harter Tag bleibt dem Rad.
    const res = build({ selected: ["run"], edits: { run: { weekdays: [2, 3, 5] } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("run")[0].trainingWeekdays).toEqual([3, 5]);
  });

  it("ohne gewählte Sportart: Fehler statt Schreiben", () => {
    const res = build({ selected: [] });
    expect(res.ok).toBe(false);
  });
});

describe("buildGroupRecompute — Stunden, Ziel-FTP, Ziele", () => {
  it("Stunden bleiben je Sportart erhalten und werden nur bei Änderung in die Zeile geschrieben", () => {
    const res = build({ edits: { run: { hours: 4 } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("run")[0].weeklyHours).toBe(4);
    expect(res.items.find((i) => i.sport === "run")?.patch?.weeklyHours).toBe(4);
    expect(res.affectedSports).toEqual(["run"]);
  });

  it("ohne Stundenänderung bleibt weeklyHours im Patch leer, der Generator bekommt die Stunden des Plans", () => {
    const res = build({ edits: { run: { weekdays: [1, 3, 5] } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("run")[0].weeklyHours).toBe(3);
    expect(res.items.find((i) => i.sport === "run")?.patch?.weeklyHours).toBeUndefined();
  });

  it("Ziel-FTP gilt nur fürs Rad", () => {
    const res = build({ edits: { ride: { ftpTarget: 230 }, run: { ftpTarget: 999, weekdays: [1, 3, 5] } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("ride")[0]).toMatchObject({ ftpTarget: 230 });
    expect(sentTo("run")[0]).toMatchObject({ ftpTarget: null });
    expect(res.items.find((i) => i.sport === "ride")?.patch?.ftpTarget).toBe(230);
    expect(res.items.find((i) => i.sport === "run")?.patch?.ftpTarget).toBeUndefined();
  });

  it("das Ziel-Profil wirkt je Sportart und macht die Sportart zur betroffenen", () => {
    const goal = { level: "einsteiger", ramp: "sanft" };
    const res = build({ goalProfiles: { run: goal } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(sentTo("run")[0]).toMatchObject({ goalProfile: goal });
    expect(sentTo("ride")).toHaveLength(0);
    expect(res.affectedSports).toEqual(["run"]);
  });
});

describe("buildGroupRecompute — Fehler und Vorschau", () => {
  it("scheitert generatePlan bei einer Sportart, ist das Ergebnis ein Fehler mit Sportart", () => {
    generateMock.mockImplementation(
      (input: { sport: string; regenerateFrom: string; trainingWeekdays: number[] }) => {
        if (input.sport === "run") throw new Error("kaputt");
        return fakeGenerate(input);
      },
    );
    const res = build();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toContain("Laufen");
    expect(res.reason).toContain("kaputt");
  });

  it("bleiben nach der Verteilung weniger als zwei Tage, erklärt der Fehler es", () => {
    // Rad belegt Mo, Di, Mi, So (alle harten Tage zählen für Laufen als belegt).
    const res = build({ edits: { ride: { weekdays: [1, 2, 3, 7] }, run: { weekdays: [1, 3] } } });
    if (!res.ok) expect(res.reason).toMatch(/Laufen.*zwei/);
    else expect(sentTo("run")[0].trainingWeekdays.length).toBeGreaterThanOrEqual(2);
  });

  it("Vorschau: jede Sportart eine Lastzeile plus Summe als Näherung; unberührte Sportarten aus ihren echten Karten", () => {
    const res = build({
      edits: { run: { weekdays: [1, 3, 5] } },
      existingCards: [card("ride", "2026-10-06", 80), card("ride", "2026-10-08", 70)],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rows = res.load.rows;
    expect(rows.map((r) => r.sport)).toEqual(["ride", "run"]);
    expect(rows[0].values[0]).toBe(150); // Rad: echte Karten
    expect(rows[1].values[0]).toBe(150); // Laufen: 3 Karten à 50 aus der Vorschau
    expect(res.load.total[0]).toBe(300);
    expect(res.load.totalLabel).toContain("Näherung");
    expect(res.grid.map((g) => g.sport)).toEqual(["ride", "run"]);
  });

  it("der Patch einer betroffenen Sportart kommt aus dem geteilten Baustein", () => {
    const res = build({ edits: { run: { weekdays: [1, 3, 5] } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const patch = res.items.find((i) => i.sport === "run")?.patch;
    expect(patch?.trainingWeekdays).toEqual([1, 3, 5]);
    expect(patch?.weekModel).toHaveLength(1);
    expect(res.replaceFrom).toBe("2026-10-07");
    expect(res.regenerateFromISO).toBe("2026-10-05");
  });
});
