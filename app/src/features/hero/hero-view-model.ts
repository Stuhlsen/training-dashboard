/* ============================================================
   FEATURES/HERO/HERO-VIEW-MODEL.TS — Datenzusammensetzung für die
   Hero-Seite. Kein React, kein DOM — reine Funktion, mit Vitest wie
   core/ testbar. Lebt bewusst in features/hero statt core/: die
   Zusammensetzung ist Hero-spezifisch (Design-Layout), die einzelnen
   Berechnungen dahinter kommen unverändert aus core/ (Etappe 2a).

   Pattern: ui/overview.js::_renderHero (Vanilla) zeigt dieselbe
   Zusammensetzung, dort verwoben mit DOM-Schreibzugriffen. Hier
   getrennt: dieses Modul liefert nur Werte, HeroPage.tsx/*.tsx
   rendern sie.

   Zweiteilung Core/PowerScale: alles außer der Leistungsskala ist vom
   What-if-Slider unabhängig. HeroPage.tsx memoisiert `buildHeroCore()`
   (teuer: Briefing/Readiness/LoadGuard/eFTP-Historie über die gesamte
   Fahrten-Historie) getrennt von `buildPowerScale()` (billig: reine
   Zonen-Prozentrechnung), damit ein Slider-Tick nicht die gesamte
   Historie neu durchrechnet. `buildHeroViewModel()` bleibt als
   unmemoisierter Komplettaufruf für Tests/einfache Aufrufer erhalten.
   ============================================================ */

import { athleteConfig, type AthleteConfig } from "../../config";
import { fmtDate, weatherIcon, windDir, fmt, fmtInt } from "../../core/format.js";
import { currentPmc, tsbTrend } from "../../core/pmc.js";
import { assessReadiness, getSubjectiveReadiness } from "../../core/readiness.js";
import { buildLoadGuard } from "../../core/loadguard.js";
import { buildBriefing } from "../../core/briefing.js";
import { isoWeekKey } from "../../core/aggregate.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories } from "../../core/ftp-forecast.js";
import {
  pinPercent,
  ringProgress,
  nextPlannedSession,
  workoutWattRange,
  workoutDurationMinutes,
  estimateSessionTSS,
  buildMilestones,
} from "../../core/ftp-progress.js";
import { computeZones, sweetSpotBand, whatIfScaleMax } from "../../core/zones.js";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;
type Subjective = ReturnType<typeof getSubjectiveReadiness>;

/** `PlanCard.workout` ist als `WorkoutJson = unknown` typisiert (api/types.ts
 *  — die echte Struktur lebt bewusst nur als JSDoc in core/ftp-progress.js,
 *  s. dortige Kommentare). Diese Teilmenge ist alles, was die Hero-Seite
 *  daraus liest. */
interface WorkoutStructure {
  pct?: [number, number] | null;
  watts?: [number, number] | null;
  warmup?: number;
  intervals?: number;
  duration?: number;
  rest?: number;
  cooldown?: number;
  label?: string;
}

/** Laufzeit-Shape von `nextPlannedSession()`: mit leeren `adjustments` gibt
 *  `core/planning.js::applyAdjustment` die Plankarte unverändert zurück
 *  (nur `isToday` kommt dazu) — s. dortigen Kommentar. Cast statt loser
 *  JSDoc-Typisierung (`Object & {...}`), analog zum Pipeline-Grenzcast in
 *  api/pipeline.ts. */
type NextSession = PlanCard & { isToday: boolean };

/** Grenzcast für beide Aufrufstellen: `nextPlannedSession`s JSDoc-Signatur
 *  nimmt eine strukturell losere Session entgegen als `PlanCard` sie
 *  liefert (u.a. `name: string|null` vs. dessen `name?: string`). Über
 *  `Parameters<typeof nextPlannedSession>[0]` statt `never`/`any` — bleibt
 *  an die tatsächliche Signatur gekoppelt, statt sie ein zweites Mal lose
 *  zu behaupten; ändert sich die core-Signatur, wandert der Zieltyp mit. */
function findNextSession(planCards: PlanCard[], doneDates: Set<string>, todayISO: string): NextSession | null {
  return nextPlannedSession(
    planCards as unknown as Parameters<typeof nextPlannedSession>[0],
    {},
    doneDates,
    todayISO,
  ) as NextSession | null;
}

/** Termine, für die eine "erledigt"-Prüfung nötig ist (Session-Karte +
 *  Briefing-nextSession) — einmal pro buildHeroCore()-Aufruf gebaut statt
 *  zweimal dieselbe Menge aus `rides`. */
function doneDatesOf(rides: Ride[]): Set<string> {
  return new Set(rides.map((r) => r.date ?? r.dateISO));
}

export interface HeroCoreInput {
  athleteId: string;
  rides: Ride[];
  wellness: WellnessDay[];
  forecast: Record<
    string,
    {
      weatherCode?: number | null;
      temp?: number | null;
      tempFeel?: number | null;
      precipProb?: number | null;
      windSpeed?: number | null;
      windDir?: number | null;
    }
  >;
  planCards: PlanCard[];
  subjective: Subjective | null;
  todayISO: string;
}

export interface HeroViewModelInput extends HeroCoreInput {
  /** Aktueller Stand des lokalen What-if-Sliders (Ziel-FTP, nur Vorschau) */
  whatIfFtp: number;
}

export interface HeroSession {
  when: string;
  label: string;
  km: number | null;
  detailParts: string[];
}

/** "Wetter · heute" — bewusst immer HEUTE (nicht ans Datum der nächsten
 *  Plankarte gebunden wie zuvor die Session-Karte): eigene, unabhängige
 *  Kachel im Hero-Weitwinkel-Design. `cond`/Freitext-Hinweise aus dem
 *  Design-Export ("Heiter, leichter Wind", "Gutes Fenster 16–19 Uhr") sind
 *  Fantasietext ohne reale Datenbasis (`weatherCode` liefert nur ein Icon,
 *  keine Textbeschreibung) und entfallen — keine erfundenen Platzhalter. */
export interface HeroWeather {
  icon: string;
  tempLabel: string;
  feelsLabel: string;
  rainLabel: string;
  windLabel: string;
}

export interface HeroBriefing {
  level: "green" | "yellow" | "red";
  headline: string;
  recommendation: string;
  tsbFmt: string;
  rhr: string;
  hrv: string;
}

export interface HeroRing {
  value: number;
  progress: number;
}

export interface HeroZoneSegment {
  id: string;
  label: string;
  pct: number;
  color: string;
}

/** `kind` statt eines reinen `isGoal`-Flags: die drei Pins sehen im Design
 *  unterschiedlich aus — Ramp normal, eFTP höher + mit Glow, Ziel gestrichelt
 *  (s. Hero-Weitwinkel.dc.html: `posR`/`posE`/`posG`). Ein reines
 *  `isGoal`-Bit unterschied nur Ziel-vs-Rest und hatte fälschlich den
 *  Glow-Höher-Stil dem Ziel- statt dem eFTP-Pin zugeordnet (Regression aus
 *  Etappe 4, hier beim Re-Sync auf den neuen Export aufgefallen und
 *  korrigiert). */
export interface HeroPin {
  pct: number;
  label: string;
  kind: "ramp" | "eftp" | "goal";
}

export interface HeroPowerScale {
  scaleMax: number;
  segments: HeroZoneSegment[];
  sweetSpot: { leftPct: number; widthPct: number } | null;
  pins: HeroPin[];
}

export interface HeroCore {
  athleteName: string;
  sources: string;
  eyebrow: string;
  dateRangeLabel: string;
  session: HeroSession | null;
  weatherToday: HeroWeather | null;
  briefing: HeroBriefing;
  eftp: HeroRing;
  ramp: HeroRing & { date: string | null };
  milestones: ReturnType<typeof buildMilestones>;
  whatIf: { min: number; max: number };
}

export interface HeroViewModel extends HeroCore {
  powerScale: HeroPowerScale;
}

const fmtSigned = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x);

function buildSession(planCards: PlanCard[], doneDates: Set<string>, ftpVal: number | null, todayISO: string): HeroSession | null {
  const next = findNextSession(planCards, doneDates, todayISO);
  if (!next) return null;

  const when = next.isToday
    ? "Heute"
    : new Date(next.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

  const workout = next.workout as WorkoutStructure | null;
  const detailParts: string[] = [];
  if (workout && ftpVal) {
    const wattRange = workoutWattRange(workout, ftpVal);
    const minutes = workoutDurationMinutes(workout);
    const tss = estimateSessionTSS(workout, ftpVal);
    if (wattRange) detailParts.push(`aktuell ${wattRange[0]}–${wattRange[1]} W`);
    if (minutes) detailParts.push(`~${minutes} min gesamt`);
    if (tss) detailParts.push(`TSS ~${tss}`);
  } else if (next.details) {
    detailParts.push(next.details);
  }

  return { when, label: next.name || next.typ || "Einheit", km: next.km, detailParts };
}

function buildWeatherToday(forecast: HeroCoreInput["forecast"], todayISO: string): HeroWeather | null {
  const wx = forecast?.[todayISO];
  if (!wx) return null;
  return {
    icon: weatherIcon(wx.weatherCode ?? null),
    tempLabel: `${fmt(wx.temp ?? null, 0)}°C`,
    feelsLabel: `${fmt(wx.tempFeel ?? null, 0)}°C`,
    rainLabel: wx.precipProb != null ? `${fmtInt(wx.precipProb)}%` : "–",
    windLabel: wx.windSpeed != null ? `${fmtInt(wx.windSpeed)} km/h${wx.windDir != null ? ` ${windDir(wx.windDir)}` : ""}` : "–",
  };
}

function buildBriefingInfo(
  rides: Ride[],
  wellness: WellnessDay[],
  planCards: PlanCard[],
  doneDates: Set<string>,
  subjective: Subjective | null,
  todayISO: string,
): HeroBriefing {
  const pmc = currentPmc(rides, todayISO);
  const readiness = assessReadiness(wellness, todayISO);
  const trend = tsbTrend(rides, todayISO);
  const loadRows = buildLoadGuard(
    rides,
    // Leere/kaputte dateISO ("" nach normalizeRide-Fallback) NICHT in
    // isoWeekKey geben — das liefert dafür die truthy Bogus-Woche
    // "NaN-KWNaN" statt eines leeren Schlüssels, die dann als "aktuellste
    // Woche" sortiert und ihr (bedeutungsloses) Risiko in den Briefing-
    // loadRisk einspeist. "" statt null: buildLoadGuards weekKeyFn ist als
    // `=> string` typisiert (core/loadguard.js), buildLoadGuard selbst
    // filtert jeden falsy Key gleichermaßen (`if (!key) continue`) — Guard
    // wie im Vanilla-Vorbild (assets/js/app.js:384).
    (r) => (r.dateISO ? isoWeekKey(r.dateISO) : ""),
    (a, b) => a.localeCompare(b),
  );
  const loadRisk = loadRows.length ? loadRows[loadRows.length - 1].risk : null;

  const next = findNextSession(planCards, doneDates, todayISO);
  const nextSession = next ? { date: next.date, title: next.name ?? undefined, typ: next.typ ?? undefined } : null;

  const briefing = buildBriefing({
    readiness,
    tsb: pmc?.tsb ?? null,
    loadRisk,
    nextSession,
    trend,
    subjective,
  });

  const hrv = readiness?.metrics?.find((m) => m.key === "hrv");
  const rhr = readiness?.metrics?.find((m) => m.key === "restingHR");

  return {
    level: briefing.level,
    headline: briefing.headline,
    recommendation: briefing.recommendation,
    tsbFmt: pmc?.tsb != null ? fmtSigned(Math.round(pmc.tsb)) : "–",
    rhr: rhr?.recent != null ? `${fmtInt(rhr.recent)} bpm` : "–",
    hrv: hrv?.recent != null ? `${fmtInt(hrv.recent)} ms` : "–",
  };
}

function eftpValue(rides: Ride[], wellness: WellnessDay[], athleteCfg: AthleteConfig | null): number | null {
  const hist = mergeEftpHistories(eftpHistory(rides), eftpHistoryFromWellness(wellness));
  if (hist.length) return hist[hist.length - 1].eftp;
  return athleteCfg?.eFTP ?? null;
}

/** Fortschrittsbasis für beide Ringe: Saison-Start-FTP, sonst der letzte
 *  Ramp-Test-Wert (Athlet 2 hat keine eigene Saisonbasis, s. config.ts). */
function ringBase(athleteCfg: AthleteConfig): number {
  return athleteCfg.seasonStartFtp ?? athleteCfg.ftpMeasured;
}

/** Alles außer der Leistungsskala — vom What-if-Slider unabhängig, teuer
 *  (durchläuft die gesamte Fahrten-/Wellness-Historie), soll in HeroPage.tsx
 *  gegen [athleteId, rides, wellness, planCards, subjective, todayISO]
 *  memoisiert werden. */
export function buildHeroCore(input: HeroCoreInput): HeroCore {
  const { athleteId, rides, wellness, forecast, planCards, subjective, todayISO } = input;
  const athleteCfg = athleteConfig(athleteId);
  const sorted = [...rides].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const ownPlan = rides.some((r) => r.week);
  const lastWithWeek = ownPlan ? sorted.findLast((r) => r.week) : null;

  const ftpVal = athleteCfg?.ftpMeasured ?? null;
  const eftpVal = eftpValue(rides, wellness, athleteCfg);
  const base = athleteCfg ? ringBase(athleteCfg) : 0;
  const goal = athleteCfg?.ftpGoal ?? 0;

  const doneDates = doneDatesOf(rides);
  const session = buildSession(planCards, doneDates, ftpVal, todayISO);
  const weatherToday = buildWeatherToday(forecast, todayISO);
  const briefing = buildBriefingInfo(rides, wellness, planCards, doneDates, subjective, todayISO);
  const milestones = athleteCfg ? buildMilestones(athleteCfg, eftpVal) : [];

  return {
    athleteName: athleteCfg?.name ?? "",
    sources: (athleteCfg?.dataSources ?? []).join(" + "),
    eyebrow: lastWithWeek?.phase ? `${lastWithWeek.week} · ${lastWithWeek.phase}` : "",
    dateRangeLabel: first && last ? `${fmtDate(first.dateISO)} – ${fmtDate(last.dateISO)}` : "",
    session,
    weatherToday,
    briefing,
    eftp: { value: eftpVal ?? 0, progress: ringProgress(eftpVal, base, goal) },
    ramp: { value: ftpVal ?? 0, progress: ringProgress(ftpVal, base, goal), date: athleteCfg?.ftpMeasuredDate ?? null },
    milestones,
    whatIf: { min: Math.max(50, Math.round((eftpVal ?? ftpVal ?? goal) - 20)), max: 430 },
  };
}

/** Nur die Leistungsskala — reine Zonen-Prozentrechnung, billig genug, um
 *  bei jedem What-if-Slider-Tick neu zu laufen, ohne `buildHeroCore()`
 *  erneut anzustoßen. `ftpVal`/`eftpVal` kommen vom Aufrufer aus dem
 *  bereits berechneten `HeroCore` (`ramp.value`/`eftp.value`). */
export function buildPowerScale(ftpVal: number | null, eftpVal: number | null, whatIfFtp: number): HeroPowerScale {
  const scaleMax = whatIfScaleMax(whatIfFtp) || 1;
  const zones = computeZones(whatIfFtp);
  const ss = sweetSpotBand(whatIfFtp);
  const segments: HeroZoneSegment[] = zones.map((z) => ({
    id: z.id,
    label: z.label,
    pct: ((z.bisW - z.vonW) / scaleMax) * 100,
    color: z.farbe,
  }));
  const ssLeft = pinPercent(ss.vonW, scaleMax);
  const ssRight = pinPercent(ss.bisW, scaleMax);
  const sweetSpot = ssLeft != null && ssRight != null ? { leftPct: ssLeft, widthPct: ssRight - ssLeft } : null;

  const pinCandidates: Array<{ value: number | null; label: string; kind: HeroPin["kind"]; skipIfEqual?: number | null }> = [
    { value: ftpVal, label: `Ramp-Test ${ftpVal} W`, kind: "ramp" },
    { value: eftpVal, label: `eFTP ${eftpVal} W`, kind: "eftp", skipIfEqual: ftpVal },
    { value: whatIfFtp, label: `Ziel ${whatIfFtp} W`, kind: "goal" },
  ];
  const pins: HeroPin[] = pinCandidates
    .filter((c) => c.value != null && c.value !== c.skipIfEqual)
    .map((c) => ({ pct: pinPercent(c.value, scaleMax), label: c.label, kind: c.kind }))
    .filter((p): p is HeroPin => p.pct != null);

  return { scaleMax, segments, sweetSpot, pins };
}

/** Komplettaufruf (Core + PowerScale) — für Tests und einfache Aufrufer,
 *  die keine getrennte Memoisierung brauchen. HeroPage.tsx nutzt
 *  stattdessen `buildHeroCore()`/`buildPowerScale()` einzeln. */
export function buildHeroViewModel(input: HeroViewModelInput): HeroViewModel {
  const core = buildHeroCore(input);
  const powerScale = buildPowerScale(core.ramp.value, core.eftp.value, input.whatIfFtp);
  return { ...core, powerScale };
}
