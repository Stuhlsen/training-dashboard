/* ============================================================
   GENERATE-DATA.JS — Orchestrator für den Trainingsdaten-Sync
   Läuft in der GitHub Action (sync-data.yml) und lokal via
   `npm run sync`. Die eigentliche Logik liegt in scripts/lib/:

     env.js           .env/Secrets           log.js   Logging+Zähler
     http.js          fetch mit Retry        plan2.js Plan-2-Struktur (Athlet 1)
     plan1-history.js Plan 1 (eingefroren)   plan-athlete2.js Plan-Struktur (Athlet 2)
     weather.js       Open-Meteo             intervals.js  intervals.icu
     map-activity.js  Mapping                output.js  Dateien lesen/schreiben

   Ablauf: Plan 1 (eingefroren) → Wetter → Plan 2 (intervals.icu)
   → mergen/sortieren → rides.json → Athlet 2 → rides-2.json
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { PLAN2_SCHEDULE, PLANNED_SESSIONS, getPlan2Blocks, getRecentComparisonBlocks } from "./lib/plan2.js";
import { SECONDARY_ATHLETES } from "./lib/athletes.js";
import { loadSyncConfig } from "./lib/sync-config-fetch.js";
import { loadActiveTrainingPlan } from "./lib/training-plan-fetch.js";
import { loadPlan1History } from "./lib/plan1-history.js";
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
  loadIntervalBlocks,
  writeOutput,
  OUT_FILE,
  INTERVAL_BLOCKS_FILE,
} from "./lib/output.js";

// Seit Fahrplan 7 CRED3: der Sync liest intervals-Key/-ID + Standort je
// Athlet aus athlete_sync_config über EINEN Service-Role-Aufruf. Fehlt der
// Key, gibt es nichts zu syncen — harter Abbruch, kein stiller Fallback.
requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

// Athlet 2 + 4 (Anzeigename, feste FTP, Plan-Vorlage, …) sind seit Fahrplan 10
// E3 Einträge in scripts/lib/athletes.js — sie teilen sich den Rumpf
// syncSecondaryAthlete() unten. Athlet 1 behält seinen eigenen Pfad in main().

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

/**
 * Sync-Rumpf für einen Sekundär-Athleten (2 / 4 / … — nicht Athlet 1).
 * Alle athletenspezifischen Unterschiede kommen aus `entry`
 * (scripts/lib/athletes.js), nicht aus kopiertem Code. Erzeugt
 * `entry.outfile` mit `mapActivity2` + der Athlet-2/4-Output-Form
 * (`athleteName` + `...ftpPublic` + rides/wellness/…).
 *
 * `entry.requireCreds`: true (Athlet 2) → ohne intervals.icu-Key/-ID wird
 * der Athlet komplett übersprungen, keine Datei. false (Athlet 4) → die
 * Datei wird trotzdem geschrieben (nur Plan, keine Fahrten,
 * `source:"plan-only"`).
 *
 * @param {import("./lib/athletes.js").SecondaryAthlete} entry
 * @param {Map<string, object>} syncConfig  aus loadSyncConfig()
 * @param {{ today: string, weatherEnd: string, formatCatalog: Array<object>,
 *   intervalBlockCache: object }} ctx  geteilte Sync-Zustände aus main()
 */
async function syncSecondaryAthlete(entry, syncConfig, ctx) {
  const { today, weatherEnd, formatCatalog, intervalBlockCache } = ctx;
  const cfg = syncConfig.get(entry.slug);
  const creds =
    cfg && cfg.apiKey && cfg.athleteId ? { apiKey: cfg.apiKey, athleteId: cfg.athleteId } : null;

  if (!cfg || (entry.requireCreds && !creds)) {
    log.info(
      `\n⏭️  ${entry.label}: ${entry.requireCreds ? "keine (vollständige) Zeile" : "keine Zeile"} ` +
        `in athlete_sync_config, übersprungen`
    );
    return;
  }

  log.info(`\n🔄 ${entry.label} (${entry.name})...`);
  const svc = { profileId: cfg.profileId, serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY };

  // plan_cards + ftp_history + aktiver DB-Plan hängen an der profile_id
  // (service_role) — stehen also auch ohne eingetragenen intervals.icu-Key
  // bereit. Read nicht fatal (loadPlanCards/loadFtpHistory/
  // loadActiveTrainingPlan: [] bzw. null ohne Credentials/Treffer).
  const planCards = await loadPlanCards(svc, { fromDate: entry.oldest });
  const ftpHistory = await loadFtpHistory(svc);
  // Fahrplan 8 E8: aktiver, selbst gebauter training_plans-Eintrag →
  // plan_cards ist die alleinige Planquelle, die Code-Vorlage entfällt ({}).
  const activePlan = await loadActiveTrainingPlan(svc);
  if (activePlan) {
    log.info(
      `📅 ${entry.shortLabel}: aktiver Trainingsplan (${activePlan.id}) — ` +
        `Code-Vorlage ${entry.templateModule} wird übersprungen`
    );
  }

  const adjustments = entry.loadAdjustments();
  if (entry.adjustmentsLabel) {
    log.info(`📋 ${entry.adjustmentsLabel}: ${Object.keys(adjustments).length} Anpassungen`);
  }
  log.info(
    `📋 ${entry.shortLabel}: ${planCards.length} plan_cards · ${ftpHistory.length} FTP-Historie-Einträge`
  );

  // Merge PRO DATUM wie bei Athlet 1: statische Vorlage (+ adjustments) als
  // Basis, echte plan_cards überschreiben Datum für Datum. Bei aktivem
  // DB-Plan trägt die Vorlage nichts mehr bei ({} → buildEffectivePlanIndex
  // liefert {}).
  const planTemplate = activePlan ? {} : entry.buildTemplate(cfg, today);
  const plannedSessions = Object.entries(planTemplate).map(([date, s]) => ({ date, ...s }));
  const effectivePlan = {
    ...buildEffectivePlanIndex(planTemplate, adjustments),
    ...buildPlanCardTypeIndex(planCards),
  };

  let rides = [];
  let wellnessList = [];
  let athleteWeight = null;
  let powerCurves = null;
  let planningForecast = {};
  let effectiveFtp = entry.fixedFtp;

  if (creds) {
    const activities = await getIntervalsActivities(
      entry.oldest,
      today,
      creds.apiKey,
      creds.athleteId,
      RIDE_TYPES
    );
    const wellness = await getIntervalsWellness(entry.oldest, today, creds.apiKey, creds.athleteId);
    powerCurves = await getIntervalsPowerCurves(entry.oldest, today, creds.apiKey, creds.athleteId);

    // Eigener Standort aus athlete_sync_config — kein Rückfall auf Athlet 1
    const weatherData = await getHistoricalWeather(entry.oldest, weatherEnd, cfg.lat, cfg.lon);
    const weatherMap = buildWeatherMap(weatherData);
    Object.assign(weatherMap, buildWeatherMap(await getRecentWeather(cfg.lat, cfg.lon)));
    planningForecast = (await getPlanningForecast(cfg.lat, cfg.lon)) || {};

    // Feste FTP (Ramp-Test bzw. Default-Rechenwert). Nur wenn keine feste FTP
    // gesetzt ist, aus dem besten NP ≥20min schätzen — historischer
    // Athlet-2-Pfad, greift heute nicht (fixedFtp ist immer gesetzt).
    if (!effectiveFtp && entry.npFallbackFtp) {
      const longRides = activities.filter(
        (a) => (a.moving_time || 0) >= 20 * 60 && a.icu_weighted_avg_watts
      );
      const bestNP = longRides.length
        ? Math.max(...longRides.map((a) => a.icu_weighted_avg_watts))
        : null;
      effectiveFtp = bestNP ? Math.round(bestNP * 0.95) : null;
      if (entry.logFtp) {
        log.info(
          `   ... FTP (${entry.name}): ${effectiveFtp}W (geschätzt aus bestem NP ${bestNP}W ≥20min)`
        );
      }
    } else if (entry.logFtp) {
      log.info(`   ... FTP (${entry.name}): ${effectiveFtp}W (Ramp-Test)`);
    }

    // Blockerkennung, derselbe geteilte Cache wie bei Athlet 1.
    await updateIntervalBlockCache(activities, intervalBlockCache, {
      apiKey: creds.apiKey,
      ftpHistory,
      fallbackFtp: effectiveFtp,
    });

    // Reihenfolge bewusst wie `activities` (attachCompliance braucht den
    // Gleichlauf rides[i] <-> activities[i]) — Datumssortierung erst danach.
    rides = activities.map((act) =>
      mapActivity2(act, wellness, weatherMap, effectiveFtp, effectivePlan, ftpHistory, intervalBlockCache)
    );
    classifyCooldowns(rides, ftpHistory, effectiveFtp);
    logRpeFeelCoverage(rides, entry.name);

    const complianceCounts = attachCompliance(
      rides,
      activities,
      planCards,
      intervalBlockCache,
      ftpHistory,
      effectiveFtp,
      formatCatalog
    );
    log.info(
      `✅ Compliance (${entry.name}): ${complianceCounts.evaluated} Fahrten ausgewertet ` +
        `(🟢 ${complianceCounts.green} · 🟡 ${complianceCounts.yellow} · 🔴 ${complianceCounts.red}, ` +
        `${planCards.length} plan_cards geladen)`
    );

    rides.sort((a, b) => a.date.localeCompare(b.date));

    wellnessList = mapWellnessList(wellness);
    logWellnessCoverage(wellnessList, entry.name);
    const latest = latestWeight(wellness);
    athleteWeight = latest ? latest.weight : null;
  } else {
    log.info(
      `ℹ️  ${entry.name}: intervals.icu-Key noch nicht in Settings — nur Plan, keine Fahrten`
    );
  }

  // Öffentliche FTP-Felder (0025). Skalar-Fallback: die effektive FTP
  // (Athlet 2, damit `ftp` nicht auf null fällt) oder null (Athlet 4 —
  // `ftp` kommt allein aus ftp_history).
  const ftpPublicFields = publicFtpFields(
    ftpHistory,
    cfg?.ftpPublic ?? true,
    entry.publicFtpScalarFromEffective ? effectiveFtp : null,
    today
  );
  log.info(
    ftpPublicFields.ftpPublic
      ? `✅ FTP öffentlich (${entry.name}): ${ftpPublicFields.ftp ?? "–"}W · ` +
          `${ftpPublicFields.ftpHistory.length} Ramp-Test(s)`
      : `ℹ️  FTP öffentlich (${entry.name}): abgeschaltet — keine FTP-Werte in ${entry.ridesFileName}`
  );

  const output = {
    athleteName: entry.name,
    ...ftpPublicFields,
    rides,
    wellness: wellnessList,
    wellnessMeta: { lastUpdated: lastFieldDates(wellnessList, READINESS_FIELDS) },
    powerCurves: powerCurves || null,
    athleteWeight,
    plannedSessions,
    adjustments,
    forecast: planningForecast || {},
    updated: new Date().toISOString(),
    source: creds ? "intervals.icu" : "plan-only",
    count: rides.length,
  };

  writeOutput(entry.outfile, output);
  log.info(`✅ ${rides.length} Fahrten (${entry.name}) → ${entry.outfile}`);
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
  // rides.json still auf "nur Plan-1-Historie" zurückfallen (kein stiller
  // Fallback, s. Fahrplan 7 CRED3).
  if (!cfg1) {
    log.error(
      "athlete_sync_config: keine Zeile für Athlet 1 — rides.json würde nur die Plan-1-Historie enthalten. Abbruch."
    );
    process.exitCode = 1;
    return;
  }
  if (!cfg1.apiKey || !cfg1.athleteId) {
    log.warn(
      "athlete_sync_config: Athlet-1-Zeile ohne intervals_api_key/-athlete_id — rides.json diesmal nur mit der Plan-1-Historie"
    );
  }

  // Ride↔Format-Brücke (Auftrag "Ride↔Format-Brücke, Verdrahtung, echte
  // Sperre" Schritt 1) — athletenunabhängiger Katalog, öffentlich lesbar,
  // einmal geladen und an alle attachCompliance()-Aufrufe weitergereicht
  // (Athlet 1 unten, die Sekundär-Athleten über ctx).
  const formatCatalog = await loadSessionFormats();
  log.info(
    formatCatalog.length
      ? `✅ Formatkatalog (session_formats): ${formatCatalog.length} Einträge`
      : `ℹ️  Formatkatalog (session_formats): keine Einträge/Credentials — Ride↔Format-Brücke bleibt für diesen Lauf unbesetzt`
  );

  // 1. Plan 1: eingefrorene Historie (früher Notion-API, s. plan1-history.js)
  const plan1 = loadPlan1History();

  // 2. Plan 2: intervals.icu + subjective.json
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

  // 2b. Plan 2: intervals.icu + subjective.json
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
        // Fallback: eingefrorener Freitext (früher Notion) wenn kein Open-Meteo-Wert
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
    // "notion" bleibt als historisches Quellen-Label der Plan-1-Ära stehen
    // (eingefroren in plan1-history.js) — kein Live-Notion-Aufruf mehr.
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

  // 5. Sekundär-Athleten (2 + 4, künftig 3) — ein gemeinsamer Rumpf, je
  //    Athlet über die Felder in scripts/lib/athletes.js parametrisiert.
  //    Athlet 1 oben hat bewusst einen eigenen Pfad (Plan-1-Historie,
  //    Power-Curve-Blöcke, subjective.js/mapActivity, eigene Output-Form).
  const today = new Date().toISOString().split("T")[0];
  for (const entry of SECONDARY_ATHLETES) {
    await syncSecondaryAthlete(entry, syncConfig, {
      today,
      weatherEnd,
      formatCatalog,
      intervalBlockCache,
    });
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
