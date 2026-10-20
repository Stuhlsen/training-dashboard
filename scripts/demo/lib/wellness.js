/* ============================================================
   DEMO/LIB/WELLNESS.JS — Demo-Wellness (Fahrplan 31 E2)
   HRV, Ruhepuls, Schlaf, Gewicht, eFTP pro Tag im Format von
   app/src/core/validate.js::WELLNESS_SCHEMA. Reiner Rechen-Code.

   Stimmigkeit (fest, mit Tests in tests/demo-payload.test.js):
   - HRV (rMSSD) um `hrvBase`, in der Krankheitswoche −20 bis −30 %,
     1–3 Tage nach einem kräftigen TSB-Abfall leicht gedrückt.
   - Ruhepuls in der Krankheitswoche +5 bis +8.
   - Schlaf 6,5–8,5 h, nach harten Tagen etwas mehr.
   ============================================================ */

import { addDaysISO } from "../../../app/src/core/format.js";
import { rngFor } from "./prng.js";
import { between, eftpAt, round } from "./rides.js";

/** TSB-Abfall an einem Tag, ab dem die HRV der Folgetage leicht sinkt. */
const TSB_DROP_THRESHOLD = -8;
const TSB_DIP_FACTOR = 0.92;
/** Tages-TSS, ab dem ein Tag als „hart" gilt (etwas mehr Schlaf danach). */
const HARD_DAY_TSS = 100;
const SLEEP_MIN = 6.5;
const SLEEP_MAX = 8.5;

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Gab es an einem der 1–3 Vortage einen kräftigen TSB-Abfall? */
function afterTsbDrop(pmcByDate, date) {
  for (let back = 1; back <= 3; back++) {
    const d = addDaysISO(date, -back);
    const now = pmcByDate.get(d);
    const before = pmcByDate.get(addDaysISO(d, -1));
    if (now && before && now.tsb - before.tsb <= TSB_DROP_THRESHOLD) return true;
  }
  return false;
}

/**
 * Wellness-Tage von `windowStart` bis einschließlich `today`.
 * @param {object} p
 * @param {import("./timeline.js").DemoTimeline} p.timeline
 * @param {import("./roster.js").DemoAthlete} p.athlete
 * @param {string} p.today
 * @param {Map<string, number>} p.tssByDate  Tages-TSS (fehlt = Ruhetag)
 * @param {Map<string, {ctl:number, atl:number, tsb:number}>} p.pmcByDate
 * @returns {Array<object>} aufsteigend nach Datum
 */
export function buildWellness({ timeline, athlete, today, tssByDate, pmcByDate }) {
  const { seed, ftpSteps } = timeline;
  const sickByDate = new Map(timeline.days.map((d) => [d.date, d.isSick]));
  const out = [];

  for (let date = timeline.windowStart; date <= today; date = addDaysISO(date, 1)) {
    const rng = rngFor(seed, athlete.id, "wellness", date);
    const sick = sickByDate.get(date) ?? false;
    const dip = afterTsbDrop(pmcByDate, date);

    const hrvFactor = (sick ? between(rng, 0.72, 0.8) : 1) * (dip ? TSB_DIP_FACTOR : 1);
    const hrv = Math.round(athlete.hrvBase * hrvFactor * between(rng, 0.95, 1.05));
    const restingHR =
      athlete.hrRest +
      Math.round(between(rng, -2, 2)) +
      (sick ? Math.round(between(rng, 5, 8)) : 0) +
      (dip ? 1 : 0);

    const yesterdayTss = tssByDate.get(addDaysISO(date, -1)) ?? 0;
    const sleepHours = round(
      clamp(
        7.3 + between(rng, -0.6, 0.6) + (yesterdayTss >= HARD_DAY_TSS ? 0.3 : 0),
        SLEEP_MIN,
        SLEEP_MAX
      ),
      1
    );
    const sleepScore = Math.round(
      clamp(60 + (sleepHours - SLEEP_MIN) * 12 + between(rng, -5, 5) - (sick ? 10 : 0), 50, 98)
    );

    out.push({
      date,
      sleepHours,
      sleepScore,
      avgSleepingHR: restingHR + 4,
      restingHR,
      hrv,
      hrvMethod: "rmssd",
      weight: round(athlete.weightKg + between(rng, -0.4, 0.4), 1),
      bodyFat: null,
      activeEnergy: Math.round(250 + (tssByDate.get(date) ?? 0) * 8),
      restingEnergy: null,
      kcalConsumed: null,
      hydration: null,
      hydrationVolume: null,
      eftp: eftpAt(ftpSteps, date, seed, athlete.id),
    });
  }
  return out;
}

/**
 * Letztes Datum je Readiness-Metrik (WellnessMeta in app/src/types.js).
 * @param {Array<{date: string, hrv: number|null, restingHR: number|null, sleepHours: number|null}>} wellness
 */
export function wellnessMetaFor(wellness) {
  const last = (field) => [...wellness].reverse().find((w) => w[field] != null)?.date ?? null;
  return {
    lastUpdated: { hrv: last("hrv"), restingHR: last("restingHR"), sleepHours: last("sleepHours") },
  };
}
