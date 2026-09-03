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
import { fmt, weatherIcon } from "../../core/format.js";
import { COMPLIANCE, intensityClass } from "../../core/plan-config.js";
import { pickPrimaryRide } from "../../core/compliance-match.js";
import { COGGAN_ZONE_UPPER_PCT } from "../../sports/cycling/zones.js";
import { HR_ZONES } from "../../sports/cycling/metrics.js";
import { targetBandFromCompliance } from "./done-detail-chart-view-model";
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
  Notiz: "#6b7280",
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
  Notiz: "📝",
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

/** Plan-Typ → Glossar-Key für den Erklär-Tooltip (`glossary.ts`). Nur die
 *  Trainingslehre-Typen; organisatorische (Gruppenfahrt/Notiz/Ruhetag/
 *  Rennen/NLS) haben keinen Eintrag → kein Tooltip. */
const PLAN_TYPE_TERM: Record<string, string> = {
  "Sweet Spot": "sweet-spot",
  Schwelle: "z4",
  VO2max: "vo2max",
  "Z2 Lang": "z2",
  "Z2 Dauer": "z2",
  Z2: "z2",
  "Z1 Recovery": "z1",
  Z1: "z1",
  "FTP-Test": "ftp",
};

export function planTypeTermKey(typ: string | null): string | null {
  return (typ && PLAN_TYPE_TERM[typ]) || null;
}

/** Ruhetag-Karten zählen nie als "verpasst" (ein nicht gefahrener Ruhetag
 *  ist Erfüllung, kein Ausfall) und nicht als Basis der Fortschrittsquote —
 *  s. buildPlanningSections(). Seit Fahrplan 6 (RUH2) werden Ruhetage
 *  abgeleitet, aber migrierte Supabase-Karten können den Typ noch tragen. */
export function isRestDay(card: PlanCard): boolean {
  return card.typ === "Ruhetag";
}

/** Karten-Typen ohne zu erfüllenden Trainingsreiz — für "verpasst"/Quote wie
 *  ein Ruhetag behandelt, aber im Raster ganz normal gerendert:
 *  - "Ruhetag": abgeleitet/migriert (s. isRestDay)
 *  - "Notiz":  reine Erinnerungskarte (z.B. Athlet 2 "Ausrüstung checken" vor
 *    dem Renntag, scripts/lib/plan-athlete2.js) — keine Session, darf die
 *    Fortschrittsquote nicht drücken und nie als "verpasst" erscheinen. */
const NON_TRAINING_TYPES = new Set(["Ruhetag", "Notiz"]);

export function isNonTrainingCard(card: PlanCard): boolean {
  return card.typ != null && NON_TRAINING_TYPES.has(card.typ);
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

/** Exportiert (statt modul-privat), weil week-grid-view-model.ts::buildWeekGrid
 *  (Etappe 13a) denselben "hat dieses Datum eine Ist-Fahrt?"-Test pro
 *  Kalendertag braucht — nicht duplizieren. */
export function doneDatesOf(rides: Ride[]): Set<string> {
  return new Set(rides.map((r) => r.date ?? r.dateISO));
}

/** Ob eine Karte als "verpasst" zählt — geteilte Regel zwischen
 *  buildPlanningSections()' missed-Filter (unten) und
 *  week-grid-view-model.ts::statusForDate() (Raster-Status), damit beide
 *  Ansichten für dieselbe Karte nie stillschweigend auseinanderlaufen.
 *
 *  Eine verschobene Karte zählt genauso wie eine nicht-verschobene: liegt
 *  ihr (neues) Datum in der Vergangenheit und es gibt keine passende Fahrt,
 *  ist sie verpasst — unabhängig davon, ob/wie oft sie vorher verschoben
 *  wurde. Vorherige Sonderregel (verschoben = nie verpasst) ließ verschobene
 *  Karten mit inzwischen ebenfalls vergangenem Zieldatum unbegrenzt unter
 *  "Ausstehend" stehen, sobald `originalDate` einmal gesetzt war. */
export function isMissedCard(card: PlanCard, doneDates: Set<string>, todayIso: string): boolean {
  return (
    card.date < todayIso && !doneDates.has(card.date) && !card.cancelled && !isNonTrainingCard(card)
  );
}

export interface PlanningDerivedSets {
  doneDates: Set<string>;
  recoveryWeeks: Set<string>;
}

/** Einmalige Ableitung von `doneDates`/`recoveryWeeks` aus `cards`/`rides` —
 *  sowohl buildPlanningSections() als auch week-grid-view-model.ts::
 *  buildWeekGrid() brauchen beide Sets, PlanningPage.tsx berechnet sie
 *  gemeinsam einmal statt zweimal pro Render-Zyklus (s. jeweiliger
 *  optionaler `derived`-Parameter dort). */
export function computePlanningDerivedSets(cards: PlanCard[], rides: Ride[]): PlanningDerivedSets {
  return {
    doneDates: doneDatesOf(rides),
    recoveryWeeks: plannedRecoveryWeeks(cards) as Set<string>,
  };
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
  derived: PlanningDerivedSets = computePlanningDerivedSets(cards, rides),
): PlanningSections {
  const { doneDates, recoveryWeeks } = derived;

  // Ausstehend: (neues) Datum liegt noch nicht in der Vergangenheit, noch
  // kein passender Ride, nicht ausgefallen. Eine verschobene Karte, deren
  // neues Datum ebenfalls vergangen ist, zählt NICHT mehr automatisch als
  // ausstehend — sie fällt stattdessen unter "Verpasst" (isMissedCard()).
  const upcoming = cards
    .filter((c) => c.date >= todayIso && !doneDates.has(c.date) && !c.cancelled)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Absolviert: Ride mit passendem Datum vorhanden — schließt eine
  // GEFAHRENE Ruhetag-Karte bewusst mit ein (Signal "Ruhetag gefahren"),
  // zählt aber unten NICHT zur Fortschritts-Basis.
  const done = cards
    .filter((c) => doneDates.has(c.date) && !c.cancelled)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Verpasst: vergangen, kein Ride, nicht ausgefallen, kein Ruhetag — auch
  // verschobene Karten, wenn ihr neues Datum ebenfalls vergangen ist.
  // isMissedCard() ist dieselbe Regel wie week-grid-view-model.ts::
  // statusForDate() nutzt (geteilt, s. dort).
  const missed = cards
    .filter((c) => isMissedCard(c, doneDates, todayIso))
    .sort((a, b) => b.date.localeCompare(a.date));

  const cancelled = cards.filter((c) => c.cancelled).sort((a, b) => b.date.localeCompare(a.date));

  // Fortschritt: Basis sind Karten mit echtem Trainingsreiz — eine gefahrene
  // Ruhetag-Karte ist eine Anomalie und eine "Notiz"-Karte gar keine Session;
  // beide zählen deshalb weder im Zähler noch im Nenner.
  const countable = cards.filter((c) => !isNonTrainingCard(c));
  const totalSessions = countable.length;
  const doneCount = done.filter((c) => !isNonTrainingCard(c)).length;
  const cancelledCount = cancelled.length;
  const missedCount = missed.length;
  const pct = totalSessions ? Math.round((doneCount / totalSessions) * 100) : 0;
  const weeksLeft = new Set(upcoming.map((c) => c.week).filter((w): w is string => !!w)).size;
  const currentWeekLabel = upcoming[0]?.week ?? null;

  // recoveryWeeks kommt aus `derived` (computePlanningDerivedSets) — über
  // ALLE Karten des Athleten (nicht nur die anstehenden), damit eine bereits
  // teilweise gefahrene Erholungswoche nicht durch die Bucket-Aufteilung
  // verzerrt wird.
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
 *  nicht, dort reicht das Datum.
 *
 *  An einem Tag mit mehreren Fahrten (Renntag: Einrollen + Rennen + Ausrollen)
 *  NICHT die erste nehmen, sondern die Hauptfahrt über core::pickPrimaryRide
 *  (Einrollen/Ausrollen scheiden aus, dann höchster TSS, Tiebreak Dauer) —
 *  dieselbe Auswahl wie im Sync (scripts/lib/compliance.js). Ein Tag mit
 *  ausschließlich Einrollen/Ausrollen liefert `null`. */
export function matchRideForCard(rides: Ride[], card: PlanCard, canEdit: boolean): Ride | null {
  const dateOf = (r: Ride) => r.date ?? r.dateISO;
  const candidates = rides.filter((r) =>
    canEdit ? dateOf(r) === card.date && r.dataSource === "intervals" : dateOf(r) === card.date,
  );
  return (pickPrimaryRide(candidates) as Ride | null) ?? null;
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

/* ============================================================
   "GEPLANT → TATSÄCHLICH"-VERGLEICHSBLOCK — Port von ui/planned.js::
   _renderDoneCard Z. 1094-1259 (Distanz/Puls/Watt/Kadenz/Dauer/TRIMP/
   Wetter/Befinden), plus eine neue Typ-Zeile: die Ist-Typerkennung
   schlägt in ride.typ immer den reinen Plan-Text (core/session-classify.js
   via scripts/lib/map-activity.js), eine Abweichung ist also ein echtes
   Signal (z.B. Plan "Schwelle" vs. tatsächlich gefahren "Z2 Lang"), kein
   Fehler. ============================================================ */

export interface DoneCompareRow {
  label: string;
  icon: string;
  plan: string;
  actual: string;
  /** Token wie "var(--ok)"/"var(--warn)"/"var(--danger)" — undefined = neutral. */
  color?: string;
  extra?: string;
}

interface ActualWeather {
  temp: number;
  windSpeed?: number | null;
  precip?: number | null;
  weatherCode: number;
}

/** Farbschwelle für die Wetter-Vergleichszeile — eigene Funktion, NICHT
 *  weatherBadgeColor() (die arbeitet auf der Forecast-Form mit precipProb
 *  in %, hier ist ride.weather.precip in mm — andere Einheit/Schwelle) und
 *  auch NICHT logbook-view-model.ts::classifyWeather() (gleiche Einheiten,
 *  aber ein zusätzlicher "cold"-Faktor und eine windy&&rainy-Kombination,
 *  die die vanilla Vergleichszeile — anders als die Fahrtenbuch-Zelle, ihre
 *  eigene 1:1-Quelle — nie hatte; Wiederverwendung hätte das Mismatch-
 *  Verhalten dieser Zeile stillschweigend verändert). 1:1 aus
 *  ui/planned.js::_renderDoneCard Z. 1222-1228. */
export function actualWeatherColor(weather: ActualWeather): string {
  const hot = weather.temp > 32;
  const windy = (weather.windSpeed ?? 0) > 30;
  const rainy = (weather.precip ?? 0) > 0.5;
  const bad = (hot ? 1 : 0) + (windy ? 1 : 0) + (rainy ? 1 : 0);
  return bad >= 2 || hot ? "var(--danger)" : bad === 1 ? "var(--warn)" : "var(--ok)";
}

/** Dauergewichtetes Mittel eines `matched[]`-Ist-Werts (Watt oder Puls) über
 *  alle Intervalle, die einen Ist-Block haben — Gewicht ist die Ist-Dauer des
 *  Intervalls. `null`, wenn kein Intervall den Wert trägt (z.B. Fahrten, die
 *  vor dem HF-Backfill des Block-Caches synchronisiert wurden → alle `avgHr`
 *  noch `null`). */
function weightedMatchedMean(matched: RideCompliance["matched"], key: "avgWatts" | "avgHr"): number | null {
  let sum = 0;
  let weight = 0;
  for (const m of matched) {
    const v = m[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const w = m.actualDurationS > 0 ? m.actualDurationS : 1;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

/** "185 W" statt "185–185 W", wenn Ober- und Untergrenze zusammenfallen
 *  (typisch bei einem Workout mit lauter gleichen Intervall-Zielwerten). */
function bandLabel(lo: number, hi: number, unit: string): string {
  return lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`;
}

const HR_ZONE_KEYS = ["z1", "z2", "z3", "z4", "z5"] as const;

/** Puls-Zielband (bpm) aus dem HF-Zonenmodell des Athleten für die
 *  Ziel-Intensität der matchbaren Intervalle: je Intervall Ziel-%FTP
 *  (`plannedWatts / ftp`) → Coggan-Zonenindex (`COGGAN_ZONE_UPPER_PCT`) →
 *  `HR_ZONES` × `hrMax`. Über alle Intervalle die weiteste Spanne
 *  (min-`lo` / max-`hi`). `null` ohne FTP oder ohne gültige Ziel-Intensität.
 *  Grobe Orientierung, kein exaktes Soll — die Herzfrequenz laggt der
 *  Leistung, kurze VO2-Intervalle erreichen ihr Zonen-HF-Band evtl. nicht. */
function hrTargetBandFromCompliance(
  comp: RideCompliance,
  ftp: number | null,
  hrMax: number,
): { lo: number; hi: number } | null {
  if (!ftp) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of comp.matched) {
    if (!(m.plannedWatts > 0)) continue;
    const pct = m.plannedWatts / ftp;
    let zi = COGGAN_ZONE_UPPER_PCT.findIndex((upper) => pct <= upper);
    if (zi < 0) zi = HR_ZONE_KEYS.length - 1;
    const [loFrac, hiFrac] = HR_ZONES[HR_ZONE_KEYS[zi]];
    lo = Math.min(lo, loFrac * hrMax);
    hi = Math.max(hi, hiFrac * hrMax);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { lo: Math.round(lo), hi: Math.round(hi) };
}

/** "Geplant → Tatsächlich"-Vergleichszeilen für eine absolvierte Plankarte.
 *  Reine Funktion — jede Zeile fehlt einzeln, wenn ihr Ist-Wert fehlt (wie
 *  in der Vanilla-Vorlage).
 *
 *  Variante B (Punkt 6 der 6-Punkte-Liste): bei einer strukturierten Einheit
 *  mit Compliance-Match werden Ø Watt und Puls INTERVALL gegen INTERVALL
 *  verglichen (Ist = dauergewichteter Intervall-Schnitt aus `ride.compliance`,
 *  Soll = Intervall-Ziel-Spanne bzw. HF-Zonen-Band), nicht mehr der
 *  Gesamt-Schnitt der Fahrt gegen die Intervall-Zielspanne. Distanz taugt bei
 *  strukturierten (oft Indoor-)Einheiten nicht als Soll/Ist und wird dort nur
 *  als Kontext gezeigt. `athleteId`/`ftp` speisen das HF-Zonen-Band. Das
 *  frühere `canEdit`-Gate für die Puls-Bänder entfällt — das Band kommt jetzt
 *  zonenbasiert aus `athleteId`/`ftp`, nicht mehr aus fest verdrahteten
 *  Athlet-1-Werten. */
export function buildDoneCompareRows(
  card: PlanCard,
  ride: Ride,
  athleteId: string,
  ftp: number | null,
): DoneCompareRow[] {
  const rows: DoneCompareRow[] = [];
  const isZ2 = isZ2Type(card.typ);
  const isInterval = !!card.workout;
  const isGroup = card.typ === "Gruppenfahrt";
  const comp = visibleCompliance(ride, card.id);

  // Typ — nur bei tatsächlich unterschiedlichem Text (sonst Redundanz zum
  // Karten-Titel) und nie bei Ruhetag (dafür gibt es restDayRiddenSignal).
  // Farbe nur bei echter Klassenabweichung (intensityClass), nicht bei
  // reiner Label-Nuance (Plan "Z2" vs. erkannt "Z2 Lang").
  if (ride.typ && card.typ && card.typ !== "Ruhetag" && ride.typ !== card.typ) {
    const sameClass = intensityClass(card.typ) === intensityClass(ride.typ);
    rows.push({
      label: "Typ",
      icon: "🏷️",
      plan: card.typ,
      actual: ride.typ,
      color: sameClass ? undefined : "var(--warn)",
    });
  }

  // Distanz — bei einer strukturierten Einheit (watts ODER pct) taugt die
  // Distanz nicht als Soll/Ist: Indoor/Zwift-Distanz hängt vom Sim ab, und
  // auch draußen richtet sich die Fahrt nach den Intervallen, nicht nach km.
  // Dann nur Kontext (kein Plan/Delta/Farbe).
  if (ride.km) {
    const planned = card.km ?? null;
    let diff: number | null = null;
    let color: string | undefined;
    if (planned && !isInterval) {
      diff = Math.round((ride.km - planned) * 10) / 10;
      color = Math.abs(diff) <= planned * 0.15 || diff > 0 ? "var(--ok)" : "var(--warn)";
    }
    rows.push({
      label: "Distanz",
      icon: "📍",
      plan: planned && !isInterval ? `${planned} km` : "–",
      actual: `${fmt(ride.km)} km`,
      color,
      extra: diff != null ? `${diff > 0 ? "+" : ""}${diff} km` : undefined,
    });
  }

  // Puls — Soll-Band zonenbasiert aus dem HF-Modell des Athleten für die
  // Ziel-Intensität der Intervalle, Ist = dauergewichteter Intervall-Schnitt-
  // Puls (nur wenn beides vorliegt). Sonst nur der Ist-Wert (Gesamt-Schnitt),
  // kein Pass/Fail — kein erfundenes Band.
  if (ride.hf) {
    const hrMax = athleteConfig(athleteId)?.hrMax ?? null;
    const intervalHr = comp ? weightedMatchedMean(comp.matched, "avgHr") : null;
    const band = comp && hrMax && intervalHr != null ? hrTargetBandFromCompliance(comp, ftp, hrMax) : null;
    const actualHr = band && intervalHr != null ? intervalHr : ride.hf;
    let plan = "–";
    let color: string | undefined;
    if (band) {
      plan = bandLabel(band.lo, band.hi, "bpm");
      color = actualHr >= band.lo ? "var(--ok)" : "var(--warn)";
    } else if (isGroup) {
      plan = "Gruppenfahrt";
    }
    rows.push({
      label: "Puls",
      icon: "❤️",
      plan,
      actual: `${actualHr} bpm`,
      color,
      extra: ride.hfMax ? `max ${ride.hfMax}` : undefined,
    });
  }

  // Ø Watt — Variante B: bei Compliance-Match Intervall-Ziel-Spanne gegen den
  // dauergewichteten Intervall-Schnitt (Range vs. Range), Gesamt-Ø + NP nur
  // als Kontext. Ohne Match (unstrukturiert / Athlet 4 ohne FTP): bisheriges
  // card.workout.watts-Verhalten, aber ohne hartes Rot — der Gesamt-Schnitt
  // gegen die Intervall-Zielspanne ist strukturell zu niedrig.
  if (ride.watt) {
    const wattBand = comp ? targetBandFromCompliance(comp) : null;
    const intervalWatt = comp ? weightedMatchedMean(comp.matched, "avgWatts") : null;
    let plan = "–";
    let actual = `${ride.watt} W`;
    let color: string | undefined;
    let extra: string | undefined = ride.np ? `NP ${ride.np} W` : undefined;

    if (wattBand && intervalWatt != null) {
      plan = bandLabel(wattBand.lowW, wattBand.highW, "W");
      actual = `${intervalWatt} W`;
      // grün, sobald der Intervall-Schnitt das Ziel (minus Toleranz) erreicht —
      // gleiche Schwelle wie die Compliance-Ampel (core/compliance-match.js).
      // Über der Bandobergrenze ist bewusst kein Warnfall (härter gefahren).
      color =
        intervalWatt >= wattBand.lowW * (1 - COMPLIANCE.powerFulfillTolerancePct) ? "var(--ok)" : "var(--warn)";
      extra = `Ø ${ride.watt} W${ride.np ? ` · NP ${ride.np} W` : ""}`;
    } else {
      const watts = (card.workout as { watts?: [number, number] } | null)?.watts;
      if (watts) {
        const [wLow, wHigh] = watts;
        plan = `${wLow}–${wHigh} W`;
        color = ride.watt >= wLow && ride.watt <= wHigh ? "var(--ok)" : "var(--warn)";
      }
    }
    rows.push({ label: "Ø Watt", icon: "⚡", plan, actual, color, extra });
  }

  // Kadenz — für alle Typen (kein canEdit-Gate).
  if (ride.kad) {
    const target = isZ2 ? 80 : 85;
    rows.push({
      label: "Kadenz",
      icon: "🔄",
      plan: `≥${target} RPM`,
      actual: `${ride.kad} RPM`,
      color: ride.kad >= target ? "var(--ok)" : "var(--warn)",
    });
  }

  // Dauer — card.durationMin zuerst (React-Modell hat das Feld direkt), sonst
  // Schätzung wie Vanilla Z. 1188-1199: Intervall-Summe NUR bei numerischer
  // Alt-Workout-Form (nicht bei der neuen Blockform — `!asWorkoutBlocks(...)`
  // spiegelt Vanillas `!Array.isArray(s.workout.blocks)`), sonst Pace aus km.
  // Wichtig als echtes either/or: ein Blockform-Workout mit isInterval=true
  // darf NICHT den km-Zweig blockieren, nur weil card.workout truthy ist.
  if (ride.min) {
    let plan = "–";
    if (card.durationMin) {
      plan = `${card.durationMin} min`;
    } else if (isInterval && !asWorkoutBlocks(card.workout)) {
      const totalMin = legacyWorkoutSegments(card.workout)?.totalMin;
      if (totalMin) plan = `${totalMin} min`;
    } else if (card.km) {
      const avgKmh = isZ2 ? 22 : isGroup ? 26 : 23;
      plan = `~${Math.round((card.km / avgKmh) * 60)} min`;
    }
    rows.push({ label: "Dauer", icon: "⏱", plan, actual: `${ride.min} min` });
  }

  // TRIMP
  if (ride.trimp) {
    rows.push({
      label: "TRIMP",
      icon: "📊",
      plan: "–",
      actual: `${ride.trimp}`,
      extra: ride.ctl != null ? `CTL ${fmt(ride.ctl)}` : undefined,
    });
  }

  // Wetter
  if (ride.weather) {
    const w = ride.weather as ActualWeather;
    rows.push({
      label: "Wetter",
      icon: "🌤️",
      plan: "–",
      actual: `${weatherIcon(w.weatherCode)} ${w.temp}°C · ${Math.round(w.windSpeed ?? 0)} km/h`,
      color: actualWeatherColor(w),
    });
  }

  // Befinden — ride.feel ist bereits das normalisierte Label
  // (normalizeRide() setzt es aus subjective.json, s. core/normalize.js).
  if (ride.feel) {
    rows.push({ label: "Befinden", icon: "😌", plan: "–", actual: ride.feel });
  }

  return rows;
}
