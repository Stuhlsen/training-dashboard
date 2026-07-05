/* ============================================================
   GENERATE-DATA.JS — Orchestrator für den Trainingsdaten-Sync
   Läuft in der GitHub Action (sync-data.yml) und lokal via
   `npm run sync`. Die eigentliche Logik liegt in scripts/lib/:

     env.js           .env/Secrets           log.js   Logging+Zähler
     http.js          fetch mit Retry        plan2.js Plan-2-Struktur
     notion.js        Plan 1 (Notion)        intervals.js  intervals.icu
     weather.js       Open-Meteo             map-activity.js  Mapping
     output.js        Dateien lesen/schreiben

   Ablauf: Plan 1 (Notion) → Wetter → Plan 2 (intervals.icu)
   → mergen/sortieren → rides.json → Athlet 2 → rides-2.json
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { PLAN2_SCHEDULE, PLANNED_SESSIONS, getPlan2Blocks } from "./lib/plan2.js";
import { queryNotionPlan1 } from "./lib/notion.js";
import { RIDE_TYPES, getIntervalsActivities, getIntervalsWellness, getIntervalsPowerCurves } from "./lib/intervals.js";
import { getHistoricalWeather, getRecentWeather, getPlanningForecast, buildWeatherMap, getWeatherForRide } from "./lib/weather.js";
import { mapActivity, mapActivity2 } from "./lib/map-activity.js";
import { mapWellnessList, latestWeight, logWellnessCoverage } from "./lib/wellness.js";
import { loadSubjective, loadAdjustments, writeOutput, OUT_FILE, OUT_FILE_2 } from "./lib/output.js";

requireEnv(["NOTION_KEY", "DB_ID"]);

const ATHLETE_2_NAME = "Athlet 2"; // Anzeigename — keine Klarnamen (Datenschutz)
const ATHLETE_2_FTP = 265;         // Fester Wert aus letztem Ramp-Test

async function main() {
  // 1. Plan 1: komplett aus Notion
  const plan1 = await queryNotionPlan1();

  // 2. Plan 2: intervals.icu + Notion subjektiv
  let plan2 = [];
  let wellnessList = [];
  let athleteWeight = null;
  let powerCurves = null;
  const powerCurveBlocks = [];

  // 2a. Wetter: Open-Meteo für gesamten Zeitraum (unabhängig von intervals.icu)
  const PLAN1_START = "2026-03-24";
  const PLAN1_FIRST_DATE = plan1.length > 0 ? plan1[0].date : PLAN1_START;
  const weatherEndDate = new Date();
  weatherEndDate.setDate(weatherEndDate.getDate() - 2); // Archive hat ~2 Tage Verzögerung
  const weatherEnd = weatherEndDate.toISOString().split("T")[0];
  const weatherData = await getHistoricalWeather(PLAN1_FIRST_DATE, weatherEnd);
  const weatherMap = buildWeatherMap(weatherData);
  // Forecast-API für die letzten 2 Tage (überbrückt Archive-Delay)
  const recentData = await getRecentWeather();
  const recentMap = buildWeatherMap(recentData);
  Object.assign(weatherMap, recentMap); // recentMap überschreibt ggf. ältere Archive-Werte

  // 2b. Plan 2: intervals.icu + Notion subjektiv
  if (ENV.INTERVALS_KEY && ENV.INTERVALS_ATHLETE) {
    const oldest = PLAN2_SCHEDULE[0].start;
    const today = new Date().toISOString().split("T")[0];
    const newest = today > "2026-09-20" ? "2026-09-20" : today;

    const activities = await getIntervalsActivities(oldest, newest, ENV.INTERVALS_KEY, ENV.INTERVALS_ATHLETE, RIDE_TYPES);
    const wellness = await getIntervalsWellness(PLAN1_START, newest);
    powerCurves = await getIntervalsPowerCurves(PLAN1_START, newest);

    // Power-Curve-Blockvergleich: eigene Kurve je Trainingsblock
    // (Plan 1 + Plan-2-Phasenblöcke, sobald begonnen — max. 4 Zusatz-Calls)
    for (const block of getPlan2Blocks(today)) {
      const curve = await getIntervalsPowerCurves(block.from, block.to);
      if (curve) powerCurveBlocks.push({ ...block, curve });
    }
    log.info(`✅ Power-Curve-Blöcke: ${powerCurveBlocks.length}`);
    const subjective = loadSubjective();
    const adjustments = loadAdjustments();
    log.info(`📋 subjective.json: ${Object.keys(subjective).length} Einträge`);
    log.info(`📋 adjustments.json: ${Object.keys(adjustments).length} Anpassungen`);

    plan2 = activities.map(act => mapActivity(act, wellness, subjective, weatherMap));
    log.info(`✅ Plan 2: ${plan2.length} Rides aus intervals.icu`);

    // Wellness-Einträge als eigenständige Liste (Schlaf-Chart, Readiness,
    // Regeneration & Körper) — Mapping zentral in lib/wellness.js
    wellnessList = mapWellnessList(wellness);
    // Letztes bekanntes Gewicht aus Wellness (Apple Health → intervals.icu)
    const latest = latestWeight(wellness);
    if (latest) {
      athleteWeight = latest.weight;
      log.info(`✅ Gewicht: ${athleteWeight} kg (Stand: ${latest.date})`);
    } else {
      log.warn("Kein Gewicht in Wellness-Daten gefunden");
    }

    log.info(`✅ Wellness: ${wellnessList.length} Tage mit Daten`);
    // Verifikationslauf: reale Feldabdeckung loggen (Basis für die
    // datengetriebene Sichtbarkeit der "Regeneration & Körper"-Sektion)
    logWellnessCoverage(wellnessList, "Athlet 1");
  } else {
    log.info("ℹ️  Kein intervals.icu Key — Plan 2 wird übersprungen");
  }

  // 3. Wetter: Open-Meteo für ALLE Fahrten (Plan 1 + Plan 2)
  // Plan 1 Rides bekommen nachträglich Wetter zugewiesen (Tageszeitfenster 09–17 Uhr)
  if (Object.keys(weatherMap).length > 0) {
    let weatherAdded = 0;
    for (const r of plan1) {
      if (!r.date) continue;
      const w = getWeatherForRide(weatherMap, r.date, 9, r.min || 120);
      if (w) {
        r.weather = w;
        r.wetter = `${w.temp}°C`;
        weatherAdded++;
      } else {
        // Fallback: Notion-Freitext wenn kein Open-Meteo-Wert
        r.wetter = r.notionWetter || null;
      }
      delete r.notionWetter;
    }
    log.info(`✅ Wetter: ${weatherAdded} Plan-1-Fahrten + ${plan2.filter(r => r.weather).length} Plan-2-Fahrten`);
  }

  // 4. Zusammenführen
  const rides = [...plan1, ...plan2];
  rides.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  rides.forEach((r, i) => {
    r.id = i + 1;
    if (r.date) {
      const [, m, d] = r.date.split("-");
      r.dateShort = `${d}.${m}`;
      r.dateISO = r.date;
    }
  });

  const plans = [...new Set(rides.map(r => r.plan))].filter(Boolean).sort();

  // Planungs-Forecast serverseitig laden (Standort bleibt im Secret, nie im Frontend)
  const planningForecast = await getPlanningForecast();

  const output = {
    rides,
    wellness: wellnessList,
    powerCurves: powerCurves || null,
    powerCurveBlocks,
    athleteWeight,
    plannedSessions: Object.entries(PLANNED_SESSIONS).map(([date, s]) => ({ date, ...s })),
    adjustments: loadAdjustments(),
    forecast: planningForecast || {},
    plans,
    updated: new Date().toISOString(),
    source: ENV.INTERVALS_KEY ? "notion+intervals" : "notion",
    count: rides.length,
  };

  writeOutput(OUT_FILE, output);

  log.info(`\n✅ ${rides.length} Fahrten → ${OUT_FILE}`);
  log.info(`   Pläne: ${plans.join(", ")}`);
  log.info(`   Zeitraum: ${rides[0]?.dateISO || "?"} bis ${rides[rides.length - 1]?.dateISO || "?"}`);
  log.info(`   Quelle: ${output.source}`);

  // 5. Zweiter Athlet (Vergleich, read-only, kein eigener Plan)
  if (ENV.INTERVALS_KEY_2 && ENV.INTERVALS_ATHLETE_2) {
    log.info(`\n🔄 Zweiter Athlet (${ATHLETE_2_NAME})...`);
    const oldest2 = "2026-01-01";
    const today2 = new Date().toISOString().split("T")[0];

    const activities2 = await getIntervalsActivities(oldest2, today2, ENV.INTERVALS_KEY_2, ENV.INTERVALS_ATHLETE_2, RIDE_TYPES);
    const wellness2 = await getIntervalsWellness(oldest2, today2, ENV.INTERVALS_KEY_2, ENV.INTERVALS_ATHLETE_2);
    const powerCurves2 = await getIntervalsPowerCurves(oldest2, today2, ENV.INTERVALS_KEY_2, ENV.INTERVALS_ATHLETE_2);

    // Eigener Standort für Athlet 2 (separates Secret) — kein Rückfall auf den Standort von Athlet 1
    const weatherData2 = await getHistoricalWeather(oldest2, weatherEnd, ENV.WEATHER_LAT_2, ENV.WEATHER_LON_2);
    const weatherMap2 = buildWeatherMap(weatherData2);
    const recentData2 = await getRecentWeather(ENV.WEATHER_LAT_2, ENV.WEATHER_LON_2);
    Object.assign(weatherMap2, buildWeatherMap(recentData2));

    // Feste FTP aus letztem Ramp-Test (ATHLETE_2_FTP), Fallback: Schätzung aus bestem NP ≥20min
    const longRides2 = activities2.filter(a => (a.moving_time || 0) >= 20 * 60 && a.icu_weighted_avg_watts);
    const bestNP2 = longRides2.length
      ? Math.max(...longRides2.map(a => a.icu_weighted_avg_watts))
      : null;
    const estimatedFTP2 = ATHLETE_2_FTP || (bestNP2 ? Math.round(bestNP2 * 0.95) : null);
    log.info(`   ... FTP (${ATHLETE_2_NAME}): ${estimatedFTP2}W ${ATHLETE_2_FTP ? "(Ramp-Test)" : `(geschätzt aus bestem NP ${bestNP2}W ≥20min)`}`);

    const rides2 = activities2
      .map(act => mapActivity2(act, wellness2, weatherMap2, estimatedFTP2))
      .sort((a, b) => a.date.localeCompare(b.date));

    const wellnessList2 = mapWellnessList(wellness2);
    logWellnessCoverage(wellnessList2, ATHLETE_2_NAME);

    const latest2 = latestWeight(wellness2);
    const athleteWeight2 = latest2 ? latest2.weight : null;

    const output2 = {
      athleteName: ATHLETE_2_NAME,
      ftp: estimatedFTP2,
      rides: rides2,
      wellness: wellnessList2,
      powerCurves: powerCurves2 || null,
      athleteWeight: athleteWeight2,
      updated: new Date().toISOString(),
      source: "intervals.icu",
      count: rides2.length,
    };

    writeOutput(OUT_FILE_2, output2);
    log.info(`✅ ${rides2.length} Fahrten (${ATHLETE_2_NAME}) → ${OUT_FILE_2}`);
  } else {
    log.info(`\n⏭️  Zweiter Athlet: kein API-Key gesetzt, übersprungen`);
  }

  log.summary();
  if (log.counts.errors > 0) process.exit(1);
}

main().catch(err => {
  log.error("Fehler:", err.message);
  process.exit(1);
});
