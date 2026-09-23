/* Reine Umwandlung Demo-Datensatz → Dashboard-Typen (Fahrplan 22).
   Ausgelagert aus LandingPage.tsx, damit sie ohne DOM testbar ist. */

import { isoWeekKey } from "../../core/aggregate.js";
import { densifyDays, pmcSkeletonAnchor } from "../../core/days.js";
import { addDaysISO } from "../../core/format.js";
import { rideLoad } from "../../core/loadguard.js";
import { ATL_DAYS, CTL_DAYS } from "../../core/pmc.js";
import { densifyPmc } from "../../core/pmc-series.js";
import { projectLoad } from "../../core/projection.js";
import type { DemoPlanCard, DemoRide, PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

/** Feste Referenzleistung nur zur Demo-Skalierung der TSS-Näherung, keine echte FTP. */
const DEMO_REFERENCE_WATTS = 200;

/** Anzahl verschiedener ISO-Kalenderwochen im Demo-Zeitraum. */
export function countDemoWeeks(rides: readonly DemoRide[]): number {
  return new Set(rides.map((ride) => isoWeekKey(ride.date))).size;
}

/** Demo-Ride → app/src/types.js::Ride, wie core/loadguard.js::rideLoad() sie
 *  erwartet: Rad bevorzugt tss, Lauf/Schwimm bevorzugt trimp (fehlt eines,
 *  fällt rideLoad() aufs andere zurück — beide zu setzen wäre irreführend,
 *  deshalb nur das jeweils passende Feld). */
export function toRide(entry: DemoRide): Ride {
  const isRide = !entry.sport || entry.sport === "ride";
  return {
    dateISO: entry.date,
    sport: entry.sport,
    min: entry.durationMinutes,
    km: entry.distanceKm,
    watt: entry.avgWatts,
    np: entry.npWatts,
    hf: entry.avgHr,
    tss: isRide ? Math.round((entry.durationMinutes / 60) * (entry.npWatts / DEMO_REFERENCE_WATTS) ** 2 * 100) : null,
    trimp: isRide ? null : Math.round((entry.durationMinutes * entry.avgHr) / 100),
    eftp: entry.eftpWatts,
    feel: String(entry.feel),
    zoneTimes: entry.zoneTimesSec,
  };
}

const PLAN_TYPE_LABEL: Record<string, string> = {
  rest: "Ruhetag",
  workout: "Intervall",
  endurance: "Ausdauer",
};

/** Demo-PlanCard → PlanCard (app/src/api/types.ts). Die Demo hat keine
 *  IDs, Workouts oder DB-Felder — die Pflichtfelder bekommen Dummy-Werte. */
export function toPlanCard(entry: DemoPlanCard): PlanCard {
  return {
    id: `demo-${entry.date}-${entry.label}`,
    date: entry.date,
    sortOrder: 0,
    name: entry.label,
    typ: PLAN_TYPE_LABEL[entry.type] ?? "Erholung",
    km: null,
    durationMin: entry.durationMinutes,
    tssPlanned: null,
    week: null,
    phase: null,
    sport: entry.sport === "rest" ? "ride" : (entry.sport as "ride" | "run" | "swim" | undefined),
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "",
    updatedAt: "",
  };
}

/** Glättungs-Anlauf für den Demo-Startwert: Tagesschnitt der ersten zwei Wochen. */
const PMC_SEED_DAYS = 14;

/** Zeitkonstanten wie core/pmc.js (CTL_DAYS/ATL_DAYS) — hier bewusst lokal
 *  gerechnet statt eine neue core/-Funktion anzulegen (Fahrplan 22, Nicht-Ziel
 *  "kein Umbau im Dashboard-Core"). */
function ewmaStep(prev: number, load: number, days: number): number {
  return prev + (load - prev) / days;
}

/** Summierte Tageslast (TSS bzw. TRIMP je Sportart, wie core/loadguard.js::rideLoad). */
function dailyLoads(rides: readonly Ride[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const ride of rides) {
    if (!ride.dateISO) continue;
    byDate.set(ride.dateISO, (byDate.get(ride.dateISO) ?? 0) + rideLoad(ride));
  }
  return byDate;
}

/** Hängt jeder Demo-Fahrt CTL/ATL an (Stand am Abend des Tages), so wie sie
 *  im echten Dashboard von intervals.icu mitkommen. Die Demo hat diese Werte
 *  nicht, nur TSS/TRIMP. Startwert ist der Tagesschnitt der ersten
 *  `PMC_SEED_DAYS` Tage, damit die Kurve nicht wie ein Trainingsbeginn bei
 *  null aussieht. Gibt neue Objekte zurück, die Eingabe bleibt unverändert. */
export function withDemoPmc(rides: readonly Ride[]): Ride[] {
  const dated = rides.filter((ride) => ride.dateISO);
  if (!dated.length) return [...rides];
  const loads = dailyLoads(dated);
  const dates = [...loads.keys()].sort();
  const days = densifyDays(dates[0], dates[dates.length - 1]) as Array<{ dateISO: string }>;

  const seedWindow = days.slice(0, PMC_SEED_DAYS);
  const seed = seedWindow.reduce((sum, day) => sum + (loads.get(day.dateISO) ?? 0), 0) / seedWindow.length;

  const pmcByDate = new Map<string, { ctl: number; atl: number }>();
  let ctl = seed;
  let atl = seed;
  for (const day of days) {
    const load = loads.get(day.dateISO) ?? 0;
    ctl = ewmaStep(ctl, load, CTL_DAYS);
    atl = ewmaStep(atl, load, ATL_DAYS);
    pmcByDate.set(day.dateISO, { ctl, atl });
  }
  return rides.map((ride) => {
    const pmc = ride.dateISO ? pmcByDate.get(ride.dateISO) : undefined;
    return pmc ? { ...ride, ctl: Math.round(pmc.ctl * 10) / 10, atl: Math.round(pmc.atl * 10) / 10 } : { ...ride };
  });
}

export interface DemoFormTrend {
  dates: string[];
  todayIdx: number;
  ctlVals: Array<number | null>;
  atlVals: Array<number | null>;
  tsbVals: Array<number | null>;
}

/** Fitness/Müdigkeit/Form über den Demo-Zeitraum plus `prognosisDays` Tage
 *  Prognose aus geplanten Karten — dieselbe Kette wie der Analyse-Tab
 *  (core/projection.js::projectLoad → core/pmc-series.js::densifyPmc). */
export function buildDemoFormTrend(
  ridesWithPmc: Ride[],
  plannedCards: ReadonlyArray<{ date: string; tssPlanned: number | null; typ?: string | null }>,
  todayISO: string,
  prognosisDays: number,
): DemoFormTrend | null {
  const anchor = pmcSkeletonAnchor(ridesWithPmc);
  if (!anchor || anchor > todayISO) return null;
  const cards = plannedCards.map((card, index) => ({ ...card, id: `demo-plan-${index}` }));
  const projection = projectLoad(cards, ridesWithPmc, { today: todayISO });
  const skeleton = densifyDays(anchor, addDaysISO(todayISO, prognosisDays)) as Array<{ dateISO: string }>;
  const todayIdx = skeleton.findIndex((day) => day.dateISO === todayISO);
  const { ctlVals, atlVals, tsbVals } = densifyPmc(skeleton, ridesWithPmc, projection.days, todayIdx);
  return { dates: skeleton.map((day) => day.dateISO), todayIdx, ctlVals, atlVals, tsbVals };
}
