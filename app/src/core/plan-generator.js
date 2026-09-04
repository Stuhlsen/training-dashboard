/* ============================================================
   CORE/PLAN-GENERATOR.JS — Trainingsplan-Generator, reine Rechen-Funktion
   (kein DOM, kein I/O, kein React)

   Fahrplan 8 E2 (docs/fahrplan-8-plan-generator.md). `generatePlan(input)`
   baut aus den Rahmenbedingungen (V2 `PlanGeneratorInput`) + einem
   Historie-Aggregat (V3 `HistoryAggregate`) eine periodisierte
   Wochenstruktur (V4 `GeneratedPlan`): Blockfolge, Wochen-TSS-Ziele mit
   gedeckelter CTL-Rampe, Erholungswochen, Qualitätstage, Taper, FTP-Testtage.

   Modelle: `pyramidal` + `linear` (E2), `polarized` + `block` (E9). Die
   Modell-Unterschiede stecken vollständig in der Phasen-Sequenz
   (`plan-generator-blocks.js::buildPhaseSequence`) — der Rest dieses Moduls
   ist modell-agnostisch (lockere Tage sind in jedem Modell strikt Z2).
   Die Workout-Auswahl der Qualitätstage läuft seit E3 über
   `plan-workout-select.js::selectWorkout()` (echte `session_formats`-Auswahl
   inkl. Ladder-Stufe); `input.formats` reicht die Katalogzeilen durch
   (leer → eingebaute Startbelegung).

   Bewusste Abweichung vom Fahrplan-Text: `ftp-forecast.js::forecastFtp`
   wird NICHT aufgerufen. Es braucht eine `{date,eftp}[]`-Historie; V3
   liefert nur `currentEftp` (Zahl). Das FTP-Ziel entsteht hier per einfacher
   Linearprojektion (deriveFtpTarget). `forecastFtp` bleibt für E5 (UI hat die
   ride-abgeleitete eFTP-Reihe) bzw. eine spätere V3-Erweiterung reserviert.

   `emptyHistory()` liegt vorerst hier — E4 (`plan-history.js`) darf es
   dorthin umziehen / von dort re-exportieren.
   ============================================================ */

import { addDaysISO, diffDays } from "./format.js";
import { isoWeekKey } from "./aggregate.js";
import { avg } from "./stats.js";
import { CTL_DAYS, ATL_DAYS } from "./pmc.js";
import { CONFLICT_THRESHOLDS } from "./plan-config.js";
import { RECOVERY_MAX_SHARE } from "./periodization.js";
import { TYPE_DEFAULT_TSS } from "../sports/cycling/session-types.js";
import { estimateSessionTSS } from "./ftp-progress.js";
import { buildPhaseSequence } from "./plan-generator-blocks.js";
import { selectWorkout } from "./plan-workout-select.js";

/* ── Verträge V2–V4 als lokale JSDoc-Typen ───────────────────────
   In E2 hier lokal gehalten (kein I/O-Typ-Import in core/). E4/E5 dürfen die
   kanonische Fassung nach app/src/api/types.ts ziehen und hier re-importieren. */

/**
 * @typedef {Object} HistoryAggregate  (V3)
 * @property {number[]} weeklyActualTss  letzte ≤ 8 abgeschlossene Wochen, alt→neu
 * @property {number|null} currentCtl
 * @property {number|null} currentEftp
 * @property {number|null} planAdherence  0..1 über die letzten ~6 Wochen
 * @property {number|null} ageYears
 * @property {"sprint"|"vo2"|"threshold"|"aerob"|null} powerCurveWeakness  (E10; bis dahin null)
 */

/**
 * @typedef {Object} PlanGeneratorInput  (V2)
 * @property {string} startDate  ISO, Montag
 * @property {"event"|"open"} mode
 * @property {string} [eventDate]
 * @property {number} [weeks]
 * @property {number[]} trainingWeekdays  ISO 1..7, aufsteigend
 * @property {number} weeklyHours
 * @property {number|null} currentFtp
 * @property {string|null} ftpMeasuredDate
 * @property {number|null} ftpTarget
 * @property {number} indoorShare  0..1
 * @property {"allgemein"|"berg"|"langstrecke"|"crit"} focus
 * @property {"einsteiger"|"fortgeschritten"} level
 * @property {"pyramidal"|"polarized"|"block"|"linear"} model
 * @property {HistoryAggregate} [history]
 * @property {Array<object>} [formats]  session_formats-Zeilen (E3); leer → eingebaute Startbelegung
 */

/**
 * @typedef {Object} PlanCardDraft  (V4)
 * @property {string} date
 * @property {string} name
 * @property {string} typ
 * @property {string} phase
 * @property {string} isoWeek
 * @property {number} tssPlanned
 * @property {number} durationMin
 * @property {number|null} km
 * @property {object|null} workout
 * @property {object|null} workoutStructure
 * @property {boolean} isQuality
 * @property {boolean} isTest
 */

/**
 * @typedef {Object} GeneratedWeek  (V4)
 * @property {number} index
 * @property {string} isoWeek
 * @property {string} start
 * @property {string} end
 * @property {string} phase
 * @property {number} targetTss
 * @property {boolean} isRecovery
 * @property {PlanCardDraft[]} cards
 */

/**
 * @typedef {Object} WeekModelEntry  (V4)
 * @property {string} week
 * @property {string} phase
 * @property {string} start
 * @property {string} end
 * @property {number[]} trainingWeekdays
 * @property {number} targetTss
 */

/**
 * @typedef {Object} GeneratedPlan  (V4)
 * @property {GeneratedWeek[]} weeks
 * @property {WeekModelEntry[]} weekModel
 * @property {number|null} ftpTarget
 * @property {string[]} warnings
 */

/* ── kleine reine Helfer ─────────────────────────────────────── */

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Power-Curve-Schwäche (V3) → Aufbau-Phase, die eine Woche mehr bekommt
 *  (E10, nur bei `focus: "allgemein"`). „sprint" hat keinen eigenen Block im
 *  4-Phasen-Vokabular → auf den VO2max-Block abgebildet.
 *  @type {Record<"sprint"|"vo2"|"threshold"|"aerob", string>} */
const WEAKNESS_TO_PHASE = {
  sprint: "VO2max",
  vo2: "VO2max",
  threshold: "Schwelle",
  aerob: "Grundlage",
};

/** Anteil des CTL-/ATL-Zuwachses, den eine gleichmäßig über 7 Tage verteilte
 *  Wochenlast erzeugt: ramp = FACTOR(τ) × (tagesTss − ctlStart).
 *  Herleitung: die tägliche Exponentialglättung ctl←ctl+(x−ctl)/τ 7× iteriert.
 *  @param {number} tauDays @returns {number} */
const rampFactor = (tauDays) => 1 - Math.pow((tauDays - 1) / tauDays, 7);
const CTL_RAMP_FACTOR = rampFactor(CTL_DAYS);

/** CTL/ATL nach einer Woche mit `weekTss`, gleichmäßig auf 7 Tage verteilt.
 *  @param {number} start @param {number} weekTss @param {number} tauDays @returns {number} */
function pmcAfterWeek(start, weekTss, tauDays) {
  let v = start;
  const dayTss = weekTss / 7;
  for (let d = 0; d < 7; d++) v += (dayTss - v) / tauDays;
  return v;
}

/** Höchste Wochen-TSS, die von `ctlStart` aus die CTL-Rampe `ramp` nicht
 *  überschreitet (Umkehrung von rampFactor). @returns {number} */
function maxWeekTssForRamp(ctlStart, ramp) {
  return 7 * (ctlStart + ramp / CTL_RAMP_FACTOR);
}

/**
 * Leeres Historie-Aggregat (V3) — alle Felder null / leer. Einsteiger bzw.
 * jeder Aufrufer ohne echte Historie reicht das rein.
 * @returns {HistoryAggregate}
 */
export function emptyHistory() {
  return {
    weeklyActualTss: [],
    currentCtl: null,
    currentEftp: null,
    planAdherence: null,
    ageYears: null,
    powerCurveWeakness: null,
  };
}

/** Level-Default für die Wochen-TSS, wenn keine Historie vorliegt. Linear mit
 *  dem Zeitbudget, in den level-typischen Korridor geklemmt. In E2
 *  finalisiert (Fahrplan „Feinentscheidungen").
 *  @param {"einsteiger"|"fortgeschritten"} level @param {number} weeklyHours @returns {number} */
export function levelDefaultWeekTss(level, weeklyHours) {
  const perHour = level === "einsteiger" ? 45 : 65;
  const band = level === "einsteiger" ? [250, 350] : [450, 600];
  return Math.round(clamp((weeklyHours || 0) * perHour, band[0], band[1]));
}

/**
 * FTP-Ziel bestimmen (Entscheidung 11, hier ohne forecastFtp — s. Modulkopf).
 * @param {PlanGeneratorInput} input
 * @param {number} weeks
 * @returns {number|null}
 */
function deriveFtpTarget(input, weeks) {
  if (input.ftpTarget != null) return Math.round(input.ftpTarget);
  const base = input.currentFtp ?? input.history?.currentEftp ?? null;
  if (base == null) return null; // Einsteiger ohne FTP → nur %-Ziele
  const gainPerWeek = input.level === "einsteiger" ? 0.7 : 0.4;
  const projected = base + gainPerWeek * weeks;
  return Math.round(clamp(projected, base, base * 1.12));
}

/* ── Workout-Bausteine ───────────────────────────────────────── */

/** Zwei Nachkommastellen als [lo,hi]-Watt-Band aus einem %-Band.
 *  @param {[number,number]} pct @param {number|null} ftp @returns {[number,number]|undefined} */
function wattBand(pct, ftp) {
  if (ftp == null) return undefined;
  return [Math.round((pct[0] / 100) * ftp), Math.round((pct[1] / 100) * ftp)];
}

/**
 * Lockerer Z2-Dauerblock über `minutes` Minuten.
 * @param {number} minutes @param {number|null} ftp
 * @returns {{name:string, typ:string, workout:object, workoutStructure:object, tssPlanned:number, durationMin:number}}
 */
function z2Workout(minutes, ftp) {
  const min = Math.max(20, Math.round(minutes));
  const pct = /** @type {[number,number]} */ ([60, 70]);
  const isLong = min >= 150;
  const workout = {
    warmup: 0,
    intervals: 1,
    duration: min,
    rest: 0,
    cooldown: 0,
    zone: "Z2",
    pct,
    ...(wattBand(pct, ftp) ? { watts: wattBand(pct, ftp) } : {}),
    label: isLong ? "Z2 Lang" : "Z2 Dauer",
  };
  const workoutStructure = {
    version: 1,
    steps: [{ kind: "steady", duration_s: min * 60, target_pct_ftp: 65 }],
  };
  return {
    name: isLong ? "Z2 Lang" : "Z2 Dauer",
    typ: isLong ? "Z2 Lang" : "Z2 Dauer",
    workout,
    workoutStructure,
    tssPlanned: estimateSessionTSS(workout, ftp ?? undefined),
    durationMin: min,
  };
}

/* ── Wochentag-Layout ────────────────────────────────────────── */

/**
 * Zwei Qualitäts-Wochentage: erster Trainingstag + spätester Tag mit ≥ 2
 * Tagen Abstand (mind. ein lockerer Tag dazwischen). Fällt auf den letzten
 * Trainingstag zurück, wenn kein Tag den Abstand erfüllt.
 * @param {number[]} weekdays  ISO 1..7, aufsteigend
 * @returns {number[]}  0, 1 oder 2 Einträge
 */
export function qualityWeekdays(weekdays) {
  if (weekdays.length < 2) return weekdays.slice();
  const first = weekdays[0];
  let second = null;
  for (let i = weekdays.length - 1; i >= 1; i--) {
    if (weekdays[i] - first >= 2) {
      second = weekdays[i];
      break;
    }
  }
  if (second == null) second = weekdays[weekdays.length - 1];
  return [first, second];
}

/** Karten-Rohobjekt (V4 `PlanCardDraft`) aus einem Workout-Bündel bauen.
 *  @param {string} date @param {string} phase @param {string} isoWeek
 *  @param {{name:string, typ:string, tssPlanned:number, durationMin:number, workout:object|null, workoutStructure:object|null}} b
 *  @param {{isQuality?:boolean, isTest?:boolean}} [flags]
 *  @returns {PlanCardDraft} */
function makeCard(date, phase, isoWeek, b, { isQuality = false, isTest = false } = {}) {
  return {
    date,
    name: b.name,
    typ: b.typ,
    phase,
    isoWeek,
    tssPlanned: b.tssPlanned,
    durationMin: b.durationMin,
    km: null,
    workout: b.workout,
    workoutStructure: b.workoutStructure,
    isQuality,
    isTest,
  };
}

/** Lockere Restminuten auf die lockeren Tage verteilen: langer Tag (Wochenende,
 *  falls Trainingstag) bekommt den halben Rest (45–210 min), der Rest wird
 *  gleichmäßig verteilt. Jeder Tag mindestens 30 min.
 *  @param {number[]} looseDays @param {number} looseMin
 *  @returns {Record<number, number>} */
function distributeLooseMinutes(looseDays, looseMin) {
  /** @type {Record<number, number>} */
  const perDay = {};
  if (!looseDays.length) return perDay;
  const longDay = looseDays.find((wd) => wd >= 6);
  if (longDay != null && looseDays.length > 1) {
    perDay[longDay] = clamp(looseMin * 0.5, 45, 210);
    const rest = (looseMin - perDay[longDay]) / (looseDays.length - 1);
    for (const wd of looseDays) if (wd !== longDay) perDay[wd] = Math.max(30, rest);
  } else {
    for (const wd of looseDays) perDay[wd] = Math.max(30, looseMin / looseDays.length);
  }
  return perDay;
}

/** Lockere Karten so umskalieren, dass ihre TSS-Summe ≈ `looseTargetTss`
 *  trifft (Faktor auf die Z2-Dauer, auf 0.5–1.8 begrenzt). Mutiert die Karten.
 *  @param {PlanCardDraft[]} looseCards @param {number} looseTargetTss @param {number|null} ftp */
function scaleLooseCardsToTarget(looseCards, looseTargetTss, ftp) {
  const base = looseCards.reduce((s, c) => s + c.tssPlanned, 0);
  if (base <= 0) return;
  const factor = clamp(looseTargetTss / base, 0.5, 1.8);
  for (const c of looseCards) {
    const scaled = z2Workout(c.durationMin * factor, ftp);
    Object.assign(c, {
      name: scaled.name,
      typ: scaled.typ,
      workout: scaled.workout,
      workoutStructure: scaled.workoutStructure,
      tssPlanned: scaled.tssPlanned,
      durationMin: scaled.durationMin,
    });
  }
}

/**
 * Ziel-TSS einer einzelnen Aufbau-Woche: vom `desired`-Wunsch (Woche 0 =
 * `week0Tss`, sonst voriger Wert × Zuwachs) heruntergedeckelt auf die
 * CTL-Rampe (`ctlRampWarn` hart) und den Wochen-TSS-Deckel; im Aufbau nie
 * fallend.
 * @param {number} ctl @param {number} prevBuildTss @param {boolean} isFirst
 * @param {number} week0Tss @param {number} rampTarget @param {number} weeklyGrowth
 * @returns {{ tss: number, warning: string|null }}
 */
function buildWeekTss(ctl, prevBuildTss, isFirst, week0Tss, rampTarget, weeklyGrowth) {
  const hardCap = maxWeekTssForRamp(ctl, CONFLICT_THRESHOLDS.ctlRampWarn);
  const rampCap = maxWeekTssForRamp(ctl, rampTarget);
  const ceilCap = ctl * CONFLICT_THRESHOLDS.weekTssCeilingFactor;
  const desired = isFirst ? week0Tss : prevBuildTss * weeklyGrowth;
  let tss = Math.min(desired, hardCap, ceilCap);
  if (!isFirst) tss = Math.max(tss, prevBuildTss);

  const realizedRamp = pmcAfterWeek(ctl, tss, CTL_DAYS) - ctl;
  let warning = null;
  if (realizedRamp > CONFLICT_THRESHOLDS.ctlRampInfo) {
    warning = `CTL-Rampe am oberen Limit (${realizedRamp.toFixed(1)}).`;
  } else if (desired > rampCap && tss >= ceilCap) {
    warning = `Wochen-TSS am CTL-Deckel (${Math.round(ceilCap)}).`;
  }
  return { tss, warning };
}

/**
 * Ziel-TSS je Woche + Renntag-TSB-Prognose. Rampt die Aufbau-Wochen so hoch,
 * dass die projizierte CTL-Rampe das Rampenziel hält (harte Grenze
 * `ctlRampWarn`); Erholungswochen −45 %, Taper absteigend.
 * @param {object} a
 * @param {number} a.totalWeeks @param {number} a.taperWeeks
 * @param {string[]} a.phases @param {boolean[]} a.isRecovery
 * @param {number} a.week0Tss @param {number} a.startCtl
 * @param {number} a.rampTarget @param {number} a.weeklyGrowth
 * @param {"event"|"open"} a.mode
 * @returns {{ targetTss: number[], raceTsb: number|null, warnings: string[] }}
 */
function computeWeekTargets(a) {
  const { totalWeeks, taperWeeks, phases, isRecovery, week0Tss, startCtl, rampTarget, weeklyGrowth, mode } = a;
  const warnings = [];
  const targetTss = new Array(totalWeeks).fill(0);
  let ctl = startCtl;
  let atl = startCtl;
  let prevBuildTss = week0Tss;

  for (let i = 0; i < totalWeeks; i++) {
    let tss;
    if (isRecovery[i]) {
      // −45 % der vorangehenden Bau-Woche, zusätzlich hart auf
      // RECOVERY_MAX_SHARE (periodization.js) gedeckelt.
      tss = Math.min(0.55, RECOVERY_MAX_SHARE) * prevBuildTss;
    } else if (phases[i] === "Taper") {
      const taperIdx = i - (totalWeeks - taperWeeks);
      tss = prevBuildTss * (taperIdx <= 0 ? 0.6 : 0.4);
    } else {
      const bw = buildWeekTss(ctl, prevBuildTss, i === 0, week0Tss, rampTarget, weeklyGrowth);
      tss = bw.tss;
      prevBuildTss = tss;
      if (bw.warning) warnings.push(`Woche ${i + 1}: ${bw.warning}`);
    }
    targetTss[i] = Math.round(tss);
    ctl = pmcAfterWeek(ctl, targetTss[i], CTL_DAYS);
    atl = pmcAfterWeek(atl, targetTss[i], ATL_DAYS);
  }

  let raceTsb = null;
  if (mode === "event") {
    raceTsb = ctl - atl;
    const [lo, hi] = CONFLICT_THRESHOLDS.eventWindowMain;
    if (raceTsb < lo || raceTsb > hi) {
      warnings.push(
        `Renntag-TSB-Prognose ${raceTsb.toFixed(1)} außerhalb des Zielfensters [${lo}, ${hi}].`
      );
    }
  }
  return { targetTss, raceTsb, warnings };
}

/** Wochen-Indizes mit FTP-Testtag (Entscheidung 23): Start bei veralteter/
 *  fehlender FTP, danach alle 7 Wochen, plus die letzte Woche.
 *  @param {number} totalWeeks @param {string} startDate @param {string|null} ftpMeasuredDate
 *  @returns {Set<number>} */
function ftpTestWeeks(totalWeeks, startDate, ftpMeasuredDate) {
  const set = new Set();
  if (!ftpMeasuredDate || diffDays(startDate, ftpMeasuredDate) > 42) set.add(0);
  for (let i = 7; i < totalWeeks; i += 7) set.add(i);
  set.add(totalWeeks - 1);
  return set;
}

/**
 * Karten einer Woche: Qualitätstage aus `selectWorkout()` (E3, session_formats
 * + Ladder-Stufe nach `weekIndexInPhase`), lockere Tage als Z2-Blöcke auf die
 * Wochen-Restdauer verteilt und auf `targetTss` skaliert, optional ein
 * FTP-Testtag statt des ersten Slots.
 * @param {object} c
 * @param {string} c.weekStart @param {string} c.isoWeek @param {string} c.phase
 * @param {boolean} c.isRecovery @param {number[]} c.effectiveWeekdays
 * @param {number[]} c.quality @param {number} c.weeklyHours
 * @param {number} c.targetTss @param {number|null} c.ftp @param {boolean} c.isTestWeek
 * @param {number} c.weekIndexInPhase  0-basiert, Woche innerhalb der Phase (Ladder-Stufe)
 * @param {"allgemein"|"berg"|"langstrecke"|"crit"} c.focus
 * @param {"einsteiger"|"fortgeschritten"} c.level
 * @param {Array<object>} c.formats  session_formats-Zeilen (leer → eingebaute Startbelegung)
 * @returns {PlanCardDraft[]}
 */
function buildWeekCards(c) {
  const { weekStart, isoWeek, phase, isRecovery, effectiveWeekdays, quality, weeklyHours, targetTss, ftp, isTestWeek } = c;
  const { weekIndexInPhase, focus, level, formats } = c;
  const dayIsQuality = (wd) => !isRecovery && quality.includes(wd);
  const looseDays = effectiveWeekdays.filter((wd) => !dayIsQuality(wd));

  // Qualitätstage bekommen ~ ein Viertel des Wochen-Zeitbudgets (45–100 min);
  // die lockeren Tage füllen den Rest bis targetTss (scaleLooseCardsToTarget).
  const qualityTargetMin = clamp(Math.round(weeklyHours * 60 * 0.25), 45, 100);

  const cards = [];
  let qTss = 0;
  for (const wd of effectiveWeekdays) {
    if (!dayIsQuality(wd)) continue;
    const q = selectWorkout({
      phase,
      weekIndexInPhase,
      qualitySlot: quality.indexOf(wd) === 0 ? 1 : 2,
      focus,
      level,
      currentFtp: ftp,
      targetDurationMin: qualityTargetMin,
      targetTss: Math.round(targetTss * 0.3),
      formats,
    });
    qTss += q.tssPlanned;
    cards.push(makeCard(addDaysISO(weekStart, wd - 1), phase, isoWeek, q, { isQuality: true }));
  }

  const weeklyMin = weeklyHours * 60 * (isRecovery ? 0.7 : 1);
  const looseMin = Math.max(0, weeklyMin - cards.reduce((s, x) => s + x.durationMin, 0));
  const perDayMin = distributeLooseMinutes(looseDays, looseMin);
  const looseCards = looseDays.map((wd) =>
    makeCard(addDaysISO(weekStart, wd - 1), phase, isoWeek, z2Workout(perDayMin[wd], ftp))
  );
  scaleLooseCardsToTarget(looseCards, Math.max(0, targetTss - qTss), ftp);
  cards.push(...looseCards);

  if (isTestWeek && effectiveWeekdays.length) {
    const testWd = quality.length && !isRecovery ? quality[0] : effectiveWeekdays[0];
    const testDate = addDaysISO(weekStart, testWd - 1);
    const testCard = makeCard(
      testDate,
      phase,
      isoWeek,
      {
        name: "FTP-Test (20 min)",
        typ: "FTP-Test",
        tssPlanned: TYPE_DEFAULT_TSS["FTP-Test"],
        durationMin: 55,
        workout: null,
        workoutStructure: null,
      },
      { isTest: true }
    );
    const idx = cards.findIndex((x) => x.date === testDate);
    if (idx >= 0) cards[idx] = testCard;
    else cards.push(testCard);
  }

  cards.sort((x, y) => x.date.localeCompare(y.date));
  return cards;
}

/* ── Hauptfunktion ───────────────────────────────────────────── */

/**
 * Erzeugt einen periodisierten Trainingsplan. Rein deterministisch:
 * gleicher Input → gleicher Output, kein `Date.now()`/`Math.random()`.
 *
 * @param {PlanGeneratorInput} input  V2. `input.history` optional →
 *   `emptyHistory()`.
 * @returns {GeneratedPlan}  V4
 */
export function generatePlan(input) {
  const history = input.history || emptyHistory();
  const warnings = [];
  const startDate = input.startDate;

  // 1) Wochenanzahl -------------------------------------------------------
  let totalWeeks =
    input.mode === "event"
      ? Math.ceil((diffDays(input.eventDate, startDate) + 1) / 7)
      : Math.round(input.weeks || 0);
  if (!Number.isFinite(totalWeeks) || totalWeeks < 3) {
    warnings.push(`Plan zu kurz (${totalWeeks || 0} Wochen) — auf 3 Wochen angehoben.`);
    totalWeeks = 3;
  }
  const taperWeeks =
    input.mode === "event"
      ? Math.min(Math.ceil(CONFLICT_THRESHOLDS.eventTaperDays / 7), totalWeeks - 1)
      : 0;

  // 2) Phasen je Woche --------------------------------------------------
  // Power-Curve-Schwäche verschiebt bei allgemeinem Fokus eine Aufbau-Woche
  // zugunsten des schwächsten Systems (E10). Anderer Fokus hat schon einen
  // bewussten Schwerpunkt → keine zusätzliche Verschiebung.
  const weaknessPhase =
    input.focus === "allgemein" && history.powerCurveWeakness
      ? WEAKNESS_TO_PHASE[history.powerCurveWeakness] ?? null
      : null;
  const seq = buildPhaseSequence({
    totalWeeks,
    taperWeeks,
    model: input.model,
    level: input.level,
    ageYears: history.ageYears,
    weaknessPhase,
  });
  warnings.push(...seq.warnings);

  // 3) Woche-0-TSS + Anpassung bei schwacher Planerfüllung -------------
  const recentTss = avg((history.weeklyActualTss || []).slice(-4));
  const week0Tss =
    recentTss != null ? recentTss : levelDefaultWeekTss(input.level, input.weeklyHours);
  const lowAdherence = history.planAdherence != null && history.planAdherence < 0.7;
  // Flachere Aufbaurampe: Rampenziel 6 → 4 UND wöchentlicher Zuwachs 8 % → 4 %.
  // Der Zuwachsfaktor ist der wirksame Hebel — die CTL-Rampe-Deckel greifen bei
  // moderatem Ausgangs-CTL selten (sonst bliebe der Unterschied unsichtbar).
  const rampTarget = lowAdherence ? 4 : CONFLICT_THRESHOLDS.ctlRampInfo;
  const weeklyGrowth = lowAdherence ? 1.04 : 1.08;
  let effectiveWeekdays = [...input.trainingWeekdays].sort((x, y) => x - y);
  if (lowAdherence && effectiveWeekdays.length > 2) {
    effectiveWeekdays = effectiveWeekdays.slice(0, -1);
    warnings.push(`Planerfüllung zuletzt unter 70 % — ein Trainingstag weniger, flachere Aufbaurampe.`);
  }

  // 4) Wochen-TSS-Rampe + PMC-Projektion ------------------------------
  const startCtl = history.currentCtl != null ? history.currentCtl : week0Tss / 7;
  const ramp = computeWeekTargets({
    totalWeeks,
    taperWeeks,
    phases: seq.phases,
    isRecovery: seq.isRecovery,
    week0Tss,
    startCtl,
    rampTarget,
    weeklyGrowth,
    mode: input.mode,
  });
  warnings.push(...ramp.warnings);

  // 5)–7) Testwochen + Karten je Woche ------------------------------
  const ftp = input.currentFtp ?? null;
  const formats = input.formats || [];
  const testWeeks = ftpTestWeeks(totalWeeks, startDate, input.ftpMeasuredDate);
  const quality = qualityWeekdays(effectiveWeekdays);
  const weeks = seq.phases.map((phase, i) => {
    const weekStart = addDaysISO(startDate, i * 7);
    const isoWeek = isoWeekKey(weekStart);
    // 0-basierte Woche innerhalb der laufenden Phase (Erholungswochen zählen
    // nicht mit) — treibt die Ladder-Stufe in selectWorkout().
    const weekIndexInPhase = seq.phases
      .slice(0, i)
      .filter((p, j) => p === phase && !seq.isRecovery[j]).length;
    return {
      index: i,
      isoWeek,
      start: weekStart,
      end: addDaysISO(weekStart, 6),
      phase,
      targetTss: ramp.targetTss[i],
      isRecovery: seq.isRecovery[i],
      cards: buildWeekCards({
        weekStart,
        isoWeek,
        phase,
        isRecovery: seq.isRecovery[i],
        effectiveWeekdays,
        quality,
        weeklyHours: input.weeklyHours,
        targetTss: ramp.targetTss[i],
        ftp,
        isTestWeek: testWeeks.has(i),
        weekIndexInPhase,
        focus: input.focus,
        level: input.level,
        formats,
      }),
    };
  });

  // 8) Wochenmodell (V4) --------------------------------------------
  const weekModel = weeks.map((w) => ({
    week: w.isoWeek,
    phase: w.phase,
    start: w.start,
    end: w.end,
    trainingWeekdays: effectiveWeekdays.slice(),
    targetTss: w.targetTss,
  }));

  return {
    weeks,
    weekModel,
    ftpTarget: deriveFtpTarget({ ...input, history }, totalWeeks),
    warnings,
  };
}
