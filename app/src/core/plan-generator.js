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
import { CONFLICT_THRESHOLDS, TYPE_DEFAULT_TSS, intensityClass } from "./plan-config.js";
import { RECOVERY_MAX_SHARE } from "./periodization.js";
import { buildPhaseSequence, sequenceFromWeekModel } from "./plan-generator-blocks.js";
import { getSportStrategy } from "./plan-generator-sport.js";

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
 * @property {number|null} currentThresholdSpeed  km/h — nur "run"/"swim" (Fahrplan 14 E5); sonst null
 */

/**
 * @typedef {Object} PlanGeneratorInput  (V2)
 * @property {"ride"|"run"|"swim"} [sport]  Default "ride" (Golden-Master, Fahrplan 14 E1)
 * @property {string} startDate  ISO, Montag
 * @property {"event"|"open"} mode
 * @property {string} [eventDate]
 * @property {number} [weeks]
 * @property {number[]} trainingWeekdays  ISO 1..7, aufsteigend
 * @property {FixedDayInput[]} [fixedDays]  "Feste Tage" (Alex-Feedback 21.09.2026): pro
 *   Wochentag optional ein fixierter Typ statt der automatischen Qualitätstag-Verteilung
 * @property {number} weeklyHours
 * @property {number|null} currentFtp  nur sport === "ride"
 * @property {string|null} ftpMeasuredDate  nur sport === "ride"
 * @property {number|null} ftpTarget  nur sport === "ride"
 * @property {number|null} [currentThresholdSpeed]  km/h — nur "run"/"swim" (E2/E3)
 * @property {string|null} [thresholdSpeedMeasuredDate]  nur "run"/"swim" (E2/E3)
 * @property {number|null} [thresholdSpeedTarget]  nur "run"/"swim" (E2/E3)
 * @property {number} indoorShare  0..1
 * @property {"allgemein"|"berg"|"langstrecke"|"crit"} focus
 * @property {"einsteiger"|"fortgeschritten"} level
 * @property {"pyramidal"|"polarized"|"block"|"linear"|"reverse"} model
 * @property {HistoryAggregate} [history]
 * @property {Array<object>} [formats]  session_formats-Zeilen (E3); leer → eingebaute Startbelegung
 * @property {string} [regenerateFrom]  E13: ISO-Montag, ab dem die Wochen neu gerechnet werden
 * @property {WeekModelEntry[]} [baseWeekModel]  E13: eingefrorene Blockstruktur des Ur-Plans
 */

/**
 * @typedef {Object} FixedDayInput  (V2, "Feste Tage")
 * @property {number} weekday  ISO 1..7, muss in trainingWeekdays enthalten sein
 * @property {string} typ  aus KNOWN_PLAN_TYPES (plan-config.js) oder FIXED_INTERVAL_TYP
 * @property {boolean} keepInRecoveryWeek  Default false — sonst pausiert die Fixierung in Erholungswochen
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
 * @property {string|null} loadContext  Einordnung "wie passt targetTss zur CTL zu
 *   Wochenbeginn" (weekLoadContext()) — null für eingefrorene Wochen ohne bekannte CTL
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
    currentThresholdSpeed: null,
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
 *  gleichmäßig verteilt. Jeder Tag mindestens 30 min. Fokus "langstrecke"
 *  gibt dem langen Tag einen größeren Anteil (0.65 statt 0.5) und eine
 *  höhere Obergrenze (300 statt 210 min) — alle anderen Fokus-Werte
 *  verhalten sich exakt wie bisher.
 *  @param {number[]} looseDays @param {number} looseMin
 *  @param {"allgemein"|"berg"|"langstrecke"|"crit"} [focus]
 *  @returns {Record<number, number>} */
export function distributeLooseMinutes(looseDays, looseMin, focus = "allgemein") {
  /** @type {Record<number, number>} */
  const perDay = {};
  if (!looseDays.length) return perDay;
  const longDay = looseDays.find((wd) => wd >= 6);
  const longShare = focus === "langstrecke" ? 0.65 : 0.5;
  const longCap = focus === "langstrecke" ? 300 : 210;
  if (longDay != null && looseDays.length > 1) {
    perDay[longDay] = clamp(looseMin * longShare, 45, longCap);
    const rest = (looseMin - perDay[longDay]) / (looseDays.length - 1);
    for (const wd of looseDays) if (wd !== longDay) perDay[wd] = Math.max(30, rest);
  } else {
    for (const wd of looseDays) perDay[wd] = Math.max(30, looseMin / looseDays.length);
  }
  return perDay;
}

/** Lockere Karten so umskalieren, dass ihre TSS-Summe ≈ `looseTargetTss`
 *  trifft (Faktor auf die Z2-Dauer, auf 0.5–1.8 begrenzt). Mutiert die Karten.
 *  `strategy.looseWorkout()` kapselt die Sport-Verzweigung (Rad → FTP,
 *  Lauf/Schwimm → Schwellengeschwindigkeit) vollständig — plan-generator.js
 *  selbst kennt keinen Sportnamen mehr (Fahrplan-14-Review).
 *  @param {PlanCardDraft[]} looseCards @param {number} looseTargetTss
 *  @param {number|null} ftp @param {number|null} thresholdSpeed @param {object} strategy */
function scaleLooseCardsToTarget(looseCards, looseTargetTss, ftp, thresholdSpeed, strategy) {
  const base = looseCards.reduce((s, c) => s + c.tssPlanned, 0);
  if (base <= 0) return;
  const factor = clamp(looseTargetTss / base, 0.5, 1.8);
  for (const c of looseCards) {
    const scaled = strategy.looseWorkout(c.durationMin * factor, ftp, thresholdSpeed, strategy);
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
 * @returns {{ targetTss: number[], ctlByWeek: number[], raceTsb: number|null, warnings: string[] }}
 */
function computeWeekTargets(a) {
  const { totalWeeks, taperWeeks, phases, isRecovery, week0Tss, startCtl, rampTarget, weeklyGrowth, mode } = a;
  const warnings = [];
  const targetTss = new Array(totalWeeks).fill(0);
  // CTL VOR der jeweiligen Woche (für weekLoadContext() — wie passt die
  // geplante Wochenbelastung zur Fitness zu Wochenbeginn).
  const ctlByWeek = new Array(totalWeeks).fill(0);
  let ctl = startCtl;
  let atl = startCtl;
  let prevBuildTss = week0Tss;

  for (let i = 0; i < totalWeeks; i++) {
    ctlByWeek[i] = ctl;
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
  return { targetTss, ctlByWeek, raceTsb, warnings };
}

/** Wortkategorie: wie die geplante Wochen-TSS zur Fitness (CTL) zu Wochenbeginn
 *  passt. Referenzpunkt "Steady State" ≈ 7 × CTL (eine Woche gleichmäßig
 *  verteilter TSS in Höhe der CTL hält die CTL stabil, s. `pmcAfterWeek()`)
 *  und die bestehende harte Deckel-Schwelle
 *  `CONFLICT_THRESHOLDS.weekTssCeilingFactor` (dieselbe, die `buildWeekTss()`s
 *  `ceilCap` begrenzt) — keine neue Schwelle, nur eine grobe Textkategorie
 *  für die Vorschau.
 *  @param {number} weekTss @param {number|null} ctlAtWeekStart @returns {string|null} */
export function weekLoadContext(weekTss, ctlAtWeekStart) {
  if (ctlAtWeekStart == null || ctlAtWeekStart <= 0) return null;
  const ceiling = CONFLICT_THRESHOLDS.weekTssCeilingFactor; // 8
  const steady = ceiling - 1; // 7 — Steady-State-Referenzpunkt
  const ratio = weekTss / ctlAtWeekStart;
  if (ratio < steady - 1) return "deutlich unter deiner aktuellen Belastung";
  if (ratio < steady + 0.5) return "passt zu deiner aktuellen Belastung";
  if (ratio < ceiling) return "über deiner aktuellen Belastung";
  return "deutlich über deiner aktuellen Belastung";
}

/** Sonderwert für `FixedDayInput.typ` (Alex-Feedback 23.09.2026): "an diesem
 *  Wochentag immer Intervalle" — ohne festen Typ. Der Tag wird zum festen
 *  Qualitätsplatz; welche Einheit dort liegt, wählt weiter `selectWorkout()`
 *  passend zu Phase + Ladder-Stufe (echte Intervalle mit Progression statt
 *  des flachen `fixedDayCard()`-Blocks). In Erholungswochen gibt es keine
 *  Qualitätstage, der Tag wird dann ein lockerer Tag.
 *  Bewusst KEIN Eintrag in KNOWN_PLAN_TYPES: es ist kein Kartentyp. */
export const FIXED_INTERVAL_TYP = "Intervalle";

/** Qualitätstage einer Woche nach den festen Intervalltagen (`pinned`)
 *  ausrichten: jeder gepinnte Tag ist Qualitätstag, die Gesamtzahl bleibt
 *  `quality.length` (mehr nur, wenn mehr Tage gepinnt sind). Welche
 *  automatischen Slots weichen: zuerst solche, die ohnehin ein anderer fester
 *  Tag belegt (`isBlocked`, z.B. Gruppenfahrt — der Slot wäre sonst still
 *  verloren), danach der dem Pin nächstgelegene (harte Tage bleiben verteilt).
 *  @param {number[]} quality @param {number[]} pinned @param {(wd:number)=>boolean} isBlocked
 *  @returns {number[]}  aufsteigend */
function applyIntervalPins(quality, pinned, isBlocked) {
  if (!pinned.length) return quality;
  let auto = quality.filter((q) => !pinned.includes(q));
  const keep = Math.max(0, quality.length - pinned.length);
  const dist = (q) => Math.min(...pinned.map((p) => Math.abs(p - q)));
  while (auto.length > keep) {
    const blocked = auto.find(isBlocked);
    const victim = blocked ?? auto.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    auto = auto.filter((q) => q !== victim);
  }
  return [...pinned, ...auto].sort((a, b) => a - b);
}

/** Grobe %FTP-/Dauer-Schätzung je Intensitätsklasse für "feste Tage" — bewusst
 *  kein `selectWorkout()`-Aufruf: ein fixierter Tag soll IMMER denselben Typ
 *  tragen, unabhängig von der aktuellen Phase (die PHASE_PLAN-Ladder-Progression
 *  aus plan-workout-select.js gilt nur für die automatisch verteilten
 *  Qualitätstage).
 *  @type {Record<string, {pctBand:[number,number], assumedIF:number}>} */
const FIXED_DAY_PROFILE = {
  hart: { pctBand: [88, 94], assumedIF: 0.88 },
  moderat: { pctBand: [70, 85], assumedIF: 0.75 },
  locker: { pctBand: [60, 70], assumedIF: 0.65 },
};

/** Karte für einen "festen Tag" (V2 `fixedDays`, Alex-Feedback 21.09.2026 —
 *  z.B. "Dienstag ist immer Gruppenfahrt"): TSS-Vorgabe aus
 *  `TYPE_DEFAULT_TSS[typ]`, Dauer aus TSS + einer pauschalen IF-Schätzung je
 *  Intensitätsklasse zurückgerechnet (TSS = Std × IF² × 100).
 *  @param {string} typ  aus KNOWN_PLAN_TYPES @param {number|null} ftp
 *  @returns {{name:string, typ:string, workout:object|null, workoutStructure:object|null, tssPlanned:number, durationMin:number}} */
function fixedDayCard(typ, ftp) {
  const tssPlanned = TYPE_DEFAULT_TSS[typ] ?? 50;
  if (tssPlanned <= 0) {
    return { name: typ, typ, workout: null, workoutStructure: null, tssPlanned: 0, durationMin: 0 };
  }
  const profile = FIXED_DAY_PROFILE[intensityClass(typ)] ?? FIXED_DAY_PROFILE.moderat;
  const durationMin = clamp(Math.round((tssPlanned / (100 * profile.assumedIF ** 2)) * 60), 20, 240);
  const pct = profile.pctBand;
  const watts = ftp != null ? [Math.round((pct[0] / 100) * ftp), Math.round((pct[1] / 100) * ftp)] : undefined;
  const workout = {
    warmup: 0,
    intervals: 1,
    duration: durationMin,
    rest: 0,
    cooldown: 0,
    zone: typ,
    pct,
    ...(watts ? { watts } : {}),
    label: typ,
  };
  const workoutStructure = {
    version: 1,
    steps: [{ kind: "steady", duration_s: durationMin * 60, target_pct_ftp: Math.round((pct[0] + pct[1]) / 2) }],
  };
  return { name: typ, typ, workout, workoutStructure, tssPlanned, durationMin };
}

/**
 * Karten einer Woche: Qualitätstage aus `selectWorkout()` (E3, session_formats
 * + Ladder-Stufe nach `weekIndexInPhase`), feste Tage aus `fixedDayCard()`,
 * lockere Tage als Z2-Blöcke auf die Wochen-Restdauer verteilt und auf
 * `targetTss` skaliert, optional ein FTP-Testtag statt des ersten Slots.
 * @param {object} c
 * @param {string} c.weekStart @param {string} c.isoWeek @param {string} c.phase
 * @param {boolean} c.isRecovery @param {number[]} c.effectiveWeekdays
 * @param {number[]} c.quality @param {FixedDayInput[]} [c.fixedDays] @param {number} c.weeklyHours
 * @param {number} c.targetTss @param {number|null} c.ftp @param {boolean} c.isTestWeek
 * @param {number|null} [c.thresholdSpeed]  km/h — nur "run"/"swim" (Fahrplan 14 E2/E3)
 * @param {number} c.weekIndexInPhase  0-basiert, Woche innerhalb der Phase (Ladder-Stufe)
 * @param {"allgemein"|"berg"|"langstrecke"|"crit"} c.focus
 * @param {"einsteiger"|"fortgeschritten"} c.level
 * @param {Array<object>} c.formats  session_formats-Zeilen (leer → eingebaute Startbelegung)
 * @param {object} c.strategy  Sport-Strategie (`plan-generator-sport.js`)
 * @returns {PlanCardDraft[]}
 */
function buildWeekCards(c) {
  const { weekStart, isoWeek, phase, isRecovery, effectiveWeekdays, quality, weeklyHours, targetTss, ftp, isTestWeek } = c;
  const { weekIndexInPhase, focus, level, formats, strategy, thresholdSpeed = null, fixedDays = [] } = c;

  // "Feste Tage": nur aktiv, wenn der Wochentag ein Trainingstag ist UND
  // (keine Erholungswoche ODER der Eintrag trägt `keepInRecoveryWeek: true`).
  // Feste Intervalltage (FIXED_INTERVAL_TYP) sind keine festen Karten, sondern
  // feste Qualitätsplätze — s. applyIntervalPins().
  const fixedByWeekday = new Map(fixedDays.map((d) => [d.weekday, d]));
  const isIntervalPin = (wd) => fixedByWeekday.get(wd)?.typ === FIXED_INTERVAL_TYP;
  const dayIsFixed = (wd) => {
    const entry = fixedByWeekday.get(wd);
    return entry != null && !isIntervalPin(wd) && (!isRecovery || entry.keepInRecoveryWeek);
  };
  // Ein "harter" fixierter Tag (z.B. Sweet Spot) ersetzt einen der automatisch
  // verteilten Qualitätstage, statt zusätzlich draufzukommen — sonst würde die
  // Gesamtzahl Qualitätstage/Woche unbeabsichtigt steigen. Reichen die
  // automatischen Slots nicht aus (mehr feste harte Tage als `quality.length`,
  // s. generatePlan()s hartFixedCount-Warnung), bleiben ab dann keine Slots
  // mehr zum Ersetzen übrig — die überzähligen fixierten harten Tage kommen
  // zusätzlich oben drauf statt zu verdrängen (bewusste, im Formular einzeln
  // sichtbare Athletenentscheidung, keine stille Fehlzählung). "Gruppenfahrt"
  // & Co. (moderat/locker) zählen NICHT als Qualitätstag, die normale
  // Verteilung läuft auf den übrigen Tagen unverändert (Alex' konkreter Fall).
  let effectiveQuality = applyIntervalPins(quality, effectiveWeekdays.filter(isIntervalPin), dayIsFixed);
  for (const wd of effectiveWeekdays) {
    if (!dayIsFixed(wd) || effectiveQuality.includes(wd)) continue;
    if (intensityClass(fixedByWeekday.get(wd).typ) !== "hart") continue;
    // Gepinnte Intervalltage werden nie verdrängt.
    const replaceable = effectiveQuality.filter((q) => !isIntervalPin(q));
    if (!replaceable.length) continue;
    let farthest = replaceable[0];
    for (const q of replaceable) if (Math.abs(q - wd) > Math.abs(farthest - wd)) farthest = q;
    effectiveQuality = effectiveQuality.filter((q) => q !== farthest);
  }

  const dayIsQuality = (wd) => !isRecovery && !dayIsFixed(wd) && effectiveQuality.includes(wd);
  const looseDays = effectiveWeekdays.filter((wd) => !dayIsQuality(wd) && !dayIsFixed(wd));

  // Qualitätstage bekommen ~ ein Viertel des Wochen-Zeitbudgets (45–100 min);
  // die lockeren Tage füllen den Rest bis targetTss (scaleLooseCardsToTarget).
  const qualityTargetMin = clamp(Math.round(weeklyHours * 60 * 0.25), 45, 100);

  const cards = [];
  let qTss = 0;
  for (const wd of effectiveWeekdays) {
    if (!dayIsQuality(wd)) continue;
    const q = strategy.selectWorkout({
      phase,
      weekIndexInPhase,
      qualitySlot: effectiveQuality.indexOf(wd) === 0 ? 1 : 2,
      focus,
      level,
      currentFtp: ftp,
      currentThresholdSpeed: thresholdSpeed,
      targetDurationMin: qualityTargetMin,
      targetTss: Math.round(targetTss * 0.3),
      formats,
    });
    qTss += q.tssPlanned;
    cards.push(makeCard(addDaysISO(weekStart, wd - 1), phase, isoWeek, q, { isQuality: true }));
  }

  for (const wd of effectiveWeekdays) {
    if (!dayIsFixed(wd)) continue;
    const entry = fixedByWeekday.get(wd);
    const f = fixedDayCard(entry.typ, ftp);
    qTss += f.tssPlanned;
    cards.push(
      makeCard(addDaysISO(weekStart, wd - 1), phase, isoWeek, f, { isQuality: intensityClass(entry.typ) === "hart" })
    );
  }

  const weeklyMin = weeklyHours * 60 * (isRecovery ? 0.7 : 1);
  const looseMin = Math.max(0, weeklyMin - cards.reduce((s, x) => s + x.durationMin, 0));
  const perDayMin = distributeLooseMinutes(looseDays, looseMin, focus);
  const looseCards = looseDays.map((wd) =>
    makeCard(
      addDaysISO(weekStart, wd - 1),
      phase,
      isoWeek,
      strategy.looseWorkout(perDayMin[wd], ftp, thresholdSpeed, strategy)
    )
  );
  scaleLooseCardsToTarget(looseCards, Math.max(0, targetTss - qTss), ftp, thresholdSpeed, strategy);
  cards.push(...looseCards);

  if (isTestWeek && effectiveWeekdays.length) {
    // Sicherheitsnetz statt stiller Degradation: eine Strategie, deren
    // testWeeks() eine echte Testwoche liefert, MUSS ein testCard mitbringen
    // — sonst würde `{...undefined}` unbemerkt eine Karte mit lauter
    // undefined-Feldern bauen (Fahrplan 14 E2/E3-Review). Für Rad immer
    // erfüllt; für Lauf/Schwimm derzeit unreachable, da testWeeks() konstant
    // eine leere Menge liefert (Entscheidung 7, kein Testtag).
    if (!strategy.testCard) {
      throw new Error(
        `plan-generator: strategy.testWeeks() lieferte eine Testwoche, aber ` +
          `strategy.testCard fehlt (sport "${strategy.sport}").`
      );
    }
    const testWd = effectiveQuality.length && !isRecovery ? effectiveQuality[0] : effectiveWeekdays[0];
    const testDate = addDaysISO(weekStart, testWd - 1);
    const testCard = makeCard(
      testDate,
      phase,
      isoWeek,
      {
        ...strategy.testCard,
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
  const strategy = getSportStrategy(input.sport ?? "ride");
  const history = input.history || emptyHistory();
  const warnings = [];

  // E13 „Rest neu berechnen": mit `regenerateFrom` + `baseWeekModel` bleibt die
  // Blockstruktur des Ur-Plans eingefroren (keine Neu-Ableitung der Phasen);
  // nur die Wochen ab `cut` werden mit frischer Historie neu gerechnet. Ohne
  // beide Felder läuft der unveränderte Erst-Erzeugungspfad.
  const base =
    input.regenerateFrom && Array.isArray(input.baseWeekModel) && input.baseWeekModel.length
      ? input.baseWeekModel
      : null;
  const startDate = base ? base[0].start : input.startDate;

  // 1) Wochenanzahl + 2) Phasen je Woche -------------------------------
  let totalWeeks;
  let taperWeeks;
  let seq;
  let cut = 0;
  if (base) {
    const recon = sequenceFromWeekModel(base);
    totalWeeks = base.length;
    taperWeeks = recon.taperWeeks;
    seq = { phases: recon.phases, isRecovery: recon.isRecovery, warnings: [] };
    cut = base.findIndex((w) => w.start >= input.regenerateFrom);
    if (cut < 0) cut = totalWeeks; // ganzer Plan liegt vor der Startwoche
  } else {
    totalWeeks =
      input.mode === "event"
        ? Math.ceil((diffDays(input.eventDate, startDate) + 1) / 7)
        : Math.round(input.weeks || 0);
    if (!Number.isFinite(totalWeeks) || totalWeeks < 3) {
      warnings.push(`Plan zu kurz (${totalWeeks || 0} Wochen) — auf 3 Wochen angehoben.`);
      totalWeeks = 3;
    }
    taperWeeks =
      input.mode === "event"
        ? Math.min(Math.ceil(CONFLICT_THRESHOLDS.eventTaperDays / 7), totalWeeks - 1)
        : 0;

    // Power-Curve-Schwäche verschiebt bei allgemeinem Fokus eine Aufbau-Woche
    // zugunsten des schwächsten Systems (E10). Anderer Fokus hat schon einen
    // bewussten Schwerpunkt → keine zusätzliche Verschiebung. Nur Rad: die
    // Power-Curve-Schwäche kommt ausschließlich aus Watt-/FTP-Daten
    // (plan-history.js::derivePowerCurveWeakness) — für Lauf/Schwimm ist
    // `history.powerCurveWeakness` bislang zwar immer `null` (E5 baut die
    // sport-bewusste Historie erst noch), aber ohne dieses Gate würde ein
    // Rad-Signal aus derselben Historie fälschlich auf einen Lauf-/Schwimmplan
    // wirken UND eine Rad-spezifische "Power-Kurve"-Warnung dort anzeigen
    // (Fahrplan-14-Review, bestätigt per generatePlan({sport:"swim"})-Lauf).
    const weaknessPhase =
      strategy.sport === "ride" && input.focus === "allgemein" && history.powerCurveWeakness
        ? WEAKNESS_TO_PHASE[history.powerCurveWeakness] ?? null
        : null;
    seq = buildPhaseSequence({
      totalWeeks,
      taperWeeks,
      model: input.model,
      level: input.level,
      ageYears: history.ageYears,
      weaknessPhase,
      phases: strategy.phases ?? null,
    });
    warnings.push(...seq.warnings);
  }

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
  // In der Restberechnung rampt nur der Schwanz ab `cut` (CTL-Anker = frische
  // currentCtl, Woche-0-TSS = frischer Ist-Schnitt); die eingefrorenen Wochen
  // behalten ihr targetTss aus dem Ur-week_model.
  const startCtl = history.currentCtl != null ? history.currentCtl : week0Tss / 7;
  /** @type {(i: number) => number} */
  let targetTssAt;
  // CTL vor Wochenbeginn (für weekLoadContext()) — für eingefrorene Wochen der
  // Restberechnung (i < cut, keine Karten) nicht bekannt, dort bleibt sie null.
  /** @type {(i: number) => number|null} */
  let ctlAt;
  if (base) {
    const tailPhases = seq.phases.slice(cut);
    const tailRamp = computeWeekTargets({
      totalWeeks: tailPhases.length,
      taperWeeks: Math.min(taperWeeks, tailPhases.length),
      phases: tailPhases,
      isRecovery: seq.isRecovery.slice(cut),
      week0Tss,
      startCtl,
      rampTarget,
      weeklyGrowth,
      mode: input.mode,
    });
    warnings.push(...tailRamp.warnings.map((w) => `Restberechnung: ${w}`));
    targetTssAt = (i) =>
      i < cut ? Math.round(base[i].targetTss ?? 0) : tailRamp.targetTss[i - cut];
    ctlAt = (i) => (i < cut ? null : tailRamp.ctlByWeek[i - cut]);
  } else {
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
    targetTssAt = (i) => ramp.targetTss[i];
    ctlAt = (i) => ramp.ctlByWeek[i];
  }

  // 5)–7) Testwochen + Karten je Woche ------------------------------
  const ftp = input.currentFtp ?? null;
  const thresholdSpeed = input.currentThresholdSpeed ?? null;
  const formats = input.formats || [];
  const testWeeks = strategy.testWeeks(totalWeeks, startDate, input.ftpMeasuredDate, cut);
  const quality = qualityWeekdays(effectiveWeekdays);
  const fixedDays = input.fixedDays || [];
  // Mehr feste harte Tage als automatische Qualitätstage/Woche (quality.length,
  // i.d.R. 2): buildWeekCards() ersetzt dann nicht mehr genug Slots, die
  // überzähligen fixierten harten Tage kommen zusätzlich oben drauf — eine
  // bewusste Athletenentscheidung (jeder Eintrag ist im Formular einzeln
  // sichtbar gewählt), aber die Wochenbelastung steigt entsprechend. Hinweis
  // statt stiller Zusatzbelastung.
  const hartFixedCount = fixedDays.filter(
    (d) => d.typ === FIXED_INTERVAL_TYP || intensityClass(d.typ) === "hart"
  ).length;
  if (hartFixedCount > quality.length) {
    warnings.push(
      `${hartFixedCount} feste harte Tage, aber nur ${quality.length} automatische Qualitätstage/Woche — zusätzliche Belastung prüfen.`
    );
  }
  const weeks = seq.phases.map((phase, i) => {
    const weekStart = addDaysISO(startDate, i * 7);
    const isoWeek = isoWeekKey(weekStart);
    const targetTss = targetTssAt(i);
    // Eingefrorene Woche der Restberechnung: Struktur + Ziel-TSS aus dem
    // Ur-week_model, keine Karten (der Schreibpfad E13 fasst sie nicht an).
    if (base && i < cut) {
      return {
        index: i,
        isoWeek,
        start: weekStart,
        end: addDaysISO(weekStart, 6),
        phase,
        targetTss,
        isRecovery: seq.isRecovery[i],
        loadContext: null,
        cards: [],
      };
    }
    // 0-basierte Woche innerhalb der laufenden Phase (Erholungswochen zählen
    // nicht mit) — treibt die Ladder-Stufe in selectWorkout(). Über den ganzen
    // Plan gezählt, damit die Restberechnung die Ladder nahtlos fortsetzt.
    const weekIndexInPhase = seq.phases
      .slice(0, i)
      .filter((p, j) => p === phase && !seq.isRecovery[j]).length;
    return {
      index: i,
      isoWeek,
      start: weekStart,
      end: addDaysISO(weekStart, 6),
      phase,
      targetTss,
      isRecovery: seq.isRecovery[i],
      loadContext: weekLoadContext(targetTss, ctlAt(i)),
      cards: buildWeekCards({
        weekStart,
        isoWeek,
        phase,
        isRecovery: seq.isRecovery[i],
        effectiveWeekdays,
        quality,
        fixedDays,
        weeklyHours: input.weeklyHours,
        targetTss,
        ftp,
        thresholdSpeed,
        isTestWeek: testWeeks.has(i),
        weekIndexInPhase,
        focus: input.focus,
        level: input.level,
        formats,
        strategy,
      }),
    };
  });

  // 8) Wochenmodell (V4) --------------------------------------------
  const weekModel = weeks.map((w, i) => ({
    week: w.isoWeek,
    phase: w.phase,
    start: w.start,
    end: w.end,
    trainingWeekdays:
      base && i < cut && Array.isArray(base[i].trainingWeekdays) && base[i].trainingWeekdays.length
        ? base[i].trainingWeekdays.slice()
        : effectiveWeekdays.slice(),
    targetTss: w.targetTss,
  }));

  return {
    weeks,
    weekModel,
    // deriveFtpTarget() bleibt ride-only (Fahrplan 14 E1). E2/E3 (Lauf/
    // Schwimm) liefern trotz `thresholdSpeedTarget`-Inputfeld (V1) bewusst
    // noch kein abgeleitetes Schwellenpace-Ziel — offener Punkt, kein Teil
    // des E2/E3-Aufgabenumfangs.
    ftpTarget: strategy.sport === "ride" ? deriveFtpTarget({ ...input, history }, totalWeeks) : null,
    warnings,
  };
}
