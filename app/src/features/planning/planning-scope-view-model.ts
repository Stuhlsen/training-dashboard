/* ============================================================
   FEATURES/PLANNING/PLANNING-SCOPE-VIEW-MODEL.TS — Fortschritt + Absolviert-
   Tabelle für EINE Kartenliste (Fahrplan 44 E1).

   Bisher lebte diese Ableitung als einzelne useMemo-Kette in PlanningPage.tsx
   (Karten der aktiven Sportart). Im gemeinsamen Kalender (Modus "Alle")
   arbeiten Fortschritt und Done-Liste JE Sportart — jede Sportart rechnet nur
   mit ihren Karten und ihren Aktivitäten, damit ein Lauf nie eine Radkarte
   erledigt und die Quoten nie sportübergreifend vermischt werden. Reine
   Funktionen, keine eigene Logik: sie reichen nur an die bestehenden
   Berechnungen weiter.
   ============================================================ */

import { activitySport } from "../../core/activity-sport.js";
import {
  buildPlanningSections,
  computePlanningDerivedSets,
  matchRideForCard,
  type PlanningSections,
} from "./planning-view-model";
import {
  buildDoneRows,
  gapsChips,
  planFidelitySummary,
  type DoneTableRow,
  type GapChip,
  type PlanFidelitySummary,
} from "./done-table-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

export interface PlanningScope {
  /** `null` = Einzelsport-Ansicht (wie bisher, ohne Sport-Überschrift). */
  sport: string | null;
  sections: PlanningSections;
  doneRides: Map<string, Ride | null>;
  doneRows: DoneTableRow[];
  fidelity: PlanFidelitySummary;
  gaps: GapChip[];
}

export interface PlanningScopeInput {
  sport: string | null;
  cards: PlanCard[];
  rides: Ride[];
  todayIso: string;
  athleteId: string;
  ftp: number | null;
  canEdit: boolean;
}

export function buildPlanningScope(input: PlanningScopeInput): PlanningScope {
  const { cards, rides, todayIso, athleteId, ftp, canEdit } = input;
  const derived = computePlanningDerivedSets(cards, rides);
  const sections = buildPlanningSections(cards, rides, todayIso, derived);
  const doneRides = new Map(sections.done.map((c) => [c.id, matchRideForCard(rides, c, canEdit)]));
  return {
    sport: input.sport,
    sections,
    doneRides,
    doneRows: buildDoneRows(sections.done, doneRides, athleteId, ftp),
    fidelity: planFidelitySummary(sections.done, doneRides, todayIso),
    gaps: gapsChips(sections.missed, sections.cancelled),
  };
}

export interface SportScopesInput extends Omit<PlanningScopeInput, "sport" | "cards" | "rides"> {
  sports: readonly string[];
  /** Karten ALLER Sportarten. */
  cards: PlanCard[];
  /** Aktivitäten ALLER Sportarten (`ridesAll`). */
  rides: Ride[];
}

/** Ein Scope je Sportart, die mindestens eine Karte hat. */
export function buildSportScopes(input: SportScopesInput): PlanningScope[] {
  return input.sports.flatMap((sport) => {
    const cards = input.cards.filter((c) => activitySport(c) === sport);
    if (!cards.length) return [];
    const rides = input.rides.filter((r) => activitySport(r) === sport);
    return [buildPlanningScope({ ...input, sport, cards, rides })];
  });
}
