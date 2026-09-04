import { describe, expect, it } from "vitest";
import { buildWeekGrid } from "./week-grid-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

const TODAY = "2026-08-12"; // Mittwoch der KW33-Woche unten (Mo 10.08–So 16.08)

function card(overrides: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: "Session",
    typ: "Z2 Dauer",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: "Aufbau 2",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function ride(dateISO: string): Ride {
  return { dateISO } as Ride;
}

function cellFor(grid: ReturnType<typeof buildWeekGrid>, date: string) {
  for (const week of grid) {
    const day = week.days.find((d) => d.date === date);
    if (day) return day;
  }
  throw new Error(`Kein Tag für ${date} im Raster`);
}

describe("buildWeekGrid — Status je Tag", () => {
  it("markiert eine absolvierte Karte (Ride am selben Datum) als 'done'", () => {
    const cards = [card({ id: "a", date: "2026-08-10" })];
    const grid = buildWeekGrid(cards, [ride("2026-08-10")], TODAY);
    expect(cellFor(grid, "2026-08-10").status).toBe("done");
  });

  it("markiert den heutigen, noch nicht gefahrenen Tag als 'today'", () => {
    const cards = [card({ id: "a", date: TODAY })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(cellFor(grid, TODAY).status).toBe("today");
  });

  it("markiert eine zukünftige Karte als 'open'", () => {
    const cards = [card({ id: "a", date: "2026-08-14" })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(cellFor(grid, "2026-08-14").status).toBe("open");
  });

  it("markiert eine vergangene, nicht gefahrene, nicht verschobene Karte als 'missed'", () => {
    const cards = [card({ id: "a", date: "2026-08-10" })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(cellFor(grid, "2026-08-10").status).toBe("missed");
  });

  it("markiert eine verschobene Karte als 'missed', wenn auch ihr neues Datum vergangen ist", () => {
    const cards = [card({ id: "a", date: "2026-08-10", originalDate: "2026-08-09" })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(cellFor(grid, "2026-08-10").status).toBe("missed");
  });

  it("markiert eine ausgefallene Karte als 'cancelled'", () => {
    const cards = [card({ id: "a", date: "2026-08-10", cancelled: true })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(cellFor(grid, "2026-08-10").status).toBe("cancelled");
  });

  it("markiert einen leeren Tag (keine Karte) als 'empty' mit card=null", () => {
    const cards = [card({ id: "a", date: "2026-08-10" })];
    const grid = buildWeekGrid(cards, [], TODAY);
    const empty = cellFor(grid, "2026-08-11");
    expect(empty.status).toBe("empty");
    expect(empty.card).toBeNull();
  });

  it("Ruhetag gilt vergangen als 'done', künftig als 'open' — nie 'missed'", () => {
    const cards = [
      card({ id: "past", date: "2026-08-10", typ: "Ruhetag" }),
      card({ id: "future", date: "2026-08-14", typ: "Ruhetag" }),
    ];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(cellFor(grid, "2026-08-10").status).toBe("done");
    expect(cellFor(grid, "2026-08-14").status).toBe("open");
  });
});

describe("buildWeekGrid — abgeleiteter Ruhetag aus dem Plan-Wochen-Modell (Fahrplan 6 RUH4)", () => {
  // athlete1, KW33 (Mo 10.08.–So 16.08.): trainingWeekdays [1,2,4,5,6] →
  // Mi + So sind Ruhe-Slots, Do ist Trainings-Slot.
  const thuCard = [card({ id: "thu", date: "2026-08-13" })];

  it("Tag ohne Karte auf einem Ruhe-Slot → status 'rest', card null", () => {
    const grid = buildWeekGrid(thuCard, [], TODAY, "athlete1");
    expect(cellFor(grid, "2026-08-12").status).toBe("rest"); // Mi
    expect(cellFor(grid, "2026-08-16").status).toBe("rest"); // So
    expect(cellFor(grid, "2026-08-12").card).toBeNull();
  });

  it("Tag mit Karte bleibt normaler Status, Trainings-Slot ohne Karte bleibt 'empty'", () => {
    const grid = buildWeekGrid(thuCard, [], TODAY, "athlete1");
    expect(cellFor(grid, "2026-08-13").status).toBe("open"); // Do, hat Karte
    expect(cellFor(grid, "2026-08-10").status).toBe("empty"); // Mo, Trainings-Slot ohne Karte
  });

  it("ohne athleteId bleibt ein Ruhe-Slot-Tag 'empty' (Ableitung ist opt-in)", () => {
    const grid = buildWeekGrid(thuCard, [], TODAY);
    expect(cellFor(grid, "2026-08-12").status).toBe("empty");
  });

  it("row.phase kommt aus dem Modell, wenn athleteId gesetzt ist", () => {
    expect(buildWeekGrid(thuCard, [], TODAY, "athlete1")[0].phase).toBe("Schwelle");
    expect(buildWeekGrid(thuCard, [], TODAY)[0].phase).toBe("Aufbau 2"); // Fallback: Karten-Phase
  });

  // Migration 0026: plan_offset_weeks verschiebt die Ruhe-Slot-Ableitung mit.
  it("offsetWeeks verschiebt die abgeleiteten Ruhetage um N ganze Wochen", () => {
    // Athlet 4, KW36-Vorlage (Mo 2026-08-31). Di ist Trainings-Slot, Mi ist
    // Ruhe-Slot. Ohne Offset: 2026-09-02 (Mi) → 'rest'.
    const tue36 = [card({ id: "t36", date: "2026-09-01" })];
    expect(cellFor(buildWeekGrid(tue36, [], TODAY, "athlete4"), "2026-09-02").status).toBe("rest");
    // Mit +1 Woche liegt 2026-09-02 vor dem verschobenen Planstart → 'empty'.
    expect(
      cellFor(buildWeekGrid(tue36, [], TODAY, "athlete4", undefined, 1), "2026-09-02").status,
    ).toBe("empty");
    // Der verschobene Mi (2026-09-09) ist jetzt der Ruhe-Slot.
    const tue37 = [card({ id: "t37", date: "2026-09-08" })];
    expect(
      cellFor(buildWeekGrid(tue37, [], TODAY, "athlete4", undefined, 1), "2026-09-09").status,
    ).toBe("rest");
  });

  // Fahrplan 8 E7: hat der Athlet einen aktiven training_plans-Eintrag, kommen
  // Phase + Ruhe-Slots aus dessen week_model statt aus der Code-Vorlage.
  it("weekModel überschreibt Phase + Ruhe-/Trainings-Slots der Code-Vorlage", () => {
    // athlete1/KW33 laut Code-Vorlage: phase "Schwelle", Training [1,2,4,5,6]
    // (Mi + So Ruhe). Modell sagt: phase "Grundlage", Training [1,3,5].
    const wm = [
      {
        week: "P-KW33",
        phase: "Grundlage",
        start: "2026-08-10",
        end: "2026-08-16",
        trainingWeekdays: [1, 3, 5],
        targetTss: 300,
      },
    ];
    const thuCard = [card({ id: "thu", date: "2026-08-13" })];
    const grid = buildWeekGrid(thuCard, [], TODAY, "athlete1", undefined, 0, wm);
    expect(grid[0].phase).toBe("Grundlage");
    // Mi (3) ist im Modell ein Trainings-Slot → ohne Karte 'empty' (Code-Vorlage: 'rest').
    expect(cellFor(grid, "2026-08-12").status).toBe("empty");
    // Di (2) ist im Modell KEIN Trainings-Slot → ohne Karte 'rest' (Code-Vorlage: 'empty').
    expect(cellFor(grid, "2026-08-11").status).toBe("rest");
  });
});

describe("buildWeekGrid — Mehrfachkarten am selben Datum", () => {
  it("zeigt die nicht-ausgefallene Karte primär, die ausgefallene als otherCards", () => {
    const cancelledOriginal = card({ id: "orig", date: "2026-08-10", cancelled: true, name: "Original" });
    const replacement = card({ id: "repl", date: "2026-08-10", name: "Ersatz" });
    const grid = buildWeekGrid([cancelledOriginal, replacement], [], TODAY);
    const cell = cellFor(grid, "2026-08-10");
    expect(cell.card?.id).toBe("repl");
    expect(cell.otherCards.map((c) => c.id)).toEqual(["orig"]);
  });
});

describe("buildWeekGrid — Wochenstruktur", () => {
  it("baut eine Woche mit exakt 7 Tagen, Montag zuerst", () => {
    const cards = [card({ id: "a", date: "2026-08-12" })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(grid).toHaveLength(1);
    expect(grid[0].days).toHaveLength(7);
    expect(grid[0].rangeStart).toBe("2026-08-10"); // Montag
    expect(grid[0].rangeEnd).toBe("2026-08-16"); // Sonntag
  });

  it("summiert tssPlanned nur über nicht-ausgefallene Karten der Woche", () => {
    const cards = [
      card({ id: "a", date: "2026-08-10", tssPlanned: 80 }),
      card({ id: "b", date: "2026-08-11", tssPlanned: 50, cancelled: true }),
      card({ id: "c", date: "2026-08-12", tssPlanned: 100 }),
    ];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(grid[0].tssSum).toBe(180);
  });

  it("zeigt die tatsächlich gefahrene TSS-Summe statt der geplanten, sobald die Woche Fahrten hat", () => {
    // Regression: tssSum zeigte vorher "0 TSS", wenn Karten kein tssPlanned
    // trugen (die meisten nicht) — obwohl real gefahren wurde.
    const cards = [card({ id: "a", date: "2026-08-10", tssPlanned: null })];
    const rides = [
      { ...ride("2026-08-10"), tss: 65 },
      { ...ride("2026-08-12"), tss: 90 },
    ];
    const grid = buildWeekGrid(cards, rides, TODAY);
    expect(grid[0].tssSum).toBe(155);
  });

  it("fällt auf die geplante TSS-Summe zurück, solange die Woche keine Fahrten hat", () => {
    const cards = [card({ id: "a", date: "2026-08-10", tssPlanned: 80 })];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(grid[0].tssSum).toBe(80);
  });

  it("zeigt 0, nicht die geplante Summe, wenn die Woche Fahrten ohne TSS-Wert hat (Plan-1/Notion ohne Leistungsdaten)", () => {
    const cards = [card({ id: "a", date: "2026-08-10", tssPlanned: 80 })];
    const rides = [{ ...ride("2026-08-10"), tss: null }];
    const grid = buildWeekGrid(cards, rides, TODAY);
    expect(grid[0].tssSum).toBe(0);
  });

  it("gibt loadPct relativ zur höchsten Wochenlast zurück (Maximum = 100)", () => {
    const cards = [
      card({ id: "a", date: "2026-08-10", tssPlanned: 200 }), // Woche 1
      card({ id: "b", date: "2026-08-19", tssPlanned: 100 }), // Woche 2
    ];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(grid[0].loadPct).toBe(100);
    expect(grid[1].loadPct).toBe(50);
  });

  it("übernimmt das isRecoveryWeek-Flag aus plannedRecoveryWeeks()", () => {
    // plannedRecoveryWeeks() erkennt Erholungswochen am Anteil Ruhetag-/
    // Z1-Recovery-Karten (≥50% der Kartentage einer ISO-Woche).
    const recoveryWeekCards = [
      card({ id: "a", date: "2026-08-10", typ: "Ruhetag" }),
      card({ id: "b", date: "2026-08-11", typ: "Z1 Recovery" }),
      card({ id: "c", date: "2026-08-12", typ: "Sweet Spot" }),
    ];
    const normalWeekCards = [card({ id: "d", date: "2026-08-19", typ: "Sweet Spot" })];
    const grid = buildWeekGrid([...recoveryWeekCards, ...normalWeekCards], [], TODAY);
    expect(grid[0].isRecoveryWeek).toBe(true);
    expect(grid[1].isRecoveryWeek).toBe(false);
  });

  it("liefert für ein leeres Karten-Array ein leeres Raster", () => {
    expect(buildWeekGrid([], [], TODAY)).toEqual([]);
  });

  it("lässt ganze Wochen vor der aktuellen weg, behält die laufende Woche trotz vergangener Tage komplett", () => {
    const cards = [
      card({ id: "past-week", date: "2026-08-03" }), // KW32, ganz vergangen
      card({ id: "current-week-past-day", date: "2026-08-10" }), // KW33, Montag (vergangen)
      card({ id: "current-week-future-day", date: "2026-08-14" }), // KW33, Freitag (zukünftig)
      card({ id: "future-week", date: "2026-08-19" }), // KW34, ganz zukünftig
    ];
    const grid = buildWeekGrid(cards, [], TODAY);
    expect(grid.map((w) => w.weekKey)).toEqual(["2026-KW33", "2026-KW34"]);
    expect(cellFor(grid, "2026-08-10").status).toBe("missed");
    expect(cellFor(grid, "2026-08-14").status).toBe("open");
  });
});
