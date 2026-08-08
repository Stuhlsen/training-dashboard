/* ============================================================
   FEATURES/EVENTS/EVENTS-VIEW-MODEL.TS — reine Ableitungen für die
   Events-Seite (kein DOM, kein Fetch — Muster wie hero-view-model.ts).

   isUpcomingEvent()/nextRaceEvent()/raceCountdown() bleiben in
   api/hooks/useEvents.ts (dort bereits getestet, Etappe 2b) — hier nur,
   was zusätzlich für die Verwaltungsseite selbst gebraucht wird: Gruppierung
   in Anstehend/Vergangen (Konzept docs/phase-2-konzept-event-verwaltung.md
   Abschnitt 6+7: vergangene Events bleiben in der Verwaltungsliste
   sichtbar, anders als die Vanilla-Timeline, die sie ausblendet) und die
   Badge-Beschriftung/-Farbe (Spiegel von assets/js/ui/event-timeline.js
   TYPE_LABEL/PRIORITY_LABEL). */

import { isUpcomingEvent } from "../../api/hooks/useEvents";
import type { EventItem, EventPriority, EventType } from "../../api/types";

export const TYPE_LABEL: Record<EventType, string> = {
  race: "Rennen/Tour",
  other: "Sonstiges",
};

export const PRIORITY_LABEL: Record<EventPriority, string> = {
  main: "Hauptziel",
  secondary: "Nebenziel",
};

export function typeBadgeColor(type: EventType): string {
  return type === "race" ? "var(--ss)" : "var(--ink-3)";
}

export function priorityBadgeColor(priority: EventPriority): string {
  return priority === "main" ? "var(--accent)" : "var(--ink-3)";
}

/** Anstehende Events aufsteigend (nächstes zuerst), vergangene absteigend
 *  (jüngstes zuerst) — zwei getrennte Abschnitte in der Verwaltungsliste,
 *  ein Event mit `eventDate === todayIso` zählt als anstehend
 *  (isUpcomingEvent() ist `>=`, konsistent mit dem Countdown "Heute!"). */
export function groupEvents(
  events: EventItem[],
  todayIso: string,
): { upcoming: EventItem[]; past: EventItem[] } {
  const upcoming: EventItem[] = [];
  const past: EventItem[] = [];
  for (const event of events) {
    (isUpcomingEvent(event, todayIso) ? upcoming : past).push(event);
  }
  upcoming.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  past.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  return { upcoming, past };
}
