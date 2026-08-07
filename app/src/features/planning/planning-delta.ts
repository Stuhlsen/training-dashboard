/* ============================================================
   FEATURES/PLANNING/PLANNING-DELTA.TS — Nach-Drop-Feedback (Delta-Banner)

   1:1-Port von ui/planned.js::_recordDelta (Z. 292-307) als reine, getestete
   Funktion statt Modul-Prozedur mit Nebeneffekt (Vanilla hält `deltaBanner`
   als Modul-State, hier übernimmt PlanningPage.tsx dieselbe Rolle über
   React-State, s. dort). ============================================== */

import { dayImpact, horizonRaceEvent, tsbOnDate } from "../../core/plan-feedback.js";
import { projectLoad } from "../../core/projection.js";
import type { EventItem } from "../../api/types";

type Projection = ReturnType<typeof projectLoad>;
type DayImpact = NonNullable<ReturnType<typeof dayImpact>>;

export interface DeltaBannerState {
  event: { event: EventItem; before: number; after: number } | null;
  impact: { date: string; before: DayImpact; after: DayImpact } | null;
}

/** Vergleicht die Projektion VOR einer Karten-Mutation (Move/Drop/Cancel)
 *  mit dem Stand danach — nur wenn ein A/B/C-Rennen im Prognosehorizont
 *  liegt UND/ODER `cardDateIso` (das Datum der Karte selbst — bei
 *  Verschieben das NEUE Zieldatum, bei Ausfallen das bisherige Datum)
 *  gesetzt ist. `null`, wenn beide Teile leer bleiben (kein Event im
 *  Horizont UND kein cardDateIso bzw. Datum außerhalb der Projektion). */
export function computeDeltaBanner(
  beforeProjection: Projection,
  afterProjection: Projection,
  events: EventItem[],
  todayIso: string,
  cardDateIso?: string,
): DeltaBannerState | null {
  const event = horizonRaceEvent(events, afterProjection, todayIso);
  const before = event ? tsbOnDate(beforeProjection, event.eventDate) : null;
  const after = event ? tsbOnDate(afterProjection, event.eventDate) : null;
  const eventPart = event && before != null && after != null ? { event, before, after } : null;

  const impactBefore = cardDateIso ? dayImpact(beforeProjection, cardDateIso) : null;
  const impactAfter = cardDateIso ? dayImpact(afterProjection, cardDateIso) : null;
  const impactPart =
    impactBefore && impactAfter ? { date: cardDateIso as string, before: impactBefore, after: impactAfter } : null;

  return eventPart || impactPart ? { event: eventPart, impact: impactPart } : null;
}
