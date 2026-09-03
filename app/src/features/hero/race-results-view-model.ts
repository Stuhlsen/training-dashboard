/* ============================================================
   FEATURES/HERO/RACE-RESULTS-VIEW-MODEL.TS — reine Ableitung der
   „Rennergebnisse"-Karte (Migration 0027, Punkt 3).

   Kein React, kein Request: die Event-Liste liegt im Hero schon geladen
   (useEvents / raceCountdown). Filtert auf absolvierte Rennen MIT Ergebnis
   und mappt sie in eine anzeigefertige Zeile, neuestes zuerst.
   ============================================================ */

import { formatFinishTime, hasRaceResult } from "../events/event-result-view-model";
import type { EventItem } from "../../api/types";

export interface RaceResultRow {
  id: string;
  title: string;
  dateISO: string;
  /** „3:12:45" oder "" wenn keine Zeit erfasst. */
  timeLabel: string;
  avgWatts: number | null;
  placeAg: number | null;
  placeOverall: number | null;
}

/**
 * Absolvierte Rennen mit mindestens einem Ergebnis-Feld, neuestes zuerst.
 * @param {EventItem[]} events
 * @param {string} todayISO "YYYY-MM-DD"
 * @returns {RaceResultRow[]}
 */
export function buildRaceResults(events: EventItem[], todayISO: string): RaceResultRow[] {
  return (events ?? [])
    .filter((e) => e.type === "race" && !e.isTest && e.eventDate <= todayISO && hasRaceResult(e))
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .map((e) => ({
      id: e.id,
      title: e.title,
      dateISO: e.eventDate,
      timeLabel: formatFinishTime(e.resultTimeS),
      avgWatts: e.resultAvgWatts,
      placeAg: e.resultPlaceAg,
      placeOverall: e.resultPlaceOverall,
    }));
}
