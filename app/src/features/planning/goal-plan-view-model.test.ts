import { describe, expect, it } from "vitest";
import {
  activeGoalsForPlan,
  ftpTargetSuggestion,
  goalPlanChanges,
  goalPlanHint,
  newPlanFormPatch,
  newPlanPresets,
  planGoalProfile,
  suggestedSportHours,
} from "./goal-plan-view-model";
import type { Goal, TrainingPlan } from "../../api/types";

function goal(over: Partial<Goal>): Goal {
  return {
    id: "g1",
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

function plan(over: Partial<TrainingPlan>): TrainingPlan {
  return { focus: "allgemein", level: "fortgeschritten", ftpTarget: null, sport: "ride", ...over } as TrainingPlan;
}

const ftpMain = goal({ id: "a", goalKey: "ftp", role: "main", targetValue: 300 });
const runMain = goal({ id: "b", goalKey: "laufen_starten", role: "main" });
const enduranceMain = goal({ id: "c", goalKey: "ausdauer", role: "main" });

describe("activeGoalsForPlan / planGoalProfile — Sportfilter", () => {
  it("Laufen starten wirkt nicht auf einen Radplan", () => {
    expect(activeGoalsForPlan([runMain], "ride")).toEqual({ main: null, side: null });
    expect(planGoalProfile([runMain], "ride").level).toBeNull();
    expect(planGoalProfile([runMain], "ride").ramp).toBeNull();
  });

  it("FTP wirkt nicht auf einen Laufplan", () => {
    expect(planGoalProfile([ftpMain], "run").intensityFocus).toBeNull();
  });

  it("Laufen starten wirkt auf einen Laufplan", () => {
    const p = planGoalProfile([runMain], "run");
    expect(p.level).toBe("einsteiger");
    expect(p.lowStartVolume).toBe(true);
  });

  it("Altziele ohne Rolle zählen nie", () => {
    expect(activeGoalsForPlan([goal({ goalKey: "ftp", role: null })], "ride")).toEqual({ main: null, side: null });
  });
});

describe("goalPlanChanges", () => {
  it("nennt nur, was wirklich wirkt, und trennt das, was noch nicht wirkt", () => {
    const profile = planGoalProfile(
      [goal({ goalKey: "fett_verlieren", role: "main" }), goal({ id: "s", goalKey: "ausdauer", role: "side" })],
      "ride",
    );
    const { changes, notYet } = goalPlanChanges(profile);
    expect(changes.join(" ")).toMatch(/Aufbau steigt flacher/);
    expect(changes.join(" ")).toMatch(/Trainingstag/);
    expect(notYet.join(" ")).toMatch(/lockerer Umfang/);
  });

  it("FTP-Ziel: Schwellen-/VO2max-Fokus steht unter 'wirkt noch nicht'", () => {
    const { changes, notYet } = goalPlanChanges(planGoalProfile([ftpMain], "ride"));
    expect(changes).toEqual([]);
    expect(notYet.join(" ")).toMatch(/Schwelle/);
  });

  it("Startumfang nennt den Prozentwert aus dem Generator", () => {
    const { changes } = goalPlanChanges(planGoalProfile([runMain], "run"));
    expect(changes.join(" ")).toMatch(/20 %/);
  });

  it("Muskeln/Kraft und Sonstiges: nichts, kein Hinweis", () => {
    const p = planGoalProfile(
      [goal({ goalKey: "muskeln_kraft", role: "main" }), goal({ id: "s", goalKey: "sonstiges", role: "side" })],
      "ride",
    );
    expect(goalPlanChanges(p)).toEqual({ changes: [], notYet: [], hasEffect: false });
  });
});

describe("goalPlanHint", () => {
  it("kein Hinweis ohne Abweichung", () => {
    expect(goalPlanHint([enduranceMain], plan({ focus: "langstrecke" }), null)).toBeNull();
    expect(goalPlanHint([], plan({}), null)).toBeNull();
  });

  it("Fokus-Abweichung: Hinweis mit ruhigem Text und stabiler Signatur", () => {
    const hint = goalPlanHint([enduranceMain], plan({ focus: "allgemein" }), null);
    expect(hint?.differences).toEqual(["focus"]);
    expect(hint?.text).toMatch(/Fokus/);
    expect(hint?.signature).toBe(goalPlanHint([enduranceMain], plan({ focus: "allgemein" }), null)?.signature);
  });

  it("Level-Abweichung (Laufplan, Laufen starten)", () => {
    const hint = goalPlanHint([runMain], plan({ sport: "run", level: "fortgeschritten" }), null);
    expect(hint?.differences).toContain("level");
  });

  it("Ziel-FTP weicht ab, nur für Rad", () => {
    const off = goalPlanHint([ftpMain], plan({ ftpTarget: 270 }), null);
    expect(off?.differences).toEqual(["ftpTarget"]);
    expect(goalPlanHint([ftpMain], plan({ ftpTarget: 300 }), null)).toBeNull();
    expect(goalPlanHint([ftpMain], plan({ sport: "run", ftpTarget: 270 }), null)).toBeNull();
  });

  it("Ziel-FTP gleich dem Zwischenziel zählt nicht als Abweichung", () => {
    expect(goalPlanHint([ftpMain], plan({ ftpTarget: 275 }), 275)).toBeNull();
    expect(goalPlanHint([ftpMain], plan({ ftpTarget: 270 }), 275)?.differences).toEqual(["ftpTarget"]);
  });

  it("Signatur ändert sich, wenn sich das Ziel ändert (Hinweis kommt dann wieder)", () => {
    const a = goalPlanHint([enduranceMain], plan({}), null)?.signature;
    const b = goalPlanHint([goal({ ...enduranceMain, id: "other" })], plan({}), null)?.signature;
    expect(a).not.toBe(b);
  });

  it("Muskeln/Kraft: kein Hinweis", () => {
    expect(goalPlanHint([goal({ goalKey: "muskeln_kraft", role: "main" })], plan({}), null)).toBeNull();
  });

  it("Laufen-Ziel auf Radplan: kein Hinweis", () => {
    expect(goalPlanHint([runMain], plan({ sport: "ride", level: "fortgeschritten" }), null)).toBeNull();
  });
});

describe("newPlanPresets / newPlanFormPatch", () => {
  const today = "2026-11-05";

  it("Fokus und Level aus dem Ziel", () => {
    expect(newPlanPresets([enduranceMain], "ride", today)).toEqual({ focus: "langstrecke" });
    expect(newPlanPresets([runMain], "run", today)).toEqual({ level: "einsteiger" });
  });

  it("Event-Modus nur mit Datum", () => {
    const withDate = goal({ goalKey: "event", role: "main", targetDate: "2027-03-01" });
    const noDate = goal({ goalKey: "event", role: "main" });
    expect(newPlanPresets([withDate], "ride", today).eventDate).toBe("2027-03-01");
    expect(newPlanPresets([noDate], "ride", today).eventDate).toBeUndefined();
  });

  it("Event-Datum in der Vergangenheit wird nicht vorbelegt", () => {
    const past = goal({ goalKey: "event", role: "main", targetDate: "2026-01-01" });
    expect(newPlanPresets([past], "ride", today).eventDate).toBeUndefined();
  });

  it("nichts Vorbelegbares: leeres Objekt, leerer Patch", () => {
    expect(newPlanPresets([goal({ goalKey: "muskeln_kraft", role: "main" })], "ride", today)).toEqual({});
    expect(newPlanFormPatch({}, [])).toEqual({});
  });

  it("Patch wählt ein vorhandenes Event am Datum, sonst neuer Renntag", () => {
    const presets = { focus: "berg" as const, eventDate: "2027-03-01" };
    expect(newPlanFormPatch(presets, [{ id: "e1", eventDate: "2027-03-01" }])).toEqual({
      focus: "berg",
      mode: "event",
      eventId: "e1",
    });
    expect(newPlanFormPatch(presets, [])).toEqual({
      focus: "berg",
      mode: "event",
      eventId: "",
      newEventDate: "2027-03-01",
    });
  });
});

describe("ftpTargetSuggestion", () => {
  const today = "2026-11-05";
  // 10 Wochen, +1 W/Woche: genug frische Daten für eine Prognose.
  const history = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 1 + i * 7));
    return { date: d.toISOString().slice(0, 10), eftp: 240 + i };
  });

  it("liefert das Zwischenziel nur für Rad und nur bei ok", () => {
    const withDate = goal({ ...ftpMain, targetDate: "2027-03-01" });
    const r = ftpTargetSuggestion({ goals: [withDate], sport: "ride", current: 250, history, todayISO: today });
    if (r !== null) expect(r).toBeGreaterThan(250);
    expect(ftpTargetSuggestion({ goals: [withDate], sport: "run", current: 250, history, todayISO: today })).toBeNull();
  });

  it("zu wenig Daten → null", () => {
    expect(ftpTargetSuggestion({ goals: [ftpMain], sport: "ride", current: 250, history: [], todayISO: today })).toBeNull();
  });

  it("ohne aktuelle FTP oder ohne FTP-Ziel → null", () => {
    expect(ftpTargetSuggestion({ goals: [ftpMain], sport: "ride", current: null, history, todayISO: today })).toBeNull();
    expect(ftpTargetSuggestion({ goals: [enduranceMain], sport: "ride", current: 250, history, todayISO: today })).toBeNull();
  });
});

describe("suggestedSportHours (Fahrplan 44 E7)", () => {
  it("Laufen starten: niedrigerer Start mit Hinweis, dass der Wert aus dem Ziel kommt", () => {
    const r = suggestedSportHours([runMain], "run", 3);
    expect(r.hours).toBe(2);
    expect(r.note).toContain("Ziel");
  });

  it("ohne passendes Ziel: Vorbelegung unverändert, kein Hinweis", () => {
    expect(suggestedSportHours([], "run", 3)).toEqual({ hours: 3, note: null });
    expect(suggestedSportHours([enduranceMain], "run", 3)).toEqual({ hours: 3, note: null });
  });

  it("Rad bleibt unberührt, Sportfilter hält das Ziel von Schwimmen fern", () => {
    expect(suggestedSportHours([runMain], "ride", 6)).toEqual({ hours: 6, note: null });
    expect(suggestedSportHours([runMain], "swim", 2)).toEqual({ hours: 2, note: null });
  });

  it("Altziele ohne Rolle zählen nicht", () => {
    const legacy = goal({ id: "x", goalKey: "laufen_starten", role: null });
    expect(suggestedSportHours([legacy], "run", 3)).toEqual({ hours: 3, note: null });
  });
});
