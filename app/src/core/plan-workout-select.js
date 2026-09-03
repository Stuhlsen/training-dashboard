/* ============================================================
   CORE/PLAN-WORKOUT-SELECT.JS — Qualitätstag-Workout aus session_formats
   (kein DOM, kein I/O, kein React)

   Fahrplan 8 E3 (docs/fahrplan-8-plan-generator.md). Ersetzt den V5-Stub aus
   plan-generator.js (E2): `selectWorkout()` wählt je Periodisierungsphase ein
   Format aus dem `session_formats`-Katalog (Migration 0014), nimmt die
   Ladder-Stufe nach der Wochennummer innerhalb der Phase und baut daraus

     - die numerische `workout`-Form (warmup/intervals/duration/rest/cooldown/
       pct[/watts]) — bleibt über core/zwo-export.js::canExportZwo exportierbar
     - die strukturierte `workoutStructure` (Schema aus Migration 0013,
       geprüft mit core/workout-validator.js)

   Formatzeilen reicht der Aufrufer durch (`formats`, aus der DB, gleiche Form
   wie `session_formats`). Fehlt eine Zeile (oder trägt sie kein
   `axes.explicitSteps`), greift die eingebaute Kopie der 0014-Startbelegung
   (`BUILTIN_FORMATS`) — der Generator läuft damit ganz ohne Netz/DB (E2-Tests,
   Vorschau vor dem Login).

   Entscheidungen dieser Etappe (E3, mit Alex am 2026-09-03):
   - Die „Grundlage"-Phase nutzt `sweetspot-long`, auf die Stufen S1–S2
     gedeckelt (typ „Sweet Spot"). Kein eigener Grundlagen-Seed, keine
     Migration — die im Fahrplan zuerst genannte Mapping-Option.
   - `input.formats` wird schon jetzt durch `generatePlan()` durchgereicht
     (Default `[]`); E5/E6 füllen die echten Zeilen.

   Die numerische `workout`-Form kann Over-Under / 30-15-Mikrointervalle nicht
   exakt abbilden (kein verschachteltes Schema) — sie trägt eine vereinfachte,
   fahrbare ERG-Näherung für den .zwo-/Wahoo-Export; die genaue Struktur lebt
   in `workoutStructure`. Dieselbe Trennung wie zwischen Freitext-`workout`
   und `workout_structure` im übrigen Projekt.
   ============================================================ */

import { resolveSteps, stepAt } from "./ladder.js";
import { estimateSessionTSS, workoutDurationMinutes } from "./ftp-progress.js";
import { validateWorkoutStructure } from "./workout-validator.js";

/** @param {number} v @param {number} lo @param {number} hi @returns {number} */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ── Eingebaute Startbelegung — 1:1-Kopie der explicitSteps aus Migration
      0014_session_formats.sql. Nur die vom Generator genutzten Felder je
      Stufe; `resolveSteps()`/`stepAt()` aus core/ladder.js lesen sie wie
      eine echte DB-Zeile. Ändert sich der Seed, hier nachziehen. ─────── */
export const BUILTIN_FORMATS = Object.freeze({
  "sweetspot-long": {
    id: "sweetspot-long",
    currency: "zone-time",
    axes: {
      explicitSteps: [
        { id: "S1", structureLabel: "3×10", pctFtp: 88, zoneTimeMin: 30 },
        { id: "S2", structureLabel: "3×12", pctFtp: 88, zoneTimeMin: 36 },
        { id: "S3", structureLabel: "3×15", pctFtp: 90, zoneTimeMin: 45 },
        { id: "S4", structureLabel: "4×12", pctFtp: 90, zoneTimeMin: 48 },
        { id: "S5", structureLabel: "2×20", pctFtp: 91, zoneTimeMin: 40 },
        { id: "S6", structureLabel: "3×18", pctFtp: 90, zoneTimeMin: 54 },
        { id: "S7", structureLabel: "3×20", pctFtp: 91, zoneTimeMin: 60 },
        { id: "S8", structureLabel: "2×30", pctFtp: 90, zoneTimeMin: 60 },
      ],
    },
  },
  "threshold-long": {
    id: "threshold-long",
    currency: "zone-time",
    axes: {
      explicitSteps: [
        { id: "T1", structureLabel: "3×8", pctFtp: 98, zoneTimeMin: 24 },
        { id: "T2", structureLabel: "4×8", pctFtp: 98, zoneTimeMin: 32 },
        { id: "T3", structureLabel: "2×15", pctFtp: 100, zoneTimeMin: 30 },
        { id: "T4", structureLabel: "3×12", pctFtp: 100, zoneTimeMin: 36 },
        { id: "T5", structureLabel: "2×20", pctFtp: 100, zoneTimeMin: 40 },
        { id: "T6", structureLabel: "3×15", pctFtp: 100, zoneTimeMin: 45 },
        { id: "T7", structureLabel: "4×12", pctFtp: 102, zoneTimeMin: 48 },
      ],
    },
  },
  "vo2-long": {
    id: "vo2-long",
    currency: "zone-time",
    axes: {
      explicitSteps: [
        { id: "V-L1", structureLabel: "4×3", pctFtp: 112, zoneTimeMin: 12 },
        { id: "V-L2", structureLabel: "5×3", pctFtp: 112, zoneTimeMin: 15 },
        { id: "V-L3", structureLabel: "4×4", pctFtp: 108, zoneTimeMin: 16 },
        { id: "V-L4", structureLabel: "4×5", pctFtp: 106, zoneTimeMin: 20 },
        { id: "V-L5", structureLabel: "5×5", pctFtp: 106, zoneTimeMin: 25 },
      ],
    },
  },
  "vo2-short": {
    id: "vo2-short",
    currency: "zone-time",
    axes: {
      explicitSteps: [
        { id: "V-K1", structureLabel: "2 Sätze × 10 × 30/15", pctFtp: 110, zoneTimeMin: 10 },
        { id: "V-K2", structureLabel: "3 Sätze × 10 × 30/15", pctFtp: 110, zoneTimeMin: 15 },
        { id: "V-K3", structureLabel: "3 Sätze × 13 × 30/15", pctFtp: 112, zoneTimeMin: 19.5 },
        { id: "V-K4", structureLabel: "4 Sätze × 13 × 30/15", pctFtp: 112, zoneTimeMin: 26 },
      ],
    },
  },
  "over-under": {
    id: "over-under",
    currency: "over-time",
    axes: {
      explicitSteps: [
        { id: "OU1", structureLabel: "3×9 (2/1)", pctFtpOver: 103, pctFtpUnder: 88 },
        { id: "OU2", structureLabel: "3×10 (2/2)", pctFtpOver: 105, pctFtpUnder: 88 },
        { id: "OU3", structureLabel: "3×12 (2/2)", pctFtpOver: 105, pctFtpUnder: 88 },
        { id: "OU4", structureLabel: "3×12 (2/2)", pctFtpOver: 107, pctFtpUnder: 90 },
        { id: "OU5", structureLabel: "3×15 (3/2)", pctFtpOver: 105, pctFtpUnder: 90 },
        { id: "OU6", structureLabel: "4×12 (2/2)", pctFtpOver: 107, pctFtpUnder: 90 },
      ],
    },
  },
  "sprint-accessory": {
    id: "sprint-accessory",
    currency: "reps",
    axes: {
      explicitSteps: [
        { id: "SP1", structureLabel: "3×10s", reps: 3, workSec: 10, restMin: 4 },
        { id: "SP2", structureLabel: "4×10s", reps: 4, workSec: 10, restMin: 4 },
        { id: "SP3", structureLabel: "4×15s", reps: 4, workSec: 15, restMin: 5 },
        { id: "SP4", structureLabel: "6×15s", reps: 6, workSec: 15, restMin: 5 },
      ],
    },
  },
});

/* ── Phase → Format-Mapping (E3, Startbelegung final). Zwei Slots je Woche:
      Slot 1 = erster Qualitätstag, Slot 2 = zweiter. `maxStep` deckelt die
      Ladder-Stufe (Grundlage bleibt auf S1–S2, Taper auf T1–T2). ──────── */
const PHASE_PLAN = Object.freeze({
  Grundlage: { slots: ["sweetspot-long", "sweetspot-long"], typ: "Sweet Spot", zone: "SS", maxStep: 2 },
  "Sweet Spot": { slots: ["sweetspot-long", "sweetspot-long"], typ: "Sweet Spot", zone: "SS" },
  Schwelle: { slots: ["threshold-long", "over-under"], typ: "Schwelle", zone: "THR" },
  VO2max: { slots: ["vo2-long", "vo2-short"], typ: "VO2max", zone: "VO2" },
  Taper: { slots: ["threshold-long", "threshold-long"], typ: "Schwelle", zone: "THR", maxStep: 2 },
});
const DEFAULT_PHASE_KEY = "Sweet Spot";

/**
 * Formatzeile auflösen: die durchgereichte DB-Zeile, wenn sie
 * `axes.explicitSteps` trägt, sonst die eingebaute Startbelegung.
 * @param {string} id
 * @param {Array<{id?:string, axes?:{explicitSteps?:Array<Object>}}>} formats
 * @returns {{id:string, axes:{explicitSteps:Array<Object>}}|null}
 */
function resolveFormat(id, formats) {
  const row = (formats || []).find((f) => f && f.id === id);
  if (row && Array.isArray(row.axes?.explicitSteps) && row.axes.explicitSteps.length) return row;
  return BUILTIN_FORMATS[id] || null;
}

/**
 * Ladder-Stufe (1-indexiert) aus der Wochennummer innerhalb der Phase.
 * Woche 0 → Stufe 1, danach je Woche eine Stufe höher, gedeckelt auf die
 * Zahl vorhandener Stufen, optional die Phasen-Obergrenze (`phaseMax`) und
 * bei Einsteigern auf Stufe 4.
 * @param {number} weekIndexInPhase 0-basiert
 * @param {"einsteiger"|"fortgeschritten"} level
 * @param {number|undefined} phaseMax
 * @param {number} stepCount
 * @returns {number}
 */
export function ladderStep(weekIndexInPhase, level, phaseMax, stepCount) {
  const caps = [Math.max(1, stepCount)];
  if (phaseMax) caps.push(phaseMax);
  if (level === "einsteiger") caps.push(4);
  return Math.min(Math.max(1, Math.trunc(weekIndexInPhase || 0) + 1), ...caps);
}

/** "N×M" (oder "N Sätze × M × …") aus einem structureLabel.
 *  @param {string} label @returns {{a:number, b:number}|null} */
function parseNxM(label) {
  const m = /(\d+)\s*(?:sätze|satz)?\s*[×xX]\s*(\d+)/.exec(String(label || ""));
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

/** Warmup-Minuten so wählen, dass die Gesamtdauer ~ `target` trifft
 *  (12–25 min Korridor — ein längeres Warmup ist ein aerober Vorlauf,
 *  kein Fehler). @returns {number} */
function padWarmup(target, mainMin, restMin, cooldownMin) {
  const want = (target || 0) - mainMin - restMin - cooldownMin;
  return clamp(Math.round(want || 15), 12, 25);
}

/** @param {[number,number]} pctBand @param {number|null} ftp
 *  @returns {{watts?: [number, number]}} */
function wattsPart(pctBand, ftp) {
  if (ftp == null) return {};
  return { watts: [Math.round((pctBand[0] / 100) * ftp), Math.round((pctBand[1] / 100) * ftp)] };
}

/* ── Bausteine je Format-Familie ─────────────────────────────── */

/** `sweetspot-long` / `threshold-long` / `vo2-long`: N Wiederholungen à M min
 *  bei konstanter Zielintensität. */
function sustainedWorkout({ step, formatId, typ, zone, currentFtp, targetDurationMin }) {
  const nm = parseNxM(step.structureLabel) || { a: 3, b: 12 };
  const reps = clamp(nm.a, 1, 8);
  const workMin = clamp(nm.b, 2, 30);
  const pct = clamp(step.pctFtp ?? 90, 50, 130);
  // Pausenregel L2 (Konzept): 5 min bei Intervallen ≤ 15 min, 8 darüber —
  // familienübergreifend; für die kurzen VO2-Reps 1:1 statt der langen Pause.
  const restMin = formatId === "vo2-long" ? clamp(Math.round(workMin * 0.8), 2, 5) : workMin <= 15 ? 5 : 8;
  const mainMin = reps * workMin;
  const restTotal = (reps - 1) * restMin;
  const cooldown = 10;
  const warmup = padWarmup(targetDurationMin, mainMin, restTotal, cooldown);
  const pctBand = /** @type {[number,number]} */ ([pct - 2, pct + 2]);
  const name = `${typ} ${reps}×${workMin}`;

  const workout = {
    warmup,
    intervals: reps,
    duration: workMin,
    rest: restMin,
    cooldown,
    zone,
    pct: pctBand,
    ...wattsPart(pctBand, currentFtp),
    label: name,
  };
  const structure = {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: warmup * 60, target_pct_ftp: 55 },
      {
        kind: "set",
        reps,
        work: { duration_s: workMin * 60, target_pct_ftp: pct },
        recovery: { duration_s: restMin * 60, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: cooldown * 60, target_pct_ftp: 50 },
    ],
  };
  return { name, workout, structure };
}

/** `over-under`: N Blöcke, je Block Zyklen aus 2 min über / 1 min unter FTP. */
function overUnderWorkout({ step, zone, currentFtp, targetDurationMin }) {
  const nm = parseNxM(step.structureLabel) || { a: 3, b: 9 };
  const blocks = clamp(nm.a, 2, 5);
  const over = clamp(step.pctFtpOver ?? 105, 95, 120);
  const under = clamp(step.pctFtpUnder ?? 88, 70, 95);
  const overS = 120;
  const underS = 60;
  const cycles = 3; // 3 × (2 + 1) min = 9 min Blockdauer (D1.4: exakt)
  const blockDurS = cycles * (overS + underS);
  const betweenMin = 3;
  const cooldown = 10;
  const mainMin = blocks * (blockDurS / 60);
  const restTotal = (blocks - 1) * betweenMin;
  const warmup = padWarmup(targetDurationMin, mainMin, restTotal, cooldown);
  const pctBand = /** @type {[number,number]} */ ([under, over]);
  const name = `Over-Under ${blocks}×9`;

  const workout = {
    warmup,
    intervals: blocks,
    duration: blockDurS / 60,
    rest: betweenMin,
    cooldown,
    zone,
    pct: pctBand,
    ...wattsPart(pctBand, currentFtp),
    label: name,
  };
  const structure = {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: warmup * 60, target_pct_ftp: 55 },
      {
        kind: "alternating",
        reps: blocks,
        cycles,
        duration_s: blockDurS,
        over: { duration_s: overS, target_pct_ftp: over },
        under: { duration_s: underS, target_pct_ftp: under },
        recovery: { duration_s: betweenMin * 60, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: cooldown * 60, target_pct_ftp: 50 },
    ],
  };
  return { name, workout, structure };
}

/** `vo2-short`: S Sätze à R Mikrointervalle 30 s an / 15 s ab. */
function microBurstWorkout({ step, zone, currentFtp, targetDurationMin }) {
  const nums = (String(step.structureLabel).match(/\d+/g) || ["3", "10"]).map(Number);
  const sets = clamp(nums[0] ?? 3, 2, 5);
  const microReps = clamp(nums[1] ?? 10, 5, 15);
  const onS = 30;
  const offS = 15;
  const pct = clamp(step.pctFtp ?? 110, 100, 130);
  const totalMicro = sets * microReps;
  const betweenMin = 5;
  const cooldown = 10;
  const mainMin = totalMicro * (onS / 60) + (totalMicro - 1) * (offS / 60);
  const restTotal = (sets - 1) * betweenMin;
  const warmup = padWarmup(targetDurationMin, mainMin, restTotal, cooldown);
  const pctBand = /** @type {[number,number]} */ ([pct - 2, pct + 2]);
  const name = `VO2max 30/15 ${sets}×${microReps}`;

  // Numerisch: jedes 30-s-„an" ist eine Wiederholung (fahrbarer .zwo-Export),
  // die 5-min-Satzpausen fallen dabei weg — sie stehen in der Struktur.
  const workout = {
    warmup,
    intervals: totalMicro,
    duration: onS / 60,
    rest: offS / 60,
    cooldown,
    zone,
    pct: pctBand,
    ...wattsPart(pctBand, currentFtp),
    label: name,
  };
  const structure = {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: warmup * 60, target_pct_ftp: 55 },
      {
        kind: "alternating",
        reps: sets,
        cycles: microReps,
        duration_s: microReps * (onS + offS),
        over: { duration_s: onS, target_pct_ftp: pct },
        under: { duration_s: offS, target_pct_ftp: 50 },
        recovery: { duration_s: betweenMin * 60, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: cooldown * 60, target_pct_ftp: 50 },
    ],
  };
  return { name, workout, structure };
}

/** `sprint-accessory` als angehängter `accessory`-Schritt (Fokus `crit`). */
function sprintAccessoryStep(step) {
  const reps = clamp(step.reps ?? 4, 3, 8);
  const workSec = clamp(step.workSec ?? 12, 8, 20);
  const restMin = clamp(step.restMin ?? 4, 3, 6);
  return {
    step: {
      kind: "accessory",
      subtype: "sprint",
      reps,
      work: { duration_s: workSec, target: "max" },
      recovery: { duration_s: restMin * 60, target_pct_ftp: 40 },
    },
    extraMin: reps * restMin,
    extraTss: 3,
  };
}

/* ── Hauptfunktion (V5) ──────────────────────────────────────── */

/**
 * Wählt das Qualitätstag-Workout für eine Plan-Woche. Rein deterministisch.
 *
 * @param {Object} args
 * @param {string} args.phase  "Grundlage" | "Sweet Spot" | "Schwelle" | "VO2max" | "Taper"
 * @param {number} [args.weekIndexInPhase]  0-basiert, treibt die Ladder-Stufe
 * @param {1|2} [args.qualitySlot]  erster / zweiter Qualitätstag der Woche
 * @param {"allgemein"|"berg"|"langstrecke"|"crit"} [args.focus]
 * @param {"einsteiger"|"fortgeschritten"} [args.level]
 * @param {number|null} [args.currentFtp]
 * @param {number} [args.targetDurationMin]
 * @param {number} [args.targetTss]  z. Zt. nur informativ (V5-Vertrag)
 * @param {Array<{id?:string, axes?:Object}>} [args.formats]  session_formats-Zeilen
 * @returns {{name:string, typ:string, workout:object, workoutStructure:object|null, tssPlanned:number, durationMin:number}}
 */
export function selectWorkout({
  phase,
  weekIndexInPhase = 0,
  qualitySlot = 1,
  focus = "allgemein",
  level = "fortgeschritten",
  currentFtp = null,
  targetDurationMin = 0,
  targetTss = 0, // V5-Vertragsfeld; z. Zt. nicht ausgewertet (Kalibrierung in einer späteren Etappe)
  formats = [],
} = {}) {
  const plan = PHASE_PLAN[phase] || PHASE_PLAN[DEFAULT_PHASE_KEY];
  const slotIdx = qualitySlot === 2 ? 1 : 0;
  const formatId = plan.slots[slotIdx];
  const format = resolveFormat(formatId, formats) || BUILTIN_FORMATS["sweetspot-long"];
  const steps = resolveSteps(format);
  const stepNo = ladderStep(weekIndexInPhase, level, plan.maxStep, steps.length);
  const step = stepAt(format, stepNo) || steps[steps.length - 1] || {};

  let built;
  if (formatId === "over-under") built = overUnderWorkout({ step, zone: plan.zone, currentFtp, targetDurationMin });
  else if (formatId === "vo2-short") built = microBurstWorkout({ step, zone: plan.zone, currentFtp, targetDurationMin });
  else built = sustainedWorkout({ step, formatId, typ: plan.typ, zone: plan.zone, currentFtp, targetDurationMin });

  const structure = built.structure;
  let extraMin = 0;
  let extraTss = 0;
  let nameSuffix = "";
  if (focus === "crit" && qualitySlot === 2) {
    const accFormat = resolveFormat("sprint-accessory", formats) || BUILTIN_FORMATS["sprint-accessory"];
    const accStep = stepAt(accFormat, Math.min(stepNo, 4)) || resolveSteps(accFormat)[0] || {};
    const acc = sprintAccessoryStep(accStep);
    structure.steps.splice(structure.steps.length - 1, 0, acc.step); // vor dem Cooldown
    extraMin = acc.extraMin;
    extraTss = acc.extraTss;
    nameSuffix = " + Sprint";
  }

  // Sicherheitsnetz — nur ausliefern, was derselbe Validator auch für eine
  // echte Karte akzeptieren würde (Muster aus workout-structure-derive.js).
  const workoutStructure = validateWorkoutStructure(structure).valid ? structure : null;

  return {
    name: `${built.name}${nameSuffix}`,
    typ: plan.typ,
    workout: built.workout,
    workoutStructure,
    tssPlanned: estimateSessionTSS(built.workout, currentFtp ?? undefined) + extraTss,
    durationMin: workoutDurationMinutes(built.workout) + extraMin,
  };
}
