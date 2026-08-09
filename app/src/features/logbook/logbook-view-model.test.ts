import { describe, expect, it } from "vitest";
import {
  classifyWeather,
  filterRides,
  getPhaseOptions,
  nextSort,
  sortRides,
  DEFAULT_SORT,
} from "./logbook-view-model";

type Ride = import("../../types.js").Ride;

function ride(overrides: Partial<Ride>): Ride {
  return {
    dateISO: "2026-06-01",
    dateShort: "01.06",
    name: "Testfahrt",
    typ: "Z2 Dauer",
    phase: "Sweet Spot",
    week: "2026-KW22",
    km: 50,
    ...overrides,
  } as Ride;
}

describe("getPhaseOptions", () => {
  it("liefert 'Alle' plus jede vorkommende Phase ohne Duplikate", () => {
    const rides = [ride({ phase: "Sweet Spot" }), ride({ phase: "Schwelle" }), ride({ phase: "Sweet Spot" })];
    expect(getPhaseOptions(rides)).toEqual(["Alle", "Sweet Spot", "Schwelle"]);
  });

  it("überspringt Fahrten ohne Phase", () => {
    expect(getPhaseOptions([ride({ phase: null })])).toEqual(["Alle"]);
  });
});

describe("filterRides", () => {
  const rides = [
    ride({ name: "Sweet-Spot-Intervalle", typ: "SS", phase: "Sweet Spot" }),
    ride({ name: "Lockere Ausfahrt", typ: "Z2 Dauer", phase: "Schwelle" }),
  ];

  it("filtert nach Phase, 'Alle' zeigt alles", () => {
    expect(filterRides(rides, "Schwelle", "")).toHaveLength(1);
    expect(filterRides(rides, "Alle", "")).toHaveLength(2);
  });

  it("filtert per Suche über Name ODER Typ, case-insensitive", () => {
    expect(filterRides(rides, "Alle", "sweet-spot")).toHaveLength(1);
    expect(filterRides(rides, "Alle", "SS")).toHaveLength(1);
    expect(filterRides(rides, "Alle", "keintreffer")).toHaveLength(0);
  });
});

describe("nextSort", () => {
  it("dreht die Richtung um, wenn dieselbe Spalte erneut geklickt wird", () => {
    expect(nextSort({ col: "km", dir: "asc" }, "km")).toEqual({ col: "km", dir: "desc" });
  });

  it("startet eine neue Spalte mit 'desc' für dateISO, sonst 'asc'", () => {
    const fromOtherCol: typeof DEFAULT_SORT = { col: "km", dir: "asc" };
    expect(nextSort(fromOtherCol, "dateISO")).toEqual({ col: "dateISO", dir: "desc" });
    expect(nextSort(fromOtherCol, "trimp")).toEqual({ col: "trimp", dir: "asc" });
  });
});

describe("sortRides", () => {
  it("sortiert numerisch, null/undefined immer ans Ende", () => {
    const rides = [ride({ dateISO: "a", km: 30 }), ride({ dateISO: "b", km: null }), ride({ dateISO: "c", km: 10 })];
    const sorted = sortRides(rides, { col: "km", dir: "asc" });
    expect(sorted.map((r) => r.dateISO)).toEqual(["c", "a", "b"]);
  });

  it("sortiert Strings via localeCompare in beide Richtungen", () => {
    const rides = [ride({ name: "Berg" }), ride({ name: "Anfahrt" })];
    expect(sortRides(rides, { col: "name", dir: "asc" }).map((r) => r.name)).toEqual(["Anfahrt", "Berg"]);
    expect(sortRides(rides, { col: "name", dir: "desc" }).map((r) => r.name)).toEqual(["Berg", "Anfahrt"]);
  });

  it("sortiert 'week' über den ISO-Kalenderwochen-Sortindex mit weekIndex()-Fallback für Notion-Wochen", () => {
    const rides = [ride({ dateISO: "a", week: "2026-KW05" }), ride({ dateISO: "b", week: "W2" }), ride({ dateISO: "c", week: "2026-KW01" })];
    // "W2" fällt über weekIndex() auf Index 3 (nach "Vor W1"/"Vor"/"W1") — deutlich vor
    // den ISO-Kalenderwochen 2026-KWxx (die als 202601/202605 sortieren).
    expect(sortRides(rides, { col: "week", dir: "asc" }).map((r) => r.dateISO)).toEqual(["b", "c", "a"]);
  });
});

describe("classifyWeather", () => {
  it("stuft gute Bedingungen als grün ein", () => {
    const info = classifyWeather({ temp: 18, windSpeed: 10, precip: 0 });
    expect(info.color).toBe("var(--ok)");
    expect(info.condLabel).toContain("Gute");
  });

  it("stuft genau einen Risikofaktor als gelb ein", () => {
    const info = classifyWeather({ temp: 18, windSpeed: 35, precip: 0 });
    expect(info.color).toBe("var(--warn)");
  });

  it("stuft Hitze allein schon als rot ein (Sonderfall, kein bad>=2 nötig)", () => {
    const info = classifyWeather({ temp: 34, windSpeed: 5, precip: 0 });
    expect(info.color).toBe("var(--danger)");
    expect(info.condLabel).toContain("Schwierige");
  });

  it("stuft Wind + Regen zusammen als rot ein, auch ohne zweiten Zähler", () => {
    const info = classifyWeather({ temp: 18, windSpeed: 35, precip: 1 });
    expect(info.color).toBe("var(--danger)");
  });

  it("rundet die Windgeschwindigkeit", () => {
    expect(classifyWeather({ temp: 18, windSpeed: 12.6, precip: 0 }).windKmh).toBe(13);
  });
});
