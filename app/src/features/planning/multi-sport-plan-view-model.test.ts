/* Tests: features/planning/multi-sport-plan-view-model.ts (Fahrplan 44 E4) —
 * reine Logik hinter dem „Neuer Plan"-Dialog für mehrere Sportarten:
 * Auswahl, Vorbelegung, Formular → ein Input je Sportart (über allocateWeek),
 * Lastsumme („Näherung") und „ersetzt"-Hinweise. */

import { describe, expect, it } from "vitest";
import { allocateWeek } from "../../core/multi-sport-allocator.js";
import {
  buildMultiSportInputs,
  defaultSportDrafts,
  loadSummary,
  planWeeks,
  primaryDraft,
  replaceNotes,
  selectableSports,
  toggleSport,
  type SportDrafts,
} from "./multi-sport-plan-view-model";
import { defaultFormState, type GeneratedPlan } from "./new-plan-dialog-view-model";

const TODAY = "2026-11-05";
const noEvent = () => null;

function shared(over: Record<string, unknown> = {}) {
  return { ...defaultFormState(null, TODAY), ...over };
}

function drafts(over: Partial<SportDrafts> = {}): SportDrafts {
  return { ...defaultSportDrafts(shared()), ...over };
}

describe("selectableSports / toggleSport", () => {
  it("lässt nur Rad, Laufen, Schwimmen zu — in fester Reihenfolge", () => {
    expect(selectableSports(["swim", "other", "ride"] as never)).toEqual(["ride", "swim"]);
    expect(selectableSports([])).toEqual([]);
  });

  it("wählt dazu und sortiert nach Vorrang (Rad, Laufen, Schwimmen)", () => {
    expect(toggleSport(["ride"], "swim")).toEqual(["ride", "swim"]);
    expect(toggleSport(["swim"], "ride")).toEqual(["ride", "swim"]);
  });

  it("nimmt eine Sportart wieder raus, aber nie die letzte", () => {
    expect(toggleSport(["ride", "run"], "run")).toEqual(["ride"]);
    expect(toggleSport(["ride"], "ride")).toEqual(["ride"]);
  });
});

describe("defaultSportDrafts", () => {
  it("Rad übernimmt Stunden, Tage und Level aus dem Formular", () => {
    const d = defaultSportDrafts(
      shared({ weeklyHours: 8, trainingWeekdays: [1, 3, 5], level: "einsteiger" }),
    );
    expect(d.ride).toMatchObject({ hours: 8, weekdays: [1, 3, 5], level: "einsteiger" });
  });

  it("Laufen und Schwimmen starten mit eigenen Tagen, die Rad nicht belegt", () => {
    const d = defaultSportDrafts(shared());
    for (const s of ["run", "swim"] as const) {
      expect(d[s].hours).toBeGreaterThan(0);
      expect(d[s].weekdays.length).toBeGreaterThanOrEqual(2);
      expect(d[s].currentThresholdSpeed).toBeNull();
    }
    expect(d.run.weekdays.filter((x) => d.ride.weekdays.includes(x))).toEqual([]);
  });
});

describe("primaryDraft", () => {
  it("liest die erste Sportart aus dem Dialog-Formular", () => {
    const d = primaryDraft(
      shared({
        weeklyHours: 7,
        trainingWeekdays: [2, 5],
        level: "einsteiger",
        currentThresholdSpeed: 11,
        thresholdSpeedTarget: 12,
      }),
    );
    expect(d).toEqual({
      hours: 7,
      weekdays: [2, 5],
      level: "einsteiger",
      currentThresholdSpeed: 11,
      thresholdSpeedTarget: 12,
    });
  });

  it("kopiert die Tage (keine geteilte Referenz)", () => {
    const f = shared({ trainingWeekdays: [2, 4] });
    const d = primaryDraft(f);
    d.weekdays.push(6);
    expect(f.trainingWeekdays).toEqual([2, 4]);
  });
});

describe("planWeeks", () => {
  it("offen: die gewählten Wochen", () => {
    expect(planWeeks(shared({ mode: "open", weeks: 10 }), noEvent)).toBe(10);
  });

  it("Event: Wochen vom Start-Montag bis zum Renntag", () => {
    const s = shared({ mode: "event", eventId: "e1", startDate: "2026-11-09" });
    expect(planWeeks(s, () => "2026-12-06")).toBe(4);
  });

  it("Event ohne Datum: fällt auf die Formularwochen zurück", () => {
    expect(planWeeks(shared({ mode: "event", eventId: "", weeks: 12 }), noEvent)).toBe(12);
  });
});

describe("buildMultiSportInputs", () => {
  const base = {
    shared: shared({ startDate: "2026-11-09", weeks: 8 }),
    rideModel: "linear" as const,
    resolveEventDate: noEvent,
    history: {},
  };

  it("liefert je Sportart einen Generator-Input mit den Stunden dieser Sportart", () => {
    const d = drafts();
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items.map((i) => i.sport)).toEqual(["ride", "run"]);
    expect(res.items[0].input.sport).toBe("ride");
    expect(res.items[0].input.weeklyHours).toBe(d.ride.hours);
    expect(res.items[1].input.sport).toBe("run");
    expect(res.items[1].input.weeklyHours).toBe(d.run.hours);
  });

  it("lässt den Radplan unberührt (M3): Tage wie eingegeben", () => {
    const d = drafts();
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    if (!res.ok) throw new Error("erwartet ok");
    expect(res.items[0].input.trainingWeekdays).toEqual(d.ride.weekdays);
  });

  it("reicht Schwellenpace und eigenes Level an die Laufsportart durch", () => {
    const d = drafts({
      run: { ...defaultSportDrafts(shared()).run, currentThresholdSpeed: 11.5, level: "einsteiger" },
    });
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    if (!res.ok) throw new Error("erwartet ok");
    expect(res.items[1].input.currentThresholdSpeed).toBe(11.5);
    expect(res.items[1].input.level).toBe("einsteiger");
    expect(res.items[1].input.currentFtp).toBeNull();
  });

  it("übernimmt die Pins der Verteilung auch für Laufen (buildGeneratorInput kennt feste Tage nur fürs Rad)", () => {
    const d = drafts({
      run: { ...defaultSportDrafts(shared()).run, weekdays: [1, 2, 3, 4, 5], hours: 5 },
    });
    const expected = allocateWeek({
      sports: [
        { sport: "ride", hours: d.ride.hours, weekdays: d.ride.weekdays, fixedDays: [] },
        { sport: "run", hours: d.run.hours, weekdays: d.run.weekdays, fixedDays: [] },
      ],
      blockedDays: [],
    });
    if (!expected.ok) throw new Error("erwartet ok");
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    if (!res.ok) throw new Error("erwartet ok");
    expect(res.items[1].input.fixedDays).toEqual(expected.plans[1].fixedDays);
    expect(res.items[1].input.trainingWeekdays).toEqual(expected.plans[1].trainingWeekdays);
  });

  it("Startdatum und Dauer gelten gemeinsam", () => {
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: drafts() });
    if (!res.ok) throw new Error("erwartet ok");
    expect(res.items[0].input.startDate).toBe(res.items[1].input.startDate);
    expect(res.items[0].input.weeks).toBe(res.items[1].input.weeks);
  });

  it("Event-Modus: beide Pläne tragen den Renntag", () => {
    const s = shared({ startDate: "2026-11-09", mode: "event", eventId: "e1" });
    const res = buildMultiSportInputs({
      ...base,
      shared: s,
      sports: ["ride", "run"],
      drafts: drafts(),
      resolveEventDate: () => "2026-12-20",
    });
    if (!res.ok) throw new Error("erwartet ok");
    expect(res.items.map((i) => i.input.eventDate)).toEqual(["2026-12-20", "2026-12-20"]);
  });

  it("meldet Hinweise der Verteilung, sperrt aber nichts (M4)", () => {
    const d = drafts({
      run: { ...defaultSportDrafts(shared()).run, hours: 12 }, // 12 h auf 3 Tage
    });
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hints.map((h) => h.code)).toContain("HOURS_DENSE");
    expect(res.hints.every((h) => typeof h.text === "string" && h.text.length > 0)).toBe(true);
  });

  it("bleibt die Verteilung ohne Tage für eine Sportart, kommt der Fehler MIT dem erklärenden Hinweis", () => {
    const d = drafts({
      run: { ...defaultSportDrafts(shared()).run, weekdays: [2, 4] }, // nur harte Radtage
    });
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors["run.trainingWeekdays"]).toMatch(/^Laufen:/);
    expect(res.hints?.map((h) => h.code)).toContain("DAYS_SHORT");
  });

  it("Eingabefehler je Sportart: Stunden ≤ 0 → Fehler mit Sportart, kein Ergebnis", () => {
    const d = drafts({ run: { ...defaultSportDrafts(shared()).run, hours: 0 } });
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "run"], drafts: d });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors["run.weeklyHours"]).toMatch(/^Laufen:/);
  });

  it("Eingabefehler je Sportart: weniger als zwei Tage", () => {
    const d = drafts({ swim: { ...defaultSportDrafts(shared()).swim, weekdays: [5] } });
    const res = buildMultiSportInputs({ ...base, sports: ["ride", "swim"], drafts: d });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors["swim.trainingWeekdays"]).toMatch(/^Schwimmen:/);
  });

  it("gemeinsame Fehler (Startdatum) erscheinen nur einmal", () => {
    const res = buildMultiSportInputs({
      ...base,
      shared: shared({ startDate: "" }),
      sports: ["ride", "run"],
      drafts: drafts(),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(Object.keys(res.errors).filter((k) => k.endsWith("startDate"))).toEqual(["startDate"]);
  });

  it("weniger als zwei Sportarten ist kein Fall für dieses Modul", () => {
    const res = buildMultiSportInputs({ ...base, sports: ["ride"], drafts: drafts() });
    expect(res.ok).toBe(false);
  });
});

describe("loadSummary", () => {
  // Last = Summe der geplanten Karten je Woche (nicht das Wochenziel `targetTss`).
  const plan = (weeks: Array<[string, number]>) =>
    ({
      weeks: weeks.map(([start, tss]) => ({
        start,
        targetTss: 999,
        cards: [{ tssPlanned: tss - 10 }, { tssPlanned: 10 }],
      })),
    }) as unknown as GeneratedPlan;

  it("zeigt jede Sportart als eigene Zeile plus Summe je Woche", () => {
    const s = loadSummary([
      { sport: "ride", plan: plan([["2026-11-09", 300], ["2026-11-16", 320]]) },
      { sport: "run", plan: plan([["2026-11-09", 100], ["2026-11-16", 120]]) },
    ]);
    expect(s.weekStarts).toEqual(["2026-11-09", "2026-11-16"]);
    expect(s.rows.map((r) => [r.sport, r.values])).toEqual([
      ["ride", [300, 320]],
      ["run", [100, 120]],
    ]);
    expect(s.total).toEqual([400, 440]);
    expect(s.rows[0].avg).toBe(310);
    expect(s.totalAvg).toBe(420);
  });

  it("benennt die Summe eine Näherung (M8)", () => {
    const s = loadSummary([{ sport: "ride", plan: plan([["2026-11-09", 300]]) }]);
    expect(s.totalLabel).toMatch(/Näherung/);
  });

  it("richtet Wochen am Startdatum aus; fehlende Wochen zählen 0", () => {
    const s = loadSummary([
      { sport: "ride", plan: plan([["2026-11-09", 300], ["2026-11-16", 300]]) },
      { sport: "run", plan: plan([["2026-11-16", 100]]) },
    ]);
    expect(s.rows[1].values).toEqual([0, 100]);
    expect(s.total).toEqual([300, 400]);
  });
});

describe("replaceNotes", () => {
  it("nennt je Sportart, welcher laufende Plan ersetzt wird", () => {
    const notes = replaceNotes(["ride", "run"], {
      ride: { endDate: "2026-12-20" },
      run: null,
    });
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ sport: "ride", replaces: true });
    expect(notes[0].text).toMatch(/Rad/);
    expect(notes[0].text).toMatch(/ersetzt/);
    expect(notes[1]).toMatchObject({ sport: "run", replaces: false });
    expect(notes[1].text).toMatch(/Laufen/);
  });

  it("kennt Sportarten ohne geladenen Plan als „kein Plan“", () => {
    const notes = replaceNotes(["swim"], {});
    expect(notes[0].replaces).toBe(false);
  });
});
