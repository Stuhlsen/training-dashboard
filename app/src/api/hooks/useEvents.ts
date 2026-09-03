/* ============================================================
   API/HOOKS/USEEVENTS.TS — Events lesen und schreiben

   Ersetzt state/events.js (Vanilla). Wie bei den Plankarten trägt der
   Query-Key die athleteId, `loadedForAthleteId` entfällt damit.

   Die abgeleiteten Werte (nächstes Rennen, Countdown) bleiben reine
   Funktionen und arbeiten auf einer bereits geladenen Liste — kein
   zusätzlicher Request, wie in der Vanilla-Version.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEvent as createEventAdapter,
  listEvents,
  removeEvent,
  updateEvent as updateEventAdapter,
} from "../supabase/events";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAuthUserId } from "./useSession";
import { localISODate } from "../../core/format.js";
import { qk } from "../keys";
import { catchResult, ResultError_, unwrap } from "../result";
import type { EventInput, EventItem, EventPatch, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};

const byEventDate = (a: EventItem, b: EventItem) => a.eventDate.localeCompare(b.eventDate);

/** Alle Events des angezeigten Athleten. Öffentlich lesbar (E1), kein Login
 *  nötig. Ein Athlet ohne Supabase-Account liefert hier bewusst eine LEERE
 *  Liste statt eines Fehlers (anders als usePlanCards) — "keine Events" ist
 *  für eine Zeitleiste eine gültige, unauffällige Anzeige. */
export function useEvents(athleteId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.events(athleteId),
    queryFn: async (): Promise<EventItem[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return [];
      return unwrap(await listEvents(profileId)).events;
    },
  });
}

/** Ein Event gilt als "anstehend", wenn sein Datum heute oder später liegt —
 *  geteilte Bedingung für nextRaceEvent() und die Zeitleiste, damit beide
 *  nicht unabhängig voneinander denselben Vergleich duplizieren. */
export function isUpcomingEvent(event: Pick<EventItem, "eventDate">, todayIso: string): boolean {
  return event.eventDate >= todayIso;
}

/** Nächstes zukünftiges Rennen/Tour-Event aus einer bereits geladenen Liste. */
export function nextRaceEvent(
  events: EventItem[],
  todayIso: string = localISODate(),
): EventItem | null {
  const upcoming = events.filter((e) => e.type === "race" && isUpcomingEvent(e, todayIso));
  if (upcoming.length === 0) return null;
  return upcoming.reduce((soonest, e) => (e.eventDate < soonest.eventDate ? e : soonest));
}

/** Countdown zum nächsten Rennen: "Heute!" am Renntag selbst, sonst die
 *  Tagesdifferenz. `null`, wenn kein zukünftiges Rennen in der Liste steht. */
export function raceCountdown(
  events: EventItem[],
  todayIso: string = localISODate(),
): { event: EventItem; days: number; label: string } | null {
  const event = nextRaceEvent(events, todayIso);
  if (!event) return null;
  const days = Math.round((Date.parse(event.eventDate) - Date.parse(todayIso)) / 86400000);
  return { event, days, label: days === 0 ? "Heute!" : `Noch ${days} Tage` };
}

/** Legt ein Event für den ANGEZEIGTEN Athleten an — nicht zwingend für den
 *  eingeloggten User selbst. Das ist gewollt (ein Trainer legt Events für
 *  seinen Athleten an), die Berechtigungsprüfung dafür liegt in
 *  useCanWriteForAthlete() und der RLS; hier steht nur die Login-Pflicht. */
export function useCreateEvent(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.events(athleteId);

  const mutation = useMutation({
    mutationFn: async (event: EventInput) => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      // type -> "other" macht priority/ftpGoal/isTest UND die result_*-Felder
      // ungültig (Check-Constraints events_priority_only_for_race /
      // events_result_only_for_race, Migration 0027) — hier erzwingen statt
      // jedem Aufrufer zuzumuten, das selbst zu wissen. Spiegelt updateEvent().
      const payload: EventInput =
        event.type === "other"
          ? {
              ...event,
              priority: null,
              ftpGoal: null,
              isTest: false,
              resultTimeS: null,
              resultAvgWatts: null,
              resultPlaceAg: null,
              resultPlaceOverall: null,
            }
          : event;
      return unwrap(await createEventAdapter(profileId, payload));
    },
    onSuccess: ({ event }) => {
      queryClient.setQueryData<EventItem[]>(key, (events) =>
        [...(events ?? []), event].sort(byEventDate),
      );
    },
  });

  const create = useCallback(
    async (event: EventInput): Promise<Result<{ event: EventItem }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(event));
    },
    [mutation, userId],
  );

  return { create, isPending: mutation.isPending };
}

export function useUpdateEvent(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.events(athleteId);

  const mutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EventPatch }) =>
      unwrap(await updateEventAdapter(id, patch)),
    onSuccess: ({ event }) => {
      queryClient.setQueryData<EventItem[]>(key, (events) =>
        (events ?? []).map((e) => (e.id === event.id ? event : e)).sort(byEventDate),
      );
    },
  });

  const update = useCallback(
    async (id: string, patch: EventPatch): Promise<Result<{ event: EventItem }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync({ id, patch }));
    },
    [mutation, userId],
  );

  return { update, isPending: mutation.isPending };
}

export function useRemoveEvent(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.events(athleteId);

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await removeEvent(id));
      return { id };
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData<EventItem[]>(key, (events) =>
        (events ?? []).filter((e) => e.id !== id),
      );
    },
  });

  const remove = useCallback(
    async (id: string): Promise<Result<{ id: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(id));
    },
    [mutation, userId],
  );

  return { remove, isPending: mutation.isPending };
}
