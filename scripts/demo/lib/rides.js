/* ============================================================
   DEMO/LIB/RIDES.JS — Demo-Einheiten aus der Zeitachse (Fahrplan 31 E2)
   Aus `planned` + `fulfilment` jedes vergangenen Tages entstehen
   Aktivitäten im Format der heutigen Sync-Ausgabe (Ride-Objekt, s.
   scripts/lib/map-activity.js::baseFields). Reiner Rechen-Code: kein I/O,
   kein Math.random(), kein Date.now().

   Stimmigkeit (fest, mit Tests in tests/demo-payload.test.js):
   - IF = NP ÷ FTP am Fahrttag, TSS = h × IF² × 100 (gerundet).
   - `typ` beim Rad über inferTypFromIF() — dieselben Grenzen wie der Sync.
   - Lauf/Schwimm: keine Leistung → IF über Tempo ÷ Schwellentempo,
     `typ` von der Plankarte (typSource "plan"), keine zoneTimes.
   - Wetter: rein fiktiv aus Jahresgang + Zufall, nie Koordinaten oder Orte.

   CTL/ATL/TSB und die Wellness-Felder setzt payload.js nachträglich.
   ============================================================ */

import { inferTypFromIF } from "../../lib/map-activity.js";
import { banisterTrimp } from "../../lib/core/trimp.js";
import { addDaysISO, diffDays } from "../../../app/src/core/format.js";
import { rngFor } from "./prng.js";

/** Session-IF (NP ÷ FTP) je Plan-Typ beim Rad — so gewählt, dass
 *  inferTypFromIF() bei passender Dauer wieder den Plan-Typ liefert. */
const RIDE_IF = {
  "Z1 Recovery": 0.58,
  "Z2 Dauer": 0.68,
  "Z2 Lang": 0.7,
  Tempo: 0.87,
  "Sweet Spot": 0.92,
  Schwelle: 0.99,
  VO2max: 1.07,
  "FTP-Test": 0.97,
};
const RIDE_IF_DEFAULT = 0.7;

/** Tempo-IF (Geschwindigkeit ÷ Schwellengeschwindigkeit) je Plan-Typ. */
const PACE_IF = {
  // Ø-Tempo der ganzen Einheit inkl. Ein-/Auslaufen und Pausen (E7)
  run: { Dauerlauf: 0.78, Longrun: 0.76, Tempolauf: 0.87, Intervalle: 0.88 },
  swim: { Longswim: 0.8, Technik: 0.7, Intervalle: 0.9 },
};
const PACE_IF_DEFAULT = 0.78;

/** Lauf: je länger, desto langsamer (E7) — Obergrenze der Tempo-IF über
 *  die Dauer, damit die Pace-Kurve von kurz nach lang abfällt. */
const runIfCap = (min) => 1.08 - 0.0025 * min;
/** „Härter gefahren" als Tempo-Zuschlag bei Lauf/Schwimm (Rad: 0,05). */
const PACE_HARDER_ADD = 0.02;

/** Renn-Aktivitäten am Renntag (Q3 A): Rad-Athlet eine, Triathlet drei. */
const RACE_LEGS = {
  ride: [{ sport: "ride", min: 150, if: 0.9 }],
  tri: [
    { sport: "swim", min: 28, if: 0.92 },
    { sport: "ride", min: 75, if: 0.86 },
    // Lauf nach dem Rad: langsamer als ein freier 10-km-Lauf (E7, Pace-Kurve)
    { sport: "run", min: 45, if: 0.9 },
  ],
};

/** Testtag je Zyklus (E7): ersetzt die erste Intervall-Einheit ab Woche 2.
 *  Liefert kurze, schnelle Efforts — sonst fällt die Pace-Kurve nicht von
 *  kurz nach lang ab und die CSS-Schätzung (Schwimm-Pace-Zonen) hat keine
 *  zwei Distanzen. Dauer so gewählt, dass die Strecke nach dem Runden auf
 *  0,1 km beim Lauf im 2-km-Block (3,5 km) und beim Schwimmen genau
 *  0,4/0,2 km ergibt. */
const TEST_EFFORTS = {
  // 15 min: kürzeste Dauer, die core/critical-speed.js beim Lauf zählt
  run: [{ name: "Testlauf 15 min", min: 15, if: 1.04 }],
  swim: [
    { name: "CSS-Test 400 m", min: 7, if: 1.0 },
    { name: "CSS-Test 200 m", min: 3, if: 1.04 },
  ],
};
const TEST_WEEK_OFFSET_DAYS = 7;

/** Grund-km/h beim Rad bei IF 0,6, plus Anstieg je IF-Punkt. */
const RIDE_KMH_BASE = 22;
const RIDE_KMH_PER_IF = 14;

/** Tage, über die eFTP einem FTP-Sprung hinterherläuft (Zeitkonstante). */
const EFTP_LAG_DAYS = 14;

const ZONE_IDS = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7"];
/** Wie scharf die Zeit um eine Zone gebündelt ist (größer = enger). */
const ZONE_DECAY = 2.4;
/** Arbeitsanteil einer Einheit in ihrer Zielzone, je Schwerpunkt-Zone
 *  (Index wie ZONE_IDS): Tempo/Sweet Spot, Schwelle, VO2max. */
const ZONE_WORK_SHARE = { 2: 0.4, 3: 0.3, 4: 0.2 };

/** @param {number} v @param {number} [digits] */
export const round = (v, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Gleichverteilt in [lo, hi) aus einem Zufallsstrom.
 *  @param {() => number} rng @param {number} lo @param {number} hi */
export const between = (rng, lo, hi) => lo + rng() * (hi - lo);

/**
 * TSS aus Dauer und IF — die Formel, die der Test prüft.
 * @param {number} min @param {number} ifVal @returns {number}
 */
export const tssFrom = (min, ifVal) => Math.round((min / 60) * ifVal * ifVal * 100);

/**
 * Gemessene FTP am Datum: letzte Stufe an oder vor `date`.
 * @param {Array<{date: string, watts: number}>} ftpSteps aufsteigend
 * @param {string} date
 * @returns {number|null}
 */
export function ftpAtDate(ftpSteps, date) {
  let watts = ftpSteps[0]?.watts ?? null;
  for (const s of ftpSteps) if (s.date <= date) watts = s.watts;
  return watts;
}

/**
 * eFTP am Datum — läuft jeder FTP-Stufe exponentiell hinterher, plus ±1 %
 * Tagesrauschen. Vor der ersten Stufe im Fenster gilt deren Wert.
 * @param {Array<{date: string, watts: number}>} ftpSteps
 * @param {string} date @param {string|number} seed @param {string} athleteId
 * @returns {number|null}
 */
export function eftpAt(ftpSteps, date, seed, athleteId) {
  if (!ftpSteps.length) return null;
  let prev = ftpSteps[0].watts;
  let cur = prev;
  let since = 0;
  for (let i = 0; i < ftpSteps.length && ftpSteps[i].date <= date; i++) {
    prev = i === 0 ? ftpSteps[0].watts : ftpSteps[i - 1].watts;
    cur = ftpSteps[i].watts;
    since = diffDays(date, ftpSteps[i].date);
  }
  const lagged = prev + (cur - prev) * (1 - Math.exp(-since / EFTP_LAG_DAYS));
  const noise = between(rngFor(seed, athleteId, "eftp", date), -0.01, 0.01);
  return Math.round(lagged * (1 + noise));
}

/**
 * Fiktives Wetter eines Tages — Jahresgang + Zufall, ohne jeden Ortsbezug.
 * Felder wie scripts/lib/weather.js::getWeatherForRide.
 * @param {string|number} seed @param {string} athleteId @param {string} date
 */
export function fakeWeather(seed, athleteId, date) {
  const rng = rngFor(seed, athleteId, "weather", date);
  const doy = diffDays(date, `${date.slice(0, 4)}-01-01`);
  const temp = round(10 - 9 * Math.cos((2 * Math.PI * (doy - 15)) / 365) + between(rng, -4, 4), 1);
  const windSpeed = round(between(rng, 4, 26), 1);
  const cloudCover = Math.round(between(rng, 0, 100));
  const rainy = rng() < 0.25;
  return {
    temp,
    tempFeel: round(temp - windSpeed / 10, 1),
    humidity: Math.round(between(rng, 50, 92)),
    windSpeed,
    windDir: Math.floor(between(rng, 0, 360)),
    precip: rainy ? round(between(rng, 0.2, 6), 1) : 0,
    cloudCover,
    weatherCode: rainy ? 61 : cloudCover > 80 ? 3 : cloudCover > 30 ? 2 : 0,
  };
}

/**
 * Zeit je Leistungszone ({id, secs}, wie intervals.icu) — Schwerpunkt aus
 * der IF, "SS" (Sweet-Spot-Anteil) als eigener, überlappender Eintrag.
 * @param {number} min @param {number} ifVal @param {() => number} rng
 */
function zoneTimesFor(min, ifVal, rng) {
  const total = min * 60;
  const center = ifVal < 0.75 ? 1 : ifVal < 0.9 ? 2 : ifVal < 1.05 ? 3 : 4;
  // E7: Eine harte Einheit liegt nur mit ihrem Arbeitsanteil in der
  // Zielzone — Ein-/Ausfahren und Pausen zählen als Grundlage (Z1/Z2).
  // Vorher lag die ganze Einheit um die Zielzone, der Grundlagenanteil
  // fiel in Wochen mit zwei harten Einheiten auf ~40 %.
  const workShare = ZONE_WORK_SHARE[center] ?? 0;
  const profile = (c) => {
    const w = ZONE_IDS.map(
      (_, z) => Math.exp(-ZONE_DECAY * Math.abs(z - c)) * between(rng, 0.8, 1.2)
    );
    const s = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / s);
  };
  const easy = profile(1);
  const work = workShare > 0 ? profile(center) : easy;
  const secs = easy.map((e, z) => Math.round((e * (1 - workShare) + work[z] * workShare) * total));
  secs[center] += total - secs.reduce((a, b) => a + b, 0);
  const ssShare = ifVal >= 0.85 && ifVal < 0.97 ? 0.35 : 0.05;
  return [
    ...ZONE_IDS.map((id, z) => ({ id, secs: secs[z] })),
    { id: "SS", secs: Math.round(total * ssShare) },
  ];
}

/** Startzeit: unter der Woche früh oder abends, am Wochenende vormittags.
 *  Weitere Einheiten am selben Tag starten je 90 min später. */
function startTimeFor(date, rng, index) {
  const dow = new Date(`${date}T00:00:00`).getDay();
  const hours = dow === 0 || dow === 6 ? [8, 9, 10] : [6, 17, 18];
  const total = hours[Math.floor(rng() * hours.length)] * 60 + index * 90;
  const hh = String(Math.min(23, Math.floor(total / 60))).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00`;
}

/** Dauer-Faktor und IF-Zuschlag je Erfüllung. */
function fulfilmentFactors(fulfilment, rng) {
  if (fulfilment === "shorter") return { dur: between(rng, 0.6, 0.8), ifAdd: 0 };
  if (fulfilment === "harder") return { dur: between(rng, 1, 1.05), ifAdd: 0.05 };
  return { dur: between(rng, 0.95, 1.05), ifAdd: 0 };
}

/**
 * Eine Aktivität aus Sportart, Dauer und IF.
 * @param {object} p
 * @param {import("./roster.js").DemoAthlete} p.athlete
 * @param {"ride"|"run"|"swim"} p.sport
 * @param {string} p.date @param {number} p.index  laufende Nr. am Tag
 * @param {number} p.min @param {number} p.ifVal
 * @param {string} p.name @param {string|null} p.typPlanned
 * @param {number|null} p.ftp @param {number|null} p.eftp
 * @param {object} p.weather @param {() => number} p.rng
 */
function activity(p) {
  const { athlete, sport, date, index, min, ifVal, name, typPlanned, ftp, eftp, weather, rng } = p;
  const isRide = sport === "ride";
  const plan = athlete.plans.find((sp) => sp.sport === sport);

  const np = isRide ? Math.round(ifVal * ftp) : null;
  const vi = isRide ? round(between(rng, 1.02, 1.08), 2) : null;
  const ifRounded = isRide ? round(np / ftp, 2) : round(ifVal, 2);
  const tss = tssFrom(min, ifRounded);

  const kmh = isRide
    ? round(RIDE_KMH_BASE + RIDE_KMH_PER_IF * (ifVal - 0.6) + between(rng, -2, 2), 1)
    : round((plan?.thresholdSpeed ?? 10) * ifVal, 1);
  const km = round(kmh * (min / 60), 1);
  const hoehe =
    sport === "swim" ? 0 : Math.round(km * between(rng, isRide ? 5 : 3, isRide ? 15 : 10));

  const hrr = Math.min(0.92, 0.25 + 0.5 * ifVal);
  const hf =
    Math.round(athlete.hrRest + (athlete.hrMax - athlete.hrRest) * hrr) -
    (sport === "swim" ? 10 : 0);
  const hfMax = Math.min(athlete.hrMax, hf + Math.round(between(rng, 12, 26)));

  const typ = isRide ? inferTypFromIF(np, min, ftp) : (typPlanned ?? "Außerplanmäßig");
  const weatherOut = sport === "swim" ? null : weather;

  return {
    name,
    week: null,
    phase: null,
    typ,
    typPlanned,
    typDetected: isRide ? typ : null,
    typDetection: isRide
      ? {
          type: typ,
          confidence: "mittel",
          signals: [{ label: "IF", value: ifRounded, note: "NP ÷ FTP am Fahrttag" }],
          rule: "if-band",
        }
      : null,
    typSource: isRide ? "detected" : "plan",
    dataSource: "intervals",
    sport,
    date,
    startTime: startTimeFor(date, rng, index),
    activityId: `demo-${athlete.id}-${date}-${index}`,
    km,
    min,
    kmh,
    watt: isRide ? Math.round(np / vi) : null,
    maxWatt: null,
    np,
    hf,
    hfMax,
    kad:
      sport === "swim" ? null : Math.round(isRide ? between(rng, 84, 93) : between(rng, 164, 179)),
    hoehe,
    hmProKm: km > 0 ? round(hoehe / km, 1) : null,
    tss,
    if: ifRounded,
    vi,
    trimp: banisterTrimp({
      durationMin: min,
      hrAvg: hf,
      hrRest: athlete.hrRest,
      hrMax: athlete.hrMax,
    }),
    ctl: null,
    atl: null,
    tsb: null,
    decoupling: sport !== "swim" && min >= 60 ? round(between(rng, 1, 6), 1) : null,
    dtl: tss,
    zoneTimes: isRide ? zoneTimesFor(min, ifVal, rng) : null,
    eftp: isRide ? eftp : null,
    rpe: Math.min(10, Math.max(1, Math.round(2 + ifVal * 6 + between(rng, -1, 1)))),
    feelIcu: Math.floor(between(rng, 2, 5)),
    weather: weatherOut,
    wetter: weatherOut ? `${weatherOut.temp}°C` : null,
    source: "demo",
    ruhepuls: null,
    hrv: null,
    avgSleepingHR: null,
    sleepHours: null,
    feel: null,
    notizen: null,
  };
}

/**
 * Aktivität um `factor` kürzen (0 < factor ≤ 1) — Dauer, Strecke, Höhe,
 * TSS, TRIMP und Zonenzeiten ziehen mit, IF/NP/Puls bleiben. Nutzt die
 * Rampen-Bremse in payload.js.
 * @param {object} a  Aktivität aus buildActivities()
 * @param {number} factor
 * @param {import("./roster.js").DemoAthlete} athlete
 */
export function shortenActivity(a, factor, athlete) {
  // Nie verlängern: kurze Testeinheiten (3 min) blieben sonst nicht kurz.
  const min = Math.min(a.min, Math.max(10, Math.round(a.min * factor)));
  const f = min / a.min;
  const km = round(a.km * f, 1);
  const hoehe = Math.round(a.hoehe * f);
  const tss = tssFrom(min, a.if);
  return {
    ...a,
    min,
    km,
    hoehe,
    hmProKm: km > 0 ? round(hoehe / km, 1) : null,
    tss,
    dtl: tss,
    trimp: banisterTrimp({
      durationMin: min,
      hrAvg: a.hf,
      hrRest: athlete.hrRest,
      hrMax: athlete.hrMax,
    }),
    decoupling: min >= 60 ? a.decoupling : null,
    zoneTimes: a.zoneTimes
      ? a.zoneTimes.map((z) => ({ ...z, secs: Math.round(z.secs * f) }))
      : null,
  };
}

/**
 * Testtage je Zyklus und Sportart (Lauf/Schwimm): erster gefahrener,
 * gesunder Tag ab Woche 2 mit einer Intervall-Karte dieser Sportart.
 * @param {import("./timeline.js").DemoTimeline} timeline
 * @returns {Set<string>} Schlüssel `${date}|${sport}`
 */
export function testDaysFor(timeline) {
  const keys = new Set();
  for (const c of timeline.cycles) {
    const from = addDaysISO(c.start, TEST_WEEK_OFFSET_DAYS);
    for (const sport of Object.keys(TEST_EFFORTS)) {
      const day = timeline.days.find(
        (d) =>
          d.date >= from &&
          d.date < c.raceDate &&
          !d.isSick &&
          d.fulfilment !== "skipped" &&
          d.fulfilment !== "rest" &&
          d.planned.some((p) => p.sport === sport && p.typ === "Intervalle")
      );
      if (day) keys.add(`${day.date}|${sport}`);
    }
  }
  return keys;
}

/**
 * Alle Aktivitäten der Zeitachse VOR `today` (heute ist noch nicht gefahren).
 * Renntage aus `cycles` bekommen die Renn-Aktivitäten (Q3 A).
 * @param {import("./timeline.js").DemoTimeline} timeline
 * @param {import("./roster.js").DemoAthlete} athlete
 * @param {string} today
 * @returns {Array<object>} aufsteigend nach startTime
 */
export function buildActivities(timeline, athlete, today) {
  const { seed, ftpSteps } = timeline;
  const races = new Map(timeline.cycles.map((c) => [c.raceDate, c]));
  const testDays = testDaysFor(timeline);
  const out = [];

  for (const day of timeline.days) {
    if (day.date >= today) break;
    const ctx = {
      athlete,
      date: day.date,
      ftp: ftpAtDate(ftpSteps, day.date),
      eftp: eftpAt(ftpSteps, day.date, seed, athlete.id),
      weather: fakeWeather(seed, athlete.id, day.date),
    };

    const race = races.get(day.date);
    if (race) {
      const legs = athlete.sports.length > 1 ? RACE_LEGS.tri : RACE_LEGS.ride;
      legs.forEach((leg, index) => {
        const rng = rngFor(seed, athlete.id, "race", day.date, index);
        out.push(
          activity({
            ...ctx,
            sport: leg.sport,
            index,
            min: Math.round(leg.min * between(rng, 0.95, 1.05)),
            ifVal: leg.if,
            name: race.raceName,
            typPlanned: null,
            rng,
          })
        );
      });
      continue;
    }

    if (day.fulfilment === "skipped" || day.fulfilment === "rest") continue;
    day.planned.forEach((card, index) => {
      const rng = rngFor(seed, athlete.id, "ride", day.date, index);
      if (card.typ === "Intervalle" && testDays.has(`${day.date}|${card.sport}`)) {
        TEST_EFFORTS[card.sport].forEach((t, j) => {
          const a = activity({
            ...ctx,
            sport: card.sport,
            index,
            min: t.min,
            ifVal: t.if,
            name: t.name,
            typPlanned: card.typ,
            rng,
          });
          out.push(j === 0 ? a : { ...a, activityId: `${a.activityId}-t${j}` });
        });
        return;
      }
      const f = fulfilmentFactors(day.fulfilment, rng);
      const isRide = card.sport === "ride";
      const base = isRide
        ? (RIDE_IF[card.typ] ?? RIDE_IF_DEFAULT)
        : (PACE_IF[card.sport]?.[card.typ] ?? PACE_IF_DEFAULT);
      const min = Math.max(15, Math.round(card.durationMin * f.dur));
      const add = isRide || f.ifAdd === 0 ? f.ifAdd : PACE_HARDER_ADD;
      const ifRaw = base + add + between(rng, -0.02, 0.02);
      out.push(
        activity({
          ...ctx,
          sport: card.sport,
          index,
          min,
          ifVal: card.sport === "run" ? Math.min(ifRaw, runIfCap(min)) : ifRaw,
          name: card.name,
          typPlanned: card.typ,
          rng,
        })
      );
    });
  }
  return out.sort((a, b) => a.startTime.localeCompare(b.startTime));
}
