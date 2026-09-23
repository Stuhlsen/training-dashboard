/* Reine Umwandlung Demo-Datensatz → Dashboard-Typen (Fahrplan 22).
   Ausgelagert aus LandingPage.tsx, damit sie ohne DOM testbar ist. */

import { isoWeekKey } from "../../core/aggregate.js";
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
