/* ============================================================
   FEATURES/PLANNING/MULTI-SPORT-PLAN-VIEW-MODEL.TS — „Neuer Plan" für
   mehrere Sportarten (Fahrplan 44 E4)

   Reine Logik ohne React/I/O. Der Dialog bleibt bei EINEM Formular für das
   Gemeinsame (Startdatum, Dauer/Event) und führt je Sportart nur die Felder,
   die sich unterscheiden: Stunden (M2), Tage, Level, bei Laufen/Schwimmen die
   Schwellenpace. Verteilung der Tage und harten Tage macht `allocateWeek`
   (core/multi-sport-allocator.js); den fertigen Input je Sportart baut
   weiterhin `buildGeneratorInput` — hier entsteht KEINE zweite Eingabelogik,
   nur die Verdrahtung. `generatePlan()` bleibt unangefasst.

   Hinweise der Verteilung sperren nichts (M4); Eingabefehler zeigt das
   Formular. Die Summe der Last ist eine Näherung (M8): TSS und TRIMP sind
   nicht aufeinander geeicht.
   ============================================================ */

import { allocateWeek } from "../../core/multi-sport-allocator.js";
import { diffDays, fmtDate } from "../../core/format.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { Sport } from "../../api/types";
import {
  buildGeneratorInput,
  mondayOf,
  suggestModel,
  type FixedDay,
  type GeneratedPlan,
  type NewPlanFormState,
  type PlanGeneratorInput,
  type PlanLevel,
  type PlanModel,
} from "./new-plan-dialog-view-model";

/* ── Sportarten ─────────────────────────────────────────────────── */

/** Vorrang der Sportarten wie im Allocator: Rad zuerst. */
const SPORT_ORDER: readonly ActiveSport[] = ["ride", "run", "swim"];

export const MULTI_SPORT_LABEL: Record<ActiveSport, string> = {
  ride: "Rad",
  run: "Laufen",
  swim: "Schwimmen",
};

/** Sportarten des Athleten, die ein Plan abdeckt (ohne „other"), in fester Reihenfolge. */
export function selectableSports(sports: readonly Sport[]): ActiveSport[] {
  return SPORT_ORDER.filter((s) => sports.includes(s));
}

/** Sportart an-/abwählen. Die letzte bleibt immer stehen (ein Plan braucht eine Sportart). */
export function toggleSport(current: readonly ActiveSport[], sport: ActiveSport): ActiveSport[] {
  if (current.includes(sport)) {
    return current.length === 1 ? [...current] : current.filter((s) => s !== sport);
  }
  return SPORT_ORDER.filter((s) => s === sport || current.includes(s));
}

/* ── Entwurf je Sportart ────────────────────────────────────────── */

export interface SportDraft {
  /** Stunden pro Woche (M2). */
  hours: number;
  /** Trainingstage, ISO 1..7. */
  weekdays: number[];
  level: PlanLevel;
  /** km/h — nur Laufen/Schwimmen. */
  currentThresholdSpeed: number | null;
  /** km/h — nur Laufen/Schwimmen, optional. */
  thresholdSpeedTarget: number | null;
}

export type SportDrafts = Record<ActiveSport, SportDraft>;

/** Startwerte: Rad aus dem Formular, Laufen/Schwimmen mit eigenen Tagen, die
 *  zu den Standard-Radtagen (Di/Do/Sa) passen (M7: eigene Tage zuerst). */
export function defaultSportDrafts(
  base: Pick<NewPlanFormState, "weeklyHours" | "trainingWeekdays" | "level">,
): SportDrafts {
  const common = { level: base.level, currentThresholdSpeed: null, thresholdSpeedTarget: null };
  return {
    ride: { ...common, hours: base.weeklyHours, weekdays: [...base.trainingWeekdays] },
    run: { ...common, hours: 3, weekdays: [1, 3, 7] },
    swim: { ...common, hours: 2, weekdays: [1, 5] },
  };
}

/** Die erste gewählte Sportart: ihre Eingaben stehen im Dialog-Formular selbst
 *  (so bleiben Rad-Felder wie FTP, feste Tage, Drinnen/Draußen unverändert). */
export function primaryDraft(
  form: Pick<
    NewPlanFormState,
    "weeklyHours" | "trainingWeekdays" | "level" | "currentThresholdSpeed" | "thresholdSpeedTarget"
  >,
): SportDraft {
  return {
    hours: form.weeklyHours,
    weekdays: [...form.trainingWeekdays],
    level: form.level,
    currentThresholdSpeed: form.currentThresholdSpeed,
    thresholdSpeedTarget: form.thresholdSpeedTarget,
  };
}

/** Wirksame Planlänge: im Event-Modus von Start-Montag bis Renntag (wie der Dialog). */
export function planWeeks(
  shared: Pick<NewPlanFormState, "mode" | "weeks" | "eventId" | "newEventDate" | "startDate">,
  resolveEventDate: (eventId: string) => string | null,
): number {
  if (shared.mode !== "event") return shared.weeks;
  const end = shared.eventId ? resolveEventDate(shared.eventId) : shared.newEventDate || null;
  if (!end) return shared.weeks;
  return Math.max(1, Math.ceil((diffDays(end, mondayOf(shared.startDate)) + 1) / 7));
}

/* ── Formular → ein Input je Sportart ───────────────────────────── */

export interface AllocationHint {
  code: string;
  text: string;
  sport: ActiveSport;
}

export interface MultiSportItem {
  sport: ActiveSport;
  /** Formularzustand dieser Sportart (für `training_plans.params`). */
  form: NewPlanFormState;
  input: PlanGeneratorInput;
}

export type MultiSportBuild =
  | { ok: true; items: MultiSportItem[]; hints: AllocationHint[] }
  /** `hints`: Hinweise der Verteilung, falls sie schon lief — erklären oft, warum ein
   *  Plan danach nicht passt (z. B. null Tage übrig). */
  | { ok: false; errors: Record<string, string>; hints?: AllocationHint[] };

/** Fehlerschlüssel, die für alle Sportarten gleich sind — erscheinen nur einmal. */
const SHARED_ERROR_KEYS = ["startDate", "event", "newEventName", "weeks"];

export interface BuildMultiArgs {
  /** Gemeinsames Formular (Startdatum, Dauer/Event, feste Rad-Tage, Rolle …). */
  shared: NewPlanFormState;
  drafts: SportDrafts;
  /** Gewählte Sportarten (mindestens zwei). */
  sports: readonly ActiveSport[];
  /** Wirksames Periodisierungsmodell des Radplans (Wahl oder Vorschlag). */
  rideModel: PlanModel;
  resolveEventDate: (eventId: string) => string | null;
  /** V3-Historie je Sportart (`usePlanHistoryAggregate`). */
  history: Partial<Record<ActiveSport, unknown>>;
}

/** Gemeinsame Fehler (Startdatum, Event, Wochen) einmal prüfen — mit
 *  Platzhalterwerten für alles Sportartspezifische. */
function sharedErrors(
  shared: NewPlanFormState,
  resolveEventDate: (eventId: string) => string | null,
): Record<string, string> {
  const probe = { ...shared, trainingWeekdays: [1, 2], fixedDays: [], weeklyHours: 1 };
  const built = buildGeneratorInput(probe, resolveEventDate);
  if (built.ok) return {};
  return Object.fromEntries(Object.entries(built.errors).filter(([k]) => SHARED_ERROR_KEYS.includes(k)));
}

function sportErrors(sports: readonly ActiveSport[], drafts: SportDrafts): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const s of sports) {
    const d = drafts[s];
    const label = MULTI_SPORT_LABEL[s];
    if (!(d.hours > 0)) errors[`${s}.weeklyHours`] = `${label}: Zeitbudget in Stunden angeben.`;
    if (new Set(d.weekdays.filter((x) => x >= 1 && x <= 7)).size < 2) {
      errors[`${s}.trainingWeekdays`] = `${label}: Mindestens zwei Trainingstage wählen.`;
    }
  }
  return errors;
}

/**
 * Gemeinsames Formular + Entwurf je Sportart → `PlanGeneratorInput` je Sportart.
 * Die Tage und harten Tage verteilt `allocateWeek` (Rad bleibt unberührt, M3).
 */
export function buildMultiSportInputs(args: BuildMultiArgs): MultiSportBuild {
  const { shared, drafts, sports, rideModel, resolveEventDate, history } = args;
  if (sports.length < 2) {
    return { ok: false, errors: { sports: "Mindestens zwei Sportarten wählen." } };
  }

  const early = { ...sharedErrors(shared, resolveEventDate), ...sportErrors(sports, drafts) };
  if (Object.keys(early).length) return { ok: false, errors: early };

  const alloc = allocateWeek({
    sports: sports.map((s) => ({
      sport: s,
      hours: drafts[s].hours,
      weekdays: [...new Set(drafts[s].weekdays)].sort((a, b) => a - b),
      fixedDays: s === "ride" ? shared.fixedDays : [],
    })),
    blockedDays: [],
  });
  if (!alloc.ok) return { ok: false, errors: { allocation: alloc.error.message } };

  const weeks = planWeeks(shared, resolveEventDate);
  const errors: Record<string, string> = {};
  const items: MultiSportItem[] = [];

  for (const plan of alloc.plans as Array<{
    sport: ActiveSport;
    weeklyHours: number;
    trainingWeekdays: number[];
    fixedDays: FixedDay[];
  }>) {
    const sport = plan.sport;
    const d = drafts[sport];
    const isRide = sport === "ride";
    const form: NewPlanFormState = {
      ...shared,
      level: d.level,
      weeklyHours: plan.weeklyHours,
      trainingWeekdays: plan.trainingWeekdays,
      fixedDays: isRide ? plan.fixedDays : [],
      model: isRide
        ? rideModel
        : suggestModel({ level: d.level, weeks, weeklyHours: plan.weeklyHours }),
      currentThresholdSpeed: isRide ? shared.currentThresholdSpeed : d.currentThresholdSpeed,
      thresholdSpeedTarget: isRide ? shared.thresholdSpeedTarget : d.thresholdSpeedTarget,
    };
    const built = buildGeneratorInput(form, resolveEventDate, sport, history[sport]);
    if (!built.ok) {
      for (const [key, msg] of Object.entries(built.errors)) {
        if (SHARED_ERROR_KEYS.includes(key)) errors[key] = msg;
        else errors[`${sport}.${key}`] = `${MULTI_SPORT_LABEL[sport]}: ${msg}`;
      }
      continue;
    }
    // `buildGeneratorInput` kennt feste Tage nur fürs Rad. Die Pins der
    // Verteilung (harte Tage mit Abstand, FIXED_INTERVAL_TYP) steuern aber auch
    // Laufen/Schwimmen — der Generator wertet `fixedDays` sportunabhängig aus.
    const input: PlanGeneratorInput = isRide
      ? built.input
      : { ...built.input, fixedDays: plan.fixedDays.map((f) => ({ ...f })) };
    items.push({ sport, form, input });
  }

  const hints = alloc.hints as AllocationHint[];
  if (Object.keys(errors).length) return { ok: false, errors, hints };
  return { ok: true, items, hints };
}

/* ── Last: jede Sportart eine Zeile, dazu die Summe (M8) ────────── */

export interface LoadRow {
  sport: ActiveSport;
  label: string;
  /** Geplante TSS je Woche (Summe der Karten) in `weekStarts`-Reihenfolge, fehlende Wochen = 0. */
  values: number[];
  avg: number;
}

export interface LoadSummary {
  weekStarts: string[];
  rows: LoadRow[];
  total: number[];
  totalAvg: number;
  /** Beschriftung der Summenzeile — benennt sie ausdrücklich als Näherung. */
  totalLabel: string;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const finite = (n: number) => (Number.isFinite(n) ? n : 0);
const avgOf = (xs: readonly number[]) => (xs.length ? Math.round(sum(xs) / xs.length) : 0);

export function loadSummary(
  plans: ReadonlyArray<{ sport: ActiveSport; plan: Pick<GeneratedPlan, "weeks"> }>,
): LoadSummary {
  const weekStarts = [...new Set(plans.flatMap((p) => p.plan.weeks.map((w) => w.start)))].sort();
  const rows: LoadRow[] = plans.map(({ sport, plan }) => {
    // Summe der geplanten Karten statt `targetTss`: Das Wochenziel des Generators weicht
    // von den eingeplanten Karten ab und kann bei Laufen/Schwimmen ohne Historie 0 sein.
    const byStart = new Map(
      plan.weeks.map((w) => [w.start, Math.round(sum(w.cards.map((c) => finite(c.tssPlanned))))]),
    );
    const values = weekStarts.map((s) => byStart.get(s) ?? 0);
    return { sport, label: MULTI_SPORT_LABEL[sport], values, avg: avgOf(values) };
  });
  const total = weekStarts.map((_, i) => sum(rows.map((r) => r.values[i])));
  return { weekStarts, rows, total, totalAvg: avgOf(total), totalLabel: "Summe (Näherung)" };
}

/* ── Was wird ersetzt? (je Sportart) ────────────────────────────── */

export interface ReplaceNote {
  sport: ActiveSport;
  replaces: boolean;
  text: string;
}

export function replaceNotes(
  sports: readonly ActiveSport[],
  active: Partial<Record<ActiveSport, { endDate: string } | null | undefined>>,
): ReplaceNote[] {
  return sports.map((sport) => {
    const label = MULTI_SPORT_LABEL[sport];
    const plan = active[sport];
    return plan
      ? {
          sport,
          replaces: true,
          text: `${label}: ersetzt den laufenden Plan (bis ${fmtDate(plan.endDate)}). Künftige Karten dieser Sportart werden ersetzt.`,
        }
      : { sport, replaces: false, text: `${label}: kein laufender Plan, es wird nichts ersetzt.` };
  });
}
