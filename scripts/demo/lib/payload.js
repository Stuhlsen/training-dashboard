/* ============================================================
   DEMO/LIB/PAYLOAD.JS — Demo-Athlet komplett (Fahrplan 31 E2, Vertrag V4)
   buildDemoAthlete(timeline, roster) → { json, rows }

   - json: vollständiges rides*.json-Payload wie die heutige Sync-Ausgabe,
     besteht app/src/core/validate.js ohne Warnung.
   - rows: Supabase-Zeilen als reine Objekte, Spaltennamen wie in den
     Adaptern unter app/src/api/supabase/*.ts, OHNE UUIDs (setzt E4).
     Verknüpfungen laufen über `_`-Schlüssel, die E4 vor dem Schreiben in
     echte Fremdschlüssel übersetzt und entfernt:
       training_plans._ref / _goalEventRef → events._ref
       plan_cards._planRef → training_plans._ref
   - PMC mit CTL_DAYS/ATL_DAYS aus app/src/core/pmc.js.

   Reiner Rechen-Code: kein I/O, kein Math.random(), kein Date.now().
   Wichtig: vorher ./register-app-core.js laden (s. timeline.js).
   ============================================================ */

import { CTL_DAYS, ATL_DAYS } from "../../../app/src/core/pmc.js";
import { addDaysISO } from "../../../app/src/core/format.js";
import { RECENT_BLOCK_KEY, PREVIOUS_BLOCK_KEY } from "../../../app/src/core/progress-indicators.js";
import { rngFor } from "./prng.js";
import { WINDOW_PAST_DAYS } from "./timeline.js";
import {
  between,
  buildActivities,
  fakeWeather,
  ftpAtDate,
  round,
  shortenActivity,
} from "./rides.js";
import { buildWellness, wellnessMetaFor } from "./wellness.js";

/** Tage am Fensteranfang, deren mittlere Last den PMC-Startwert setzt —
 *  „Vorlauf", damit CTL am ersten Tag nicht bei 0 beginnt. */
const PMC_WARMUP_DAYS = 42;
/** Stützstellen der Power-Kurve in Sekunden. */
const CURVE_SECS = [
  1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600,
  5400, 7200, 10800,
];
/** Anaerobe Arbeitskapazität (J) im CP-Modell der Kurve. */
const CURVE_W_PRIME = 18000;
/** 20-min-Wert ≈ FTP ÷ 0,95 (klassische FTP-Schätzung). */
const FTP_FROM_20MIN = 0.95;
const CURVE_PMAX_FACTOR = 4.2;
const CURVE_DAYS = 90;
const FORECAST_DAYS = 7;
/** Trittfrequenz-Ziel für Intervalle (athlete_sync_config). */
const CADENCE_TARGET = 88;
/** Aufschlag aufs höchste Saison-FTP für das FTP-Ziel. */
const FTP_GOAL_PLUS = 8;

/** CTL-Anstieg über 7 Tage, den die Rampen-Bremse nicht überschreiten lässt
 *  (Regel: ≤ 8/Woche, mit Abstand für die Rundung auf 0,1). */
const CTL_RAMP_LIMIT = 7.5;

/** Ein Tag PMC-Fortschreibung — dieselbe Glättung wie core/pmc.js::projectPmc. */
const pmcStep = ({ ctl, atl }, tss) => {
  const c = ctl + (tss - ctl) / CTL_DAYS;
  const a = atl + (tss - atl) / ATL_DAYS;
  return { ctl: c, atl: a, tsb: c - a };
};

/** Startwert: mittlere Tageslast der ersten Fenstertage („Vorlauf"). */
function warmStart(tssByDate, start) {
  let warm = 0;
  for (let i = 0; i < PMC_WARMUP_DAYS; i++) warm += tssByDate.get(addDaysISO(start, i)) ?? 0;
  const v = warm / PMC_WARMUP_DAYS;
  return { ctl: v, atl: v, tsb: 0 };
}

/**
 * CTL/ATL/TSB je Tag über das ganze Fenster (Ruhetage = TSS 0).
 * @param {Map<string, number>} tssByDate
 * @param {string} start @param {string} end
 * @param {{ctl:number, atl:number, tsb:number}} [init]  Startwert, sonst Vorlauf aus tssByDate
 * @returns {Map<string, {ctl:number, atl:number, tsb:number}>}
 */
export function pmcByDay(tssByDate, start, end, init = warmStart(tssByDate, start)) {
  let state = init;
  const out = new Map();
  for (let date = start; date <= end; date = addDaysISO(date, 1)) {
    state = pmcStep(state, tssByDate.get(date) ?? 0);
    out.set(date, state);
  }
  return out;
}

/** Tages-TSS-Summe je Datum. */
const tssPerDay = (activities) => {
  const m = new Map();
  for (const a of activities) m.set(a.date, (m.get(a.date) ?? 0) + a.tss);
  return m;
};

/**
 * Rampen-Bremse: würde ein Tag die CTL über 7 Tage um mehr als
 * CTL_RAMP_LIMIT heben, werden seine Einheiten anteilig gekürzt
 * (z. B. Wiedereinstieg nach der Krankheitswoche).
 * @returns {{ activities: Array<object>, init: {ctl:number, atl:number, tsb:number} }}
 *   Aktivitäten (ggf. gekürzt) + der PMC-Startwert, mit dem gerechnet wurde
 */
function applyRampGuard(activities, athlete, start, end) {
  const byDate = Map.groupBy(activities, (a) => a.date);
  const init = warmStart(tssPerDay(activities), start);
  let state = init;
  const ctlByDate = new Map();
  const out = [];
  for (let date = start; date <= end; date = addDaysISO(date, 1)) {
    let day = byDate.get(date) ?? [];
    const tss = day.reduce((s, a) => s + a.tss, 0);
    const weekAgo = ctlByDate.get(addDaysISO(date, -7));
    if (weekAgo != null && tss > 0) {
      const maxTss = CTL_DAYS * (weekAgo + CTL_RAMP_LIMIT - state.ctl) + state.ctl;
      if (tss > maxTss) {
        const factor = Math.max(0, maxTss) / tss;
        day = day.map((a) => shortenActivity(a, factor, athlete));
      }
    }
    state = pmcStep(
      state,
      day.reduce((s, a) => s + a.tss, 0)
    );
    ctlByDate.set(date, state.ctl);
    out.push(...day);
  }
  return { activities: out, init };
}

/**
 * Bestwert-Kurve (intervals.icu-Form, `list[0]`) aus den Radeinheiten
 * zwischen `from` und `to`: CP-Modell um die höchste eFTP im Zeitraum,
 * nur bis zur längsten Einheit, je Punkt die härteste passende Einheit.
 * @returns {object|null}
 */
function powerCurve(rides, { from, to, label, id, weightKg, seed, athleteId }) {
  const pool = rides.filter((r) => r.sport === "ride" && r.date >= from && r.date <= to && r.eftp);
  if (!pool.length) return null;
  const ref = Math.max(...pool.map((r) => r.eftp));
  const cp = ref / FTP_FROM_20MIN - CURVE_W_PRIME / 1200;
  const pmax = ref * CURVE_PMAX_FACTOR;
  const secs = [];
  const watts = [];
  const activityIds = [];
  for (const s of CURVE_SECS) {
    const long = pool.filter((r) => r.min * 60 >= s);
    if (!long.length) break;
    const best = long.reduce((a, b) => (b.if > a.if ? b : a));
    const decay = s > 3600 ? (3600 / s) ** 0.07 : 1;
    const jitter = between(rngFor(seed, athleteId, "curve", id, s), -0.015, 0.015);
    const raw = Math.round(Math.min(pmax, cp + CURVE_W_PRIME / s) * decay * (1 + jitter));
    secs.push(s);
    watts.push(Math.min(raw, watts.at(-1) ?? raw));
    activityIds.push(best.activityId);
  }
  return {
    id,
    label,
    start_date_local: `${from}T00:00:00`,
    end_date_local: `${to}T23:59:59`,
    days: CURVE_DAYS,
    weight: weightKg,
    secs,
    values: watts,
    watts,
    activity_id: activityIds,
    watts_per_kg: watts.map((w) => round(w / weightKg, 2)),
    wkg_activity_id: activityIds,
  };
}

/** Fiktive Vorhersage für die nächsten Tage — nie Koordinaten. */
function forecastFor(seed, athleteId, today) {
  const out = {};
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const date = addDaysISO(today, i);
    const w = fakeWeather(seed, `${athleteId}-forecast`, date);
    const month = Number(date.slice(5, 7));
    out[date] = {
      temp: w.temp,
      tempFeel: w.tempFeel,
      humidity: w.humidity,
      windSpeed: w.windSpeed,
      windDir: w.windDir,
      precipProb: w.precip > 0 ? 70 : Math.round(w.cloudCover / 5),
      weatherCode: w.weatherCode,
      uvMax: Math.max(1, Math.round(7 - Math.abs(month - 6.5) * 1.1)),
    };
  }
  return out;
}

/** Morgen-Check-in (1–5) aus HRV-Verhältnis + Krankheit. */
function wellbeingRow(w, athlete, sick, seed) {
  const rng = rngFor(seed, athlete.id, "wellbeing", w.date);
  const base = 3 + (w.hrv / athlete.hrvBase - 1) * 8 - (sick ? 1.5 : 0);
  const score = () => Math.min(5, Math.max(1, Math.round(base + between(rng, -0.7, 0.7))));
  return { date: w.date, energy: score(), muscle_feel: score(), mood: score(), note: null };
}

/** Zyklus, zu dem ein Datum gehört. */
const cycleOf = (cycles, date) => cycles.find((c) => c.start <= date && date <= c.raceDate);
const planRef = (sport, cycleStart) => `plan-${sport}-${cycleStart}`;
const eventRef = (raceDate) => `race-${raceDate}`;

/** Rennen je Zyklus — vergangene mit Ergebnis aus den Renn-Aktivitäten. */
function eventRows(cycles, ridesByDate, today) {
  return cycles.map((c) => {
    const legs = c.raceDate < today ? (ridesByDate.get(c.raceDate) ?? []) : [];
    const rideLeg = legs.find((r) => r.sport === "ride");
    return {
      _ref: eventRef(c.raceDate),
      title: c.raceName,
      event_date: c.raceDate,
      type: "race",
      priority: c.priority,
      ftp_goal: null,
      is_test: false,
      note: null,
      result_time_s: legs.length ? legs.reduce((s, r) => s + r.min * 60, 0) : null,
      result_avg_watts: rideLeg?.watt ?? null,
      result_place_ag: null,
      result_place_overall: null,
    };
  });
}

/** Ein Plan je Zyklus und Sportart; aktiv ist der Zyklus von heute (Q2 A). */
function trainingPlanRows(cycles, today) {
  const current = cycleOf(cycles, today);
  return cycles.flatMap((c) =>
    c.plans.map((p) => ({
      _ref: planRef(p.sport, c.start),
      _goalEventRef: eventRef(c.raceDate),
      is_active: c === current,
      mode: p.input.mode,
      start_date: p.input.startDate,
      end_date: p.endDate,
      weeks: p.weeks,
      model: p.input.model,
      focus: p.input.focus,
      level: p.input.level,
      training_weekdays: p.weekModel[0]?.trainingWeekdays ?? p.input.trainingWeekdays,
      weekly_hours: p.input.weeklyHours,
      indoor_share: p.input.indoorShare,
      ftp_at_creation: p.input.currentFtp,
      ftp_target: p.ftpTarget,
      sport: p.sport,
      threshold_speed_at_creation: p.input.currentThresholdSpeed,
      threshold_speed_target: p.input.thresholdSpeedTarget,
      params: { form: null, history: null, warnings: p.warnings },
      week_model: p.weekModel,
    }))
  );
}

/** Plankarten aller Tage; ausgelassene vergangene Karten sind „ausgefallen". */
function planCardRows(timeline, today) {
  return timeline.days.flatMap((d) => {
    const cycle = cycleOf(timeline.cycles, d.date);
    const skipped = d.fulfilment === "skipped" && d.date < today;
    return d.planned.map((card, i) => ({
      _planRef: planRef(card.sport, cycle.start),
      planned_date: d.date,
      sort_order: i,
      title: card.name,
      workout_type: card.typ,
      tss_planned: card.tssPlanned,
      duration_min: card.durationMin,
      km: card.km,
      week: card.isoWeek,
      phase: card.phase,
      workout: card.workout,
      workout_structure: card.workoutStructure,
      sport: card.sport,
      status: skipped ? "ausgefallen" : "geplant",
      cancel_reason: skipped ? (d.isSick ? "Krank" : "Keine Zeit") : null,
    }));
  });
}

/** Supabase-Zeilen (V4) — ohne UUIDs, ohne Koordinaten, ohne Keys. */
function buildRows({ timeline, athlete, today, rides, wellness }) {
  const { cycles, seed } = timeline;
  const sickByDate = new Map(timeline.days.map((d) => [d.date, d.isSick]));
  const nextMain = cycles.find((c) => c.priority === "main" && c.raceDate >= today);
  return {
    training_plans: trainingPlanRows(cycles, today),
    plan_cards: planCardRows(timeline, today),
    wellbeing: wellness.map((w) => wellbeingRow(w, athlete, sickByDate.get(w.date) ?? false, seed)),
    events: eventRows(
      cycles,
      Map.groupBy(rides, (r) => r.date),
      today
    ),
    goals: [
      {
        kind: "FTP",
        target_value: Math.max(...athlete.ftpSeason) + FTP_GOAL_PLUS,
        target_date: nextMain?.raceDate ?? null,
        note: null,
        is_active: true,
      },
    ],
    ftp_history: timeline.ftpSteps.map((s) => ({
      ftp_watt: s.watts,
      valid_from: s.date,
      source: "ramp-test",
      note: null,
    })),
    athlete_sync_config: [{ interval_cadence_target: CADENCE_TARGET }],
  };
}

/** Aktivitäten um PMC- und Wellness-Felder des Tages ergänzen. */
function withDayFields(activities, pmc, wellnessByDate) {
  return activities.map((a) => {
    const p = pmc.get(a.date);
    const w = wellnessByDate.get(a.date);
    return {
      ...a,
      ctl: round(p.ctl, 1),
      atl: round(p.atl, 1),
      tsb: round(p.ctl - p.atl, 1),
      ruhepuls: w?.restingHR ?? null,
      hrv: w?.hrv ?? null,
      avgSleepingHR: w?.avgSleepingHR ?? null,
      sleepHours: w?.sleepHours ?? null,
    };
  });
}

/** Gesamtkurve (90 Tage) + die zwei Vergleichsblöcke (core/progress-indicators.js). */
function powerCurvesFor(rides, athlete, seed, today) {
  const args = { weightKg: athlete.weightKg, seed, athleteId: athlete.id };
  const curve90 = powerCurve(rides, {
    ...args,
    from: addDaysISO(today, -CURVE_DAYS),
    to: addDaysISO(today, -1),
    label: "90 Tage",
    id: "90d",
  });
  const blocks = [
    { key: RECENT_BLOCK_KEY, label: "Letzte 6 Wochen", from: addDaysISO(today, -42), to: today },
    {
      key: PREVIOUS_BLOCK_KEY,
      label: "6 Wochen davor",
      from: addDaysISO(today, -84),
      to: addDaysISO(today, -43),
    },
  ];
  const powerCurveBlocks = blocks.flatMap((b) => {
    const c = powerCurve(rides, { ...args, from: b.from, to: b.to, label: b.label, id: b.key });
    return c ? [{ ...b, curve: { list: [c], activities: {} } }] : [];
  });
  return { powerCurves: curve90 ? { list: [curve90], activities: {} } : null, powerCurveBlocks };
}

/**
 * @param {import("./timeline.js").DemoTimeline} timeline
 * @param {import("./roster.js").DemoAthlete} roster  Eintrag aus DEMO_ROSTER
 * @returns {{ json: object, rows: Record<string, object[]> }}
 */
export function buildDemoAthlete(timeline, roster) {
  if (timeline.athleteId !== roster.id)
    throw new Error("Zeitachse und Athlet passen nicht zusammen");
  const athlete = roster;
  const { seed } = timeline;
  const today = addDaysISO(timeline.windowStart, WINDOW_PAST_DAYS);

  const { activities, init } = applyRampGuard(
    buildActivities(timeline, athlete, today),
    athlete,
    timeline.windowStart,
    today
  );
  const tssByDate = tssPerDay(activities);
  const pmc = pmcByDay(tssByDate, timeline.windowStart, today, init);

  const wellness = buildWellness({ timeline, athlete, today, tssByDate, pmcByDate: pmc });
  const rides = withDayFields(activities, pmc, new Map(wellness.map((w) => [w.date, w])));
  const rows = buildRows({ timeline, athlete, today, rides, wellness });

  const plannedSessions = timeline.days
    .filter((d) => d.date >= today)
    .flatMap((d) =>
      d.planned.map((c) => ({
        date: d.date,
        name: c.name,
        typ: c.typ,
        week: c.isoWeek,
        phase: c.phase,
        details: `${c.durationMin} min · ${c.tssPlanned} TSS`,
        sport: c.sport,
      }))
    );
  const adjustments = Object.fromEntries(
    timeline.days
      .filter((d) => d.date < today && d.fulfilment === "skipped")
      .map((d) => [d.date, { cancelled: true, reason: d.isSick ? "Krank" : "Keine Zeit" }])
  );

  const json = {
    athleteName: athlete.displayName,
    ftpPublic: true,
    ftp: ftpAtDate(timeline.ftpSteps, today),
    ftpGoal: rows.goals[0].target_value,
    ftpHistory: timeline.ftpSteps.map((s) => ({
      id: `ramp-${s.date}`,
      ftpWatt: s.watts,
      validFrom: s.date,
      source: "ramp-test",
    })),
    ...(athlete.sports.length > 1
      ? { hrMax: athlete.hrMax, hrRest: athlete.hrRest, hrEstimated: false }
      : {}),
    rides,
    wellness,
    wellnessMeta: wellnessMetaFor(wellness),
    ...powerCurvesFor(rides, athlete, seed, today),
    athleteWeight: wellness.at(-1)?.weight ?? athlete.weightKg,
    plannedSessions,
    adjustments,
    forecast: forecastFor(seed, athlete.id, today),
    updated: `${today}T06:00:00.000Z`,
    source: "demo",
    count: rides.length,
  };

  return { json, rows };
}
