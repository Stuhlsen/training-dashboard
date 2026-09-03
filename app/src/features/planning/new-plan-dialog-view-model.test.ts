import { describe, expect, it } from "vitest";
import {
  buildGeneratorInput,
  defaultFormState,
  mondayOf,
  suggestModel,
  type NewPlanFormState,
} from "./new-plan-dialog-view-model";

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

describe("defaultFormState", () => {
  it("startet am nächsten Montag und übernimmt die FTP aus der Config", () => {
    const state = defaultFormState(
      { ftpMeasured: 265, ftpMeasuredDate: "2026-06-24", eFTP: 261 },
      "2026-09-03",
    );
    expect(state.startDate).toBe("2026-09-07"); // Montag nach heute+7
    expect(state.currentFtp).toBe(265);
    expect(state.ftpMeasuredDate).toBe("2026-06-24");
    expect(state.trainingWeekdays.length).toBeGreaterThanOrEqual(2);
    expect(state.model).toBe(suggestModel({ level: state.level, weeks: state.weeks, weeklyHours: state.weeklyHours }));
  });

  it("fällt ohne gemessene FTP auf eFTP zurück, dann null", () => {
    expect(defaultFormState({ ftpMeasured: null, ftpMeasuredDate: null, eFTP: 200 }, "2026-09-03").currentFtp).toBe(200);
    expect(defaultFormState(null, "2026-09-03").currentFtp).toBeNull();
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
  weeklyHours: 6,
  currentFtp: 265,
  ftpMeasuredDate: "2026-06-24",
  ftpTarget: null,
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
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "ev1" },
      (id) => (id === "ev1" ? "2026-12-06" : null),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.eventDate).toBe("2026-12-06");
    expect(res.input.weeks).toBeUndefined();
  });

  it("event-Modus: Renntag zu weit weg (> 40 Wochen) -> Fehler", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "ev1" },
      () => "2028-06-01", // ~90 Wochen nach dem Start
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.event).toMatch(/40 Wochen/);
  });

  it("event-Modus: Renntag knapp innerhalb 40 Wochen -> ok", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "ev1" },
      () => "2027-06-01", // ~38 Wochen nach dem 2026-09-07-Start
    );
    expect(res.ok).toBe(true);
  });

  it("event-Modus: Renntag vor dem Start -> Fehler", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "ev1" },
      () => "2026-09-01",
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.event).toBeTruthy();
  });

  it("event-Modus: neues Event ohne Namen -> Fehler", () => {
    const res = buildGeneratorInput(
      { ...BASE, mode: "event", eventId: "", newEventDate: "2026-12-06", newEventName: "  " },
      noEvent,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.newEventName).toBeTruthy();
  });

  it("reicht die Historie unverändert durch", () => {
    const history = { weeklyActualTss: [300, 320] };
    const res = buildGeneratorInput(BASE, noEvent, history);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.input.history).toBe(history);
  });
});
