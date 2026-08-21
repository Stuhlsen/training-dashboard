/* Tests: features/analysis/answers-view-model.ts — Datenverdrahtung für den
   Analyse-Tab „Antworten & Spuren". Deckt die Skelett-/Fensterbildung, die
   Hero-Kennzahlen und die grobe Struktur der vier Leitfragen-Gruppen ab —
   nicht jede einzelne Spur-Wiring (das wäre eine Verdopplung der
   core/trace-lanes.js-Tests). Bekannte Lücke: keine dedizierten Tests für
   Wetter-/Trinkrate-/Energiebilanz-Spuren (geringe Logikdichte, reine
   joinSeries-Verdrahtung wie die getesteten HRV/Kadenz-Fälle). */

import { expect, test } from "vitest";
import { buildAnswersViewModel } from "./answers-view-model";
import { athleteConfig } from "../../config";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;
type PlanCard = import("../../api/types").PlanCard;
type EventItem = import("../../api/types").EventItem;

const TODAY = "2026-08-21";

function makeRide(overrides: Partial<Ride>): Ride {
  return { dateISO: TODAY, ...overrides } as Ride;
}

/** 60 Tage Ist-Fahrten mit CTL/ATL (jeden 2. Tag, damit ein PMC-Skelett
 *  entsteht), plus ein paar Wellness-/Effizienz-/Kadenz-Werte. */
function buildFixtureRides(): Ride[] {
  const rides: Ride[] = [];
  const start = new Date(`${TODAY}T00:00:00`);
  start.setDate(start.getDate() - 59);
  for (let i = 0; i < 60; i += 2) {
    const d = new Date(start.getTime() + i * 86400000);
    const dateISO = d.toISOString().slice(0, 10);
    rides.push(
      makeRide({
        dateISO,
        ctl: 40 + i * 0.2,
        atl: 35 + i * 0.15,
        tss: 50,
        kad: 85 + (i % 10),
        typ: "Z2 Dauer",
        min: 90,
        efficiency: 1.3 + i * 0.001,
        eftp: 200 + i * 0.3,
        decoupling: 4 + (i % 3),
      }),
    );
  }
  return rides;
}

function buildFixtureWellness(): WellnessDay[] {
  const out: WellnessDay[] = [];
  const start = new Date(`${TODAY}T00:00:00`);
  start.setDate(start.getDate() - 59);
  for (let i = 0; i < 60; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dateISO = d.toISOString().slice(0, 10);
    out.push({ dateISO, hrv: 60 + (i % 5), restingHR: 48 - (i % 3), sleepHours: 7 - (i % 4) * 0.5, weight: 75 - i * 0.01 } as WellnessDay);
  }
  return out;
}

const NO_CARDS: PlanCard[] = [];
const NO_EVENTS: EventItem[] = [];

test("buildAnswersViewModel: liefert null ohne PMC-Basis (keine Fahrt mit ctl/atl)", () => {
  const vm = buildAnswersViewModel({
    rides: [makeRide({ dateISO: TODAY, ctl: null as unknown as number, atl: null as unknown as number })],
    wellness: [],
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: null,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBe(null);
});

test("buildAnswersViewModel: baut ein Skelett, dessen todayIdx wirklich auf 'heute' zeigt", () => {
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  expect(vm!.formatDay(vm!.todayIdx)).toBe("21.08");
});

test("buildAnswersViewModel: genau vier Leitfragen-Gruppen in der Handoff-Reihenfolge", () => {
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  expect(vm!.groups.map((g) => g.key)).toEqual(["stronger", "load", "recovery", "blockers"]);
  expect(vm!.groups[0].hasPowerCurve).toBe(true);
  expect(vm!.groups[1].hasPowerCurve).toBe(false);
});

test("buildAnswersViewModel: nur Frage 1 (Werde ich stärker?) trägt die Power-Curve-Karte", () => {
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  expect(vm!.groups.filter((g) => g.hasPowerCurve).length).toBe(1);
});

test("buildAnswersViewModel: W/kg-Umschalter ändert die eFTP-Hero-Kennzahl, nicht CTL/TSB", () => {
  const input = {
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    todayISO: TODAY,
  };
  const inW = buildAnswersViewModel({ ...input, unit: "W" as const });
  const inKg = buildAnswersViewModel({ ...input, unit: "W/kg" as const });
  expect(inW).toBeTruthy();
  expect(inKg).toBeTruthy();
  const eftpW = inW!.hero.stats.find((s) => s.label.startsWith("eFTP"));
  const eftpKg = inKg!.hero.stats.find((s) => s.label.startsWith("eFTP"));
  expect(eftpW!.value).not.toBe(eftpKg!.value);
  const ctlW = inW!.hero.stats.find((s) => s.label === "CTL Fitness");
  const ctlKg = inKg!.hero.stats.find((s) => s.label === "CTL Fitness");
  expect(ctlW!.value).toBe(ctlKg!.value);
});

test("buildAnswersViewModel: eFTP-Spur ist über die volle Skelettlänge dicht (gleiche Länge wie N)", () => {
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  const eftpLane = vm!.groups[0].lanes.find((l) => l.display.key === "eftp");
  expect(eftpLane).toBeTruthy();
  expect((eftpLane!.lane.vals as unknown[]).length).toBe(vm!.N);
});

test("buildAnswersViewModel: eFTP-Spur formatValue teilt im W/kg-Modus wirklich durch das Gewicht (Regression: zeigte zuvor den rohen Watt-Wert mit 'W/kg'-Einheit)", () => {
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W/kg" as const,
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  const eftpLane = vm!.groups[0].lanes.find((l) => l.display.key === "eftp");
  expect(eftpLane).toBeTruthy();
  const raw = 200;
  const formatted = eftpLane!.formatValue(raw);
  expect(formatted).not.toContain("200,00");
  expect(formatted).toBe("2,67 W/kg");
});

test("buildAnswersViewModel: ohne Events bleibt der Hero-Countdown '–', keine erfundene Zahl", () => {
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events: NO_EVENTS,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  const daysStat = vm!.hero.stats.find((s) => s.label === "Tage bis Event");
  expect(daysStat!.value).toBe("–");
  expect(vm!.eventIdx).toBe(null);
});

test("buildAnswersViewModel: ein zukünftiges Rennen setzt eventIdx innerhalb des Skeletts", () => {
  const eventDate = "2026-09-15";
  const events: EventItem[] = [
    {
      id: "e1",
      title: "Testrennen",
      eventDate,
      type: "race",
      priority: "main",
      ftpGoal: null,
      isTest: false,
      note: null,
      createdAt: TODAY,
      updatedAt: TODAY,
    },
  ];
  const vm = buildAnswersViewModel({
    rides: buildFixtureRides(),
    wellness: buildFixtureWellness(),
    planCards: NO_CARDS,
    events,
    athleteCfg: athleteConfig("athlete1"),
    athleteFtp: null,
    athleteWeightKg: 75,
    powerCurves: null,
    unit: "W",
    todayISO: TODAY,
  });
  expect(vm).toBeTruthy();
  expect(vm!.eventIdx).not.toBe(null);
  const daysStat = vm!.hero.stats.find((s) => s.label === "Tage bis Event");
  expect(daysStat!.value).toBe("25");
});
