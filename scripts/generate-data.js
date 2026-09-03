/* ============================================================
   GENERATE-DATA.JS — Orchestrator für den Trainingsdaten-Sync
   Läuft in der GitHub Action (sync-data.yml) und lokal via
   `npm run sync`. Die eigentliche Logik liegt in scripts/lib/:

     env.js           .env/Secrets           log.js   Logging+Zähler
     http.js          fetch mit Retry        plan2.js Plan-2-Struktur (Athlet 1)
     notion.js        Plan 1 (Notion)        plan-athlete2.js Plan-Struktur (Athlet 2)
     weather.js       Open-Meteo             intervals.js  intervals.icu
     map-activity.js  Mapping                output.js  Dateien lesen/schreiben

   Ablauf: Plan 1 (Notion) → Wetter → Plan 2 (intervals.icu)
   → mergen/sortieren → rides.json → Athlet 2 → rides-2.json
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { PLAN2_SCHEDULE, PLANNED_SESSIONS, getPlan2Blocks, getRecentComparisonBlocks } from "./lib/plan2.js";
import { PLANNED_SESSIONS_ATHLETE2 } from "./lib/plan-athlete2.js";
import { shiftPlannedSessions4 } from "./lib/plan-athlete4.js";
import { loadSyncConfig } from "./lib/sync-config-fetch.js";
import { queryNotionPlan1 } from "./lib/notion.js";
import {
  RIDE_TYPES,
  getIntervalsActivities,
  getIntervalsWellness,
  getIntervalsPowerCurves,
} from "./lib/intervals.js";
import {
  getHistoricalWeather,
  getRecentWeather,
  getPlanningForecast,
  buildWeatherMap,
  getWeatherForRide,
} from "./lib/weather.js";
import {
  mapActivity,
  mapActivity2,
  buildEffectivePlanIndex,
  classifyCooldowns,
  logRpeFeelCoverage,
  DEFAULT_FTP,
} from "./lib/map-activity.js";
import { loadFtpHistory, ftpAt } from "./lib/ftp-history.js";
import { updateIntervalBlockCache } from "./lib/interval-blocks.js";
import { loadPlanCards, buildPlanCardTypeIndex } from "./lib/plan-cards-fetch.js";
import { attachCompliance } from "./lib/compliance.js";
import { loadSessionFormats } from "./lib/formats-fetch.js";
import {
  mapWellnessList,
  latestWeight,
  logWellnessCoverage,
  lastFieldDates,
} from "./lib/wellness.js";

// Readiness-Metriken (core/readiness.js), deren letztes Update-Datum je Sync
// mitgeschrieben wird — Basis für die Konfidenz-Einordnung im Frontend.
const READINESS_FIELDS = ["hrv", "restingHR", "sleepHours"];
import {
  loadSubjective,
  loadAdjustments,
  loadAdjustments2,
  loadIntervalBlocks,
  writeOutput,
  OUT_FILE,
  OUT_FILE_2,
  OUT_FILE_4,
  INTERVAL_BLOCKS_FILE,
} from "./lib/output.js";

requireEnv(["NOTION_KEY", "DB_ID"]);
// Seit Fahrplan 7 CRED3: der Sync liest intervals-Key/-ID + Standort je
// Athlet aus athlete_sync_config über EINEN Service-Role-Aufruf. Fehlt der
// Key, gibt es nichts zu syncen — harter Abbruch, kein stiller Fallback.
requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const ATHLETE_2_NAME = "hc_diZee"; // Anzeigename (Pseudonym) — keine Klarnamen (Datenschutz)
const ATHLETE_2_FTP = 265; // Fester Wert aus letztem Ramp-Test
const ATHLETE_4_NAME = "bentastiic"; // Anzeigename (Pseudonym) — muss exakt profiles.display_name entsprechen

/**
 * Öffentliche FTP-Felder fürs rides*.json-Payload (Aufgabe "FTP-Anzeige im
 * Hero für alle gleich", Migration 0025 `profiles.ftp_public`). Bei
 * `ftpPublic === false` wird NUR das Flag geschrieben — das Frontend blendet
 * die FTP-Widgets (Leistungsskala, Ringe, Zeitstrahl) für Besucher dann
 * komplett aus. Bei `true`: aktuelle gemessene FTP (letzter Ramp-Test ≤ heute,
 * sonst `scalarFallback`) + die Ramp-Test-Historie mit je eigenem Datum.
 * @param {Array<{ftpWatt:number, validFrom:string, source:string}>} ftpHistory
 * @param {boolean} ftpPublic
 * @param {number|null} scalarFallback  Fallback für das skalare `ftp`-Feld
 *   (Athlet 2: geschätzte FTP; Athlet 1/4: null)
 * @param {string} todayISO
 */
function publicFtpFields(ftpHistory, ftpPublic, scalarFallback, todayISO) {
  if (!ftpPublic) return { ftpPublic: false };
  const rampTests = (ftpHistory || []).filter((h) => h.source === "ramp-test");
  const current = ftpAt(rampTests, todayISO, scalarFallback);
  return {
    ftpPublic: true,
    ftp: current.ftpWatt ?? null,
    // Synthetische, stabile id aus validFrom (pro Profil eindeutig, DB 0009) —
    // keine echten ftp_history-UUIDs und kein `note`-Freitext im öffentlichen
    // Payload.
    ftpHistory: rampTests.map((h) => ({
      id: `ramp-${h.validFrom}`,
      ftpWatt: h.ftpWatt,
      validFrom: h.validFrom,
      source: "ramp-test",
    })),
  };
}

async function main() {
  // Blockerkennung-Cache (scripts/lib/interval-blocks.js) — einmal geladen,
  // von beiden Athleten ergänzt, einmal am Ende geschrieben. Bereits
  // gecachte Aktivitäten werden nicht erneut abgerufen (unveränderlich).
  const intervalBlockCache = loadIntervalBlocks();

  // Alle Sync-Zugangsdaten je Athlet aus athlete_sync_config (Migration
  // 0023) — EIN Service-Role-Aufruf statt Login pro Athlet. Wirft bei
  // fehlendem Key / HTTP-Fehler (fatal, s. sync-config-fetch.js) → der
  // catch von main() bricht ab, bevor ein writeOutput() lief.
  const syncConfig = await loadSyncConfig();
  const cfg1 = syncConfig.get("athlete1");

  // Athlet 1 ist der Primärathlet — eine fehlende Zeile ist eine
  // Fehlkonfiguration, kein gültiger Zustand (anders als bei Athlet 2/4, die
  // legitim nicht eingerichtet sein können). Ohne diesen harten Abbruch würde
  // rides.json still auf "nur Notion-Plan 1" zurückfallen (kein stiller
  // Fallback, s. Fahrplan 7 CRED3).
  if (!cfg1) {
    log.error(
      "athlete_sync_config: keine Zeile für Athlet 1 — rides.json würde nur den Notion-Plan enthalten. Abbruch."
    );
    process.exitCode = 1;
    return;
  }
  if (!cfg1.apiKey || !cfg1.athleteId) {
    log.warn(
      "athlete_sync_config: Athlet-1-Zeile ohne intervals_api_key/-athlete_id — rides.json diesmal nur mit Notion-Plan 1"
    );
  }
  const cfg2 = syncConfig.get("athlete2");

  // Ride↔Format-Brücke (Auftrag "Ride↔Format-Brücke, Verdrahtung, echte
  // Sperre" Schritt 1) — athletenunabhängiger Katalog, öffentlich lesbar,
  // einmal für beide Athleten geladen (beide attachCompliance()-Aufrufe
  // unten liegen in getrennten if-Blöcken, s. dort).
  const formatCatalog = await loadSessionFormats();
  log.info(
    formatCatalog.length
      ? `✅ Formatkatalog (session_formats): ${formatCatalog.length} Einträge`
      : `ℹ️  Formatkatalog (session_formats): keine Einträge/Credentials — Ride↔Format-Brücke bleibt für diesen Lauf unbesetzt`
  );

  // 1. Plan 1: komplett aus Notion
  const plan1 = await queryNotionPlan1();

  // 2. Plan 2: intervals.icu + Notion subjektiv
  let plan2 = [];
  let wellnessList = [];
  let athleteWeight = null;
  let powerCurves = null;
  const powerCurveBlocks = [];
  // Öffentliche FTP-Felder (0025) — im intervals-Block unten aus der geladenen
  // ftp_history befüllt; ohne intervals-Key bleibt es beim reinen Flag.
  let ftpPublicFields1 = { ftpPublic: cfg1?.ftpPublic ?? true };

  // 2a. Wetter: Open-Meteo für gesamten Zeitraum (unabhängig von intervals.icu)
  const PLAN1_START = "2026-03-24";
  const PLAN1_FIRST_DATE = plan1.length > 0 ? plan1[0].date : PLAN1_START;
  const weatherEndDate = new Date();
  weatherEndDate.setDate(weatherEndDate.getDate() - 2); // Archive hat ~2 Tage Verzögerung
  const weatherEnd = weatherEndDate.toISOString().split("T")[0];
  const weatherData = await getHistoricalWeather(PLAN1_FIRST_DATE, weatherEnd, cfg1?.lat, cfg1?.lon);
  const weatherMap = buildWeatherMap(weatherData);
  // Forecast-API für die letzten 2 Tage (überbrückt Archive-Delay)
  const recentData = await getRecentWeather(cfg1?.lat, cfg1?.lon);
  const recentMap = buildWeatherMap(recentData);
  Object.assign(weatherMap, recentMap); // recentMap überschreibt ggf. ältere Archive-Werte

  // 2b. Plan 2: intervals.icu + Notion subjektiv
  if (cfg1?.apiKey && cfg1?.athleteId) {
    const oldest = PLAN2_SCHEDULE[0].start;
    const today = new Date().toISOString().split("T")[0];
    const newest = today > "2026-09-20" ? "2026-09-20" : today;

    const activities = await getIntervalsActivities(
      oldest,
      newest,
      cfg1.apiKey,
      cfg1.athleteId,
      RIDE_TYPES
    );
    const wellness = await getIntervalsWellness(PLAN1_START, newest, cfg1.apiKey, cfg1.athleteId);
    powerCurves = await getIntervalsPowerCurves(PLAN1_START, newest, cfg1.apiKey, cfg1.athleteId);

    // Power-Curve-Blockvergleich: eigene Kurve je Trainingsblock
    // (Plan 1 + Plan-2-Phasenblöcke, sobald begonnen — max. 4 Zusatz-Calls).
    // `curves=r.<von>.<bis>` ist zwingend: ohne diesen Range-Spezifizierer
    // ignoriert intervals.icu `oldest` und liefert das "1y"-Preset ab
    // `newest` — dann wäre jeder Block praktisch identisch zur Gesamtkurve.
    for (const block of getPlan2Blocks(today)) {
      const curve = await getIntervalsPowerCurves(
        block.from,
        block.to,
        cfg1.apiKey,
        cfg1.athleteId,
        `r.${block.from}.${block.to}`
      );
      if (curve) powerCurveBlocks.push({ ...block, curve });
    }

    // F1 (docs/konzept-progressionssteuerung.md): zwei zusätzliche,
    // rollierende 6-Wochen-Blöcke für den Bestwerte-Vergleich (5min/20min)
    // im Trainer-Briefing, unabhängig von den Plan-Phasenblöcken oben —
    // gleiches `curves=r.<von>.<bis>`-Erfordernis, gleiche Fetch-Logik.
    for (const block of getRecentComparisonBlocks(today)) {
      const curve = await getIntervalsPowerCurves(
        block.from,
        block.to,
        cfg1.apiKey,
        cfg1.athleteId,
        `r.${block.from}.${block.to}`
      );
      if (curve) powerCurveBlocks.push({ ...block, curve });
    }
    log.info(`✅ Power-Curve-Blöcke: ${powerCurveBlocks.length}`);
    const subjective = loadSubjective();
    const adjustments = loadAdjustments();
    log.info(`📋 subjective.json: ${Object.keys(subjective).length} Einträge`);
    log.info(`📋 adjustments.json: ${Object.keys(adjustments).length} Anpassungen`);

    // Zeitpunktbezogene FTP-Historie (Migration 0009) — einmal für den
    // ganzen Lauf laden, ftpAt() löst sie pro Fahrt gegen deren Datum auf
    // (map-activity.js). Ohne SUPABASE_*-Secrets liefert loadFtpHistory()
    // [] (kein Fehler) -> ftpAt() fällt für jede Fahrt auf DEFAULT_FTP
    // zurück, exakt das bisherige Verhalten.
    const ftpHistory = await loadFtpHistory({
      profileId: cfg1.profileId,
      serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    log.info(
      ftpHistory.length
        ? `✅ FTP-Historie: ${ftpHistory.length} Einträge (${ftpHistory.map((h) => `${h.ftpWatt}W ab ${h.validFrom}`).join(", ")})`
        : `ℹ️  FTP-Historie: keine Einträge/Credentials — Fallback auf DEFAULT_FTP (${DEFAULT_FTP}W) für alle Fahrten`
    );

    // Öffentliche FTP-Felder (0025): gemessene FTP + Ramp-Test-Zeitstrahl,
    // nur wenn der Athlet sie freigegeben hat. Skalar-Fallback null — für
    // Athlet 1 deckt config.ts::ftpMeasured die Planungs-/Analyse-Sicht ab.
    ftpPublicFields1 = publicFtpFields(ftpHistory, cfg1?.ftpPublic ?? true, null, today);
    log.info(
      ftpPublicFields1.ftpPublic
        ? `✅ FTP öffentlich: ${ftpPublicFields1.ftp ?? "–"}W · ${ftpPublicFields1.ftpHistory.length} Ramp-Test(s) im Payload`
        : `ℹ️  FTP öffentlich: abgeschaltet (profiles.ftp_public=false) — keine FTP-Werte in rides.json`
    );

    // Blockerkennung (Fetch/Cache-Zwischenschritt, v2-Ist-Typerkennung) —
    // ?intervals=true pro (noch nicht gecachter) Aktivität, throttled.
    // Nutzt dieselbe ftpHistory wie oben für die Schwelle je Fahrtdatum.
    await updateIntervalBlockCache(activities, intervalBlockCache, {
      apiKey: cfg1.apiKey,
      ftpHistory,
      fallbackFtp: DEFAULT_FTP,
    });

    // plan_cards (Supabase) sind seit der Migration weg von adjustments.json
    // (scripts/migrate-plan-to-supabase.js) die einzige Stelle, die einen
    // Kartentausch/eine Verschiebung im Planungstab kennt — adjustments.json
    // wird von keinem Schreibpfad mehr aktualisiert. Ohne SUPABASE_*-
    // Credentials liefert loadPlanCards() [] (kein Fehler, s. dort).
    // Zusammenführung PRO DATUM (nicht alles-oder-nichts): die alte
    // statische Plan+adjustments.json-Kombination bleibt die Basis, echte
    // plan_cards überschreiben sie Datum für Datum. Ohne diesen Merge würde
    // ein Datum, das (noch) keine Zeile in plan_cards hat — z. B. weil
    // plan2.js nach der einmaligen Migration weiterentwickelt wurde, ohne
    // dass die neuen Tage manuell nachgetragen wurden — komplett ohne
    // Plan-Typ dastehen, statt auf den statischen Fallback auszuweichen.
    const planCards = await loadPlanCards(
      { profileId: cfg1.profileId, serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY },
      { fromDate: oldest }
    );
    const effectivePlan = {
      ...buildEffectivePlanIndex(PLANNED_SESSIONS, adjustments),
      ...buildPlanCardTypeIndex(planCards),
    };
    plan2 = activities.map((act) =>
      mapActivity(act, wellness, subjective, weatherMap, effectivePlan, ftpHistory, intervalBlockCache)
    );
    // Ausrollen nach einem harten Workout (gleicher Tag, kurz, deutlich
    // niedrigere Leistung) erbt sonst dieselbe Tages-Plankarte — analog zum
    // Fix für Athlet 2 weiter unten.
    classifyCooldowns(plan2, ftpHistory, DEFAULT_FTP);
    log.info(`✅ Plan 2: ${plan2.length} Rides aus intervals.icu`);
    logRpeFeelCoverage(plan2, "Athlet 1");

    // Soll-Ist-Matching + Compliance-Ampel (Progressionssteuerung C1/C2) —
    // nutzt dieselben planCards wie effectivePlan oben (kein zweiter Fetch).
    const complianceCounts = attachCompliance(plan2, activities, planCards, intervalBlockCache, ftpHistory, DEFAULT_FTP, formatCatalog);
    log.info(
      `✅ Compliance (Athlet 1): ${complianceCounts.evaluated} Fahrten ausgewertet ` +
        `(🟢 ${complianceCounts.green} · 🟡 ${complianceCounts.yellow} · 🔴 ${complianceCounts.red}, ` +
        `${planCards.length} plan_cards geladen)`
    );

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
    log.info(
      `✅ Wetter: ${weatherAdded} Plan-1-Fahrten + ${plan2.filter((r) => r.weather).length} Plan-2-Fahrten`
    );
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

  const dataSources = [...new Set(rides.map((r) => r.dataSource))].filter(Boolean).sort();

  // Planungs-Forecast serverseitig laden (Standort aus athlete_sync_config,
  // nie im Frontend, nie in rides.json)
  const planningForecast = await getPlanningForecast(cfg1?.lat, cfg1?.lon);

  const output = {
    rides,
    wellness: wellnessList,
    wellnessMeta: { lastUpdated: lastFieldDates(wellnessList, READINESS_FIELDS) },
    powerCurves: powerCurves || null,
    powerCurveBlocks,
    athleteWeight,
    ...ftpPublicFields1,
    plannedSessions: Object.entries(PLANNED_SESSIONS).map(([date, s]) => ({ date, ...s })),
    adjustments: loadAdjustments(),
    forecast: planningForecast || {},
    dataSources,
    updated: new Date().toISOString(),
    source: cfg1?.apiKey ? "notion+intervals" : "notion",
    count: rides.length,
  };

  writeOutput(OUT_FILE, output);

  log.info(`\n✅ ${rides.length} Fahrten → ${OUT_FILE}`);
  log.info(`   Datenquellen: ${dataSources.join(", ")}`);
  log.info(
    `   Zeitraum: ${rides[0]?.dateISO || "?"} bis ${rides[rides.length - 1]?.dateISO || "?"}`
  );
  log.info(`   Quelle: ${output.source}`);

  // 5. Zweiter Athlet (Vergleichsathlet, read-only — hat aber seit GFNY
  //    Bremen 2026 einen eigenen Planungstab, s. plannedSessions unten)
  if (cfg2?.apiKey && cfg2?.athleteId) {
    log.info(`\n🔄 Zweiter Athlet (${ATHLETE_2_NAME})...`);
    const oldest2 = "2026-01-01";
    const today2 = new Date().toISOString().split("T")[0];

    const activities2 = await getIntervalsActivities(
      oldest2,
      today2,
      cfg2.apiKey,
      cfg2.athleteId,
      RIDE_TYPES
    );
    const wellness2 = await getIntervalsWellness(oldest2, today2, cfg2.apiKey, cfg2.athleteId);
    const powerCurves2 = await getIntervalsPowerCurves(oldest2, today2, cfg2.apiKey, cfg2.athleteId);

    // Eigener Standort für Athlet 2 aus athlete_sync_config — kein Rückfall auf den Standort von Athlet 1
    const weatherData2 = await getHistoricalWeather(oldest2, weatherEnd, cfg2.lat, cfg2.lon);
    const weatherMap2 = buildWeatherMap(weatherData2);
    const recentData2 = await getRecentWeather(cfg2.lat, cfg2.lon);
    Object.assign(weatherMap2, buildWeatherMap(recentData2));

    // Feste FTP aus letztem Ramp-Test (ATHLETE_2_FTP), Fallback: Schätzung aus bestem NP ≥20min
    const longRides2 = activities2.filter(
      (a) => (a.moving_time || 0) >= 20 * 60 && a.icu_weighted_avg_watts
    );
    const bestNP2 = longRides2.length
      ? Math.max(...longRides2.map((a) => a.icu_weighted_avg_watts))
      : null;
    const estimatedFTP2 = ATHLETE_2_FTP || (bestNP2 ? Math.round(bestNP2 * 0.95) : null);
    log.info(
      `   ... FTP (${ATHLETE_2_NAME}): ${estimatedFTP2}W ${ATHLETE_2_FTP ? "(Ramp-Test)" : `(geschätzt aus bestem NP ${bestNP2}W ≥20min)`}`
    );

    const adjustments2 = loadAdjustments2();
    log.info(`📋 adjustments-2.json: ${Object.keys(adjustments2).length} Anpassungen`);
    // planCards2 hier laden (statt erst bei der Compliance weiter unten) —
    // effectivePlan2 braucht den echten, aktuellen Kartenstand für einen
    // Tausch/eine Verschiebung im (read-only) Planungstab von Athlet 2,
    // analog zu planCards/effectivePlan bei Athlet 1 oben (Merge pro Datum,
    // s. dortiger Kommentar — kein alles-oder-nichts-Fallback).
    const planCards2 = await loadPlanCards(
      { profileId: cfg2.profileId, serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY },
      { fromDate: oldest2 }
    );
    const effectivePlan2 = {
      ...buildEffectivePlanIndex(PLANNED_SESSIONS_ATHLETE2, adjustments2),
      ...buildPlanCardTypeIndex(planCards2),
    };

    // Kein Sonderfall für Athlet 2: dieselbe generische ftpAt()-Auflösung
    // wie bei Athlet 1. Pflegt Athlet 2 keine ftp_history (vermutlich der
    // Fall, kein Ramp-Test-Konzept in derselben Form), liefert
    // loadFtpHistory() [] und ftpAt() fällt auf estimatedFTP2 zurück —
    // exakt das bisherige Verhalten, ohne athletenspezifischen Code.
    const ftpHistory2 = await loadFtpHistory({
      profileId: cfg2.profileId,
      serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    log.info(
      ftpHistory2.length
        ? `✅ FTP-Historie (${ATHLETE_2_NAME}): ${ftpHistory2.length} Einträge`
        : `ℹ️  FTP-Historie (${ATHLETE_2_NAME}): keine Einträge/Credentials — Fallback auf ${estimatedFTP2}W für alle Fahrten`
    );

    // Blockerkennung, derselbe geteilte Cache wie bei Athlet 1 (s. dort).
    await updateIntervalBlockCache(activities2, intervalBlockCache, {
      apiKey: cfg2.apiKey,
      ftpHistory: ftpHistory2,
      fallbackFtp: estimatedFTP2,
    });

    // Reihenfolge bewusst identisch zu activities2 (noch NICHT nach Datum
    // sortiert) — attachCompliance() unten braucht den Gleichlauf
    // rides2[i] <-> activities2[i], um die intervals.icu-Activity-ID je
    // Fahrt aufzulösen (die im gemappten Ride-Objekt selbst nicht mehr
    // vorkommt). Die Datumssortierung fürs Frontend passiert erst danach.
    const rides2 = activities2.map((act) =>
      mapActivity2(act, wellness2, weatherMap2, estimatedFTP2, effectivePlan2, ftpHistory2, intervalBlockCache)
    );
    // Ausrollen nach einem Rennen (gleicher Tag, kurz, deutlich niedrigere
    // Leistung) erbt sonst die Renn-Plankarte des Tages — hier korrigiert.
    classifyCooldowns(rides2, ftpHistory2, estimatedFTP2);
    logRpeFeelCoverage(rides2, ATHLETE_2_NAME);

    // Soll-Ist-Matching + Compliance-Ampel (s. Athlet 1 oben) — MUSS vor der
    // folgenden Datumssortierung laufen (Gleichlauf rides2[i] <-> activities2[i]).
    // Nutzt dieselben planCards2 wie effectivePlan2 oben (kein zweiter Fetch).
    const complianceCounts2 = attachCompliance(
      rides2,
      activities2,
      planCards2,
      intervalBlockCache,
      ftpHistory2,
      estimatedFTP2,
      formatCatalog
    );
    log.info(
      `✅ Compliance (${ATHLETE_2_NAME}): ${complianceCounts2.evaluated} Fahrten ausgewertet ` +
        `(🟢 ${complianceCounts2.green} · 🟡 ${complianceCounts2.yellow} · 🔴 ${complianceCounts2.red}, ` +
        `${planCards2.length} plan_cards geladen)`
    );

    rides2.sort((a, b) => a.date.localeCompare(b.date));

    const wellnessList2 = mapWellnessList(wellness2);
    logWellnessCoverage(wellnessList2, ATHLETE_2_NAME);

    const latest2 = latestWeight(wellness2);
    const athleteWeight2 = latest2 ? latest2.weight : null;

    // Eigener Standort für Athlet 2 (athlete_sync_config, s. weatherData2 oben)
    // — kein Rückfall auf den Forecast von Athlet 1.
    const planningForecast2 = await getPlanningForecast(cfg2.lat, cfg2.lon);

    // Öffentliche FTP-Felder (0025) — Skalar-Fallback estimatedFTP2, damit
    // `ftp` für Athlet 2 nicht auf null zurückfällt, wenn keine ramp-test-
    // Historie gepflegt ist. Ersetzt das frühere feste `ftp: estimatedFTP2`.
    const ftpPublicFields2 = publicFtpFields(
      ftpHistory2,
      cfg2?.ftpPublic ?? true,
      estimatedFTP2,
      today2
    );
    log.info(
      ftpPublicFields2.ftpPublic
        ? `✅ FTP öffentlich (${ATHLETE_2_NAME}): ${ftpPublicFields2.ftp ?? "–"}W · ${ftpPublicFields2.ftpHistory.length} Ramp-Test(s)`
        : `ℹ️  FTP öffentlich (${ATHLETE_2_NAME}): abgeschaltet — keine FTP-Werte in rides-2.json`
    );

    const output2 = {
      athleteName: ATHLETE_2_NAME,
      ...ftpPublicFields2,
      rides: rides2,
      wellness: wellnessList2,
      wellnessMeta: { lastUpdated: lastFieldDates(wellnessList2, READINESS_FIELDS) },
      powerCurves: powerCurves2 || null,
      athleteWeight: athleteWeight2,
      plannedSessions: Object.entries(PLANNED_SESSIONS_ATHLETE2).map(([date, s]) => ({
        date,
        ...s,
      })),
      adjustments: adjustments2,
      forecast: planningForecast2 || {},
      updated: new Date().toISOString(),
      source: "intervals.icu",
      count: rides2.length,
    };

    writeOutput(OUT_FILE_2, output2);
    log.info(`✅ ${rides2.length} Fahrten (${ATHLETE_2_NAME}) → ${OUT_FILE_2}`);
  } else {
    log.info(`\n⏭️  Zweiter Athlet: keine (vollständige) Zeile in athlete_sync_config, übersprungen`);
  }

  // 6. Vierter Athlet (Bentastiic, Einsteiger — volles Modell wie Athlet 1
  //    [Login, Befinden, editierbare plan_cards], aber Lesedaten-Pipeline
  //    wie Athlet 2 [intervals.icu + Supabase, kein Notion]).
  //    Seit Fahrplan 7 CRED3: intervals.icu-Key/-Athlete-ID + Standort kommen
  //    aus athlete_sync_config (self-service in Settings). Fehlt die Zeile,
  //    wird der Block übersprungen; fehlt nur der intervals-Key in der Zeile,
  //    wird rides-4.json trotzdem geschrieben — nur der Plan, keine Fahrten.
  //    WATTLOS: kein Ramp-Test → output4.ftp = null; DEFAULT_FTP dient hier
  //    nur als reiner Rechen-Fallback für die Ist-Typerkennung.
  const cfg4 = syncConfig.get("athlete4");
  const today4 = new Date().toISOString().split("T")[0];
  // profiles.plan_offset_weeks (Migration 0026): Athlet 4 kann seinen Plan im
  // Planungstab um N ganze Wochen verschieben. Die Vorlage (Datum + Baseline
  // für Compliance/Hero) wandert hier mit — aber NUR ab heute, genau wie der
  // Schreibpfad im Frontend (planShiftPatches verschiebt nur künftige, nicht
  // ausgefallene Karten). Die editierten plan_cards sind beim Verschieben
  // schon einmalig umdatiert worden (useShiftPlan).
  const planTemplate4 = shiftPlannedSessions4(cfg4?.planOffsetWeeks ?? 0, today4);
  const plannedSessions4 = Object.entries(planTemplate4).map(([date, s]) => ({
    date,
    ...s,
  }));
  if (cfg4) {
    log.info(`\n🔄 Vierter Athlet (${ATHLETE_4_NAME})...`);
    const svc4 = { profileId: cfg4.profileId, serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY };
    const oldest4 = "2026-08-01"; // kurz vor Planstart (KW36, 2026-08-31)
    // today4 ist oben (vor dem shiftPlannedSessions4-Aufruf) deklariert.

    const creds4 =
      cfg4.apiKey && cfg4.athleteId ? { apiKey: cfg4.apiKey, athleteId: cfg4.athleteId } : null;

    // plan_cards + ftp_history hängen an der profile_id (service_role), nicht
    // an creds4 — auch ohne eingetragenen intervals.icu-Key stehen sie bereit.
    const planCards4 = await loadPlanCards(svc4, { fromDate: oldest4 });
    const ftpHistory4 = await loadFtpHistory(svc4);
    const effectivePlan4 = {
      ...buildEffectivePlanIndex(planTemplate4, {}),
      ...buildPlanCardTypeIndex(planCards4),
    };
    log.info(
      `📋 Athlet 4: ${planCards4.length} plan_cards · ${ftpHistory4.length} FTP-Historie-Einträge`
    );

    let rides4 = [];
    let wellnessList4 = [];
    let athleteWeight4 = null;
    let powerCurves4 = null;
    let planningForecast4 = {};

    if (creds4) {
      const activities4 = await getIntervalsActivities(
        oldest4,
        today4,
        creds4.apiKey,
        creds4.athleteId,
        RIDE_TYPES
      );
      const wellness4 = await getIntervalsWellness(
        oldest4,
        today4,
        creds4.apiKey,
        creds4.athleteId
      );
      powerCurves4 = await getIntervalsPowerCurves(
        oldest4,
        today4,
        creds4.apiKey,
        creds4.athleteId
      );

      // Eigener Standort aus athlete_sync_config — kein Rückfall auf Athlet 1/2
      const weatherData4 = await getHistoricalWeather(oldest4, weatherEnd, cfg4.lat, cfg4.lon);
      const weatherMap4 = buildWeatherMap(weatherData4);
      const recentData4 = await getRecentWeather(cfg4.lat, cfg4.lon);
      Object.assign(weatherMap4, buildWeatherMap(recentData4));
      planningForecast4 = (await getPlanningForecast(cfg4.lat, cfg4.lon)) || {};

      // Blockerkennung, derselbe geteilte Cache wie bei Athlet 1/2.
      await updateIntervalBlockCache(activities4, intervalBlockCache, {
        apiKey: creds4.apiKey,
        ftpHistory: ftpHistory4,
        fallbackFtp: DEFAULT_FTP,
      });

      // Reihenfolge bewusst wie activities4 (attachCompliance braucht den
      // Gleichlauf rides4[i] <-> activities4[i]) — Datumssortierung danach.
      rides4 = activities4.map((act) =>
        mapActivity2(act, wellness4, weatherMap4, DEFAULT_FTP, effectivePlan4, ftpHistory4, intervalBlockCache)
      );
      classifyCooldowns(rides4, ftpHistory4, DEFAULT_FTP);
      logRpeFeelCoverage(rides4, ATHLETE_4_NAME);

      const complianceCounts4 = attachCompliance(
        rides4,
        activities4,
        planCards4,
        intervalBlockCache,
        ftpHistory4,
        DEFAULT_FTP,
        formatCatalog
      );
      log.info(
        `✅ Compliance (${ATHLETE_4_NAME}): ${complianceCounts4.evaluated} Fahrten ausgewertet ` +
          `(🟢 ${complianceCounts4.green} · 🟡 ${complianceCounts4.yellow} · 🔴 ${complianceCounts4.red})`
      );

      rides4.sort((a, b) => a.date.localeCompare(b.date));

      wellnessList4 = mapWellnessList(wellness4);
      logWellnessCoverage(wellnessList4, ATHLETE_4_NAME);
      const latest4 = latestWeight(wellness4);
      athleteWeight4 = latest4 ? latest4.weight : null;
    } else {
      log.info(
        `ℹ️  ${ATHLETE_4_NAME}: intervals.icu-Key noch nicht in Settings — nur Plan, keine Fahrten`
      );
    }

    // Öffentliche FTP-Felder (0025) — Athlet 4 hat (noch) keine ramp-test-
    // Historie: `ftp` bleibt null, `ftpHistory` leer, bis der 20-Min-Test
    // (plan-athlete4.js KW47) einen Eintrag anlegt. Dann leuchtet es
    // automatisch, ohne Code-Änderung.
    const ftpPublicFields4 = publicFtpFields(ftpHistory4, cfg4?.ftpPublic ?? true, null, today4);

    const output4 = {
      athleteName: ATHLETE_4_NAME,
      ...ftpPublicFields4,
      rides: rides4,
      wellness: wellnessList4,
      wellnessMeta: { lastUpdated: lastFieldDates(wellnessList4, READINESS_FIELDS) },
      powerCurves: powerCurves4 || null,
      athleteWeight: athleteWeight4,
      plannedSessions: plannedSessions4,
      adjustments: {}, // volles Modell: Verschiebungen leben in plan_cards
      forecast: planningForecast4,
      updated: new Date().toISOString(),
      source: creds4 ? "intervals.icu" : "plan-only",
      count: rides4.length,
    };

    writeOutput(OUT_FILE_4, output4);
    log.info(`✅ ${rides4.length} Fahrten (${ATHLETE_4_NAME}) → ${OUT_FILE_4}`);
  } else {
    log.info(`\n⏭️  Vierter Athlet: keine Zeile in athlete_sync_config, übersprungen`);
  }

  writeOutput(INTERVAL_BLOCKS_FILE, intervalBlockCache);
  log.info(`✅ ${Object.keys(intervalBlockCache).length} Aktivitäten im Blockerkennung-Cache → ${INTERVAL_BLOCKS_FILE}`);

  log.summary();
  if (log.counts.errors > 0) process.exit(1);
}

main().catch((err) => {
  log.error("Fehler:", err.message);
  // process.exitCode statt process.exit(1): ein hartes exit() mitten in einem
  // noch offenen fetch()/undici-Socket lässt libuv auf Windows mit einer
  // Assertion abbrechen (exit 127 statt 1). So läuft der Event-Loop leer und
  // Node beendet sauber mit Code 1 — es lief ohnehin kein writeOutput().
  process.exitCode = 1;
});
