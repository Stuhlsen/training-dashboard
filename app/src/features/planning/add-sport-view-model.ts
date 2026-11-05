/* ============================================================
   FEATURES/PLANNING/ADD-SPORT-VIEW-MODEL.TS — „Sportart hinzufügen" in
   „Plan anpassen" (Fahrplan 44 E5)

   Reine Logik ohne React/I/O. Eine neue Sportart kommt OBEN DRAUF (M3):
   der laufende Plan wird nur gelesen (echte Tage, feste Tage, Stunden aus der
   Plan-Zeile), seine Verteilung fließt nie zurück. Verteilung macht
   `allocateWeek` über `buildMultiSportInputs` (kein zweiter Weg), den Plan
   `generatePlan()` — beides unangetastet. Der Plan startet am nächsten Montag
   (M5), die Last der laufenden Pläne kommt aus ihren echten Karten.

   Hinweise sperren nichts (M4). Die Summe aus TSS und TRIMP ist eine
   Näherung (M8), nicht geeicht.
   ============================================================ */

import { addDaysISO, diffDays } from "../../core/format.js";
import { goalPlanProfile } from "../../core/goals.js";
import { generatePlan } from "../../core/plan-generator.js";
import type { ActiveSport } from "../../api/hooks/useActiveSport";
import type { PlanCard, Sport, TrainingPlan } from "../../api/types";
import type { GoalPlanProfile } from "./goal-plan-view-model";
import {
  buildMultiSportInputs,
  defaultSportDrafts,
  loadSummary,
  MULTI_SPORT_LABEL,
  type AllocationHint,
  type LoadSummary,
  type MultiSportItem,
  type SportDraft,
  type SportDrafts,
} from "./multi-sport-plan-view-model";
import {
  defaultFormState,
  formFromLastPlan,
  MAX_PLAN_WEEKS,
  mondayOf,
  type GeneratedPlan,
} from "./new-plan-dialog-view-model";

/* ── Benannte Festlegungen ──────────────────────────────────────── */

/** Der neue Plan startet frühestens in einer Woche (dann auf den Montag gelegt):
 *  heute Montag ⇒ Montag nächster Woche. */
export const ADD_SPORT_DEFAULT_START_OFFSET_DAYS = 7;

/** Kürzeste Planlänge für die neue Sportart, wenn der laufende Plan bald endet.
 *  Darunter ergibt der Aufbau (Grundlage, Belastung, Erholung) keinen Sinn.
 *  eigene Festlegung, nicht belegt */
export const MIN_ADD_SPORT_WEEKS = 4;

/** Ab diesem Anstieg der Wochenlast (Prozent gegenüber dem bisherigen
 *  Wochenschnitt) erscheint die ruhige Warnung. Orientierung, keine Sperre.
 *  eigene Festlegung, nicht belegt */
export const LOAD_JUMP_WARN_PCT = 30;

/** Vorrang wie im Allocator: Rad, Laufen, Schwimmen. */
const SPORT_ORDER: readonly ActiveSport[] = ["ride", "run", "swim"];
const rank = (s: ActiveSport) => SPORT_ORDER.indexOf(s);

/* ── Start und Dauer ────────────────────────────────────────────── */

/** Nächster Montag nach heute; ist heute Montag, der Montag nächster Woche. */
export function nextMondayISO(todayISO: string): string {
  return mondayOf(addDaysISO(todayISO, ADD_SPORT_DEFAULT_START_OFFSET_DAYS));
}

export interface AddSportDuration {
  weeks: number;
  /** Der Mindestwert gilt, weil der laufende Plan zu bald endet. */
  usedMinimum: boolean;
  /** Der laufende Plan reicht weiter als die Höchstlänge. */
  cappedAtMax: boolean;
}

/** Dauer = Wochen vom Start bis zum Ende des laufenden Plans, mindestens
 *  `MIN_ADD_SPORT_WEEKS`, höchstens die Höchstlänge eines Plans. */
export function addSportDuration(startISO: string, planEndISO: string): AddSportDuration {
  const span = diffDays(planEndISO, startISO);
  const raw = span < 0 ? 0 : Math.ceil((span + 1) / 7);
  if (raw < MIN_ADD_SPORT_WEEKS) return { weeks: MIN_ADD_SPORT_WEEKS, usedMinimum: true, cappedAtMax: false };
  if (raw > MAX_PLAN_WEEKS) return { weeks: MAX_PLAN_WEEKS, usedMinimum: false, cappedAtMax: true };
  return { weeks: raw, usedMinimum: false, cappedAtMax: false };
}

/* ── Angebot ────────────────────────────────────────────────────── */

export interface AddSportOptions {
  /** Im Profil, ohne aktiven Plan und ohne Vorrang vor einem laufenden Plan. */
  offered: ActiveSport[];
  /** Nicht im Profil — der Dialog sagt das offen und verweist auf die Einstellungen. */
  missingInProfile: ActiveSport[];
  /** Im Profil, aber mit Vorrang vor einem laufenden Plan: die Verteilung stellt
   *  Rad vor Laufen vor Schwimmen, ein laufender Plan würde dabei verschoben. */
  outranked: ActiveSport[];
}

export function addSportOptions(
  profileSports: readonly Sport[],
  activePlanSports: readonly ActiveSport[],
): AddSportOptions {
  const lastActiveRank = Math.max(-1, ...activePlanSports.map(rank));
  const candidates = SPORT_ORDER.filter((s) => !activePlanSports.includes(s));
  const inProfile = candidates.filter((s) => profileSports.includes(s));
  return {
    offered: inProfile.filter((s) => rank(s) > lastActiveRank),
    missingInProfile: candidates.filter((s) => !profileSports.includes(s)),
    outranked: inProfile.filter((s) => rank(s) < lastActiveRank),
  };
}

/* ── Sanfter Einstieg beim Laufen ───────────────────────────────── */

export interface GentleStart {
  gentle: boolean;
  reason: "goal" | "no-history" | null;
  /** Das Ziel-Profil für `generatePlan({ goalProfile })` (Fahrplan 43), bei
   *  sanftem Einstieg mit Level „Einsteiger" und der sanften Rampe. */
  profile: GoalPlanProfile;
}

/** Laufen startet sanft, wenn das Ziel „Laufen starten" gilt — oder, ohne
 *  dieses Ziel, wenn es weder einen früheren Laufplan noch Lauf-Historie gibt.
 *  Die Rampe selbst liefert `core/goals.js` (kein zweites Rampen-Profil). */
export function gentleStart(args: {
  sport: ActiveSport;
  goalProfile: GoalPlanProfile;
  hasEarlierPlan: boolean;
  hasHistory: boolean;
}): GentleStart {
  const { sport, goalProfile, hasEarlierPlan, hasHistory } = args;
  if (sport !== "run") return { gentle: false, reason: null, profile: goalProfile };
  if (goalProfile.level === "einsteiger" && goalProfile.ramp === "sanft") {
    return { gentle: true, reason: "goal", profile: goalProfile };
  }
  if (!hasEarlierPlan && !hasHistory) {
    const soft = goalPlanProfile({ goalKey: "laufen_starten" }, null) as GoalPlanProfile;
    return {
      gentle: true,
      reason: "no-history",
      profile: { ...goalProfile, level: soft.level, ramp: soft.ramp, lowStartVolume: soft.lowStartVolume },
    };
  }
  return { gentle: false, reason: null, profile: goalProfile };
}

/** Gibt es Trainingslast dieser Sportart? Ohne Fahrten füllt das Aggregat die
 *  Wochen mit Nullen auf — das ist keine Historie. */
export function hasTrainingHistory(aggregate: unknown): boolean {
  const weekly = (aggregate as { weeklyActualTss?: unknown } | null)?.weeklyActualTss;
  return Array.isArray(weekly) && weekly.some((v) => Number(v) > 0);
}

/** Eine reine Nullhistorie wird zu einer leeren: `generatePlan()` startet sonst bei
 *  0 TSS statt beim Level-Startwert (Mittel über lauter Nullwochen = 0). Echte
 *  Historie bleibt unverändert; `generatePlan()` selbst bleibt unangetastet. */
export function withoutEmptyHistory<T>(aggregate: T): T {
  if (!aggregate || hasTrainingHistory(aggregate)) return aggregate;
  const weekly = (aggregate as { weeklyActualTss?: unknown }).weeklyActualTss;
  return Array.isArray(weekly) && weekly.length > 0 ? ({ ...aggregate, weeklyActualTss: [] } as T) : aggregate;
}

/** Fehlt die Schwellen-Geschwindigkeit, setzt der Generator keine Pace-Vorgaben
 *  (plan-workout-select-generic.js). Das sagen wir offen, statt Werte zu erfinden. */
export function thresholdNote(sport: ActiveSport, speed: number | null): string | null {
  if (sport === "ride" || speed != null) return null;
  return `Ohne Schwellen-Geschwindigkeit bekommen die ${MULTI_SPORT_LABEL[sport]}-Karten keine Pace-Vorgaben. Trage sie ein, sobald du sie kennst.`;
}

/* ── Lastsprung ─────────────────────────────────────────────────── */

export interface LoadJump {
  oldAvg: number;
  newAvg: number;
  pct: number;
  warn: boolean;
  text: string | null;
}

const avg = (xs: readonly number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** Vergleicht die Wochenlast vorher/nachher (gleiche Wochen, gleiche Länge). */
export function loadJump(oldWeekly: readonly number[], newWeekly: readonly number[]): LoadJump {
  const oldAvg = avg(oldWeekly);
  const newAvg = avg(newWeekly);
  if (oldAvg <= 0) return { oldAvg, newAvg, pct: 0, warn: false, text: null };
  const pct = Math.round(((newAvg - oldAvg) / oldAvg) * 100);
  const warn = pct >= LOAD_JUMP_WARN_PCT;
  return {
    oldAvg,
    newAvg,
    pct,
    warn,
    text: warn
      ? `In den Wochen des neuen Plans steigt die Wochenlast im Schnitt von etwa ${oldAvg} auf etwa ${newAvg} (+${pct} %). Das ist ein größerer Sprung; zur Orientierung kannst du Stunden oder Tage der neuen Sportart verkleinern. Es bleibt deine Entscheidung. TSS (Rad) und TRIMP (Laufen, Schwimmen) sind nicht aufeinander geeicht, die Summe ist eine Näherung.`
      : null,
  };
}

/* ── Vorschau ───────────────────────────────────────────────────── */

export interface PreviewCard {
  date: string;
  name: string;
  durationMin: number;
  tssPlanned: number;
}
export interface PreviewWeek {
  start: string;
  cards: PreviewCard[];
}

export interface AddSportPreviewArgs {
  /** Alle aktiven Pläne des Athleten (mindestens einer). */
  activePlans: readonly TrainingPlan[];
  sport: ActiveSport;
  draft: Pick<SportDraft, "hours" | "weekdays" | "level" | "currentThresholdSpeed" | "thresholdSpeedTarget">;
  todayISO: string;
  /** Ziel-Profil aus Fahrplan 43 (ggf. mit sanftem Einstieg), sonst null. */
  goalProfile: GoalPlanProfile | null;
  /** V3-Historie je Sportart (`usePlanHistoryAggregate`). */
  history: Partial<Record<ActiveSport, unknown>>;
  formats: unknown[];
  /** Alle Plan-Karten des Athleten — daraus die bisherige Last. */
  existingCards: readonly PlanCard[];
}

export type AddSportPreview =
  | {
      ok: true;
      startDate: string;
      duration: AddSportDuration;
      item: MultiSportItem & { plan: GeneratedPlan };
      hints: AllocationHint[];
      /** Raster der Vorschau: laufende Sportarten aus ihren echten Karten, dazu die neue. */
      gridItems: Array<{ sport: ActiveSport; plan: { weeks: PreviewWeek[] } }>;
      load: LoadSummary;
      jump: LoadJump;
      notes: string[];
    }
  /** `hints`: Hinweise der Verteilung, falls sie schon lief — erklären oft, warum nichts passt. */
  | { ok: false; errors: Record<string, string>; hints?: AllocationHint[] };

/** Die echten Karten einer laufenden Sportart ab `fromISO`, nach Wochenstart gruppiert — für
 *  Raster und Wochenlast der Vorschau. Ausgefallene Karten zählen nicht. */
export function weeksFromCards(cards: readonly PlanCard[], sport: ActiveSport, fromISO: string) {
  const byWeek = new Map<string, PreviewCard[]>();
  for (const c of cards) {
    if ((c.sport ?? "ride") !== sport || c.cancelled || c.date < fromISO) continue;
    const start = mondayOf(c.date);
    byWeek.set(start, [
      ...(byWeek.get(start) ?? []),
      { date: c.date, name: c.name ?? c.typ ?? "", durationMin: c.durationMin ?? 0, tssPlanned: c.tssPlanned ?? 0 },
    ]);
  }
  return { weeks: [...byWeek.entries()].map(([start, cards]) => ({ start, cards })) };
}

export function buildAddSportPreview(args: AddSportPreviewArgs): AddSportPreview {
  const { activePlans, sport, draft, todayISO, goalProfile, history, formats, existingCards } = args;
  const ordered = [...activePlans].sort((a, b) => rank(a.sport ?? "ride") - rank(b.sport ?? "ride"));
  const activeSports = ordered.map((p) => (p.sport ?? "ride") as ActiveSport);
  if (ordered.length === 0 || activeSports.includes(sport) || rank(sport) < Math.max(...activeSports.map(rank))) {
    return { ok: false, errors: { sports: "Diese Sportart kann hier nicht dazukommen." } };
  }

  const primary = ordered[0];
  const startDate = nextMondayISO(todayISO);
  const latestEnd = ordered.reduce((m, p) => (p.endDate > m ? p.endDate : m), ordered[0].endDate);
  const duration = addSportDuration(startDate, latestEnd);
  const sports = SPORT_ORDER.filter((s) => activeSports.includes(s) || s === sport);

  const shared = {
    ...defaultFormState(null, todayISO),
    ...formFromLastPlan(primary),
    mode: "open" as const,
    eventId: "",
    weeks: duration.weeks,
    startDate,
    currentFtp: primary.ftpAtCreation ?? null,
  };

  // Die laufenden Pläne liefern ihre echten Werte; nur die neue Sportart bekommt die Eingabe.
  const base = defaultSportDrafts(shared);
  const drafts = { ...base } as SportDrafts;
  for (const p of ordered) {
    const s = (p.sport ?? "ride") as ActiveSport;
    drafts[s] = {
      ...base[s],
      hours: p.weeklyHours ?? base[s].hours,
      weekdays: [...p.trainingWeekdays],
      level: p.level,
      currentThresholdSpeed: p.thresholdSpeedAtCreation,
      thresholdSpeedTarget: p.thresholdSpeedTarget,
    };
  }
  drafts[sport] = { ...base[sport], ...draft };

  const built = buildMultiSportInputs({
    shared,
    drafts,
    sports,
    rideModel: primary.model,
    resolveEventDate: () => null,
    history: { ...history, [sport]: withoutEmptyHistory(history[sport]) },
  });
  if (!built.ok) return { ok: false, errors: built.errors, hints: built.hints?.filter((h) => h.sport === sport) };

  const mine = built.items.find((i) => i.sport === sport);
  if (!mine) return { ok: false, errors: { sports: "Die neue Sportart wurde nicht verteilt." } };

  const run = generatePlan as (input: unknown) => GeneratedPlan;
  const plan = run({ ...mine.input, formats, ...(goalProfile ? { goalProfile } : {}) });
  const item = { ...mine, plan };

  // Last: laufende Sportarten aus ihren echten Karten, die neue aus der Vorschau (M8).
  const existing = activeSports.map((s) => ({
    sport: s,
    plan: weeksFromCards(existingCards, s, startDate),
  }));
  const load = loadSummary([...existing, { sport, plan }] as unknown as Parameters<typeof loadSummary>[0]);
  const oldAt = (i: number) =>
    existing.reduce((sum, e) => sum + (load.rows.find((r) => r.sport === e.sport)?.values[i] ?? 0), 0);
  const overlap = load.weekStarts
    .map((_, i) => i)
    .filter((i) => oldAt(i) > 0 && plan.weeks.some((w) => w.start === load.weekStarts[i]));
  const jump = loadJump(overlap.map(oldAt), overlap.map((i) => load.total[i]));

  const notes: string[] = [];
  if (duration.usedMinimum) {
    notes.push(
      `Der laufende Plan endet bald. Für einen sinnvollen Aufbau plane ich mindestens ${MIN_ADD_SPORT_WEEKS} Wochen (eigene Festlegung).`,
    );
  }
  if (duration.cappedAtMax) notes.push(`Der Plan ist auf höchstens ${MAX_PLAN_WEEKS} Wochen begrenzt.`);
  const tn = thresholdNote(sport, mine.input.currentThresholdSpeed ?? null);
  if (tn) notes.push(tn);

  return {
    ok: true,
    startDate,
    duration,
    item,
    hints: built.hints.filter((h) => h.sport === sport),
    gridItems: [...existing, { sport, plan }],
    load,
    jump,
    notes,
  };
}
