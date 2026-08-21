/* ============================================================
   FEATURES/ANALYSIS/ANSWERS-VIEW-MODEL.TS — Datenverdrahtung für den
   Analyse-Tab „Antworten & Spuren" (Umsetzungsplan Etappe 3).

   Baut aus echten Rides/Wellness/Plan-Karten/Events die Eingaben für
   core/trace-lanes.js (Spuren-Geometrie) und core/analysis-narrative.js
   (Klartext-Urteile). Pure Funktion auf bereits geladenen Daten — kein
   eigener Hook-Aufruf hier (Muster wie analysis-view-model.ts).

   Bekannte, bewusste Vereinfachungen ggü. dem Claude-Design-Prototyp
   (s. Umsetzungsplan „Bekannte Lücken"):
   - Kein Power-Curve-Vorjahresvergleich (keine historische Kurve in der
     Datenpipeline).
   - Trinkrate ist ein Tageswert (core/body.js::hydrationSeries), keine
     Fahrt-Dauer-bezogene ml/h-Größe — deshalb ohne Zielwert/goodAbove-
     Einfärbung (keine erfundene Schwelle).
   - Die "Ruhewert"-Einheitszeile der Fitness-/Wetter-Spur zeigt nur die
     Haupt-Metrik (CTL bzw. °C), nicht zusätzlich den Zweitwert (ATL bzw.
     Wind/Regen) wie im Prototyp — der ist über Endlabel/Legende trotzdem
     sichtbar.
   ============================================================ */

import { pmcSkeletonAnchor, densifyDays, joinSeries } from "../../core/days.js";
import { densifyPmc } from "../../core/pmc-series.js";
import { projectLoad } from "../../core/projection.js";
import { buildLoadGuard } from "../../core/loadguard.js";
import { eftpHistory, eftpHistoryFromWellness, mergeEftpHistories, forecastFtp } from "../../core/ftp-forecast.js";
import { efficiencyTrend, decouplingTrend } from "../../core/efficiency.js";
import { normalizeZoneTimes, bandZoneTimes, LOW_INTENSITY_TARGET } from "../../core/zones.js";
import { energyView, hydrationSeries, estimateBMR, wattsPerKg } from "../../core/body.js";
import { isoWeekKey } from "../../core/aggregate.js";
import { fmt, fmtInt, fmtSigned, fmtDate, localISODate } from "../../core/format.js";
import { tsbBandOf } from "../../core/trace-lanes.js";
import { heroVerdict, wins as buildWins, strongerVerdict, loadVerdict, recoveryVerdict, blockerVerdict } from "../../core/analysis-narrative.js";
import { raceCountdown } from "../../api/hooks/useEvents";
import { CADENCE_TARGET_RPM } from "../../sports/cycling/metrics";
import type { AthleteConfig } from "../../config";
import type { LaneDisplay } from "../../charts/TraceLane";
import type { LaneSpecInput, TraceLaneConfig } from "../../charts/TraceCard";
import type { EventItem, PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

export type PowerUnit = "W" | "W/kg";

const CADENCE_TARGET = CADENCE_TARGET_RPM;
const HYDRATION_TARGET_MLH = 600; // Handoff-Richtwert — nur als Referenzlinie, s. Lücken-Hinweis oben
const SLEEP_TARGET_H = 7;
const GA_TARGET = LOW_INTENSITY_TARGET;

function toProjectionCard(c: PlanCardT) {
  return {
    id: c.id,
    date: c.date,
    typ: c.typ,
    phase: c.phase,
    cancelled: c.cancelled,
    tssPlanned: c.tssPlanned,
    workout: c.workout as object | null,
  };
}
function toProjectionEvent(e: EventItem) {
  return { eventDate: e.eventDate, title: e.title, type: e.type, priority: e.priority ?? undefined };
}

/** Mittelwert eines Fensters von Tagesindizes einer dichten Reihe, `null`
 *  ohne einen einzigen Messwert im Fenster. */
function windowMean(vals: Array<number | null>, from: number, to: number): number | null {
  let sum = 0, n = 0;
  for (let i = Math.max(0, from); i <= Math.min(vals.length - 1, to); i++) {
    if (vals[i] == null) continue;
    sum += vals[i] as number;
    n++;
  }
  return n ? sum / n : null;
}

function lastKnown(vals: Array<number | null>, uptoIdx: number): number | null {
  for (let i = Math.min(uptoIdx, vals.length - 1); i >= 0; i--) {
    if (vals[i] != null) return vals[i];
  }
  return null;
}

/** Wochenweise Intensitätsverteilung MIT Tagesindex-Grenzen (für die
 *  zoneStack-Spur) — core/zones.js::weeklyZoneShares liefert nur ISO-Wochen-
 *  Schlüssel, keine Tagesindizes; hier direkt gegen das Skelett gebaut. */
function buildZoneWeeks(skeleton: Array<{ dateISO: string }>, rides: Ride[]) {
  const weeks: Array<{ startIdx: number; endIdx: number; low: number; mid: number; high: number }> = [];
  const byDate = new Map<string, Ride[]>();
  for (const r of rides) {
    if (!byDate.has(r.dateISO)) byDate.set(r.dateISO, []);
    byDate.get(r.dateISO)!.push(r);
  }
  let i = 0;
  while (i < skeleton.length) {
    const dow = new Date(`${skeleton[i].dateISO}T00:00:00`).getDay();
    if (dow !== 1) {
      i++;
      continue;
    }
    const endIdx = Math.min(i + 6, skeleton.length - 1);
    let low = 0, mid = 0, high = 0;
    for (let j = i; j <= endIdx; j++) {
      for (const r of byDate.get(skeleton[j].dateISO) ?? []) {
        const secs = normalizeZoneTimes(r.zoneTimes);
        if (!secs) continue;
        const b = bandZoneTimes(secs);
        low += b.low;
        mid += b.mid;
        high += b.high;
      }
    }
    const total = low + mid + high;
    if (total > 0) weeks.push({ startIdx: i, endIdx, low: low / total, mid: mid / total, high: high / total });
    i = endIdx + 1;
  }
  return weeks;
}

export interface HeroStat {
  value: string;
  label: string;
  sub: string;
  colorVar: string;
}

export interface Win {
  value: string;
  delta: string;
  label: string;
  note: string;
}

export interface QuestionGroup {
  key: string;
  question: string;
  verdict: string;
  colorVar: string;
  answer: string;
  lanes: TraceLaneConfig[];
  hasPowerCurve: boolean;
}

export interface AnswersViewModel {
  N: number;
  todayIdx: number;
  eventIdx: number | null;
  eventDateISO: string | null;
  formatDay: (index: number) => string;
  /** ISO-Daten des Skeletts, Länge N — für die ISO↔Index-Umrechnung des
   *  Brush-Fensters (BrushBar arbeitet auf ISO-Daten, TraceCard auf
   *  Tagesindizes über demselben Skelett). */
  skeletonDates: string[];
  defaultRange: { r0: number; r1: number };
  hero: { readoutDate: string; headline: string; text: string; stats: HeroStat[] };
  wins: Win[];
  groups: QuestionGroup[];
  powerCurves: unknown;
  weightKg: number | null;
}

export interface AnswersViewModelInput {
  rides: Ride[];
  wellness: WellnessDay[];
  planCards: PlanCardT[];
  events: EventItem[];
  athleteCfg: AthleteConfig | null;
  athleteFtp: number | null;
  athleteWeightKg: number | null;
  powerCurves: unknown;
  unit: PowerUnit;
  todayISO?: string;
}

const VERDICT_COLOR: Record<string, string> = {
  pos: "var(--role-positive)",
  status: "var(--role-status)",
  warn: "var(--thr)",
  neutral: "var(--text-soft)",
};

function fmtW(raw: number, unit: PowerUnit, weightKg: number | null): string {
  if (unit === "W/kg") {
    const perKg = wattsPerKg(raw, weightKg);
    return perKg != null ? `${fmt(perKg, 2)} W/kg` : "–";
  }
  return `${fmtInt(raw)} W`;
}

/** Baut das komplette View-Model, oder `null` ohne belastbare PMC-Basis
 *  (kein Skelett möglich — Aufrufer zeigt dann einen Leerzustand). */
export function buildAnswersViewModel(input: AnswersViewModelInput): AnswersViewModel | null {
  const { rides, wellness, planCards, events, athleteCfg, athleteFtp, athleteWeightKg, powerCurves, unit } = input;
  const todayISO = input.todayISO ?? localISODate();

  const anchorISO = pmcSkeletonAnchor(rides);
  if (!anchorISO) return null;

  const projectionCards = planCards.map(toProjectionCard);
  const projectionEvents = events.map(toProjectionEvent);
  const ftp = athleteCfg?.ftpMeasured ?? athleteFtp ?? undefined;
  const projection = projectLoad(projectionCards, rides, { today: todayISO, events: projectionEvents, ftp });
  const horizonEndISO = projection.horizonEnd;
  if (anchorISO > horizonEndISO) return null;

  const skeleton = densifyDays(anchorISO, horizonEndISO);
  const N = skeleton.length;
  const indexByDate = new Map(skeleton.map((d, i) => [d.dateISO, i]));
  const todayIdx = indexByDate.get(todayISO) ?? N - 1;

  const countdown = raceCountdown(events, todayISO);
  const eventDateISO = countdown?.event.eventDate ?? null;
  const eventIdx = eventDateISO ? (indexByDate.get(eventDateISO) ?? null) : null;

  const { ctlVals, atlVals, tsbVals } = densifyPmc(skeleton, rides, projection.days, todayIdx);

  // ── eFTP ────────────────────────────────────────────────────────────
  const eftpHistoryMerged = mergeEftpHistories(eftpHistory(rides), eftpHistoryFromWellness(wellness));
  const eftpRows = eftpHistoryMerged.map((h) => ({ dateISO: h.date, eftp: h.eftp }));
  const eftpVals = joinSeries(skeleton, eftpRows, { key: "eftp", absence: "gap" });
  const eftpForecast = forecastFtp(eftpHistoryMerged, horizonEndISO);
  const eftpNow = lastKnown(eftpVals, todayIdx);
  const ftpGoalGapW = eftpNow != null && athleteCfg?.ftpGoal != null ? athleteCfg.ftpGoal - eftpNow : null;

  // ── Effizienz (EF) ──────────────────────────────────────────────────
  const efTrend = efficiencyTrend(rides);
  const efRows = efTrend.comparable
    .map((r, i) => ({ dateISO: r.dateISO, ef: efTrend.rolling[i] }))
    .filter((r): r is { dateISO: string; ef: number } => r.ef != null);
  const efVals = joinSeries(skeleton, efRows, { key: "ef", absence: "gap" });
  const efDeltaPct = efTrend.first != null && efTrend.last != null && efTrend.first !== 0 ? ((efTrend.last - efTrend.first) / efTrend.first) * 100 : null;

  // ── Wellness (HRV/Ruhepuls/Schlaf/Gewicht) ─────────────────────────
  const wellnessRows = wellness.map((w) => ({ dateISO: w.dateISO || w.date, hrv: w.hrv, restingHR: w.restingHR, sleepHours: w.sleepHours, weight: w.weight }));
  const hrvVals = joinSeries(skeleton, wellnessRows, { key: "hrv", absence: "gap" });
  const rhrVals = joinSeries(skeleton, wellnessRows, { key: "restingHR", absence: "gap" });
  const sleepVals = joinSeries(skeleton, wellnessRows, { key: "sleepHours", absence: "gap" });
  const weightVals = joinSeries(skeleton, wellnessRows, { key: "weight", absence: "gap" });

  const hrvBaseline = windowMean(hrvVals, todayIdx - 41, todayIdx);
  const hrvRecent = windowMean(hrvVals, todayIdx - 6, todayIdx);
  const hrvVsBaselinePct = hrvBaseline != null && hrvRecent != null && hrvBaseline !== 0 ? ((hrvRecent - hrvBaseline) / hrvBaseline) * 100 : null;
  const rhrBaseline = windowMean(rhrVals, todayIdx - 41, todayIdx);
  const rhrRecent = windowMean(rhrVals, todayIdx - 6, todayIdx);
  const rhrDeltaBpm = rhrBaseline != null && rhrRecent != null ? rhrRecent - rhrBaseline : null;
  let shortNightsCount = 0;
  for (let i = Math.max(0, todayIdx - 13); i <= todayIdx; i++) {
    if (sleepVals[i] != null && (sleepVals[i] as number) < SLEEP_TARGET_H) shortNightsCount++;
  }

  // ── Entkopplung ─────────────────────────────────────────────────────
  const dec = decouplingTrend(rides);
  const decRows = (dec?.points ?? []).map((p) => ({ dateISO: p.date, dec: p.value }));
  const decVals = joinSeries(skeleton, decRows, { key: "dec", absence: "gap" });

  // ── Kadenz ──────────────────────────────────────────────────────────
  const kadRows = rides.map((r) => ({ dateISO: r.dateISO, kad: r.kad ?? null }));
  const kadVals = joinSeries(skeleton, kadRows, { key: "kad", absence: "gap" });
  const kadSamples = kadVals.filter((v): v is number => v != null);
  const cadenceAvg = kadSamples.length ? kadSamples.reduce((s, v) => s + v, 0) / kadSamples.length : null;
  const cadenceSharePct = kadSamples.length ? (kadSamples.filter((v) => v >= CADENCE_TARGET).length / kadSamples.length) * 100 : null;

  // ── Energiebilanz ───────────────────────────────────────────────────
  const estBmr = athleteCfg?.bmr ? estimateBMR(athleteCfg.bmr) : null;
  const energy = energyView(wellness, estBmr);
  const ebalRows = (energy?.days ?? [])
    .map((d) => ({ dateISO: d.date, ebal: d.intake != null ? d.intake - d.burned : null }))
    .filter((r): r is { dateISO: string; ebal: number } => r.ebal != null);
  const ebalVals = joinSeries(skeleton, ebalRows, { key: "ebal", absence: "gap" });
  const energyDeficitAvgKcal = energy?.hasIntake && energy.avgIntake != null && energy.avgBurned != null ? energy.avgIntake - energy.avgBurned : null;

  // ── Trinkrate ───────────────────────────────────────────────────────
  const hydration = hydrationSeries(wellness);
  const hydrRows = (hydration?.points ?? []).map((p) => ({ dateISO: p.date, hydr: p.value }));
  const hydrVals = joinSeries(skeleton, hydrRows, { key: "hydr", absence: "gap" });

  // ── Wetter ──────────────────────────────────────────────────────────
  const weatherRows = rides.map((r) => {
    const w = r.weather as { temp?: number | null; windSpeed?: number | null; precip?: number | null } | null | undefined;
    return { dateISO: r.dateISO, temp: w?.temp ?? null, wind: w?.windSpeed ?? null, rain: w?.precip ?? null };
  });
  const tempVals = joinSeries(skeleton, weatherRows, { key: "temp", absence: "gap" });
  const windVals = joinSeries(skeleton, weatherRows, { key: "wind", absence: "gap" });
  const rainVals = joinSeries(skeleton, weatherRows, { key: "rain", absence: "gap" });

  // ── Intensität (zoneStack) ─────────────────────────────────────────
  const zoneWeeks = buildZoneWeeks(skeleton, rides);
  const recent4 = zoneWeeks.slice(-4);
  const prior4 = zoneWeeks.slice(-8, -4);
  const avgLow = (ws: typeof zoneWeeks) => (ws.length ? ws.reduce((s, w) => s + w.low, 0) / ws.length : null);
  const gaShareRecentAvg = avgLow(recent4);
  const gaSharePriorAvg = avgLow(prior4);
  const gaShareDeltaPct = gaShareRecentAvg != null && gaSharePriorAvg != null ? (gaShareRecentAvg - gaSharePriorAvg) * 100 : null;

  // ── Belastungswächter (Ramp-Zielband) ──────────────────────────────
  const loadWeeks = buildLoadGuard(rides, (r) => isoWeekKey(r.dateISO), (a, b) => a.localeCompare(b));
  const rampWeeksOverBand = loadWeeks.slice(-4).filter((w) => w.ramp != null && w.ramp > 6).length;

  // ── CTL-Trend (4 Wochen) ───────────────────────────────────────────
  const ctlNow = ctlVals[todayIdx];
  const ctlMonthAgo = lastKnown(ctlVals, Math.max(0, todayIdx - 28));
  const ctlTrendDirection: "steigend" | "fallend" | "stabil" | null =
    ctlNow == null || ctlMonthAgo == null ? null : ctlNow - ctlMonthAgo > 1.5 ? "steigend" : ctlNow - ctlMonthAgo < -1.5 ? "fallend" : "stabil";
  const tsb = tsbVals[todayIdx];
  const tsbBand = tsbBandOf(tsb);

  // ── Hero ────────────────────────────────────────────────────────────
  const hv = heroVerdict({ ctlTrendDirection, tsb, tsbBand, daysToEvent: countdown?.days ?? null });
  const isKg = unit === "W/kg";
  const weightKg = athleteWeightKg;
  const eftpDisplay = eftpNow != null ? (isKg && weightKg ? wattsPerKg(eftpNow, weightKg) : Math.round(eftpNow)) : null;
  const hero = {
    readoutDate: `Stand heute · ${fmtDate(todayISO)}`,
    headline: hv.headline,
    text: hv.text,
    stats: [
      { value: ctlNow != null ? fmt(ctlNow, 0) : "–", label: "CTL Fitness", sub: "Fitness", colorVar: "var(--role-primary)" },
      {
        value: eftpDisplay != null ? (isKg ? fmt(eftpDisplay, 2) : fmtInt(eftpDisplay)) : "–",
        label: isKg ? "eFTP W/kg" : "eFTP Watt",
        sub: athleteCfg?.ftpGoal ? (isKg && weightKg ? `Ziel ${fmt(wattsPerKg(athleteCfg.ftpGoal, weightKg) ?? 0, 2)} W/kg` : `Ziel ${athleteCfg.ftpGoal} W`) : "",
        colorVar: "var(--ss)",
      },
      { value: tsb != null ? fmtSigned(tsb, 0) : "–", label: "TSB Form", sub: "", colorVar: "var(--role-status)" },
      { value: countdown ? String(countdown.days) : "–", label: "Tage bis Event", sub: countdown?.event.title ?? "", colorVar: "var(--event)" },
    ],
  };

  // ── Das läuft ───────────────────────────────────────────────────────
  const winsList = buildWins({
    efDeltaPct,
    hrvVsBaselinePct,
    gaShareDeltaPct,
    gaShare: gaShareRecentAvg,
    gaTarget: GA_TARGET,
    bestEffort: null,
  });

  // ── Leitfragen-Verdikte ─────────────────────────────────────────────
  const v1 = strongerVerdict({ eftpSlopePerWeek: eftpForecast?.slopePerWeek ?? null, efDeltaPct, ftpGoalGapW });
  const v2 = loadVerdict({ rampWeeksOverBand, tsb, tsbBand, gaShare: gaShareRecentAvg, gaTarget: GA_TARGET });
  const v3 = recoveryVerdict({ hrvVsBaselinePct, rhrDeltaBpm, shortNightsCount, sleepTargetH: SLEEP_TARGET_H });
  const v4 = blockerVerdict({
    decouplingStableSharePct: dec ? dec.stableShare : null,
    cadenceSharePct,
    cadenceAvg,
    cadenceTarget: CADENCE_TARGET,
    energyDeficitAvgKcal,
    hydrationBelowTargetShare: null,
  });

  // ── Spuren-Displays ─────────────────────────────────────────────────
  const lane =(key: string, laneInput: LaneSpecInput, display: Omit<LaneDisplay, "key">, baseHeight: number, formatValue: (v: number) => string, formatUnit: (rk: string | null) => string): TraceLaneConfig => ({
    display: { key, ...display },
    lane: laneInput,
    baseHeight,
    formatValue,
    formatUnit,
  });

  const staticUnit = (u: string) => () => u;

  const laneEftp = lane(
    "eftp",
    { kind: "power", vals: eftpVals },
    { title: "Leistung", sub: "eFTP geschätzt", colorVar: "var(--ss)", legend: [{ label: "eFTP", colorVar: "var(--ss)", shape: "line" }], note: eftpForecast ? `eFTP-Trend ${fmtSigned(eftpForecast.slopePerWeek, 1)} W/Woche.` : "Noch nicht genug eFTP-Historie für einen Trend." },
    56,
    (v) => fmtW(v, unit, weightKg),
    staticUnit(unit),
  );

  const laneEf = lane(
    "ef",
    { kind: "dots", vals: efVals, min: 1.0, max: Math.max(1.6, ...efVals.filter((v): v is number => v != null)) },
    { title: "Effizienz", sub: "W je Herzschlag", colorVar: "var(--z1)", legend: [{ label: "Effizienzfaktor", colorVar: "var(--z1)", shape: "block" }], note: efDeltaPct != null ? `Über den Beobachtungszeitraum ${fmtSigned(efDeltaPct, 0)} %.` : undefined },
    46,
    (v) => fmt(v, 2),
    staticUnit("W/bpm"),
  );

  const laneFitness = lane(
    "fitness",
    { kind: "fitness", ctlVals, atlVals, todayIdx },
    { title: "Fitness & Ermüdung", sub: "CTL · ATL", colorVar: "var(--role-primary)", legend: [{ label: "CTL Fitness", colorVar: "var(--role-primary)", shape: "line" }, { label: "ATL Ermüdung", colorVar: "var(--role-secondary)", shape: "line" }, { label: "Prognose", colorVar: "#6b7280", shape: "line" }], note: "CTL ist die Langzeitfitness (42 Tage), ATL die frische Ermüdung (7 Tage). Ab heute gestrichelt: Prognose aus dem geplanten Training." },
    88,
    (v) => fmt(v, 0),
    staticUnit("CTL"),
  );

  const laneTsb = lane(
    "tsb",
    { kind: "tsb", tsbVals, todayIdx },
    { title: "Form (TSB)", sub: "CTL − ATL", colorVar: "var(--role-positive)", legend: [{ label: "TSB", colorVar: "var(--role-positive)", shape: "line" }, { label: "Aufbau −5 … −25", colorVar: "rgba(111,196,140,.45)", shape: "block" }, { label: "Frische +5 … +20", colorVar: "rgba(201,168,76,.45)", shape: "block" }, { label: "Überlast < −25", colorVar: "rgba(217,79,79,.45)", shape: "block" }], note: "−5 bis −25 ist der produktive Aufbaukorridor; unter −25 kippt es in Überlast, +5 bis +20 ist das Frischefenster." },
    82,
    (v) => fmtSigned(v, 0),
    (rk) => (rk === "overload" ? "Überlast" : rk === "build" ? "im Aufbaukorridor" : rk === "fresh" ? "im Frischefenster" : rk === "too-fresh" ? "zu frisch" : "neutral"),
  );

  const actualTssVals = joinSeries(skeleton, rides, { key: "tss", absence: "zero" });
  const plannedTssVals = joinSeries(skeleton, projection.days.map((d) => ({ dateISO: d.date, tss: d.tss })), { key: "tss", absence: "zero" });
  const tssVals = skeleton.map((_, i) => (i <= todayIdx ? actualTssVals[i] : plannedTssVals[i]));

  const laneTss = lane(
    "tss",
    { kind: "tssBars", vals: tssVals, todayIdx },
    { title: "Tageslast", sub: "TSS je Tag", colorVar: "var(--ss)", legend: [{ label: "gefahren", colorVar: "var(--ss)", shape: "block" }, { label: "geplant", colorVar: "#6b7280", shape: "block" }], note: "Balken bis heute sind gefahren, danach geplant." },
    54,
    (v) => fmtInt(v),
    (rk) => (rk === "planned" ? "TSS geplant" : rk === "sum7" ? "TSS letzte 7 Tage" : "TSS"),
  );

  const laneZones = lane(
    "zones",
    { kind: "zoneStack", weeks: zoneWeeks },
    { title: "Intensität", sub: "Anteile je Woche", colorVar: "var(--z2)", legend: [{ label: "niedrig", colorVar: "var(--z2)", shape: "block" }, { label: "mittel", colorVar: "var(--ss)", shape: "block" }, { label: "hoch", colorVar: "var(--vo2)", shape: "block" }], note: `Grundlagenanteil je Woche. Richtwert ${Math.round(GA_TARGET * 100)} %.` },
    46,
    (v) => `${fmtInt(v)} %`,
    (rk) => (rk === "last-week" ? "% GA letzte Woche" : "% GA"),
  );

  const laneHrv = lane("hrv", { kind: "line", vals: hrvVals, area: true }, { title: "HRV", sub: "Tageswert", colorVar: "var(--role-primary)", legend: [{ label: "HRV", colorVar: "var(--role-primary)", shape: "line" }], note: hrvBaseline != null ? `7-Tage-Mittel vs. 42-Tage-Basis: ${fmtSigned(hrvVsBaselinePct ?? 0, 0)} %.` : undefined }, 50, (v) => fmt(v, 0), staticUnit("ms"));
  const laneRhr = lane("rhr", { kind: "line", vals: rhrVals }, { title: "Ruhepuls", sub: "Tageswert", colorVar: "var(--role-secondary)", legend: [{ label: "Ruhepuls", colorVar: "var(--role-secondary)", shape: "line" }] }, 44, (v) => fmt(v, 0), staticUnit("bpm"));
  const laneSleep = lane("sleep", { kind: "bars", vals: sleepVals, target: SLEEP_TARGET_H }, { title: "Schlaf", sub: "Stunden", colorVar: "var(--z2)", legend: [{ label: "Schlafdauer", colorVar: "var(--z2)", shape: "block" }, { label: `Ziel ${SLEEP_TARGET_H} h`, colorVar: "var(--role-status)", shape: "line" }], note: `Ziel ${SLEEP_TARGET_H} h.` }, 46, (v) => fmt(v, 1), staticUnit("h"));

  const laneDec = lane("dec", { kind: "dots", vals: decVals, target: 5, goodAbove: false, min: 0 }, { title: "Entkopplung", sub: "je Fahrt", colorVar: "var(--ss)", legend: [{ label: "stabil", colorVar: "var(--z1)", shape: "block" }, { label: "über Schwelle", colorVar: "var(--ss)", shape: "block" }], note: dec ? `${dec.stableShare} % der Fahrten unter 5 % Entkopplung.` : "Noch nicht genug vergleichbare Fahrten." }, 46, (v) => fmt(v, 1), staticUnit("%"));
  const laneKad = lane("kad", { kind: "dots", vals: kadVals, target: CADENCE_TARGET, goodAbove: true }, { title: "Kadenz", sub: "je Fahrt", colorVar: "var(--role-status)", legend: [{ label: `am Ziel ≥ ${CADENCE_TARGET}`, colorVar: "var(--z1)", shape: "block" }, { label: "unter Ziel", colorVar: "var(--role-status)", shape: "block" }], note: cadenceAvg != null ? `Ø ${Math.round(cadenceAvg)} RPM (Ziel ${CADENCE_TARGET}).` : undefined }, 46, (v) => fmt(v, 0), staticUnit("RPM"));
  const laneEnergy = lane("energy", { kind: "diverge", vals: ebalVals }, { title: "Energiebilanz", sub: "Zufuhr − Verbrauch", colorVar: "var(--ss)", legend: [{ label: "Überschuss", colorVar: "var(--z1)", shape: "block" }, { label: "Defizit", colorVar: "var(--ss)", shape: "block" }], note: energyDeficitAvgKcal != null ? `Ø ${fmtSigned(energyDeficitAvgKcal, 0)} kcal/Tag über 30 Tage.` : "Noch keine Zufuhr-Daten." }, 52, (v) => fmtSigned(v, 0), (rk) => (rk === "avg30" ? "kcal Ø 30 Tage" : "kcal"));
  const laneHydration = lane("hydration", { kind: "dots", vals: hydrVals }, { title: "Trinkrate", sub: hydration?.field === "hydrationVolume" ? "Tageswert" : "Score", colorVar: "var(--z2)", legend: [{ label: hydration?.field === "hydrationVolume" ? "ml/Tag" : "Score", colorVar: "var(--z2)", shape: "block" }] }, 46, (v) => fmt(v, 0), staticUnit(hydration?.field === "hydrationVolume" ? "ml" : "Score"));
  const laneWeather = lane("weather", { kind: "weather", tempVals, windVals, rainVals }, { title: "Wetter", sub: "Temp · Wind · Regen", colorVar: "var(--text-soft)", legend: [{ label: "Temperatur", colorVar: "var(--text-soft)", shape: "line" }, { label: "über 24 °C", colorVar: "var(--ss)", shape: "block" }, { label: "Regen", colorVar: "var(--z2)", shape: "block" }] }, 50, (v) => fmt(v, 0), (rk) => (rk === "hot-days" ? "Tage über 24 °C" : "°C"));
  const laneWeight = lane("weight", { kind: "line", vals: weightVals }, { title: "Gewicht", sub: "Trend", colorVar: "var(--role-status)", legend: [{ label: "Gewicht", colorVar: "var(--role-status)", shape: "line" }] }, 44, (v) => fmt(v, 1), staticUnit("kg"));

  void HYDRATION_TARGET_MLH; // Zielwert bewusst nicht als Lane-Target verwendet, s. Kopfkommentar

  const groups: QuestionGroup[] = [
    { key: "stronger", question: "Werde ich stärker?", verdict: v1.verdict, colorVar: VERDICT_COLOR[v1.color], answer: v1.answer, lanes: [laneEftp, laneEf], hasPowerCurve: true },
    { key: "load", question: "Verkrafte ich die Last?", verdict: v2.verdict, colorVar: VERDICT_COLOR[v2.color], answer: v2.answer, lanes: [laneFitness, laneTsb, laneTss, laneZones], hasPowerCurve: false },
    { key: "recovery", question: "Wie erhole ich mich?", verdict: v3.verdict, colorVar: VERDICT_COLOR[v3.color], answer: v3.answer, lanes: [laneHrv, laneRhr, laneSleep], hasPowerCurve: false },
    { key: "blockers", question: "Was bremst mich?", verdict: v4.verdict, colorVar: VERDICT_COLOR[v4.color], answer: v4.answer, lanes: [laneDec, laneKad, laneEnergy, laneHydration, laneWeather, laneWeight], hasPowerCurve: false },
  ];

  return {
    N,
    todayIdx,
    eventIdx,
    eventDateISO,
    formatDay: (i: number) => fmtDate(skeleton[Math.max(0, Math.min(N - 1, i))]?.dateISO ?? null),
    skeletonDates: skeleton.map((d) => d.dateISO),
    defaultRange: { r0: Math.max(0, todayIdx - 90), r1: N - 1 },
    hero,
    wins: winsList,
    groups,
    powerCurves,
    weightKg,
  };
}
