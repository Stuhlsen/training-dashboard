/* Tests: add-sport-view-model.ts — „Sportart hinzufügen" in „Plan anpassen"
 * (Fahrplan 44 E5). Reine Logik; generatePlan() und allocateWeek() laufen echt. */

import { describe, expect, it } from "vitest";
import {
  ADD_SPORT_DEFAULT_START_OFFSET_DAYS,
  LOAD_JUMP_WARN_PCT,
  MIN_ADD_SPORT_WEEKS,
  addSportDuration,
  addSportOptions,
  buildAddSportPreview,
  gentleStart,
  hasTrainingHistory,
  loadJump,
  nextMondayISO,
  thresholdNote,
  withoutEmptyHistory,
} from "./add-sport-view-model";
import { MAX_PLAN_WEEKS } from "./new-plan-dialog-view-model";
import { addDaysISO } from "../../core/format.js";
import type { PlanCard, TrainingPlan } from "../../api/types";

const TODAY = "2026-11-05"; // Donnerstag
const NEXT_MONDAY = "2026-11-09";

const noProfile = { ramp: null, level: null } as never;

function ridePlan(over: Partial<TrainingPlan> = {}): TrainingPlan {
  return {
    id: "plan-ride",
    athleteId: "prof-a",
    createdBy: "prof-a",
    isActive: true,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    mode: "open",
    goalEventId: null,
    startDate: "2026-09-07",
    endDate: "2027-01-31",
    weeks: 21,
    model: "pyramidal",
    focus: "allgemein",
    level: "fortgeschritten",
    trainingWeekdays: [2, 4, 6],
    weeklyHours: 6,
    indoorShare: null,
    ftpAtCreation: 200,
    ftpTarget: 210,
    sport: "ride",
    thresholdSpeedAtCreation: null,
    thresholdSpeedTarget: null,
    planGroupId: null,
    params: { form: { fixedDays: [{ weekday: 6, typ: "Gruppenfahrt", keepInRecoveryWeek: false }] } },
    weekModel: [],
    ...over,
  } as TrainingPlan;
}

/** Radkarten Di/Do/Sa mit je 60 TSS über 14 Wochen ab dem nächsten Montag. */
function rideCards(): PlanCard[] {
  const cards: PlanCard[] = [];
  for (let w = 0; w < 14; w++) {
    for (const offset of [1, 3, 5]) {
      cards.push({
        id: `c-${w}-${offset}`,
        date: addDaysISO(NEXT_MONDAY, w * 7 + offset),
        tssPlanned: 60,
        sport: "ride",
      } as PlanCard);
    }
  }
  return cards;
}

describe("nextMondayISO", () => {
  it("Donnerstag → Montag der nächsten Woche", () => {
    expect(nextMondayISO("2026-11-05")).toBe("2026-11-09");
  });
  it("Montag → Montag nächster Woche, nicht heute", () => {
    expect(nextMondayISO("2026-11-09")).toBe("2026-11-16");
  });
  it("Sonntag → der Montag direkt danach", () => {
    expect(nextMondayISO("2026-11-08")).toBe("2026-11-09");
  });
  it("Dienstag → nächster Montag", () => {
    expect(nextMondayISO("2026-11-10")).toBe("2026-11-16");
  });
  it("benennt den Versatz als Konstante", () => {
    expect(ADD_SPORT_DEFAULT_START_OFFSET_DAYS).toBe(7);
  });
});

describe("addSportDuration", () => {
  it("richtet sich nach dem Ende des laufenden Plans", () => {
    const d = addSportDuration("2026-11-09", "2027-01-31");
    expect(d).toMatchObject({ weeks: 12, usedMinimum: false, cappedAtMax: false });
  });
  it("greift auf den benannten Mindestwert zurück, wenn der Plan bald endet", () => {
    const d = addSportDuration("2026-11-09", "2026-11-22");
    expect(d.weeks).toBe(MIN_ADD_SPORT_WEEKS);
    expect(d.usedMinimum).toBe(true);
  });
  it("Plan endet vor dem Start → Mindestwert", () => {
    expect(addSportDuration("2026-11-09", "2026-11-01")).toMatchObject({
      weeks: MIN_ADD_SPORT_WEEKS,
      usedMinimum: true,
    });
  });
  it("deckelt an der Höchstlänge", () => {
    const d = addSportDuration("2026-11-09", "2030-01-01");
    expect(d.weeks).toBe(MAX_PLAN_WEEKS);
    expect(d.cappedAtMax).toBe(true);
  });
});

describe("addSportOptions", () => {
  it("bietet Sportarten aus dem Profil ohne aktiven Plan an", () => {
    expect(addSportOptions(["ride", "run"], ["ride"])).toEqual({
      offered: ["run"],
      missingInProfile: ["swim"],
      outranked: [],
    });
  });
  it("nennt Sportarten, die im Profil fehlen, statt sie wegzulassen", () => {
    const o = addSportOptions(["ride"], ["ride"]);
    expect(o.offered).toEqual([]);
    expect(o.missingInProfile).toEqual(["run", "swim"]);
  });
  it("Sportart mit Vorrang vor einem laufenden Plan wird nicht angeboten, aber benannt", () => {
    const o = addSportOptions(["ride", "run"], ["run"]);
    expect(o.offered).toEqual([]);
    expect(o.outranked).toEqual(["ride"]);
  });
  it("Schwimmen nach Rad und Laufen ist möglich", () => {
    expect(addSportOptions(["ride", "run", "swim"], ["ride", "run"]).offered).toEqual(["swim"]);
  });
});

describe("gentleStart", () => {
  const goalGentle = { level: "einsteiger", ramp: "sanft", lowStartVolume: true } as never;
  it("Ziel „Laufen starten“ → sanft, Grund Ziel", () => {
    const r = gentleStart({ sport: "run", goalProfile: goalGentle, hasEarlierPlan: true, hasHistory: true });
    expect(r).toMatchObject({ gentle: true, reason: "goal" });
  });
  it("ohne Ziel, ohne früheren Plan, ohne Historie → sanft (Profil aus core/goals, keine zweite Rampe)", () => {
    const r = gentleStart({ sport: "run", goalProfile: noProfile, hasEarlierPlan: false, hasHistory: false });
    expect(r).toMatchObject({ gentle: true, reason: "no-history" });
    expect(r.profile).toMatchObject({ level: "einsteiger", ramp: "sanft", lowStartVolume: true });
  });
  it("ohne Ziel, aber mit früherem Laufplan → nicht sanft", () => {
    const r = gentleStart({ sport: "run", goalProfile: noProfile, hasEarlierPlan: true, hasHistory: false });
    expect(r.gentle).toBe(false);
  });
  it("ohne Ziel, aber mit Lauf-Historie → nicht sanft", () => {
    const r = gentleStart({ sport: "run", goalProfile: noProfile, hasEarlierPlan: false, hasHistory: true });
    expect(r.gentle).toBe(false);
  });
  it("Schwimmen ist nie automatisch sanft", () => {
    const r = gentleStart({ sport: "swim", goalProfile: noProfile, hasEarlierPlan: false, hasHistory: false });
    expect(r.gentle).toBe(false);
  });
});

describe("hasTrainingHistory / withoutEmptyHistory", () => {
  it("nur Nullwochen zählen nicht als Historie (Aggregat ohne Fahrten dieser Sportart)", () => {
    expect(hasTrainingHistory({ weeklyActualTss: [0, 0, 0, 0] })).toBe(false);
  });
  it("leer oder fehlend: keine Historie", () => {
    expect(hasTrainingHistory({ weeklyActualTss: [] })).toBe(false);
    expect(hasTrainingHistory(null)).toBe(false);
  });
  it("eine Woche mit Last: Historie vorhanden", () => {
    expect(hasTrainingHistory({ weeklyActualTss: [0, 0, 35] })).toBe(true);
  });
  it("macht aus einer Nullhistorie eine leere, damit der Generator seinen Level-Startwert nimmt", () => {
    const h = withoutEmptyHistory({ weeklyActualTss: [0, 0, 0], currentThresholdSpeed: 11 }) as {
      weeklyActualTss: number[];
      currentThresholdSpeed: number;
    };
    expect(h.weeklyActualTss).toEqual([]);
    expect(h.currentThresholdSpeed).toBe(11);
  });
  it("lässt echte Historie unverändert", () => {
    const real = { weeklyActualTss: [10, 20] };
    expect(withoutEmptyHistory(real)).toBe(real);
  });
});

describe("thresholdNote", () => {
  it("fehlt die Schwellen-Geschwindigkeit, steht das offen da", () => {
    expect(thresholdNote("run", null)).toMatch(/Pace-Vorgaben/);
  });
  it("mit Wert: kein Hinweis", () => {
    expect(thresholdNote("run", 12)).toBeNull();
  });
  it("beim Rad nie", () => {
    expect(thresholdNote("ride", null)).toBeNull();
  });
});

describe("loadJump", () => {
  it("warnt ab der benannten Schwelle, ruhig formuliert, ohne Sperre, mit Hinweis auf die fehlende Eichung", () => {
    const up = 180 * (1 + LOAD_JUMP_WARN_PCT / 100);
    const j = loadJump([180, 180], [up, up]);
    expect(j.warn).toBe(true);
    expect(j.text).toMatch(/nicht aufeinander geeicht/);
    expect(j.text).not.toMatch(/gesperrt|sofort|nur noch|musst/i);
  });
  it("darunter keine Warnung", () => {
    expect(loadJump([180], [200]).warn).toBe(false);
  });
  it("ohne bisherige Last kein Vergleich", () => {
    expect(loadJump([0, 0], [100, 100])).toMatchObject({ warn: false, oldAvg: 0 });
  });
});

describe("buildAddSportPreview", () => {
  const args = {
    activePlans: [ridePlan()],
    sport: "run" as const,
    draft: {
      hours: 3,
      weekdays: [1, 3, 7],
      level: "einsteiger" as const,
      currentThresholdSpeed: null,
      thresholdSpeedTarget: null,
    },
    todayISO: TODAY,
    goalProfile: { level: "einsteiger", ramp: "sanft", lowStartVolume: true } as never,
    history: {},
    formats: [],
    existingCards: rideCards(),
  };

  it("startet am nächsten Montag ohne Startdatum-Eingabe; Dauer bis zum Planende", () => {
    const r = buildAddSportPreview(args);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.startDate).toBe(NEXT_MONDAY);
    expect(r.item.input.startDate).toBe(NEXT_MONDAY);
    expect(r.item.sport).toBe("run");
    expect(r.duration.weeks).toBe(12);
    expect(r.item.plan.weeks[0].start).toBe(NEXT_MONDAY);
  });

  it("liefert nur die neue Sportart; die Rad-Ausgabe der Verteilung wird verworfen", () => {
    const r = buildAddSportPreview(args);
    if (!r.ok) throw new Error("erwartet ok");
    expect(r.item.input.sport).toBe("run");
    expect((r.item.input.fixedDays ?? []).every((f) => f.typ !== "Gruppenfahrt")).toBe(true);
  });

  it("legt Laufen auf eigene Tage, wenn Rad Di/Do/Sa belegt", () => {
    const r = buildAddSportPreview(args);
    if (!r.ok) throw new Error("erwartet ok");
    expect(r.item.input.trainingWeekdays).toEqual([1, 3, 7]);
  });

  it("zeigt die Last je Sportart als eigene Zeile und die Summe als Näherung", () => {
    const r = buildAddSportPreview(args);
    if (!r.ok) throw new Error("erwartet ok");
    expect(r.load.rows.map((x) => x.sport)).toEqual(["ride", "run"]);
    expect(r.load.totalLabel).toMatch(/Näherung/);
    expect(r.jump.oldAvg).toBe(180);
  });

  it("gibt Hinweise der Verteilung weiter (harte Tage ohne Abstand)", () => {
    const r = buildAddSportPreview({ ...args, draft: { ...args.draft, weekdays: [3, 5, 7] } });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.hints.length).toBeGreaterThan(0);
  });

  it("belegt Rad alle Wunschtage hart, bekommt Laufen keine: Fehler mit erklärendem Hinweis statt stiller Änderung", () => {
    const r = buildAddSportPreview({ ...args, draft: { ...args.draft, weekdays: [2, 4, 6] } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors["run.trainingWeekdays"]).toBeDefined();
    expect(r.hints?.some((h) => h.code === "DAYS_SHORT")).toBe(true);
  });

  it("sanfter Einstieg wirkt über goalProfile: weniger Startumfang als ohne", () => {
    const gentle = buildAddSportPreview(args);
    const plain = buildAddSportPreview({
      ...args,
      goalProfile: null,
      draft: { ...args.draft, level: "fortgeschritten" },
    });
    if (!gentle.ok || !plain.ok) throw new Error("erwartet ok");
    const week0 = (p: typeof gentle) => p.item.plan.weeks[0].cards.reduce((s, c) => s + (c.tssPlanned ?? 0), 0);
    expect(week0(gentle)).toBeLessThan(week0(plain));
  });

  it("eine Historie aus lauter Nullwochen drückt den Startumfang nicht auf 0", () => {
    const zeros = buildAddSportPreview({ ...args, history: { run: { weeklyActualTss: [0, 0, 0, 0] } } });
    const none = buildAddSportPreview(args);
    if (!zeros.ok || !none.ok) throw new Error("erwartet ok");
    const week0 = (p: typeof zeros) => p.item.plan.weeks[0].cards.reduce((s, c) => s + (c.tssPlanned ?? 0), 0);
    expect(week0(zeros)).toBeGreaterThan(0);
    expect(week0(zeros)).toBe(week0(none));
  });

  it("Eingabefehler (0 Stunden) kommen als Fehler, nicht als Wurf", () => {
    const r = buildAddSportPreview({ ...args, draft: { ...args.draft, hours: 0 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).join()).toMatch(/weeklyHours/);
  });

  it("nennt den Mindestwert, wenn der laufende Plan bald endet", () => {
    const r = buildAddSportPreview({ ...args, activePlans: [ridePlan({ endDate: "2026-11-22" })] });
    if (!r.ok) throw new Error("erwartet ok");
    expect(r.duration.usedMinimum).toBe(true);
    expect(r.duration.weeks).toBe(MIN_ADD_SPORT_WEEKS);
    expect(r.notes.join(" ")).toContain(String(MIN_ADD_SPORT_WEEKS));
  });

  it("fehlende Schwellen-Geschwindigkeit wird offen genannt, es wird nichts erfunden", () => {
    const r = buildAddSportPreview(args);
    if (!r.ok) throw new Error("erwartet ok");
    expect(r.item.input.currentThresholdSpeed).toBeNull();
    expect(r.notes.join(" ")).toMatch(/Pace-Vorgaben/);
  });
});
