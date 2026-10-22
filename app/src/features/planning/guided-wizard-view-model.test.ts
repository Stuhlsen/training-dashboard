import { describe, expect, it } from "vitest";
import {
  applyWizardResult,
  buildWizardResult,
  initialWizardAnswers,
  wizardStepError,
  wizardSteps,
  type WizardAnswers,
  type WizardContext,
} from "./guided-wizard-view-model";
import { defaultFormState, ftpTestNote } from "./new-plan-dialog-view-model";

const TODAY = "2026-10-22";

const rideCtx: WizardContext = { sport: "ride", profileRole: null, roleAnswer: null };

function answers(over: Partial<WizardAnswers> = {}): WizardAnswers {
  return {
    mode: "open",
    eventId: "",
    newEventDate: "",
    newEventName: "",
    weeks: 12,
    experience: "ueber1Jahr",
    focus: "allgemein",
    trainingWeekdays: [2, 4, 6],
    weeklyHours: 6,
    role: null,
    dayEnvironment: {},
    ftpKnown: null,
    ftpWatt: null,
    ftpDate: "",
    thresholdSpeed: null,
    ...over,
  };
}

describe("wizardSteps", () => {
  it("Rad, Profil-Rolle leer: Rolle wird gefragt, Tage drinnen/draußen erst nach „ja“", () => {
    expect(wizardSteps(rideCtx)).toEqual([
      "goal",
      "experience",
      "focus",
      "schedule",
      "role",
      "threshold",
    ]);
    expect(wizardSteps({ ...rideCtx, roleAnswer: true })).toEqual([
      "goal",
      "experience",
      "focus",
      "schedule",
      "role",
      "environment",
      "threshold",
    ]);
    expect(wizardSteps({ ...rideCtx, roleAnswer: false })).not.toContain("environment");
  });

  it("Profil-Rolle gesetzt: Rolle-Schritt entfällt; „ja“ im Profil zeigt Umgebung", () => {
    const yes = wizardSteps({ sport: "ride", profileRole: true, roleAnswer: null });
    expect(yes).not.toContain("role");
    expect(yes).toContain("environment");
    const no = wizardSteps({ sport: "ride", profileRole: false, roleAnswer: null });
    expect(no).not.toContain("role");
    expect(no).not.toContain("environment");
  });

  it("Profil-Wert gewinnt über eine alte Antwort", () => {
    const steps = wizardSteps({ sport: "ride", profileRole: false, roleAnswer: true });
    expect(steps).not.toContain("environment");
  });

  it("Lauf/Schwimmen: weder Rolle noch Umgebung, Schwellen-Schritt bleibt", () => {
    for (const sport of ["run", "swim"] as const) {
      expect(wizardSteps({ sport, profileRole: null, roleAnswer: true })).toEqual([
        "goal",
        "experience",
        "focus",
        "schedule",
        "threshold",
      ]);
    }
  });

  it("Trainer-Fall (Profilwert nicht lesbar = null): Rolle wird gefragt", () => {
    expect(wizardSteps({ sport: "ride", profileRole: null, roleAnswer: null })).toContain("role");
  });
});

describe("wizardStepError", () => {
  it("goal: Event-Modus braucht Event oder Renntag + Name; offen braucht 3–40 Wochen", () => {
    expect(wizardStepError("goal", answers({ mode: "event" }), rideCtx, TODAY)).toMatch(/Event/);
    expect(
      wizardStepError("goal", answers({ mode: "event", newEventDate: "2027-05-01" }), rideCtx, TODAY)
    ).toMatch(/Name/);
    expect(
      wizardStepError(
        "goal",
        answers({ mode: "event", newEventDate: "2027-05-01", newEventName: "Rennen" }),
        rideCtx,
        TODAY
      )
    ).toBeNull();
    expect(wizardStepError("goal", answers({ mode: "event", eventId: "e1" }), rideCtx, TODAY)).toBeNull();
    expect(wizardStepError("goal", answers({ weeks: 2 }), rideCtx, TODAY)).toMatch(/Wochen/);
    expect(wizardStepError("goal", answers({ weeks: 41 }), rideCtx, TODAY)).toMatch(/Wochen/);
    expect(wizardStepError("goal", answers({ weeks: 12 }), rideCtx, TODAY)).toBeNull();
  });

  it("experience/focus/role verlangen eine Antwort", () => {
    expect(wizardStepError("experience", answers({ experience: null }), rideCtx, TODAY)).not.toBeNull();
    expect(wizardStepError("focus", answers({ focus: null }), rideCtx, TODAY)).not.toBeNull();
    expect(wizardStepError("role", answers({ role: null }), rideCtx, TODAY)).not.toBeNull();
    expect(wizardStepError("role", answers({ role: false }), rideCtx, TODAY)).toBeNull();
  });

  it("schedule: mindestens zwei Tage, Stunden > 0 und ≤ 25", () => {
    expect(wizardStepError("schedule", answers({ trainingWeekdays: [2] }), rideCtx, TODAY)).toMatch(
      /zwei Trainingstage/
    );
    expect(wizardStepError("schedule", answers({ weeklyHours: 0 }), rideCtx, TODAY)).toMatch(/Stunden/);
    expect(wizardStepError("schedule", answers({ weeklyHours: 26 }), rideCtx, TODAY)).toMatch(/Stunden/);
    expect(wizardStepError("schedule", answers(), rideCtx, TODAY)).toBeNull();
  });

  it("threshold (Rad): „bekannt“ braucht Watt 80–500 und Messdatum, nicht in der Zukunft", () => {
    expect(wizardStepError("threshold", answers({ ftpKnown: null }), rideCtx, TODAY)).not.toBeNull();
    expect(wizardStepError("threshold", answers({ ftpKnown: false }), rideCtx, TODAY)).toBeNull();
    const known = { ftpKnown: true, ftpWatt: 250, ftpDate: "2026-10-08" };
    expect(wizardStepError("threshold", answers(known), rideCtx, TODAY)).toBeNull();
    expect(wizardStepError("threshold", answers({ ...known, ftpWatt: 30 }), rideCtx, TODAY)).toMatch(/Watt/);
    expect(wizardStepError("threshold", answers({ ...known, ftpWatt: null }), rideCtx, TODAY)).toMatch(/Watt/);
    expect(wizardStepError("threshold", answers({ ...known, ftpDate: "" }), rideCtx, TODAY)).toMatch(/Messdatum/);
    expect(
      wizardStepError("threshold", answers({ ...known, ftpDate: "2026-11-01" }), rideCtx, TODAY)
    ).toMatch(/Messdatum/);
  });

  it("threshold (Lauf/Schwimmen): Pace optional, aber 1–30 km/h wenn angegeben", () => {
    const run: WizardContext = { sport: "run", profileRole: null, roleAnswer: null };
    expect(wizardStepError("threshold", answers({ thresholdSpeed: null }), run, TODAY)).toBeNull();
    expect(wizardStepError("threshold", answers({ thresholdSpeed: 12 }), run, TODAY)).toBeNull();
    expect(wizardStepError("threshold", answers({ thresholdSpeed: 0.5 }), run, TODAY)).toMatch(/km\/h/);
    expect(wizardStepError("threshold", answers({ thresholdSpeed: 45 }), run, TODAY)).toMatch(/km\/h/);
  });
});

describe("buildWizardResult", () => {
  const events = [{ id: "e1", ftpGoal: 290 }];

  it("offener Plan → Wochen, Level, Fokus, Tage, Stunden", () => {
    const res = buildWizardResult(answers({ experience: "unter1Jahr", focus: "berg" }), rideCtx, {
      canSaveRoleToProfile: true,
      events,
    });
    expect(res.form).toMatchObject({
      mode: "open",
      weeks: 12,
      level: "einsteiger",
      focus: "berg",
      trainingWeekdays: [2, 4, 6],
      weeklyHours: 6,
    });
    expect(res.form).not.toHaveProperty("eventId");
  });

  it("Event-Plan → Event-ID, FTP-Ziel des Events; neues Event → Renntag + Name", () => {
    const withEvent = buildWizardResult(answers({ mode: "event", eventId: "e1" }), rideCtx, {
      canSaveRoleToProfile: true,
      events,
    });
    expect(withEvent.form).toMatchObject({ mode: "event", eventId: "e1", ftpTarget: 290 });
    expect(withEvent.form).not.toHaveProperty("weeks");

    const fresh = buildWizardResult(
      answers({ mode: "event", newEventDate: "2027-05-01", newEventName: " Rennen " }),
      rideCtx,
      { canSaveRoleToProfile: true, events }
    );
    expect(fresh.form).toMatchObject({
      mode: "event",
      eventId: "",
      newEventDate: "2027-05-01",
      newEventName: "Rennen",
    });
  });

  it("Rolle im Selbst-Fall: Antwort ins Profil und in die Plan-Kopie, Umgebung übernommen", () => {
    const res = buildWizardResult(
      answers({ role: true, dayEnvironment: { 2: "indoor", 4: "any", 6: "outdoor", 7: "indoor" } }),
      { ...rideCtx, roleAnswer: true },
      { canSaveRoleToProfile: true, events }
    );
    expect(res.saveIndoorTrainerToProfile).toBe(true);
    expect(res.form.hasIndoorTrainer).toBe(true);
    // Tag 7 ist kein Trainingstag, „egal“ fällt weg
    expect(res.form.dayEnvironment).toEqual({ 2: "indoor", 6: "outdoor" });
  });

  it("Rolle im Trainer-Fall: nur Plan-Kopie, nie ins Profil", () => {
    const res = buildWizardResult(answers({ role: true }), { ...rideCtx, roleAnswer: true }, {
      canSaveRoleToProfile: false,
      events,
    });
    expect(res.saveIndoorTrainerToProfile).toBe(false);
    expect(res.form.hasIndoorTrainer).toBe(true);
  });

  it("Rolle „nein“ leert die Umgebung", () => {
    const res = buildWizardResult(
      answers({ role: false, dayEnvironment: { 2: "indoor" } }),
      { ...rideCtx, roleAnswer: false },
      { canSaveRoleToProfile: true, events }
    );
    expect(res.form.hasIndoorTrainer).toBe(false);
    expect(res.form.dayEnvironment).toEqual({});
    expect(res.saveIndoorTrainerToProfile).toBe(true);
  });

  it("Rolle aus dem Profil: weder speichern noch Plan-Kopie setzen", () => {
    const res = buildWizardResult(
      answers({ dayEnvironment: { 2: "indoor" } }),
      { sport: "ride", profileRole: true, roleAnswer: null },
      { canSaveRoleToProfile: true, events }
    );
    expect(res.saveIndoorTrainerToProfile).toBe(false);
    expect(res.form).not.toHaveProperty("hasIndoorTrainer");
    expect(res.form.dayEnvironment).toEqual({ 2: "indoor" });
  });

  it("FTP bekannt, vor 2 Wochen → Datum gesetzt, Automatik zeigt „aus“ mit Grund „aktuell“", () => {
    const res = buildWizardResult(
      answers({ ftpKnown: true, ftpWatt: 250, ftpDate: "2026-10-08" }),
      rideCtx,
      { canSaveRoleToProfile: true, events }
    );
    expect(res.form).toMatchObject({
      currentFtp: 250,
      ftpMeasuredDate: "2026-10-08",
      startWithFtpTest: null,
    });
    const merged = applyWizardResult(defaultFormState(null, TODAY), res);
    const note = ftpTestNote(merged.startDate, merged.ftpMeasuredDate, merged.startWithFtpTest);
    expect(note.on).toBe(false);
    expect(note.text).toBe("aus — FTP vom 08.10.2026 ist aktuell");
  });

  it("FTP unbekannt → Messdatum leer, Automatik zeigt „an“ mit Grund", () => {
    const res = buildWizardResult(answers({ ftpKnown: false }), rideCtx, {
      canSaveRoleToProfile: true,
      events,
    });
    expect(res.form.ftpMeasuredDate).toBeNull();
    expect(res.form.startWithFtpTest).toBeNull();
    expect(res.form).not.toHaveProperty("currentFtp");
    const merged = applyWizardResult(defaultFormState(null, TODAY), res);
    expect(ftpTestNote(merged.startDate, merged.ftpMeasuredDate, merged.startWithFtpTest)).toEqual({
      on: true,
      text: "an — noch keine FTP gemessen",
    });
  });

  it("Lauf: Schwellenpace statt FTP, keine FTP-/Rollen-Felder", () => {
    const res = buildWizardResult(
      answers({ thresholdSpeed: 11.5 }),
      { sport: "run", profileRole: null, roleAnswer: null },
      { canSaveRoleToProfile: true, events }
    );
    expect(res.form.currentThresholdSpeed).toBe(11.5);
    expect(res.form).not.toHaveProperty("currentFtp");
    expect(res.form).not.toHaveProperty("ftpMeasuredDate");
    expect(res.form).not.toHaveProperty("hasIndoorTrainer");
    expect(res.form).not.toHaveProperty("dayEnvironment");
    expect(res.saveIndoorTrainerToProfile).toBe(false);
  });
});

describe("applyWizardResult", () => {
  it("überschreibt gesetzte Felder und verwirft feste Tage auf abgewählten Wochentagen", () => {
    const base = {
      ...defaultFormState(null, TODAY),
      trainingWeekdays: [2, 4, 6],
      fixedDays: [
        { weekday: 2, typ: "Z2 Dauer", keepInRecoveryWeek: false },
        { weekday: 6, typ: "Z2 Dauer", keepInRecoveryWeek: false },
      ],
    };
    const merged = applyWizardResult(base, {
      form: { trainingWeekdays: [1, 2, 3], weeklyHours: 4 },
      saveIndoorTrainerToProfile: false,
    });
    expect(merged.trainingWeekdays).toEqual([1, 2, 3]);
    expect(merged.weeklyHours).toBe(4);
    expect(merged.fixedDays.map((d) => d.weekday)).toEqual([2]);
    expect(merged.startDate).toBe(base.startDate);
  });
});

describe("initialWizardAnswers", () => {
  it("erster Plan: Erfahrung und Fokus bleiben unbeantwortet", () => {
    const a = initialWizardAnswers(defaultFormState(null, TODAY), { prefilled: false, role: null });
    expect(a.experience).toBeNull();
    expect(a.focus).toBeNull();
    expect(a.trainingWeekdays).toEqual([2, 4, 6]);
  });

  it("aus dem letzten Plan: Erfahrung, Fokus, Rolle und Umgebung vorbelegt", () => {
    const form = {
      ...defaultFormState(null, TODAY),
      level: "einsteiger" as const,
      focus: "berg" as const,
      hasIndoorTrainer: true,
      dayEnvironment: { 2: "indoor" as const },
      ftpMeasuredDate: "2026-10-01",
      currentFtp: 240,
    };
    const a = initialWizardAnswers(form, { prefilled: true, role: true });
    expect(a).toMatchObject({
      experience: "unter1Jahr",
      focus: "berg",
      role: true,
      dayEnvironment: { 2: "indoor" },
      ftpKnown: true,
      ftpWatt: 240,
      ftpDate: "2026-10-01",
    });
  });

  it("ohne bekannte FTP bleibt „FTP bekannt?“ offen", () => {
    const a = initialWizardAnswers(
      { ...defaultFormState(null, TODAY), currentFtp: null, ftpMeasuredDate: null },
      { prefilled: false, role: null }
    );
    expect(a.ftpKnown).toBeNull();
    expect(a.ftpDate).toBe("");
  });
});
