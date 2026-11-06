/* Tests: goal-nutrition-sync — Ziel → nutrition_goals (Fahrplan 43, E6).
 * Richtung nur goals → nutrition_goals, Tabelle append-only. Alle Werte erfunden. */

import { describe, expect, it, vi } from "vitest";
import type { Goal, GoalKey, GoalRole, NutritionGoalInput, Result } from "../../api/types";
import { groupGoals } from "./goals-view-model";
import {
  buildLoseInput,
  endGoalWithNutrition,
  paceFieldFor,
  planOnEnd,
  planOnSave,
  saveGoalWithNutrition,
  setsDeficit,
  type SyncDeps,
} from "./goal-nutrition-sync";

function goal(id: string, goalKey: GoalKey | null, role: GoalRole | null): Goal {
  return { id, kind: goalKey ?? "Freitext", targetValue: null, targetDate: null, note: null, isActive: true, goalKey, role };
}

const LOSE: NutritionGoalInput = { goalType: "lose", pacePerWeekKg: 0.3, targetWeightKg: null, targetDate: null };

describe("planOnSave", () => {
  it("schreibt beim Setzen von Fett verlieren (Hauptziel) eine lose-Zeile nach dem Ziel", () => {
    const plan = planOnSave(groupGoals([]), { goalKey: "fett_verlieren", role: "main" }, LOSE);
    expect(plan).toEqual({ maintainFirst: false, loseAfter: LOSE });
  });

  it("schreibt maintain zuerst, wenn Fett verlieren durch ein anderes Ziel ersetzt wird", () => {
    const groups = groupGoals([goal("a", "fett_verlieren", "main")]);
    const plan = planOnSave(groups, { goalKey: "ausdauer", role: "main" }, null);
    expect(plan).toEqual({ maintainFirst: true, loseAfter: null });
  });

  it("schreibt beim Ersetzen von Fett verlieren durch Fett verlieren nur die neue lose-Zeile", () => {
    const groups = groupGoals([goal("a", "fett_verlieren", "main")]);
    const plan = planOnSave(groups, { goalKey: "fett_verlieren", role: "main" }, LOSE);
    expect(plan).toEqual({ maintainFirst: false, loseAfter: LOSE });
  });

  it("schreibt nichts, wenn Fett verlieren als Nebenziel hinter einem FTP-Hauptziel steht (Profil sagt halten)", () => {
    const groups = groupGoals([goal("a", "ftp", "main")]);
    const plan = planOnSave(groups, { goalKey: "fett_verlieren", role: "side" }, null);
    expect(plan).toEqual({ maintainFirst: false, loseAfter: null });
  });

  it("schreibt nichts bei Zielen ohne Bezug zur Energie", () => {
    expect(planOnSave(groupGoals([]), { goalKey: "ausdauer", role: "main" }, null)).toEqual({
      maintainFirst: false,
      loseAfter: null,
    });
  });

  it("rührt ein lose-Ziel ohne goals-Eintrag nicht an", () => {
    const groups = groupGoals([goal("a", "ausdauer", "main")]);
    const plan = planOnSave(groups, { goalKey: "bergauf", role: "main" }, null);
    expect(plan.maintainFirst).toBe(false);
  });

  it("schreibt maintain zuerst, wenn das Hauptziel Fett verlieren dem FTP-Ziel weicht", () => {
    const groups = groupGoals([goal("a", "fett_verlieren", "main")]);
    const plan = planOnSave(groups, { goalKey: "ftp", role: "main" }, null);
    expect(plan.maintainFirst).toBe(true);
  });
});

describe("setsDeficit", () => {
  it("ist wahr, wenn das neue Profil ein Defizit setzt (Fett verlieren als Hauptziel)", () => {
    expect(setsDeficit(groupGoals([]), { goalKey: "fett_verlieren", role: "main" })).toBe(true);
  });

  it("ist falsch als Nebenziel hinter FTP, bei anderen Zielen und ohne Wahl", () => {
    const ftpMain = groupGoals([goal("a", "ftp", "main")]);
    expect(setsDeficit(ftpMain, { goalKey: "fett_verlieren", role: "side" })).toBe(false);
    expect(setsDeficit(groupGoals([]), { goalKey: "ausdauer", role: "main" })).toBe(false);
  });

  it("ist wahr als Nebenziel, wenn das Hauptziel die Energie offen lässt", () => {
    const enduranceMain = groupGoals([goal("a", "ausdauer", "main")]);
    expect(setsDeficit(enduranceMain, { goalKey: "fett_verlieren", role: "side" })).toBe(true);
  });
});

describe("planOnEnd", () => {
  it("schreibt maintain, wenn Fett verlieren endet", () => {
    const groups = groupGoals([goal("a", "fett_verlieren", "main")]);
    expect(planOnEnd(groups, "a")).toEqual({ maintainFirst: true, loseAfter: null });
  });

  it("schreibt nichts, wenn ein anderes Ziel endet", () => {
    const groups = groupGoals([goal("a", "fett_verlieren", "main"), goal("b", "ausdauer", "side")]);
    expect(planOnEnd(groups, "b").maintainFirst).toBe(false);
  });

  it("schreibt nichts, wenn ein Altziel ohne Rolle endet", () => {
    const groups = groupGoals([goal("a", "fett_verlieren", "main"), goal("x", null, null)]);
    expect(planOnEnd(groups, "x").maintainFirst).toBe(false);
  });

  it("schreibt nichts, wenn das Defizit weiter vom Hauptziel getragen wird", () => {
    // Haupt: Fett verlieren, Neben: FTP. Endet das Nebenziel, bleibt das Profil „lose“.
    const groups = groupGoals([goal("a", "fett_verlieren", "main"), goal("b", "ftp", "side")]);
    expect(planOnEnd(groups, "b").maintainFirst).toBe(false);
  });
});

function deps(overrides: Partial<SyncDeps> = {}): SyncDeps & { calls: string[] } {
  const calls: string[] = [];
  const base: SyncDeps = {
    replace: vi.fn(async (oldId: string | null) => {
      calls.push(`replace:${oldId}`);
      return { ok: true, id: "new" } as Result<{ id: string }>;
    }),
    deactivate: vi.fn(async (id: string) => {
      calls.push(`deactivate:${id}`);
      return { ok: true, goalId: id } as Result<{ goalId: string }>;
    }),
    addNutritionGoal: vi.fn(async (input: NutritionGoalInput) => {
      calls.push(`nutrition:${input.goalType}`);
      return { ok: true, id: "n" } as Result<{ id: string }>;
    }),
  };
  return Object.assign({ ...base, ...overrides }, { calls });
}

const fail = (message: string): Result<never> =>
  ({ ok: false, error: { code: "UNKNOWN", message } }) as Result<never>;

const GOAL_INPUT = { kind: "Fett verlieren", goalKey: "fett_verlieren" as const, role: "main" as const };

describe("saveGoalWithNutrition", () => {
  it("speichert das Ziel und schreibt danach die lose-Zeile", async () => {
    const d = deps();
    const r = await saveGoalWithNutrition(d, { oldGoalId: null, goalInput: GOAL_INPUT, plan: { maintainFirst: false, loseAfter: LOSE } });
    expect(r).toEqual({ ok: true });
    expect(d.calls).toEqual(["replace:null", "nutrition:lose"]);
  });

  it("schreibt maintain vor dem Ersetzen", async () => {
    const d = deps();
    await saveGoalWithNutrition(d, { oldGoalId: "a", goalInput: GOAL_INPUT, plan: { maintainFirst: true, loseAfter: null } });
    expect(d.calls).toEqual(["nutrition:maintain", "replace:a"]);
  });

  it("bricht ab und ändert das Ziel nicht, wenn die maintain-Zeile scheitert", async () => {
    const d = deps({ addNutritionGoal: vi.fn(async () => fail("db")) });
    const r = await saveGoalWithNutrition(d, { oldGoalId: "a", goalInput: GOAL_INPUT, plan: { maintainFirst: true, loseAfter: null } });
    expect(r).toMatchObject({ ok: false, stage: "maintain" });
    expect(d.replace).not.toHaveBeenCalled();
  });

  it("markiert, dass die Ernährung schon pausiert ist, wenn das Ersetzen nach maintain scheitert", async () => {
    const d = deps({ replace: vi.fn(async () => fail("db")) });
    const r = await saveGoalWithNutrition(d, { oldGoalId: "a", goalInput: GOAL_INPUT, plan: { maintainFirst: true, loseAfter: null } });
    expect(r).toMatchObject({ ok: false, stage: "goal", nutritionPaused: true });
  });

  it("markiert nichts, wenn gar keine maintain-Zeile geschrieben wurde", async () => {
    const d = deps({ replace: vi.fn(async () => fail("db")) });
    const r = await saveGoalWithNutrition(d, { oldGoalId: "a", goalInput: GOAL_INPUT, plan: { maintainFirst: false, loseAfter: null } });
    expect(r).toMatchObject({ ok: false, stage: "goal", nutritionPaused: false });
  });

  it("meldet den Fehler des Ersetzen-Ablaufs, schreibt keine lose-Zeile und lässt maintain stehen", async () => {
    const d = deps({ replace: vi.fn(async () => fail("Speichern gescheitert — inaktiv")) });
    const r = await saveGoalWithNutrition(d, { oldGoalId: "a", goalInput: GOAL_INPUT, plan: { maintainFirst: true, loseAfter: LOSE } });
    expect(r).toMatchObject({ ok: false, stage: "goal", message: "Speichern gescheitert — inaktiv" });
    expect(d.addNutritionGoal).toHaveBeenCalledTimes(1); // nur maintain
  });

  it("sagt offen, dass das Ziel steht, aber die lose-Zeile fehlt", async () => {
    const add = vi.fn(async () => fail("db"));
    const d = deps({ addNutritionGoal: add });
    const r = await saveGoalWithNutrition(d, { oldGoalId: null, goalInput: GOAL_INPUT, plan: { maintainFirst: false, loseAfter: LOSE } });
    expect(r).toMatchObject({ ok: false, stage: "nutrition" });
    expect((r as { message: string }).message).toMatch(/Ziel ist gespeichert/);
    expect((r as { message: string }).message).toMatch(/ohne Defizit/);
  });

  it("schreibt ohne Plan nichts in nutrition_goals", async () => {
    const d = deps();
    await saveGoalWithNutrition(d, { oldGoalId: null, goalInput: GOAL_INPUT, plan: { maintainFirst: false, loseAfter: null } });
    expect(d.addNutritionGoal).not.toHaveBeenCalled();
  });
});

describe("endGoalWithNutrition", () => {
  it("schreibt maintain zuerst, dann wird das Ziel beendet", async () => {
    const d = deps();
    const r = await endGoalWithNutrition(d, { goalId: "a", plan: { maintainFirst: true, loseAfter: null } });
    expect(r).toEqual({ ok: true });
    expect(d.calls).toEqual(["nutrition:maintain", "deactivate:a"]);
  });

  it("beendet das Ziel nicht, wenn maintain scheitert (sonst liefe das Defizit still weiter)", async () => {
    const d = deps({ addNutritionGoal: vi.fn(async () => fail("db")) });
    const r = await endGoalWithNutrition(d, { goalId: "a", plan: { maintainFirst: true, loseAfter: null } });
    expect(r).toMatchObject({ ok: false, stage: "maintain" });
    expect(d.deactivate).not.toHaveBeenCalled();
  });

  it("markiert die pausierte Ernährung, wenn das Beenden nach maintain scheitert", async () => {
    const d = deps({ deactivate: vi.fn(async () => fail("db")) });
    const r = await endGoalWithNutrition(d, { goalId: "a", plan: { maintainFirst: true, loseAfter: null } });
    expect(r).toMatchObject({ ok: false, stage: "goal", nutritionPaused: true });
    const r2 = await endGoalWithNutrition(d, { goalId: "a", plan: { maintainFirst: false, loseAfter: null } });
    expect(r2).toMatchObject({ ok: false, stage: "goal", nutritionPaused: false });
  });

  it("lässt maintain stehen, wenn das Beenden scheitert", async () => {
    const d = deps({ deactivate: vi.fn(async () => fail("db")) });
    const r = await endGoalWithNutrition(d, { goalId: "a", plan: { maintainFirst: true, loseAfter: null } });
    expect(r).toMatchObject({ ok: false, stage: "goal" });
    expect(d.calls).toEqual(["nutrition:maintain"]);
  });

  it("beendet ohne Plan direkt", async () => {
    const d = deps();
    await endGoalWithNutrition(d, { goalId: "a", plan: { maintainFirst: false, loseAfter: null } });
    expect(d.addNutritionGoal).not.toHaveBeenCalled();
    expect(d.calls).toEqual(["deactivate:a"]);
  });
});

describe("paceFieldFor", () => {
  it("zeigt die Obergrenze vorab", () => {
    const f = paceFieldFor(80);
    expect(f).toMatchObject({ kind: "ok", max: 0.4 });
    expect(f.text).toMatch(/0,4 kg/);
    expect(f.text).toMatch(/0,5 %/);
  });

  it("bietet ohne aktuelles Gewicht kein Tempo an und sagt warum", () => {
    for (const w of [null, undefined, 0]) {
      const f = paceFieldFor(w);
      expect(f.kind).toBe("no-weight");
      expect(f.text).toMatch(/Gewicht/);
    }
  });
});

describe("buildLoseInput", () => {
  const base = { pace: "0,3", targetWeight: "", targetDate: "", weightKg: 80 };

  it("baut die lose-Zeile mit Komma-Tempo", () => {
    expect(buildLoseInput(base)).toEqual({
      ok: true,
      input: { goalType: "lose", pacePerWeekKg: 0.3, targetWeightKg: null, targetDate: null },
    });
  });

  it("nimmt Zielgewicht und Datum mit, wenn angegeben", () => {
    const r = buildLoseInput({ ...base, targetWeight: "72,5", targetDate: "2027-03-01" });
    expect(r).toMatchObject({ ok: true, input: { targetWeightKg: 72.5, targetDate: "2027-03-01" } });
  });

  it("lehnt ein zu hohes Tempo ab und nennt die Obergrenze, ohne den Wert zu ändern", () => {
    const r = buildLoseInput({ ...base, pace: "0.9" });
    expect(r.ok).toBe(false);
    expect((r as { message: string }).message).toMatch(/höchstens 0,4 kg/);
  });

  it("lehnt fehlendes, null, negatives oder unlesbares Tempo ab", () => {
    for (const pace of ["", "0", "-0.2", "abc"]) {
      expect(buildLoseInput({ ...base, pace }).ok).toBe(false);
    }
  });

  it("lehnt ohne Gewicht ab", () => {
    expect(buildLoseInput({ ...base, weightKg: null }).ok).toBe(false);
  });

  it("lehnt ein ungültiges Zielgewicht ab", () => {
    expect(buildLoseInput({ ...base, targetWeight: "0" }).ok).toBe(false);
    expect(buildLoseInput({ ...base, targetWeight: "x" }).ok).toBe(false);
  });
});
