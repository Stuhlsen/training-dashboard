/* ============================================================
   FEATURES/PLANNING/NEW-PLAN-DIALOG-VIEW-MODEL.TS — reine Formular-/
   Vorschau-Logik für den „Neuer Plan"-Dialog (Fahrplan 8 E5).

   Kein React, kein Fetch: übersetzt den Formularzustand in einen
   `PlanGeneratorInput` (V2), validiert die Felder und schlägt aus
   Level + Länge + Zeitbudget ein Periodisierungsmodell vor (Entscheidung
   7+8). Die Komponente rendert nur und ruft `generatePlan()` (E2).

   E5 bietet nur `pyramidal` + `linear` an — `polarized`/`block` kommen mit
   E9 (bis dahin fallen sie im Generator still auf `pyramidal` zurück, s.
   plan-generator-blocks.js::MODEL_BLOCK_SHARES).
   ============================================================ */

import { addDaysISO, diffDays } from "../../core/format.js";

/** Ober-/Untergrenze für die Planlänge — im `open`-Modus als Formularfeld,
 *  im `event`-Modus aus `start..event` abgeleitet und hier gegengeprüft
 *  (sonst würde ein Renntag Jahre in der Zukunft z. B. 78 Wochen erzeugen). */
export const MIN_PLAN_WEEKS = 3;
export const MAX_PLAN_WEEKS = 40;

/* ── Verträge V2/V4 als lokale TS-Typen (Fahrplan: „erzeugt in E5") ──── */

export type PlanMode = "event" | "open";
export type PlanFocus = "allgemein" | "berg" | "langstrecke" | "crit";
export type PlanLevel = "einsteiger" | "fortgeschritten";
/** In E5 nur die ersten beiden anwählbar (s. Modulkopf). */
export type PlanModel = "pyramidal" | "polarized" | "block" | "linear";

/** V4 `GeneratedPlan` — Ausgabe von `generatePlan()` (E2). Nur die Felder,
 *  die die Vorschau (E5) rendert; `weekModel` wird erst in E6 geschrieben. */
export interface GeneratedPlan {
  weeks: GeneratedWeek[];
  weekModel: unknown[];
  ftpTarget: number | null;
  warnings: string[];
}

export interface GeneratedWeek {
  index: number;
  isoWeek: string;
  start: string;
  end: string;
  phase: string;
  targetTss: number;
  isRecovery: boolean;
  cards: GeneratedCard[];
}

export interface GeneratedCard {
  date: string;
  name: string;
  typ: string;
  phase: string;
  tssPlanned: number;
  durationMin: number;
  isQuality: boolean;
  isTest: boolean;
}

export interface PlanGeneratorInput {
  startDate: string;
  mode: PlanMode;
  eventDate?: string;
  weeks?: number;
  trainingWeekdays: number[];
  weeklyHours: number;
  currentFtp: number | null;
  ftpMeasuredDate: string | null;
  ftpTarget: number | null;
  indoorShare: number;
  focus: PlanFocus;
  level: PlanLevel;
  model: PlanModel;
  history?: unknown;
}

/* ── Formularzustand ────────────────────────────────────────────────── */

export interface NewPlanFormState {
  mode: PlanMode;
  /** `mode === "event"`: ID des gewählten Events, "" = keins gewählt. */
  eventId: string;
  /** Nur wenn kein passendes Event existiert: neuer Renntag + Name. */
  newEventDate: string;
  newEventName: string;
  /** `mode === "open"`: Planlänge in Wochen. */
  weeks: number;
  startDate: string;
  trainingWeekdays: number[]; // ISO 1..7
  weeklyHours: number;
  currentFtp: number | null;
  /** Aus `config.ts` durchgereicht (nicht im Formular editierbar) — steuert
   *  im Generator den Start-FTP-Test (Entscheidung 23: Test zu Beginn, wenn
   *  die Messung fehlt oder älter als ~42 Tage ist). */
  ftpMeasuredDate: string | null;
  /** leer → Generator leitet das FTP-Ziel selbst ab (V4 `ftpTarget`). */
  ftpTarget: number | null;
  indoorPct: number; // 0..100 im Formular, /100 im Input
  focus: PlanFocus;
  level: PlanLevel;
  model: PlanModel;
}

export const WEEKDAY_LABELS: ReadonlyArray<{ iso: number; short: string }> = [
  { iso: 1, short: "Mo" },
  { iso: 2, short: "Di" },
  { iso: 3, short: "Mi" },
  { iso: 4, short: "Do" },
  { iso: 5, short: "Fr" },
  { iso: 6, short: "Sa" },
  { iso: 7, short: "So" },
];

export const FOCUS_LABELS: Record<PlanFocus, string> = {
  allgemein: "Allgemein",
  berg: "Berg",
  langstrecke: "Langstrecke",
  crit: "Crit / Kurzrennen",
};

export const MODEL_LABELS: Record<PlanModel, string> = {
  pyramidal: "Pyramidal (Allrounder)",
  linear: "Linear (Umfang zuerst)",
  polarized: "Polarisiert (ab E9)",
  block: "Blocktraining (ab E9)",
};

/** In E5 tatsächlich baubar. */
export const AVAILABLE_MODELS: readonly PlanModel[] = ["pyramidal", "linear"];

/* ── reine Helfer ──────────────────────────────────────────────────── */

/** Montag der Woche, in der `iso` liegt (Plan-Wochen beginnen montags). */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Mo=0 … So=6
  return addDaysISO(iso, -dow);
}

/**
 * Modell-Vorschlag aus Level + Länge + Zeitbudget (Entscheidung 7+8).
 * E5 schlägt nur `pyramidal`/`linear` vor; der Athlet kann später wechseln.
 * - Einsteiger, oder lange Vorlaufzeit mit wenig Zeit → `linear`
 *   (Umfang früh/locker, Intensität wandert nach hinten).
 * - sonst → `pyramidal` (Default-Allrounder).
 */
export function suggestModel(opts: {
  level: PlanLevel;
  weeks: number;
  weeklyHours: number;
}): "pyramidal" | "linear" {
  const { level, weeks, weeklyHours } = opts;
  if (level === "einsteiger") return "linear";
  if (weeks >= 14 && weeklyHours < 8) return "linear";
  return "pyramidal";
}

/* ── Defaults ──────────────────────────────────────────────────────── */

export interface AthleteDefaults {
  ftpMeasured: number | null;
  ftpMeasuredDate: string | null;
  eFTP: number | null;
}

/** Startzustand des Formulars. `todayISO` = heute (lokal); Plan startet am
 *  nächsten Montag, damit die erste Woche voll ist. */
export function defaultFormState(cfg: AthleteDefaults | null, todayISO: string): NewPlanFormState {
  const start = mondayOf(addDaysISO(todayISO, 7));
  const weeks = 12;
  const level: PlanLevel = "fortgeschritten";
  const weeklyHours = 6;
  return {
    mode: "open",
    eventId: "",
    newEventDate: "",
    newEventName: "",
    weeks,
    startDate: start,
    trainingWeekdays: [2, 4, 6], // Di / Do / Sa — zwei Qualitätstage + langer Tag
    weeklyHours,
    currentFtp: cfg?.ftpMeasured ?? cfg?.eFTP ?? null,
    ftpMeasuredDate: cfg?.ftpMeasuredDate ?? null,
    ftpTarget: null,
    indoorPct: 40,
    focus: "allgemein",
    level,
    model: suggestModel({ level, weeks, weeklyHours }),
  };
}

/* ── Validierung → PlanGeneratorInput ──────────────────────────────── */

export type BuildResult =
  | { ok: true; input: PlanGeneratorInput }
  | { ok: false; errors: Record<string, string> };

/**
 * Formular → `PlanGeneratorInput` (V2). Prüft die Pflichtfelder; die
 * sportwissenschaftliche Plausibilität übernimmt der Generator (Warnungen).
 *
 * @param state  aktueller Formularzustand
 * @param resolveEventDate  liefert das Renntagsdatum zu `state.eventId`
 *   (aus `useEvents`); `null`, wenn die ID nicht (mehr) existiert
 * @param history  V3-Aggregat aus `usePlanHistoryAggregate` (durchgereicht)
 */
export function buildGeneratorInput(
  state: NewPlanFormState,
  resolveEventDate: (eventId: string) => string | null,
  history?: unknown,
): BuildResult {
  const errors: Record<string, string> = {};

  const startDate = mondayOf(state.startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.startDate)) errors.startDate = "Startdatum wählen.";

  const weekdays = [...new Set(state.trainingWeekdays)]
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (weekdays.length < 2) errors.trainingWeekdays = "Mindestens zwei Trainingstage wählen.";

  if (!(state.weeklyHours > 0)) errors.weeklyHours = "Zeitbudget in Stunden angeben.";

  let eventDate: string | undefined;
  let weeks: number | undefined;
  if (state.mode === "event") {
    const chosen = state.eventId
      ? resolveEventDate(state.eventId)
      : state.newEventDate || null;
    if (!chosen) {
      errors.event = "Event wählen oder Renntag + Name angeben.";
    } else if (chosen <= startDate) {
      errors.event = "Renntag muss nach dem Startdatum liegen.";
    } else if (Math.ceil((diffDays(chosen, startDate) + 1) / 7) > MAX_PLAN_WEEKS) {
      errors.event = `Renntag zu weit weg — der Plan wäre länger als ${MAX_PLAN_WEEKS} Wochen.`;
    } else {
      eventDate = chosen;
      if (state.eventId === "" && !state.newEventName.trim()) {
        errors.newEventName = "Name für das neue Event angeben.";
      }
    }
  } else {
    weeks = Math.round(state.weeks);
    if (!(weeks >= MIN_PLAN_WEEKS && weeks <= MAX_PLAN_WEEKS)) {
      errors.weeks = `Planlänge zwischen ${MIN_PLAN_WEEKS} und ${MAX_PLAN_WEEKS} Wochen.`;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    input: {
      startDate,
      mode: state.mode,
      ...(eventDate ? { eventDate } : {}),
      ...(weeks ? { weeks } : {}),
      trainingWeekdays: weekdays,
      weeklyHours: state.weeklyHours,
      currentFtp: state.currentFtp,
      ftpMeasuredDate: state.ftpMeasuredDate,
      ftpTarget: state.ftpTarget,
      indoorShare: Math.min(1, Math.max(0, state.indoorPct / 100)),
      focus: state.focus,
      level: state.level,
      model: state.model,
      history,
    },
  };
}
