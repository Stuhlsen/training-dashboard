import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  DEFAULT_CATEGORIES,
  OPTIONAL_CATEGORIES,
  checkinToday,
  governorColor,
  isTrainerCardProposalMode,
  isTrainerProposalMode,
  lastRidesAvgRpe,
  sparklinePoints,
  tsbTileData,
  visibleTileKeys,
  wellbeing7dAverages,
} from "./trainer-bar-view-model";
import type { Checkin, EventItem } from "../../api/types";

type Ride = import("../../types.js").Ride;

const checkin = (over: Partial<Checkin> & { date: string }): Checkin =>
  ({ id: over.date, energy: 3, muscleFeel: 3, mood: 3, note: null, updatedAt: "t", ...over }) as Checkin;

describe("isTrainerProposalMode", () => {
  it("nur bei Trainer UND saveMode=proposal true", () => {
    expect(isTrainerProposalMode(true, "proposal")).toBe(true);
    expect(isTrainerProposalMode(true, "direct")).toBe(false);
    expect(isTrainerProposalMode(false, "proposal")).toBe(false);
    expect(isTrainerProposalMode(false, "direct")).toBe(false);
  });
});

describe("isTrainerCardProposalMode (T2)", () => {
  it("Neuanlage ist für den Trainer IMMER Vorschlag, unabhängig vom Modus", () => {
    expect(isTrainerCardProposalMode(true, false, "direct")).toBe(true);
    expect(isTrainerCardProposalMode(true, false, "proposal")).toBe(true);
  });

  it("bestehende Karte folgt dem Umschalter", () => {
    expect(isTrainerCardProposalMode(true, true, "proposal")).toBe(true);
    expect(isTrainerCardProposalMode(true, true, "direct")).toBe(false);
  });

  it("kein Trainer-Speichern → immer false", () => {
    expect(isTrainerCardProposalMode(false, false, "proposal")).toBe(false);
    expect(isTrainerCardProposalMode(false, true, "proposal")).toBe(false);
  });
});

describe("visibleTileKeys", () => {
  it("Default-Kategorien immer dabei, ohne gespeicherte Auswahl keine optionalen", () => {
    expect(visibleTileKeys([])).toEqual([...DEFAULT_CATEGORIES]);
  });

  it("gültige optionale Kategorien werden angehängt", () => {
    expect(visibleTileKeys(["conflicts", "ctlAtl"])).toEqual([...DEFAULT_CATEGORIES, "conflicts", "ctlAtl"]);
  });

  it("unbekannte/veraltete Kategorie-Strings werden gefiltert, nicht durchgereicht", () => {
    expect(visibleTileKeys(["conflicts", "irgendwas-altes"])).toEqual([...DEFAULT_CATEGORIES, "conflicts"]);
  });

  it("Default-Kategorien lassen sich nicht doppelt über die gespeicherte Auswahl einschleusen", () => {
    // DEFAULT_CATEGORIES stehen nicht in OPTIONAL_CATEGORIES, ein Versuch
    // sie über `categories` reinzuschieben wird also ohnehin gefiltert.
    expect(visibleTileKeys(["governor"])).toEqual([...DEFAULT_CATEGORIES]);
  });

  it("CATEGORY_LABELS deckt alle Default- und optionalen Kategorien ab", () => {
    for (const key of [...DEFAULT_CATEGORIES, ...OPTIONAL_CATEGORIES]) {
      expect(CATEGORY_LABELS[key]).toBeTruthy();
    }
  });
});

describe("checkinToday", () => {
  it("findet den exakten Heute-Treffer", () => {
    const checkins = [checkin({ date: "2026-08-06" }), checkin({ date: "2026-08-07", energy: 5 })];
    expect(checkinToday(checkins, "2026-08-07")?.energy).toBe(5);
  });

  it("kein Treffer → null", () => {
    expect(checkinToday([checkin({ date: "2026-08-06" })], "2026-08-07")).toBeNull();
  });
});

describe("wellbeing7dAverages", () => {
  it("leere Historie → null", () => {
    expect(wellbeing7dAverages([])).toBeNull();
  });

  it("rundet auf eine Nachkommastelle", () => {
    const checkins = [
      checkin({ date: "1", energy: 3, mood: 4 }),
      checkin({ date: "2", energy: 4, mood: 5 }),
      checkin({ date: "3", energy: 5, mood: 3 }),
    ];
    expect(wellbeing7dAverages(checkins)).toEqual({ avgEnergy: "4.0", avgMood: "4.0" });
  });
});

describe("lastRidesAvgRpe", () => {
  const ride = (rpe: number | null): Ride => ({ rpe }) as Ride;

  it("keine RPE-Daten → null", () => {
    expect(lastRidesAvgRpe([ride(null), ride(null)])).toBeNull();
  });

  it("mittelt nur Fahrten mit RPE, nur die letzten 10", () => {
    const rides = [...Array(12).keys()].map((i) => ride(i < 2 ? null : 5));
    expect(lastRidesAvgRpe(rides)).toBe("5.0");
  });
});

describe("sparklinePoints", () => {
  it("weniger als 2 definierte Werte → null", () => {
    expect(sparklinePoints([])).toBeNull();
    expect(sparklinePoints([5])).toBeNull();
    expect(sparklinePoints([null, 5, undefined])).toBeNull();
  });

  it("monotone Reihe liefert einen Punkt pro definiertem Wert", () => {
    const points = sparklinePoints([10, 20, 30]);
    expect(points).not.toBeNull();
    expect(points!.split(" ")).toHaveLength(3);
  });

  it("undefinierte Zwischenwerte werden übersprungen, nicht als 0 gezeichnet", () => {
    const points = sparklinePoints([10, null, 30]);
    expect(points!.split(" ")).toHaveLength(2);
  });
});

describe("governorColor", () => {
  it("mappt auf die Ampel-Tokens", () => {
    expect(governorColor("red")).toBe("var(--danger)");
    expect(governorColor("yellow")).toBe("var(--warn)");
    expect(governorColor("green")).toBe("var(--ok)");
  });
});

describe("tsbTileData", () => {
  const events: EventItem[] = [];
  const projection = { horizonEnd: "2026-09-30", days: [] } as unknown as Parameters<typeof tsbTileData>[2];

  it("kein TSB-Wert → '–'", () => {
    expect(tsbTileData(null, events, projection, "2026-08-07").current).toBe("–");
  });

  it("rundet den TSB-Wert, kein Vorzeichen (anders als HeroBriefing.tsbFmt)", () => {
    expect(tsbTileData(-4.6, events, projection, "2026-08-07").current).toBe("-5");
    expect(tsbTileData(7.2, events, projection, "2026-08-07").current).toBe("7");
  });

  it("ohne Race-Event im Horizont: kein Ziel", () => {
    expect(tsbTileData(0, events, projection, "2026-08-07").goal).toBeNull();
  });
});
