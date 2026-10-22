import { describe, expect, it } from "vitest";
import {
  buildGeneratorInput,
  defaultFormState,
  FIXED_INTERVAL_TYP,
  FOCUS_DESCRIPTIONS,
  formFromLastPlan,
  ftpTestAutoReason,
  ftpTestNote,
  LEVEL_DESCRIPTIONS,
  levelFromExperience,
  MODEL_DESCRIPTIONS,
  mondayOf,
  parseDescriptionSegments,
  planSummaryRows,
  resolveHasIndoorTrainer,
  resolveMeasuredFtp,
  suggestModel,
  type NewPlanFormState,
  type PlanFocus,
  type PlanLevel,
  type PlanModel,
} from "./new-plan-dialog-view-model";
import type { FtpHistoryEntry } from "../../api/supabase/ftp-history";
import type { TrainingPlan } from "../../api/types";

describe("mondayOf", () => {
  it("gibt den Montag derselben Woche zurück", () => {
    expect(mondayOf("2026-09-03")).toBe("2026-08-31"); // Do -> Mo
    expect(mondayOf("2026-08-31")).toBe("2026-08-31"); // Mo -> Mo
    expect(mondayOf("2026-09-06")).toBe("2026-08-31"); // So -> Mo
  });
});

describe("suggestModel", () => {
  it("Einsteiger -> linear", () => {
    expect(suggestModel({ level: "einsteiger", weeks: 8, weeklyHours: 10 })).toBe("linear");
  });

  it("Fortgeschritten, lange Vorlaufzeit + wenig Zeit -> linear", () => {
    expect(suggestModel({ level: "fortgeschritten", weeks: 16, weeklyHours: 6 })).toBe("linear");
  });

  it("Fortgeschritten, Standardfall -> pyramidal", () => {
    expect(suggestModel({ level: "fortgeschritten", weeks: 12, weeklyHours: 8 })).toBe("pyramidal");
  });
});

describe("levelFromExperience", () => {
  it("unter1Jahr -> einsteiger", () => {
    expect(levelFromExperience("unter1Jahr")).toBe("einsteiger");
  });

  it("ueber1Jahr -> fortgeschritten", () => {
    expect(levelFromExperience("ueber1Jahr")).toBe("fortgeschritten");
  });
});

describe("defaultFormState", () => {
  it("startet am nächsten Montag und übernimmt die FTP aus der Config", () => {
    const state = defaultFormState(
      { ftpMeasured: 265, ftpMeasuredDate: "2026-06-24", eFTP: 261 },
      "2026-09-03"
    );
    expect(state.startDate).toBe("2026-09-07"); // Montag nach heute+7
    expect(state.currentFtp).toBe(265);
    expect(state.ftpMeasuredDate).toBe("2026-06-24");
    expect(state.trainingWeekdays.length).toBeGreaterThanOrEqual(2);
    expect(state.model).toBe(
      suggestModel({ level: state.level, weeks: state.weeks, weeklyHours: state.weeklyHours })
    );
  });

  it("fällt ohne gemessene FTP auf eFTP zurück, dann null", () => {
    expect(
      defaultFormState({ ftpMeasured: null, ftpMeasuredDate: null, eFTP: 200 }, "2026-09-03")
        .currentFtp
    ).toBe(200);
    expect(defaultFormState(null, "2026-09-03").currentFtp).toBeNull();
  });

  it("bevorzugt den neuesten ftp_history-Ramp-Test vor dem config.ts-Wert", () => {
    const entries: FtpHistoryEntry[] = [
      { id: "1", ftpWatt: 193, validFrom: "2026-06-12", source: "ramp-test", note: null },
      { id: "2", ftpWatt: 205, validFrom: "2026-08-22", source: "ramp-test", note: null },
    ];
    const state = defaultFormState(
      { ftpMeasured: 193, ftpMeasuredDate: "2026-06-12", eFTP: 213 },
      "2026-09-21",
      entries
    );
    expect(state.currentFtp).toBe(205);
    expect(state.ftpMeasuredDate).toBe("2026-08-22");
  });
});

describe("resolveMeasuredFtp", () => {
  const cfg = { ftpMeasured: 193, ftpMeasuredDate: "2026-06-12", eFTP: 213 };
  const today = "2026-09-21";

  it("ohne Historie: Fallback auf config.ts", () => {
    expect(resolveMeasuredFtp(cfg, [], today)).toEqual({
      ftpMeasured: 193,
      ftpMeasuredDate: "2026-06-12",
    });
    expect(resolveMeasuredFtp(null, [], today)).toEqual({
      ftpMeasured: null,
      ftpMeasuredDate: null,
    });
  });

  it("nimmt den jüngsten ramp-test-Eintrag, egal in welcher Reihenfolge geliefert", () => {
    const entries: FtpHistoryEntry[] = [
      { id: "2", ftpWatt: 205, validFrom: "2026-08-22", source: "ramp-test", note: null },
      { id: "1", ftpWatt: 193, validFrom: "2026-06-12", source: "ramp-test", note: null },
    ];
    expect(resolveMeasuredFtp(cfg, entries, today)).toEqual({
      ftpMeasured: 205,
      ftpMeasuredDate: "2026-08-22",
    });
  });

  it("ignoriert 'schaetzung'-Einträge — nur ramp-test zählt als gemessen", () => {
    const entries: FtpHistoryEntry[] = [
      { id: "1", ftpWatt: 193, validFrom: "2026-06-12", source: "ramp-test", note: null },
      { id: "2", ftpWatt: 220, validFrom: "2026-09-10", source: "schaetzung", note: null },
    ];
    expect(resolveMeasuredFtp(cfg, entries, today)).toEqual({
      ftpMeasured: 193,
      ftpMeasuredDate: "2026-06-12",
    });
  });

  it("nur schaetzung-Einträge vorhanden -> Fallback auf config.ts wie bei leerer Historie", () => {
    const entries: FtpHistoryEntry[] = [
      { id: "1", ftpWatt: 220, validFrom: "2026-09-10", source: "schaetzung", note: null },
    ];
    expect(resolveMeasuredFtp(cfg, entries, today)).toEqual({
      ftpMeasured: 193,
      ftpMeasuredDate: "2026-06-12",
    });
  });

  it("ignoriert einen zukünftig datierten ramp-test-Eintrag (currentFtpEntry()-Deckel)", () => {
    const entries: FtpHistoryEntry[] = [
      { id: "1", ftpWatt: 193, validFrom: "2026-06-12", source: "ramp-test", note: null },
      { id: "2", ftpWatt: 230, validFrom: "2026-10-01", source: "ramp-test", note: null }, // nach `today`
    ];
    expect(resolveMeasuredFtp(cfg, entries, today)).toEqual({
      ftpMeasured: 193,
      ftpMeasuredDate: "2026-06-12",
    });
  });
});

const BASE: NewPlanFormState = {
  mode: "open",
  eventId: "",
  newEventDate: "",
  newEventName: "",
  weeks: 12,
  startDate: "2026-09-07",
  trainingWeekdays: [2, 4, 6],
  fixedDays: [],
  weeklyHours: 6,
  currentFtp: 265,
  ftpMeasuredDate: "2026-06-24",
  ftpTarget: null,
  currentThresholdSpeed: null,
  thresholdSpeedMeasuredDate: null,
  thresholdSpeedTarget: null,
  focus: "allgemein",
  level: "fortgeschritten",
  model: "pyramidal",
};

const noEvent = () => null;

describe("buildGeneratorInput", () => {
  it("open-Modus: gültiges Formular -> ok, Startdatum auf Montag normalisiert", () => {
    const res = buildGeneratorInput({ ...BASE, startDate: "2026-09-09" }, noEvent);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.startDate).toBe("2026-09-07");
    expect(res.input.mode).toBe("open");
    expect(res.input.weeks).toBe(12);
    expect(res.input.eventDate).toBeUndefined();
    // Fahrplan 32 E5: der Indoor-Prozent-Regler ist weg, kein Wert im Input.
    expect("indoorShare" in res.input).toBe(false);
  });

  it("fester Intervalltag (FIXED_INTERVAL_TYP) ist ein gültiger fester Tag", () => {
    const res = buildGeneratorInput(
      { ...BASE, fixedDays: [{ weekday: 4, typ: FIXED_INTERVAL_TYP, keepInRecoveryWeek: false }] },
      noEvent
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.fixedDays).toEqual([
      { weekday: 4, typ: FIXED_INTERVAL_TYP, keepInRecoveryWeek: false },
    ]);
  });

  it("fester Tag mit Dauer: Dauer geht in den Generator-Input", () => {
    const res = buildGeneratorInput(
      { ...BASE, fixedDays: [{ weekday: 4, typ: "Gruppenfahrt", keepInRecoveryWeek: false, durationMin: 60 }] },
      noEvent
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.fixedDays).toEqual([
      { weekday: 4, typ: "Gruppenfahrt", keepInRecoveryWeek: false, durationMin: 60 },
    ]);
  });

  it("fester Tag ohne Dauer: Input trägt kein durationMin-Feld", () => {
    const res = buildGeneratorInput(
      { ...BASE, fixedDays: [{ weekday: 4, typ: "Gruppenfahrt", keepInRecoveryWeek: false }] },
      noEvent
    );
    expect(res.ok && "durationMin" in res.input.fixedDays![0]).toBe(false);
  });

  it("Dauer außerhalb 15..300 oder nicht ganzzahlig -> Fehler", () => {
    for (const durationMin of [14, 301, 45.5, Number.NaN]) {
      const res = buildGeneratorInput(
        { ...BASE, fixedDays: [{ weekday: 4, typ: "Gruppenfahrt", keepInRecoveryWeek: false, durationMin }] },
        noEvent
      );
      expect(res.ok, `durationMin ${durationMin}`).toBe(false);
      if (!res.ok) expect(res.errors.fixedDayDuration).toBeTruthy();
    }
  });

  it("Grenzwerte 15 und 300 sind gültig", () => {
    for (const durationMin of [15, 300]) {
      const res = buildGeneratorInput(
        { ...BASE, fixedDays: [{ weekday: 4, typ: "Gruppenfahrt", keepInRecoveryWeek: false, durationMin }] },
        noEvent
      );
      expect(res.ok, `durationMin ${durationMin}`).toBe(true);
    }
  });

  it("fester Intervalltag: Dauer wird nicht an den Generator gereicht", () => {
    const res = buildGeneratorInput(
      { ...BASE, fixedDays: [{ weekday: 4, typ: FIXED_INTERVAL_TYP, keepInRecoveryWeek: false, durationMin: 60 }] },
      noEvent
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.fixedDays).toEqual([
      { weekday: 4, typ: FIXED_INTERVAL_TYP, keepInRecoveryWeek: false },
    ]);
  });

  it("fester Tag mit unbekanntem Typ -> Fehler", () => {
    const res = buildGeneratorInput(
      { ...BASE, fixedDays: [{ weekday: 4, typ: "Quatsch", keepInRecoveryWeek: false }] },
      noEvent
    );
    expect(res.ok).toBe(false);
  });

  it("weniger als zwei Trainingstage -> Fehler", () => {
    const res = buildGeneratorInput({ ...BASE, trainingWeekdays: [3] }, noEvent);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.trainingWeekdays).toBeTruthy();
  });

  it("open-Modus: Wochen außerhalb 3..40 -> Fehler", () => {
    expect(buildGeneratorInput({ ...BASE, weeks: 2 }, noEvent).ok).toBe(false);
    expect(buildGeneratorInput({ ...BASE, weeks: 41 }, noEvent).ok).toBe(false);
  });

  it("fehlendes Zeitbudget -> Fehler", () => {
    const res = buildGeneratorInput({ ...BASE, weeklyHours: 0 }, noEvent);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.weeklyHours).toBeTruthy();
  });

  it("event-Modus: gewähltes Event liefert eventDate, keine weeks", () => {
    const res = buildGeneratorInput({ ...BASE, mode: "event", eventId: "ev1" }, (id) =>
      id === "ev1" ? "2026-12-06" : null
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.eventDate).toBe("2026-12-06");
    expect(res.input.weeks).toBeUndefined();
  });

  it("event-Modus: Renntag zu weit weg (> 40 Wochen) -> Fehler", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "ev1" },
      () => "2028-06-01" // ~90 Wochen nach dem Start
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.event).toMatch(/40 Wochen/);
  });

  it("event-Modus: Renntag knapp innerhalb 40 Wochen -> ok", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "ev1" },
      () => "2027-06-01" // ~38 Wochen nach dem 2026-09-07-Start
    );
    expect(res.ok).toBe(true);
  });

  it("event-Modus: Renntag vor dem Start -> Fehler", () => {
    const res = buildGeneratorInput({ ...BASE, mode: "event", eventId: "ev1" }, () => "2026-09-01");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.event).toBeTruthy();
  });

  it("event-Modus: neues Event ohne Namen -> Fehler", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "", newEventDate: "2026-12-06", newEventName: "  " },
      noEvent
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.newEventName).toBeTruthy();
  });

  it("reicht die Historie unverändert durch", () => {
    const history = { weeklyActualTss: [300, 320] };
    const res = buildGeneratorInput(BASE, noEvent, "ride", history);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.history).toBe(history);
  });
});

describe("LEVEL_DESCRIPTIONS / FOCUS_DESCRIPTIONS", () => {
  const LEVELS: PlanLevel[] = ["einsteiger", "fortgeschritten"];
  const FOCI: PlanFocus[] = ["allgemein", "berg", "langstrecke", "crit"];

  it("jeder PlanLevel-Wert hat einen nicht-leeren Erklärtext", () => {
    for (const level of LEVELS) {
      expect(LEVEL_DESCRIPTIONS[level].trim().length).toBeGreaterThan(0);
    }
  });

  it("jeder PlanFocus-Wert hat einen nicht-leeren Erklärtext", () => {
    for (const focus of FOCI) {
      expect(FOCUS_DESCRIPTIONS[focus].trim().length).toBeGreaterThan(0);
    }
  });
});

describe("parseDescriptionSegments", () => {
  it("zerlegt mehrere Teilsätze an ' · ' und liest das Vorzeichen", () => {
    expect(parseDescriptionSegments("+Erstes Plus · −Erstes Minus · +Zweites Plus")).toEqual([
      { text: "Erstes Plus", sign: "plus" },
      { text: "Erstes Minus", sign: "minus" },
      { text: "Zweites Plus", sign: "plus" },
    ]);
  });

  it("ein einzelnes Segment ohne Trenner", () => {
    expect(parseDescriptionSegments("+Nur ein Segment")).toEqual([
      { text: "Nur ein Segment", sign: "plus" },
    ]);
  });

  it("Segment ohne führendes Zeichen -> Fallback sign 'plus'", () => {
    expect(parseDescriptionSegments("Kein Vorzeichen")).toEqual([
      { text: "Kein Vorzeichen", sign: "plus" },
    ]);
  });

  it("alle drei echten Beschreibungs-Konstanten parsen ohne Rest-Fehler", () => {
    const LEVELS: PlanLevel[] = ["einsteiger", "fortgeschritten"];
    const FOCI: PlanFocus[] = ["allgemein", "berg", "langstrecke", "crit"];
    const MODELS: PlanModel[] = ["pyramidal", "linear", "polarized", "block", "reverse"];

    for (const level of LEVELS) {
      for (const seg of parseDescriptionSegments(LEVEL_DESCRIPTIONS[level])) {
        expect(seg.text.startsWith("+")).toBe(false);
        expect(seg.text.startsWith("−")).toBe(false);
      }
    }
    for (const focus of FOCI) {
      for (const seg of parseDescriptionSegments(FOCUS_DESCRIPTIONS[focus])) {
        expect(seg.text.startsWith("+")).toBe(false);
        expect(seg.text.startsWith("−")).toBe(false);
      }
    }
    for (const model of MODELS) {
      for (const seg of parseDescriptionSegments(MODEL_DESCRIPTIONS[model])) {
        expect(seg.text.startsWith("+")).toBe(false);
        expect(seg.text.startsWith("−")).toBe(false);
      }
    }
  });
});

describe("ftpTestAutoReason (V6)", () => {
  it("keine gemessene FTP -> an, 'keine-ftp'", () => {
    expect(ftpTestAutoReason("2026-09-07", null)).toEqual({ on: true, reason: "keine-ftp" });
  });

  it("Messung genau 42 Tage vor dem Start -> aus (Grenze: erst >42 Tage ist 'älter')", () => {
    expect(ftpTestAutoReason("2026-09-07", "2026-07-27")).toEqual({
      on: false,
      reason: "ftp-aktuell",
    });
  });

  it("Messung 43 Tage vor dem Start -> an, 'ftp-aelter-6-wochen'", () => {
    expect(ftpTestAutoReason("2026-09-07", "2026-07-26")).toEqual({
      on: true,
      reason: "ftp-aelter-6-wochen",
    });
  });

  it("frische Messung -> aus, 'ftp-aktuell'", () => {
    expect(ftpTestAutoReason("2026-09-07", "2026-08-30")).toEqual({
      on: false,
      reason: "ftp-aktuell",
    });
  });
});

describe("ftpTestNote", () => {
  it("Automatik: Text nennt den Grund samt Datum", () => {
    expect(ftpTestNote("2026-09-07", null, null)).toEqual({
      on: true,
      text: "an — noch keine FTP gemessen",
    });
    expect(ftpTestNote("2026-09-07", "2026-06-24", undefined)).toEqual({
      on: true,
      text: "an — letzte FTP älter als 6 Wochen (24.06.2026)",
    });
    expect(ftpTestNote("2026-09-07", "2026-08-30", null)).toEqual({
      on: false,
      text: "aus — FTP vom 30.08.2026 ist aktuell",
    });
  });

  it("manuell gegen die Automatik umgestellt -> 'von dir geändert'", () => {
    expect(ftpTestNote("2026-09-07", "2026-08-30", true)).toEqual({
      on: true,
      text: "an — von dir geändert",
    });
    expect(ftpTestNote("2026-09-07", null, false)).toEqual({
      on: false,
      text: "aus — von dir geändert",
    });
  });

  it("manuelle Wahl gleich der Automatik -> normaler Grund", () => {
    expect(ftpTestNote("2026-09-07", null, true).text).toBe("an — noch keine FTP gemessen");
  });
});

describe("resolveHasIndoorTrainer", () => {
  it("Profilwert gewinnt, auch false", () => {
    expect(resolveHasIndoorTrainer(true, false)).toBe(true);
    expect(resolveHasIndoorTrainer(false, true)).toBe(false);
  });

  it("Profil null -> plan-lokale Kopie, sonst null", () => {
    expect(resolveHasIndoorTrainer(null, true)).toBe(true);
    expect(resolveHasIndoorTrainer(null, false)).toBe(false);
    expect(resolveHasIndoorTrainer(null, null)).toBeNull();
    expect(resolveHasIndoorTrainer(null, undefined)).toBeNull();
  });
});

describe("buildGeneratorInput — dayEnvironment (V2/V5)", () => {
  const ENV = { 2: "indoor", 4: "any", 6: "outdoor" } as const;

  it("Rad + Rolle = true -> nur Nicht-'egal'-Tage im Input", () => {
    const res = buildGeneratorInput(
      { ...BASE, hasIndoorTrainer: true, dayEnvironment: { ...ENV } },
      noEvent,
      "ride"
    );
    expect(res.ok && res.input.dayEnvironment).toEqual({ 2: "indoor", 6: "outdoor" });
  });

  it("Tage, die nicht (mehr) Trainingstage sind, fallen heraus", () => {
    const res = buildGeneratorInput(
      { ...BASE, hasIndoorTrainer: true, dayEnvironment: { 2: "indoor", 5: "outdoor" } },
      noEvent,
      "ride"
    );
    expect(res.ok && res.input.dayEnvironment).toEqual({ 2: "indoor" });
  });

  it("alles 'egal' -> kein dayEnvironment-Feld", () => {
    const res = buildGeneratorInput(
      { ...BASE, hasIndoorTrainer: true, dayEnvironment: { 2: "any", 4: "any" } },
      noEvent,
      "ride"
    );
    expect(res.ok && "dayEnvironment" in res.input).toBe(false);
  });

  it.each([false, null, undefined])("Rolle = %s -> kein dayEnvironment", (role) => {
    const res = buildGeneratorInput(
      { ...BASE, hasIndoorTrainer: role, dayEnvironment: { ...ENV } },
      noEvent,
      "ride"
    );
    expect(res.ok && "dayEnvironment" in res.input).toBe(false);
  });

  it.each(["run", "swim"] as const)("Sport %s -> kein dayEnvironment trotz Rolle", (sport) => {
    const res = buildGeneratorInput(
      { ...BASE, hasIndoorTrainer: true, dayEnvironment: { ...ENV } },
      noEvent,
      sport
    );
    expect(res.ok && "dayEnvironment" in res.input).toBe(false);
  });
});

describe("planSummaryRows", () => {
  it("Start fett, dann Wochen, Stunden/Woche und FTP-Test samt Grund", () => {
    const rows = planSummaryRows({
      startDate: "2026-09-07",
      weeks: 12,
      weeklyHours: 6.5,
      ftp: { on: true, text: "an — noch keine FTP gemessen" },
    });
    expect(rows).toEqual([
      { label: "Start", value: "07.09.2026", strong: true },
      { label: "Wochen", value: "12" },
      { label: "Stunden/Woche", value: "6,5 h" },
      { label: "FTP-Test", value: "an — noch keine FTP gemessen" },
    ]);
  });

  it("ohne FTP-Zeile (Lauf/Schwimmen) fehlt die Zeile; ganze Stunden ohne Komma", () => {
    const rows = planSummaryRows({ startDate: "2026-09-07", weeks: 8, weeklyHours: 5, ftp: null });
    expect(rows.map((r) => r.label)).toEqual(["Start", "Wochen", "Stunden/Woche"]);
    expect(rows[2].value).toBe("5 h");
  });
});

describe("formFromLastPlan (Fahrplan 32 E6, PF17)", () => {
  const basePlan = {
    id: "p1",
    mode: "open",
    weeks: 10,
    level: "einsteiger",
    focus: "berg",
    trainingWeekdays: [1, 3, 5],
    weeklyHours: 5.5,
    sport: "ride",
    params: {},
  } as unknown as TrainingPlan;

  it("übernimmt Spalten und neue params.form-Felder", () => {
    const plan = {
      ...basePlan,
      params: {
        form: {
          fixedDays: [{ weekday: 3, typ: "Z2 Dauer", keepInRecoveryWeek: true, durationMin: 90 }],
          dayEnvironment: { 1: "indoor", 3: "any", 5: "outdoor" },
          hasIndoorTrainer: true,
        },
      },
    } as unknown as TrainingPlan;
    expect(formFromLastPlan(plan)).toEqual({
      weeks: 10,
      level: "einsteiger",
      focus: "berg",
      trainingWeekdays: [1, 3, 5],
      weeklyHours: 5.5,
      fixedDays: [{ weekday: 3, typ: "Z2 Dauer", keepInRecoveryWeek: true, durationMin: 90 }],
      dayEnvironment: { 1: "indoor", 5: "outdoor" },
      hasIndoorTrainer: true,
    });
  });

  it("funktioniert mit alten Plänen ohne params.form", () => {
    expect(formFromLastPlan(basePlan)).toEqual({
      weeks: 10,
      level: "einsteiger",
      focus: "berg",
      trainingWeekdays: [1, 3, 5],
      weeklyHours: 5.5,
      fixedDays: [],
    });
  });

  it("lässt Planlänge eines Event-Plans weg (aus Renntag abgeleitet) und ignoriert kaputte Felder", () => {
    const plan = {
      ...basePlan,
      mode: "event",
      weeklyHours: null,
      params: { form: { fixedDays: "kaputt", dayEnvironment: 7, hasIndoorTrainer: "ja" } },
    } as unknown as TrainingPlan;
    const form = formFromLastPlan(plan);
    expect(form).not.toHaveProperty("weeks");
    expect(form).not.toHaveProperty("weeklyHours");
    expect(form).not.toHaveProperty("dayEnvironment");
    expect(form).not.toHaveProperty("hasIndoorTrainer");
    expect(form.fixedDays).toEqual([]);
  });

  it("übernimmt feste Tage und Umgebung nur beim Rad-Plan", () => {
    const plan = {
      ...basePlan,
      sport: "run",
      params: {
        form: {
          fixedDays: [{ weekday: 3, typ: "Z2 Dauer", keepInRecoveryWeek: false }],
          dayEnvironment: { 1: "indoor" },
          hasIndoorTrainer: true,
        },
      },
    } as unknown as TrainingPlan;
    const form = formFromLastPlan(plan);
    expect(form.fixedDays).toEqual([]);
    expect(form).not.toHaveProperty("dayEnvironment");
  });
});
