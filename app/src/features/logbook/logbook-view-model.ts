/* ============================================================
   FEATURES/LOGBOOK/LOGBOOK-VIEW-MODEL.TS — reine Ableitungen für das
   Fahrtenbuch (kein DOM, kein Fetch — Muster wie events-view-model.ts).

   Port von assets/js/ui/table.js (Filter/Sort/Wetter-Klassifikation).
   Die Befinden-Spalte (RPE/Feel, editierbar) ist NICHT mit portiert —
   sie wurde in der Vanilla-Version bereits in Commit c26e44c entfernt
   (dokumentierter, bisher unbehobener Feature-Verlust, s.
   docs/offene-punkte.md "Ist-Typerkennung / Blockerkennung / FTP-Historie").
   11b portiert den AKTUELLEN Vanilla-Stand 1:1, fixt das nicht nebenbei.
   ============================================================ */

import { weekSortIndex } from "../../core/aggregate.js";
import { weekIndex } from "../../config";

type Ride = import("../../types.js").Ride;

export interface LogbookColumn {
  key: string;
  label: string;
  sortKey?: string;
  noSort?: boolean;
}

/** 1:1 aus table.js::COLS. */
export const COLUMNS: LogbookColumn[] = [
  { key: "dateShort", label: "Datum", sortKey: "dateISO" },
  { key: "week", label: "Woche" },
  { key: "name", label: "Einheit" },
  { key: "typ", label: "Typ" },
  { key: "km", label: "km" },
  { key: "min", label: "min" },
  { key: "kmh", label: "km/h" },
  { key: "hf", label: "Ø HF" },
  { key: "hfMax", label: "HF-Max" },
  { key: "kad", label: "Kadenz" },
  { key: "watt", label: "Ø W" },
  { key: "np", label: "NP" },
  { key: "trimp", label: "TRIMP" },
  { key: "ctl", label: "CTL" },
  { key: "weather", label: "Wetter", noSort: true },
];

export type SortDir = "asc" | "desc";

export interface SortState {
  col: string;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { col: "dateISO", dir: "desc" };

/** Phasen-Filterknöpfe: "Alle" + jede in den Fahrten vorkommende Phase,
 *  Reihenfolge wie im Datensatz (keine eigene Sortierung, wie im Original). */
export function getPhaseOptions(rides: Ride[]): string[] {
  const phases = new Set<string>();
  for (const r of rides) if (r.phase) phases.add(r.phase);
  return ["Alle", ...phases];
}

export function filterRides(rides: Ride[], phase: string, search: string): Ride[] {
  let r = rides;
  if (phase !== "Alle") r = r.filter((x) => x.phase === phase);
  if (search) {
    const s = search.toLowerCase();
    r = r.filter(
      (x) => (x.name || "").toLowerCase().includes(s) || (x.typ || "").toLowerCase().includes(s),
    );
  }
  return r;
}

/** Klickt man dieselbe Spalte erneut an, dreht sich die Richtung um — sonst
 *  startet die neue Spalte mit "desc" fürs Datum, sonst "asc" (wie table.js). */
export function nextSort(current: SortState, col: string): SortState {
  if (current.col === col) return { col, dir: current.dir === "asc" ? "desc" : "asc" };
  return { col, dir: col === "dateISO" ? "desc" : "asc" };
}

export function sortRides(rides: Ride[], sort: SortState): Ride[] {
  const sorted = [...rides];
  sorted.sort((a, b) => {
    let va: unknown;
    let vb: unknown;
    if (sort.col === "week") {
      va = weekSortIndex(a.week ?? "", weekIndex);
      vb = weekSortIndex(b.week ?? "", weekIndex);
    } else {
      va = (a as unknown as Record<string, unknown>)[sort.col];
      vb = (b as unknown as Record<string, unknown>)[sort.col];
    }
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sort.dir === "asc"
      ? (va as number) - (vb as number)
      : (vb as number) - (va as number);
  });
  return sorted;
}

/** Rohes Wetter-Objekt aus rides.json (weich getypt wie `Ride["weather"]`
 *  selbst, s. types.js). */
export interface RideWeather {
  temp: number;
  tempFeel?: number;
  windSpeed?: number;
  wind?: number;
  windDir?: number;
  humidity?: number;
  precip?: number;
  cloudCover?: number | null;
  weatherCode?: number;
}

export interface WeatherCellInfo {
  color: string;
  condLabel: string;
  windKmh: number;
}

/** 1:1 aus table.js::_renderTable's Wetter-Zellen-IIFE — Ampel-Einstufung
 *  über Hitze/Kälte/Wind/Regen. Farbtokens auf die React-Palette gemappt
 *  (--red/--gold/--green → --danger/--warn/--ok, s. app/src/styles/tokens.css). */
export function classifyWeather(w: RideWeather): WeatherCellInfo {
  const hot = w.temp > 32;
  const cold = w.temp < 5;
  const windy = (w.windSpeed || w.wind || 0) > 30;
  const rainy = (w.precip || 0) > 0.5;
  const bad = (hot ? 1 : 0) + (cold ? 1 : 0) + (windy ? 1 : 0) + (rainy ? 1 : 0);
  const severe = bad >= 2 || hot || (windy && rainy);
  return {
    color: severe ? "var(--danger)" : bad === 1 ? "var(--warn)" : "var(--ok)",
    condLabel: severe ? "❌ Schwierige Bedingungen" : bad === 1 ? "⚠️ Suboptimal" : "✅ Gute Bedingungen",
    windKmh: Math.round(w.windSpeed || 0),
  };
}
