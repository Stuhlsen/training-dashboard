/* ============================================================
   FEATURES/PLANNING/TRAINER-BAR-VIEW-MODEL.TS — reine Ableitungen für die
   Trainer-Leiste (kein DOM, kein Fetch — Muster wie planning-view-model.ts/
   hero-view-model.ts).

   Port der entsprechenden Berechnungen aus assets/js/ui/trainer-bar.js
   (dort Teil von _draw()/den Tile-Funktionen) und
   assets/js/state/trainer-view.js (Konstanten, Gate-Logik). Etappe 7a. */

import { horizonRaceEvent, tsbOnDate } from "../../core/plan-feedback.js";
import { projectLoad } from "../../core/projection.js";
import type { Checkin, EventItem } from "../../api/types";

type Ride = import("../../types.js").Ride;

/** "proposal" ist der Default (Trainer-Sicht-Konzept §5: konservative
 *  Vorgabe) — jeder neue Tab-Besuch startet wieder hier, kein
 *  Persistenz-Bedarf (state/trainer-view.js-Kommentar 1:1 übernommen). */
export type SaveMode = "proposal" | "direct";

export const DEFAULT_CATEGORIES = ["checkin", "governor", "tsb", "proposals"] as const;
export const OPTIONAL_CATEGORIES = ["wellbeing7d", "lastRides", "conflicts", "ctlAtl"] as const;

export type TileKey = (typeof DEFAULT_CATEGORIES)[number] | (typeof OPTIONAL_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<TileKey, string> = {
  checkin: "Check-in heute",
  governor: "Governor heute",
  tsb: "TSB aktuell",
  proposals: "Vorschläge",
  wellbeing7d: "Wellbeing 7 Tage",
  lastRides: "Letzte Fahrten",
  conflicts: "Offene Konflikte",
  ctlAtl: "CTL/ATL-Verlauf",
};

/** Zentrales Gate für Move/Cancel/Drag — Port von
 *  ui/planned.js::_isTrainerProposalMode(). Der `isTrainer`-Anteil ist hier
 *  bereits geprüft (useTrainerContext), `isCoach()` selbst folgt daraus. */
export function isTrainerProposalMode(isTrainer: boolean, saveMode: SaveMode): boolean {
  return isTrainer && saveMode === "proposal";
}

/** T2 (Trainer-Sicht-Konzept §3): Neuanlage ist für den Trainer IMMER
 *  Vorschlag, unabhängig vom Umschalter — nur bei einer BESTEHENDEN Karte
 *  entscheidet saveMode. Port von ui/plan-card-dialog.js:378-382. */
export function isTrainerCardProposalMode(
  isTrainerSaving: boolean,
  isEditingExisting: boolean,
  saveMode: SaveMode,
): boolean {
  return isTrainerSaving && (!isEditingExisting || saveMode === "proposal");
}

/** [...DEFAULT_CATEGORIES, ...gültige gespeicherte categories] — unbekannte/
 *  veraltete Kategorie-Strings aus der DB werden gefiltert, nicht blind
 *  durchgereicht (z.B. falls OPTIONAL_CATEGORIES sich künftig ändert). */
export function visibleTileKeys(categories: string[]): TileKey[] {
  const optional = new Set<string>(OPTIONAL_CATEGORIES);
  return [...DEFAULT_CATEGORIES, ...categories.filter((c): c is TileKey => optional.has(c))];
}

export function checkinToday(checkins: Checkin[], todayISO: string): Checkin | null {
  return checkins.find((c) => c.date === todayISO) ?? null;
}

/** Port von ui/trainer-bar.js::wellbeing7dTile()s avg()-Helfer. `null` bei
 *  leerer Historie (Kachel zeigt dann "keine Daten" statt "0.0"). */
export function wellbeing7dAverages(checkins: Checkin[]): { avgEnergy: string; avgMood: string } | null {
  if (!checkins.length) return null;
  const avg = (key: "energy" | "mood") =>
    (checkins.reduce((sum, c) => sum + (c[key] || 0), 0) / checkins.length).toFixed(1);
  return { avgEnergy: avg("energy"), avgMood: avg("mood") };
}

/** Port von ui/trainer-bar.js::lastRidesTile() — nur Fahrten mit RPE, die
 *  letzten 10. `null` ohne RPE-Daten. */
export function lastRidesAvgRpe(rides: Ride[]): string | null {
  const withRpe = rides.filter((r) => r.rpe != null).slice(-10);
  if (!withRpe.length) return null;
  return (withRpe.reduce((sum, r) => sum + (r.rpe ?? 0), 0) / withRpe.length).toFixed(1);
}

/** Port von ui/trainer-bar.js::sparkline() — liefert nur die `points`-Liste
 *  fürs `<polyline>`, kein `<svg>`-Wrapper (React rendert das selbst).
 *  `null` bei weniger als 2 definierten Werten (wie im Vanilla-Original:
 *  eine Linie durch einen einzigen Punkt ist kein Trend). */
export function sparklinePoints(
  vals: Array<number | null | undefined>,
  width = 72,
  height = 22,
  pad = 2,
): string | null {
  const defined = vals.filter((v): v is number => v != null);
  if (defined.length < 2) return null;
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (vals.length - 1);
  return vals
    .map((v, i) => (v == null ? null : `${pad + i * stepX},${height - pad - ((v - min) / range) * (height - pad * 2)}`))
    .filter((p): p is string => p != null)
    .join(" ");
}

/** "red"/"yellow"/"green" → dasselbe Token-Mapping wie
 *  ui/trainer-bar.js::governorTile() (dort inline `var(--red)`/`var(--gold)`/
 *  `var(--green)`). */
export function governorColor(level: "red" | "yellow" | "green"): string {
  if (level === "red") return "var(--danger)";
  if (level === "yellow") return "var(--warn)";
  return "var(--ok)";
}

export interface TsbTileData {
  current: string;
  goal: { eventTitle: string; value: number } | null;
}

/** Port von ui/trainer-bar.js::tsbTile() — `tsb` ist der rohe PMC-Wert
 *  (core/pmc.js::currentPmc(...).tsb), NICHT das vorzeichenbehaftete
 *  `HeroBriefing.tsbFmt` (das ist für die Hero-Kachel, nicht für diese). */
export function tsbTileData(
  tsb: number | null,
  events: EventItem[],
  projection: ReturnType<typeof projectLoad>,
  todayISO: string,
): TsbTileData {
  const event = horizonRaceEvent(events, projection, todayISO);
  const eventTsb = event ? tsbOnDate(projection, event.eventDate) : null;
  return {
    current: tsb != null ? String(Math.round(tsb)) : "–",
    goal: event && eventTsb != null ? { eventTitle: event.title || "Event", value: Math.round(eventTsb) } : null,
  };
}
