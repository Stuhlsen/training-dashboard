import { describe, expect, it } from "vitest";
import {
  buildGeneratorInput,
  defaultFormState,
  FIXED_INTERVAL_TYP,
  FOCUS_DESCRIPTIONS,
  LEVEL_DESCRIPTIONS,
  levelFromExperience,
  MODEL_DESCRIPTIONS,
  mondayOf,
  parseDescriptionSegments,
  resolveMeasuredFtp,
  suggestModel,
  type NewPlanFormState,
  type PlanFocus,
  type PlanLevel,
  type PlanModel,
} from "./new-plan-dialog-view-model";
import type { FtpHistoryEntry } from "../../api/supabase/ftp-history";

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
  indoorPct: 40,
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
    expect(res.input.indoorShare).toBeCloseTo(0.4);
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
