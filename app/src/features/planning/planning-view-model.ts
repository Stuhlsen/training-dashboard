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
import { athleteConfig } from "../../config";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;
type WellnessDay = import("../../types.js").WellnessDay;

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

/* ============================================================
   ETAPPE 6C — Wirkungsanzeige & Compliance: weitere reine Ableitungen.
   Jede hier 1:1 aus ui/planned.js portiert (core-Funktionen wie cardImpact/
   conflictsForCard/summarizeCardHints kommen bereits aus core/plan-
   feedback.js und werden direkt in den Komponenten genutzt, nicht hier
   noch einmal gewrappt). ============================================== */

/** FTP-Wert für `cardImpact({ftp})` — steuert dort nur die `scale`-
 *  Klassifizierung ("tss" vs. "tss-approx" in estimateTss()), keine
 *  kritische Anzeigezahl. Vereinfachte Fallback-Kette gegenüber Vanillas
 *  `Data.ftpValue()` (state/data.js): der dritte Fallback dort — höchster
 *  NP aus den Ist-Fahrten — entfällt hier bewusst. */
export function resolvePlanningFtp(athleteId: string, athleteFtp: number | null): number | undefined {
  return athleteConfig(athleteId)?.ftpMeasured ?? athleteFtp ?? undefined;
}

/** 1:1 aus ui/planned.js::_renderDoneCard Z. 1090-1092 — bei editierbarem
 *  Athlet 1 zusätzlich auf `dataSource === "intervals"` gefiltert (schützt
 *  vor Fehlzuordnung an Tagen mit sowohl Notion- als auch intervals.icu-
 *  Fahrt, z.B. in der Übergangswoche). Athlet 2 hat diese Unterscheidung
 *  nicht, dort reicht das Datum. */
export function matchRideForCard(rides: Ride[], card: PlanCard, canEdit: boolean): Ride | null {
  const dateOf = (r: Ride) => r.date ?? r.dateISO;
  const match = canEdit
    ? rides.find((r) => dateOf(r) === card.date && r.dataSource === "intervals")
    : rides.find((r) => dateOf(r) === card.date);
  return match ?? null;
}

/** Sichtbarkeits-Gate für die Compliance-Tabelle — 1:1 aus
 *  ui/planned.js::_renderComplianceTable Z. 1303-1304: nur sichtbar, wenn
 *  die Ist-Fahrt tatsächlich gegen GENAU diese Karte gematcht wurde UND das
 *  Matching mindestens ein Intervall geliefert hat. */
export function visibleCompliance(ride: Ride | null | undefined, cardId: string): RideCompliance | null {
  const c = ride?.compliance;
  if (!c || c.matchedCardId !== cardId || !Array.isArray(c.matched) || !c.matched.length) return null;
  return c;
}

export interface DayForecast {
  temp: number;
  tempFeel: number;
  windSpeed: number;
  windDir: number;
  precipProb: number;
  uvMax: number | null;
  weatherCode: number;
}

/** 1:1 aus ui/planned.js::_renderCard Z. 826-831 — Ampelfarbe aus vier
 *  Schwellwerten (hot/cold/windy/rainy). Nutzt `--ok/--warn/--danger`
 *  (tokens.css) statt der in Vanilla verwendeten, hier nicht existierenden
 *  `--green/--gold/--red`-Namen. */
export function weatherBadgeColor(fw: DayForecast): string {
  const hot = fw.temp > 32;
  const cold = fw.temp < 5;
  const windy = fw.windSpeed > 30;
  const rainy = fw.precipProb > 50;
  const bad = (hot ? 1 : 0) + (cold ? 1 : 0) + (windy ? 1 : 0) + (rainy ? 1 : 0);
  return bad >= 2 || hot ? "var(--danger)" : bad === 1 ? "var(--warn)" : "var(--ok)";
}

/** 1:1 aus ui/planned.js::_renderCard Z. 834-844. */
export function uvLabel(uvMax: number | null): { text: string; color: string } | null {
  if (uvMax == null) return null;
  const text =
    uvMax >= 8
      ? `☀️ UV ${uvMax} (sehr hoch)`
      : uvMax >= 6
        ? `☀️ UV ${uvMax} (hoch)`
        : uvMax >= 3
          ? `☀️ UV ${uvMax} (mittel)`
          : `☀️ UV ${uvMax} (niedrig)`;
  const color = uvMax >= 8 ? "var(--danger)" : uvMax >= 6 ? "var(--warn)" : "var(--ink-3)";
  return { text, color };
}

export type LegacySegmentType = "warmup" | "interval" | "rest" | "cooldown";

export interface LegacySegment {
  type: LegacySegmentType;
  widthPct: number;
  label: string;
  title: string;
}

export interface LegacyWorkoutTimeline {
  label: string;
  segments: LegacySegment[];
  summary: string;
  totalMin: number;
  wattsLine: string | null;
}

interface LegacyWorkoutShape {
  label?: string;
  intervals?: number;
  duration?: number;
  warmup?: number;
  rest?: number;
  cooldown?: number;
  pct?: [number, number];
  watts?: [number, number];
}

function asLegacyWorkout(workout: unknown): LegacyWorkoutShape | null {
  if (!workout || typeof workout !== "object" || Array.isArray((workout as { blocks?: unknown }).blocks)) {
    return null;
  }
  return workout as LegacyWorkoutShape;
}

/** 1:1 aus ui/planned.js::_renderCard Z. 893-926 — altes, dialogfreies
 *  Zahlenformat (warmup/intervals/duration/rest/cooldown/pct|watts).
 *  `null` für das neue Block-Format (das rendert `asWorkoutBlocks()`) oder
 *  wenn `intervals`/`duration` fehlen (keine sinnvolle Timeline baubar). */
export function legacyWorkoutSegments(workout: unknown): LegacyWorkoutTimeline | null {
  const w = asLegacyWorkout(workout);
  if (!w || !w.intervals || !w.duration) return null;
  const warmup = w.warmup ?? 0;
  const rest = w.rest ?? 0;
  const cooldown = w.cooldown ?? 0;
  const totalMin = warmup + w.duration * w.intervals + rest * (w.intervals - 1) + cooldown;
  const pctOf = (min: number) => Math.round((min / totalMin) * 1000) / 10;
  // Athlet 2s Workouts (plan-athlete2.js) tragen nur watts, kein pct (%FTP).
  const intensityLabel = w.pct
    ? `${w.pct[0]}–${w.pct[1]}% FTP`
    : w.watts
      ? `${w.watts[0]}–${w.watts[1]}W`
      : "";

  const segments: LegacySegment[] = [
    { type: "warmup", widthPct: pctOf(warmup), label: "WU", title: `Warm-up ${warmup} min` },
  ];
  for (let i = 0; i < w.intervals; i++) {
    segments.push({
      type: "interval",
      widthPct: pctOf(w.duration),
      label: `${w.duration}'`,
      title: `${w.duration} min @ ${intensityLabel}`,
    });
    if (i < w.intervals - 1) {
      segments.push({ type: "rest", widthPct: pctOf(rest), label: `${rest}'`, title: `Pause ${rest} min` });
    }
  }
  segments.push({ type: "cooldown", widthPct: pctOf(cooldown), label: "CD", title: `Cool-down ${cooldown} min` });

  const summary = `${warmup} min Warm-up → ${w.intervals}× ${w.duration} min @ ${intensityLabel} (Pause: ${rest} min) → ${cooldown} min Cool-down · ${totalMin} min gesamt`;
  const wattsLine = w.watts ? `${w.watts[0]}–${w.watts[1]}W · Ziel: ${Math.round((w.watts[0] + w.watts[1]) / 2)}W` : null;

  return { label: w.label ?? "", segments, summary, totalMin, wattsLine };
}

/** 1:1 aus ui/planned.js::_renderCard Z. 931/934. */
export function isZ2Type(typ: string | null): boolean {
  return typ === "Z2 Lang" || typ === "Z2 Dauer";
}

export function isRecoveryType(typ: string | null): boolean {
  return typ === "Z1 Recovery" || typ === "Z1";
}

export interface Z2Estimate {
  kmMin: number;
  kmMax: number;
  kcal: number;
  hours: number;
}

/** 1:1 aus ui/planned.js::_renderCard Z. 936-945 — nur für Athlet-1-Typen
 *  (`isZ2` dort bewusst auf Z2-Lang/-Dauer beschränkt, s. Kommentar dort:
 *  braucht zusätzlich `s.km`, das Athlet 2 nicht führt). */
export function z2Estimate(card: { typ: string | null; km: number | null }): Z2Estimate | null {
  if (!isZ2Type(card.typ) || !card.km) return null;
  const km = card.km;
  const kmMin = card.typ === "Z2 Lang" ? Math.round(km * 0.85) : Math.round(km * 0.9);
  const kmMax = Math.round(km * 1.15);
  const durationH = km / 22;
  const kcal = Math.round((durationH * 600) / 50) * 50;
  return { kmMin, kmMax, kcal, hours: Math.round(durationH * 10) / 10 };
}

/** 1:1 aus ui/planned.js::_renderCard Z. 964-967. */
export function latestWellness(wellness: WellnessDay[]): WellnessDay | null {
  if (!wellness.length) return null;
  return [...wellness].sort((a, b) => (b.dateISO ?? "").localeCompare(a.dateISO ?? ""))[0];
}

export interface PlannedSessionRef {
  date: string;
  name?: string;
  workout?: unknown;
}

/** 1:1 aus ui/planned.js::_renderCard Z. 982-987 — nächste Belastungs-
 *  einheit aus der (unmigrierten) JSON-Pipeline `plannedSessions`, reiner
 *  Hinweistext ohne Schreibpfad (s. Kommentar dort). */
export function nextLoadAfter(
  plannedSessions: PlannedSessionRef[],
  afterDateIso: string,
): { name: string; date: string; daysUntil: number } | null {
  const next = plannedSessions
    .filter((ps) => ps.date > afterDateIso && ps.workout)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const daysUntil = Math.ceil((Date.parse(next.date) - Date.parse(afterDateIso)) / 86400000);
  return { name: next.name ?? "", date: next.date, daysUntil };
}

/** 1:1 aus ui/planned.js::_fmtMinSec — kompakter als fmtDuration (das auf
 *  Stunden zielt), Intervalldauern bleiben durchgehend im Minutenbereich. */
export function fmtMinSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "–";
  const m = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${m}:${String(rem).padStart(2, "0")}`;
}

/** 1:1 aus ui/planned.js::COMPLIANCE_RULE_TEXT (Z. 67-75) — Regelcodes aus
 *  core/compliance-match.js::computeCompliance() im Klartext. */
export const COMPLIANCE_RULE_TEXT: Record<string, string> = {
  "alle-intervalle-erfuellt": "alle Intervalle erfüllt",
  "intervall-abgebrochen": "ein Intervall abgebrochen",
  "zeit-in-zone-niedrig": "Zeit in Zone zu niedrig",
  "zeit-in-zone-mittel": "Zeit in Zone im mittleren Bereich",
  "fade-stark": "starker Leistungsabfall (Fade)",
  "fade-mittel": "mittlerer Leistungsabfall (Fade)",
  "rpe-hoch": "hohe empfundene Anstrengung (RPE)",
};

export function complianceRuleText(rule: string): string {
  return COMPLIANCE_RULE_TEXT[rule] ?? rule;
}

export interface AccessoryStep {
  kind: "accessory";
  reps?: number;
  work?: { duration_s?: number; target?: string | number };
}

/** `workoutStructure.steps` mit `kind==="accessory"` (Sprints etc., D1.3/
 *  L6.1) — reine Planinformation, wird nicht gematcht (core/compliance-
 *  match.js::expandPlannedIntervals überspringt sie strukturell) und trägt
 *  deshalb keine Ist-Werte/Ampel. 1:1 aus ui/planned.js::
 *  _renderComplianceTable Z. 1332. */
export function accessorySteps(workoutStructure: unknown): AccessoryStep[] {
  if (!workoutStructure || typeof workoutStructure !== "object") return [];
  const steps = (workoutStructure as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  return steps.filter(
    (s): s is AccessoryStep => !!s && typeof s === "object" && (s as { kind?: unknown }).kind === "accessory",
  );
}
