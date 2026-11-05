/* ============================================================
   FEATURES/PLANNING/GROUP-RECOMPUTE-VIEW-MODEL.TS — „Plan anpassen" für
   verknüpfte Pläne (Fahrplan 44 E6)

   Reine Logik ohne React/I/O. Hat der aktive Plan eine Gruppe mit mindestens
   zwei aktiven Plänen, wirken Trainingstage und feste Tage auf alle gewählten
   Sportarten. Gerechnet wird mit denselben Bausteinen wie bei einem Plan:
   `buildRecomputeInput` (Eingabe je Plan), `allocateWeek` (Verteilung, Rad hat
   Vorrang — M3) und `generatePlan` (unangetastet). Hier entsteht keine zweite
   Eingabelogik, nur die Verdrahtung.

   WER WIRD GESCHRIEBEN? Eine Sportart ist „betroffen", wenn sie gewählt ist
   und sich ihr Ergebnis ändert: eigene Änderung (Tage, feste Tage, Stunden,
   Ziel-FTP, Häkchen, Ziele) oder weil die Verteilung ihre Tage verschiebt.
   Betrifft eine Änderung nur eine Sportart, bleiben die Karten der anderen
   unangetastet — sie werden nicht einmal neu gerechnet. Ändert der Athlet
   nichts, werden alle gewählten Sportarten mit frischer Form neu gerechnet
   (wie „Plan anpassen" heute) und beim Schreiben nur dort geschrieben, wo sich
   wirklich etwas ändert. Eine abgewählte Sportart wird nie gerechnet oder
   geschrieben, ihre heutigen Tage gelten in der Verteilung aber als belegt.

   Hinweise der Verteilung sperren nichts (M4). Die Summe der Last ist eine
   Näherung (M8): TSS und TRIMP sind nicht aufeinander geeicht.
   ============================================================ */

import { allocateWeek } from "../../core/multi-sport-allocator.js";
import { generatePlan } from "../../core/plan-generator.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { PlanCard, TrainingPlan } from "../../api/types";
import { weeksFromCards } from "./add-sport-view-model";
import type { GoalPlanProfile } from "./goal-plan-view-model";
import {
  loadSummary,
  MULTI_SPORT_LABEL,
  type AllocationHint,
  type LoadSummary,
} from "./multi-sport-plan-view-model";
import type { AthleteDefaults, FixedDay, GeneratedPlan, PlanGeneratorInput } from "./new-plan-dialog-view-model";
import { savedPlanForm } from "./new-plan-dialog-view-model";
import {
  buildRecomputeInput,
  buildRecomputePatch,
  replaceFromISO,
  type RecomputePatch,
} from "./recompute-plan-view-model";

/** Stunden, wenn ein Plan keine gespeichert hat (wie `buildRecomputeInput`). */
const DEFAULT_WEEKLY_HOURS = 6;

/** Vorrang der Sportarten wie im Allocator: Rad zuerst. */
const SPORT_ORDER: readonly ActiveSport[] = ["ride", "run", "swim"];

const sportOf = (p: TrainingPlan): ActiveSport => (p.sport ?? "ride") as ActiveSport;

/** Gilt die gemeinsame Anpassung? Erst ab zwei aktiven Plänen — eine Gruppe mit
 *  nur noch einem Plan verhält sich wie ein Plan ohne Gruppe. */
export function isGroupRecompute(plans: readonly TrainingPlan[]): boolean {
  return plans.filter((p) => p.isActive).length >= 2;
}

/* ── Eingaben ───────────────────────────────────────────────────── */

/** Was der Athlet für eine Sportart im Dialog geändert hat. Fehlt ein Feld,
 *  gilt der Stand des Plans. */
export interface SportEdit {
  /** Trainingstage, ISO 1..7. */
  weekdays?: number[];
  /** Stunden pro Woche (M2). */
  hours?: number;
  /** Feste Tage — nur Rad. */
  fixedDays?: FixedDay[];
  /** Ziel-FTP in Watt — nur Rad, bei anderen Sportarten ignoriert. */
  ftpTarget?: number | null;
  /** Häkchen „alle Tage behalten". */
  keepAllTrainingDays?: boolean;
}

export interface GroupBuildArgs {
  /** Alle aktiven Pläne der Gruppe (`listPlanGroup`). */
  plans: readonly TrainingPlan[];
  /** Sportart des aufrufenden Plans — steht in der Anzeige vorn. */
  callerSport: ActiveSport;
  todayISO: string;
  /** Gewählte Sportarten; alle anderen bleiben unberührt. */
  selected: readonly ActiveSport[];
  edits: Partial<Record<ActiveSport, SportEdit>>;
  /** V3-Historie je Sportart (`usePlanHistoryAggregate`). */
  history: Partial<Record<ActiveSport, unknown>>;
  currentThresholdSpeed: Partial<Record<ActiveSport, number | null | undefined>>;
  athleteDefaults: AthleteDefaults | null;
  /** Ziel-Profil je Sportart; fehlt es, wirkt kein Ziel (Fahrplan 43 E5). */
  goalProfiles: Partial<Record<ActiveSport, GoalPlanProfile | null>>;
  formats: unknown[];
  /** Alle Plan-Karten des Athleten — daraus die Last der unberührten Sportarten. */
  existingCards: readonly PlanCard[];
}

/* ── Ergebnis ───────────────────────────────────────────────────── */

export interface GroupItem {
  sport: ActiveSport;
  plan: TrainingPlan;
  selected: boolean;
  /** Wird gerechnet und (soweit sich etwas ändert) geschrieben. */
  affected: boolean;
  /** Stunden pro Woche, mit denen gerechnet wird. */
  weeklyHours: number;
  /** Nur bei `affected`. */
  input?: PlanGeneratorInput;
  generated?: GeneratedPlan;
  patch?: RecomputePatch;
  /** Wochentage fester Tage, die entfallen (nur Rad). */
  droppedFixedWeekdays: number[];
}

export interface GroupGridItem {
  sport: ActiveSport;
  plan: {
    weeks: Array<{
      start: string;
      cards: Array<{ date: string; name: string; durationMin: number; tssPlanned: number }>;
    }>;
  };
}

export type GroupBuild =
  | {
      ok: true;
      /** Aufrufende Sportart zuerst, danach in Vorrang-Reihenfolge. */
      items: GroupItem[];
      affectedSports: ActiveSport[];
      /** Nichts geändert: alle gewählten Sportarten werden mit frischer Form gerechnet. */
      refreshMode: boolean;
      regenerateFromISO: string;
      /** Ab hier werden Karten ersetzt; davor wird nichts angefasst. */
      replaceFrom: string;
      affectedWeeks: number;
      hints: AllocationHint[];
      grid: GroupGridItem[];
      load: LoadSummary;
    }
  | { ok: false; reason: string; hints?: AllocationHint[] };

const fail = (reason: string, hints?: AllocationHint[]): GroupBuild => ({ ok: false, reason, hints });

/** Stabile Darstellung zum Vergleichen (Schlüsselreihenfolge egal). */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

interface AllocatedPlan {
  sport: ActiveSport;
  weeklyHours: number;
  trainingWeekdays: number[];
  fixedDays: FixedDay[];
}
type Allocation =
  | { ok: true; plans: AllocatedPlan[]; hints: AllocationHint[] }
  | { ok: false; error: { message: string } };

type OkInput = Extract<ReturnType<typeof buildRecomputeInput>, { ok: true }>;

export function buildGroupRecompute(args: GroupBuildArgs): GroupBuild {
  const { plans, callerSport, todayISO, selected } = args;
  const bySport = new Map(plans.map((p) => [sportOf(p), p] as const));
  const sports = SPORT_ORDER.filter((s) => bySport.has(s));
  const isSelected = (s: ActiveSport) => selected.includes(s);
  if (!sports.some(isSelected)) return fail("Mindestens eine Sportart gewählt lassen.");

  // 1) Eingabe je Plan: Stand des Plans (base) und mit den Änderungen des Athleten (edited).
  const built = new Map<ActiveSport, { base: OkInput; edited: OkInput }>();
  for (const s of sports) {
    const plan = bySport.get(s)!;
    const label = MULTI_SPORT_LABEL[s];
    const common = {
      plan,
      history: args.history[s],
      todayISO,
      athleteDefaults: args.athleteDefaults,
      currentThresholdSpeed: args.currentThresholdSpeed[s],
    };
    const base = buildRecomputeInput(common);
    if (!base.ok) return fail(`${label}: ${base.reason}`);
    const edit = isSelected(s) ? (args.edits[s] ?? {}) : {};
    const goal = isSelected(s) ? args.goalProfiles[s] : null;
    const edited = buildRecomputeInput({
      ...common,
      ...(edit.weekdays ? { trainingWeekdays: edit.weekdays } : {}),
      ...(edit.keepAllTrainingDays != null ? { keepAllTrainingDays: edit.keepAllTrainingDays } : {}),
      ...(s === "ride" && edit.fixedDays ? { fixedDays: edit.fixedDays } : {}),
      ...(s === "ride" && edit.ftpTarget != null ? { ftpTarget: edit.ftpTarget } : {}),
      ...(goal ? { goalProfile: goal } : {}),
    });
    if (!edited.ok) return fail(`${label}: ${edited.reason}`);
    built.set(s, { base, edited });
  }

  const planHours = (s: ActiveSport) => bySport.get(s)!.weeklyHours ?? DEFAULT_WEEKLY_HOURS;
  const hoursOf = (s: ActiveSport) => (isSelected(s) ? (args.edits[s]?.hours ?? planHours(s)) : planHours(s));
  for (const s of sports.filter(isSelected)) {
    if (!(hoursOf(s) > 0)) return fail(`${MULTI_SPORT_LABEL[s]}: Zeitbudget in Stunden angeben.`);
  }

  // 2) Verteilung: Stand nach den Änderungen und Stand davor (für „hat sich etwas verschoben?").
  const allocate = (pick: "base" | "edited"): Allocation =>
    allocateWeek({
      sports: sports.map((s) => ({
        sport: s,
        hours: pick === "edited" ? hoursOf(s) : planHours(s),
        weekdays: [...built.get(s)![pick].input.trainingWeekdays],
        fixedDays: s === "ride" ? (built.get(s)![pick].input.fixedDays ?? []) : [],
      })),
      blockedDays: [],
    }) as Allocation;
  const after = allocate("edited");
  if (!after.ok) return fail(after.error.message);
  const before = allocate("base");
  const afterOf = (s: ActiveSport) => after.plans.find((p) => p.sport === s)!;
  const beforeOf = (s: ActiveSport) => (before.ok ? before.plans.find((p) => p.sport === s) : undefined);

  // 3) Wer ist betroffen?
  const dirty = (s: ActiveSport): boolean => {
    if (!isSelected(s)) return false;
    const plan = bySport.get(s)!;
    const edit = args.edits[s] ?? {};
    const savedKeepAll = savedPlanForm(plan).keepAllTrainingDays === true;
    const own =
      !!args.goalProfiles[s] ||
      (s === "ride" && edit.ftpTarget != null && edit.ftpTarget !== plan.ftpTarget) ||
      (edit.keepAllTrainingDays != null && edit.keepAllTrainingDays !== savedKeepAll);
    const prev = beforeOf(s);
    const moved = !prev || stableJson(afterOf(s)) !== stableJson(prev);
    return own || moved;
  };
  const dirtySports = sports.filter(dirty);
  const refreshMode = dirtySports.length === 0;
  const affected = refreshMode ? sports.filter(isSelected) : dirtySports;

  // 4) Betroffene Pläne rechnen — scheitert eine, wird nichts geschrieben.
  const { regenerateFromISO, affectedWeeks } = built.get(sports[0])!.edited;
  const replaceFrom = replaceFromISO(regenerateFromISO, todayISO);
  const run = generatePlan as (input: unknown) => GeneratedPlan;
  const items = new Map<ActiveSport, GroupItem>();
  for (const s of sports) {
    const plan = bySport.get(s)!;
    const alloc = afterOf(s);
    const item: GroupItem = {
      sport: s,
      plan,
      selected: isSelected(s),
      affected: affected.includes(s),
      weeklyHours: alloc.weeklyHours,
      droppedFixedWeekdays: built.get(s)!.edited.droppedFixedWeekdays,
    };
    items.set(s, item);
    if (!item.affected) continue;

    const label = MULTI_SPORT_LABEL[s];
    if (alloc.trainingWeekdays.length < 2) {
      return fail(
        `${label}: Nach der Verteilung bleiben weniger als zwei Trainingstage. Wähle mehr Tage für ${label} oder ändere die Rad-Tage.`,
        after.hints.filter((h) => h.sport === s),
      );
    }
    const input: PlanGeneratorInput = {
      ...built.get(s)!.edited.input,
      weeklyHours: alloc.weeklyHours,
      trainingWeekdays: alloc.trainingWeekdays,
      fixedDays: alloc.fixedDays.map((f) => ({ ...f })),
    };
    let generated: GeneratedPlan;
    try {
      generated = run({ ...input, formats: args.formats });
    } catch (err) {
      return fail(`${label}: ${err instanceof Error ? err.message : "Der Plan ließ sich nicht berechnen."}`);
    }
    const editedHours = isSelected(s) ? args.edits[s]?.hours : undefined;
    const hoursChanged = editedHours != null && editedHours !== plan.weeklyHours;
    item.input = input;
    item.generated = generated;
    item.patch = buildRecomputePatch(plan, generated, input, hoursChanged ? { weeklyHours: alloc.weeklyHours } : {});
  }

  // 5) Vorschau: betroffene Sportarten aus der Rechnung, die anderen aus ihren echten Karten.
  const grid: GroupGridItem[] = sports.map((s) => {
    const item = items.get(s)!;
    const weeks = item.generated
      ? item.generated.weeks.filter((w) => w.start >= regenerateFromISO)
      : weeksFromCards(args.existingCards, s, regenerateFromISO).weeks;
    return { sport: s, plan: { weeks } } as GroupGridItem;
  });
  const load = loadSummary(grid as unknown as Parameters<typeof loadSummary>[0]);

  const ordered = [callerSport, ...sports.filter((s) => s !== callerSport)].filter((s) => items.has(s));
  return {
    ok: true,
    items: ordered.map((s) => items.get(s)!),
    affectedSports: affected,
    refreshMode,
    regenerateFromISO,
    replaceFrom,
    affectedWeeks,
    hints: after.hints.filter((h) => affected.includes(h.sport)),
    grid,
    load,
  };
}
