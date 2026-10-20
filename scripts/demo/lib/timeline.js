/* ============================================================
   DEMO/LIB/TIMELINE.JS — Demo-Zeitachse (Fahrplan 31 E1, Vertrag V3)
   buildDemoTimeline({ seed, athleteId, epoch, today }) → DemoTimeline.
   Reiner Rechen-Code: kein I/O, kein Math.random(), kein Date.now().

   Saison-Modell (Q11/Q19): feste 12-Wochen-Zyklen ab `epoch` (Montag),
   jeder Zyklus endet am Sonntag der 12. Woche mit einem Rennen. Vier
   Zyklen bilden eine Saison: FTP-Sprung 1 ab Zyklus 2, Sprung 2 ab
   Zyklus 3, Zyklus 4 endet mit dem A-Rennen ("main"), danach beginnt die
   nächste Saison wieder beim Startwert. Die Krankheitswoche liegt fest in
   Woche 6 von Zyklus 2 jeder Saison (eine pro 336 Tage → mindestens eine
   im 365-Tage-Fenster).

   Plan je Zyklus aus dem echten app/src/core/plan-generator.js (Q1 A):
   ein Aufruf pro Sportart, Mehrsport wird zusammengeführt (Q2 A).
   Erholungswochen und Phasen bestimmt der Generator (Q3 A).

   Wichtig: dieses Modul importiert app/src/ — vorher muss
   ./register-app-core.js geladen sein (s. dort).
   ============================================================ */

import { generatePlan } from "../../../app/src/core/plan-generator.js";
import { addDaysISO, diffDays } from "../../../app/src/core/format.js";
import { isoWeekKey } from "../../../app/src/core/aggregate.js";
import { rngFor } from "./prng.js";
import { demoAthlete } from "./roster.js";

export const CYCLE_DAYS = 84;
const CYCLES_PER_SEASON = 4;
const WINDOW_PAST_DAYS = 365;
const WINDOW_FUTURE_DAYS = 42;
const SICK_SEASON_POS = 1;
const SICK_WEEK_INDEX = 5;

/** Kumulative Schwellen für die Planerfüllung eines gesunden Tages
 *  (done + shorter + harder ≈ 86 %). */
const HEALTHY_FULFILMENT = [
  { upTo: 0.7, value: "done" },
  { upTo: 0.8, value: "shorter" },
  { upTo: 0.86, value: "harder" },
];
/** Anteil `skipped` an Krankheitstagen mit geplanter Einheit. */
const SICK_SKIP_SHARE = 0.85;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {import("../../../app/src/core/plan-generator.js").PlanCardDraft & { sport: "ride"|"run"|"swim" }} PlannedSession
 */

/**
 * @typedef {Object} DemoTimeline  (V3)
 * @property {"demo1"|"demo2"} athleteId
 * @property {string} epoch
 * @property {string} windowStart
 * @property {string} windowEnd
 * @property {Array<{ start: string, raceDate: string, raceName: string, priority: "main"|"secondary" }>} cycles
 * @property {Array<{ date: string, watts: number, source: "test" }>} ftpSteps
 * @property {Array<{ start: string, end: string }>} sickWindows
 * @property {Array<{ date: string, phase: string, isRecoveryWeek: boolean, isSick: boolean,
 *   planned: PlannedSession[], fulfilment: "done"|"skipped"|"shorter"|"harder"|"rest" }>} days
 */

/** @param {number} k @returns {number} Position 0..3 innerhalb der Saison */
const seasonPos = (k) => ((k % CYCLES_PER_SEASON) + CYCLES_PER_SEASON) % CYCLES_PER_SEASON;

/** @param {string} epoch @param {string} date @returns {number} */
export const cycleIndexOf = (epoch, date) => Math.floor(diffDays(date, epoch) / CYCLE_DAYS);

/** @param {string} epoch @param {number} k */
function cycleInfo(epoch, k) {
  const start = addDaysISO(epoch, k * CYCLE_DAYS);
  const pos = seasonPos(k);
  return {
    start,
    raceDate: addDaysISO(start, CYCLE_DAYS - 1),
    pos,
    sickStart: pos === SICK_SEASON_POS ? addDaysISO(start, SICK_WEEK_INDEX * 7) : null,
  };
}

/** @param {import("./roster.js").DemoAthlete} athlete @param {number} pos */
const ftpForPos = (athlete, pos) => athlete.ftpSeason[Math.min(pos, athlete.ftpSeason.length - 1)];

/**
 * Plan-Eingabe für eine Sportart eines Zyklus — fester Input, damit der
 * Plan nur vom Zyklus abhängt (Stabilität, V3).
 * @param {import("./roster.js").DemoAthlete} athlete
 * @param {import("./roster.js").DemoSportPlan} sp
 * @param {{ start: string, raceDate: string, pos: number }} cycle
 */
function planInput(athlete, sp, cycle) {
  const measured = addDaysISO(cycle.start, -1);
  const isRide = sp.sport === "ride";
  return {
    sport: sp.sport,
    startDate: cycle.start,
    mode: "event",
    eventDate: cycle.raceDate,
    trainingWeekdays: sp.trainingWeekdays,
    weeklyHours: sp.weeklyHours,
    currentFtp: isRide ? ftpForPos(athlete, cycle.pos) : null,
    ftpMeasuredDate: isRide ? measured : null,
    ...(isRide ? { startWithFtpTest: false } : {}),
    ftpTarget: null,
    currentThresholdSpeed: isRide ? null : sp.thresholdSpeed,
    thresholdSpeedMeasuredDate: isRide ? null : measured,
    thresholdSpeedTarget: null,
    indoorShare: 0.3,
    focus: "allgemein",
    level: athlete.level,
    model: "pyramidal",
  };
}

/**
 * Plant einen Zyklus für alle Sportarten des Athleten.
 * Die Wochen-Einordnung (Phase/Erholung) kommt aus dem ersten Sportplan.
 * @returns {{ byDate: Map<string, PlannedSession[]>, weeks: Map<string, { phase: string, isRecovery: boolean }> }}
 */
function planCycle(athlete, cycle) {
  /** @type {Map<string, PlannedSession[]>} */
  const byDate = new Map();
  const weeks = new Map();
  athlete.plans.forEach((sp, i) => {
    const plan = generatePlan(planInput(athlete, sp, cycle));
    for (const week of plan.weeks) {
      if (i === 0) weeks.set(week.isoWeek, { phase: week.phase, isRecovery: week.isRecovery });
      for (const card of week.cards) {
        // Am Renntag gibt es keine Trainingseinheit — das Rennen selbst setzt E2.
        if (card.date === cycle.raceDate) continue;
        byDate.set(card.date, [...(byDate.get(card.date) ?? []), { ...card, sport: sp.sport }]);
      }
    }
  });
  return { byDate, weeks };
}

/**
 * Planerfüllung eines Tages — hängt nur von seed, athleteId und Datum ab.
 * @param {string|number} seed @param {string} athleteId @param {string} date
 * @param {boolean} hasPlan @param {boolean} isSick
 * @returns {"done"|"skipped"|"shorter"|"harder"|"rest"}
 */
export function fulfilmentFor(seed, athleteId, date, hasPlan, isSick) {
  if (!hasPlan) return "rest";
  const r = rngFor(seed, athleteId, date)();
  if (isSick) return r < SICK_SKIP_SHARE ? "skipped" : "shorter";
  return HEALTHY_FULFILMENT.find((t) => r < t.upTo)?.value ?? "skipped";
}

/** @param {{ seed: unknown, athleteId: unknown, epoch: unknown, today: unknown }} input */
function assertInput({ seed, epoch, today }) {
  if (seed === undefined || seed === null || seed === "") throw new Error("seed fehlt");
  for (const [name, v] of [
    ["epoch", epoch],
    ["today", today],
  ]) {
    if (typeof v !== "string" || !ISO_DATE.test(v))
      throw new Error(`${name} muss ein ISO-Datum sein`);
  }
  if (new Date(`${epoch}T00:00:00`).getDay() !== 1) throw new Error("epoch muss ein Montag sein");
}

/** FTP-Stufen ab dem ersten Zyklus im Fenster, danach nur bei Wertänderung. */
function ftpStepsFor(athlete, cycles) {
  const steps = [];
  for (const c of cycles) {
    const watts = ftpForPos(athlete, c.pos);
    if (steps.at(-1)?.watts !== watts) steps.push({ date: c.start, watts, source: "test" });
  }
  return steps;
}

/**
 * @param {{ seed: string|number, athleteId: "demo1"|"demo2", epoch: string, today: string }} input
 * @returns {DemoTimeline}
 */
export function buildDemoTimeline(input) {
  assertInput(input);
  const { seed, athleteId, epoch, today } = input;
  const athlete = demoAthlete(athleteId);
  const windowStart = addDaysISO(today, -WINDOW_PAST_DAYS);
  const windowEnd = addDaysISO(today, WINDOW_FUTURE_DAYS);

  const cycles = [];
  for (let k = cycleIndexOf(epoch, windowStart); k <= cycleIndexOf(epoch, windowEnd); k++) {
    cycles.push({ ...cycleInfo(epoch, k), k });
  }
  const plans = new Map(cycles.map((c) => [c.k, planCycle(athlete, c)]));
  const sickWindows = cycles
    .filter((c) => c.sickStart)
    .map((c) => ({ start: c.sickStart, end: addDaysISO(c.sickStart, 6) }));

  const days = [];
  for (let date = windowStart; date <= windowEnd; date = addDaysISO(date, 1)) {
    const { byDate, weeks } = plans.get(cycleIndexOf(epoch, date));
    const week = weeks.get(isoWeekKey(date));
    const planned = byDate.get(date) ?? [];
    const isSick = sickWindows.some((w) => date >= w.start && date <= w.end);
    days.push({
      date,
      phase: week?.phase ?? "",
      isRecoveryWeek: week?.isRecovery ?? false,
      isSick,
      planned,
      fulfilment: fulfilmentFor(seed, athleteId, date, planned.length > 0, isSick),
    });
  }

  return {
    athleteId,
    epoch,
    windowStart,
    windowEnd,
    cycles: cycles.map((c) => ({
      start: c.start,
      raceDate: c.raceDate,
      raceName: athlete.raceNames[c.pos],
      priority: c.pos === CYCLES_PER_SEASON - 1 ? "main" : "secondary",
    })),
    ftpSteps: ftpStepsFor(athlete, cycles),
    sickWindows,
    days,
  };
}
