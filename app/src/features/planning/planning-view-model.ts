/* ============================================================
   FEATURES/PLANNING/PLANNING-VIEW-MODEL.TS — reine Ableitungen für den
   Planungstab (kein DOM, kein Fetch — Muster wie hero-view-model.ts/
   events-view-model.ts).

   Etappe 6a (Grundgerüst) — deckt Filterung/Gruppierung/Fortschritt ab,
   Port der entsprechenden Logik aus assets/js/ui/planned.js (dort Teil von
   render(), hier als reine, getestete Funktion). Was 6c nachliefert (Delta-
   Banner, Wirkungsanzeige, Hinweis-Chip, Compliance-Tabelle) sitzt bewusst
   NICHT hier — dafür bleibt core/plan-feedback.js in 6a auf
   plannedRecoveryWeeks()/restDayRiddenSignal() beschränkt. */

import { plannedRecoveryWeeks } from "../../core/plan-feedback.js";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

/** 1:1 aus ui/planned.js::_typColor — inkl. Athlet-2-Vokabular (GFNY Bremen
 *  2026: Ruhetag/NLS/Z1/Z2/Rennen/Race). */
export const PLAN_TYPE_COLOR: Record<string, string> = {
  "Sweet Spot": "#e08a3c",
  Schwelle: "#d94f4f",
  VO2max: "#a24ad0",
  "Z2 Lang": "#4a7fa8",
  "Z2 Dauer": "#4a7fa8",
  "Z1 Recovery": "#4a9a6e",
  Gruppenfahrt: "#c9a84c",
  "FTP-Test": "#c9a84c",
  Ruhetag: "#6b7280",
  NLS: "#6b7280",
  Z1: "#4a9a6e",
  Z2: "#4a7fa8",
  Rennen: "#c9a84c",
  Race: "#f2b705",
};

/** 1:1 aus ui/planned.js::_typIcon. */
export const PLAN_TYPE_ICON: Record<string, string> = {
  "Sweet Spot": "⚡",
  Schwelle: "🔥",
  VO2max: "💜",
  "Z2 Lang": "🚴",
  "Z2 Dauer": "🚴",
  "Z1 Recovery": "🌿",
  Gruppenfahrt: "👥",
  "FTP-Test": "🎯",
  Ruhetag: "😴",
  NLS: "🏁",
  Z1: "🌿",
  Z2: "🚴",
  Rennen: "🏆",
  Race: "🎯",
};

export function typeColor(typ: string | null): string {
  return (typ && PLAN_TYPE_COLOR[typ]) || "#6b7280";
}

export function typeIcon(typ: string | null): string {
  return (typ && PLAN_TYPE_ICON[typ]) || "📅";
}

/** Ruhetag-Karten zählen nie als "verpasst" (ein nicht gefahrener Ruhetag
 *  ist Erfüllung, kein Ausfall) und nicht als Basis der Fortschrittsquote —
 *  s. buildPlanningSections(). */
export function isRestDay(card: PlanCard): boolean {
  return card.typ === "Ruhetag";
}

export type WorkoutBlockType = "warmup" | "interval" | "cooldown";

export interface WorkoutBlock {
  type: WorkoutBlockType;
  text: string;
}

export interface WorkoutBlocks {
  blocks: WorkoutBlock[];
}

/** `PlanCard.workout`/`workoutStructure` sind `unknown` (s. api/types.ts) —
 *  nur das NEUE, im Dialog erzeugte Format ({blocks:[{type,text}]}) wird in
 *  6a gerendert/editiert. Migrierte Plan-2-Karten mit dem alten, starren
 *  Zahlenformat (warmup/intervals/duration/rest/cooldown/pct/watts) liefern
 *  hier `null` — ihre Segmentbalken-Darstellung ist 6c-Scope. */
export function asWorkoutBlocks(workout: unknown): WorkoutBlocks | null {
  if (
    workout &&
    typeof workout === "object" &&
    Array.isArray((workout as { blocks?: unknown }).blocks)
  ) {
    return workout as WorkoutBlocks;
  }
  return null;
}

function doneDatesOf(rides: Ride[]): Set<string> {
  return new Set(rides.map((r) => r.date ?? r.dateISO));
}

export interface WeekGroup {
  week: string;
  phase: string | null;
  cards: PlanCard[];
  isRecoveryWeek: boolean;
}

export interface PlanningStats {
  doneCount: number;
  upcomingCount: number;
  weeksLeft: number;
  /** Roher Wochenschlüssel (z. B. "2026-KW28") der ersten anstehenden
   *  Karte — Formatierung (weekDisplayLabels) ist Sache der UI-Schicht. */
  currentWeekLabel: string | null;
  cancelledCount: number;
  missedCount: number;
  totalSessions: number;
  pct: number;
}

export interface PlanningSections {
  weeks: WeekGroup[];
  done: PlanCard[];
  missed: PlanCard[];
  cancelled: PlanCard[];
  stats: PlanningStats;
}

/** Portiert 1:1 die Filter-/Gruppier-/Statistik-Logik aus
 *  ui/planned.js (render(), ~Zeilen 457–628). `cards` sind bereits die vom
 *  Server aufgelösten plan_cards (Ruhetage als echte Zeilen enthalten, s.
 *  Rechercheergebnisse im Etappe-6a-Plan — kein fillRestDays() hier nötig). */
export function buildPlanningSections(
  cards: PlanCard[],
  rides: Ride[],
  todayIso: string,
): PlanningSections {
  const doneDates = doneDatesOf(rides);

  // Ausstehend: zukünftig/heute ODER verschoben (auch wenn neues Datum
  // vergangen), noch kein passender Ride, nicht ausgefallen.
  const upcoming = cards
    .filter((c) => (c.date >= todayIso || c.originalDate) && !doneDates.has(c.date) && !c.cancelled)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Absolviert: Ride mit passendem Datum vorhanden — schließt eine
  // GEFAHRENE Ruhetag-Karte bewusst mit ein (Signal "Ruhetag gefahren"),
  // zählt aber unten NICHT zur Fortschritts-Basis.
  const done = cards
    .filter((c) => doneDates.has(c.date) && !c.cancelled)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Verpasst: vergangen, kein Ride, nicht ausgefallen, nicht verschoben,
  // kein Ruhetag.
  const missed = cards
    .filter(
      (c) =>
        c.date < todayIso &&
        !doneDates.has(c.date) &&
        !c.cancelled &&
        !c.originalDate &&
        !isRestDay(c),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const cancelled = cards.filter((c) => c.cancelled).sort((a, b) => b.date.localeCompare(a.date));

  // Fortschritt: Basis sind Nicht-Ruhetag-Karten — eine gefahrene
  // Ruhetag-Karte ist eine Anomalie, kein erfüllter Trainingsreiz, und
  // zählt deshalb weder im Zähler noch im Nenner.
  const countable = cards.filter((c) => !isRestDay(c));
  const totalSessions = countable.length;
  const doneCount = done.filter((c) => !isRestDay(c)).length;
  const cancelledCount = cancelled.length;
  const missedCount = missed.length;
  const pct = totalSessions ? Math.round((doneCount / totalSessions) * 100) : 0;
  const weeksLeft = new Set(upcoming.map((c) => c.week).filter((w): w is string => !!w)).size;
  const currentWeekLabel = upcoming[0]?.week ?? null;

  // Erholungswochen über ALLE Karten des Athleten (nicht nur die
  // anstehenden), damit eine bereits teilweise gefahrene Erholungswoche
  // nicht durch die Bucket-Aufteilung verzerrt wird.
  const recoveryWeeks = plannedRecoveryWeeks(cards) as Set<string>;

  const weekMap = new Map<string, PlanCard[]>();
  for (const c of upcoming) {
    const key = c.week ?? "–";
    const bucket = weekMap.get(key);
    if (bucket) bucket.push(c);
    else weekMap.set(key, [c]);
  }
  const weeks: WeekGroup[] = [...weekMap.entries()].map(([week, weekCards]) => ({
    week,
    phase: weekCards[0]?.phase ?? null,
    cards: weekCards,
    isRecoveryWeek: recoveryWeeks.has(week),
  }));

  return {
    weeks,
    done,
    missed,
    cancelled,
    stats: {
      doneCount,
      upcomingCount: upcoming.length,
      weeksLeft,
      currentWeekLabel,
      cancelledCount,
      missedCount,
      totalSessions,
      pct,
    },
  };
}
