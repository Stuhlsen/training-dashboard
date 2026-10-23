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
   → mergen/sortieren → Tabellen → Athlet 2 → Tabellen → …

   Fahrplan 26 E2/E5: Jeder Account läuft einzeln mit Zeitlimit und eigener
   Fehlerisolation (runAccount). Die Ergebnisse gehen für ALLE Accounts per
   Upsert in die Tabellen training_* (persistTraining) — Dateien rides*.json
   gibt es nicht mehr. Accounts ohne eigenes Sync-Verhalten kommen aus
   athlete_sync_config (listGenericAccounts).
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import {
  PLAN2_SCHEDULE,
  PLANNED_SESSIONS,
  getPlan2Blocks,
  getRecentComparisonBlocks,
} from "./lib/plan2.js";
import { PROFILE_SYNC_ENTRIES, listGenericAccounts } from "./lib/athletes.js";
import { runAccount, accountTimeoutMs, logTimings } from "./lib/account-runner.js";
import { saveTrainingData } from "./lib/training-store.js";
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
  normalizeSport,
  DEFAULT_FTP,
} from "./lib/map-activity.js";
import { loadFtpHistory, ftpAt } from "./lib/ftp-history.js";
import { loadFtpGoal } from "./lib/goals.js";
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
  INTERVAL_BLOCKS_FILE,
} from "./lib/output.js";

// Seit Fahrplan 7 CRED3: der Sync liest intervals-Key/-ID + Standort je
// Athlet aus athlete_sync_config über EINEN Service-Role-Aufruf. Fehlt der
// Key, gibt es nichts zu syncen — harter Abbruch, kein stiller Fallback.
requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

// Athlet 2 + 4 (Anzeigename, feste FTP, Plan-Vorlage, …) sind seit Fahrplan 10
// E3 Einträge in scripts/lib/athletes.js — sie teilen sich den Rumpf
// syncSyncEntry() unten. Athlet 1 behält seinen eigenen Pfad in main().

// Fahrplan 10 E6 (Q6): NP-basierte FTP-Notschätzung (npFallbackFtp) über ein
// hohes Perzentil statt Math.max — ein einzelner kaputter Power-Datenpunkt
// zog Athlet 3 im E4-Verifikations-Sync auf 425 W (bestes NP 447 W). Bei
// wenigen Fahrten liegt P95 nahe am Max; der echte Fix ist ein per Settings
// eingetragener FTP-Wert.
const NP_FTP_PERCENTILE = 0.95;

/** Nearest-Rank-Perzentil einer nicht-leeren Zahlenliste (0 < p ≤ 1). */
function percentile(nums, p) {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
}

/**
 * Öffentliche FTP-Felder fürs Trainingsdaten-Payload (Aufgabe "FTP-Anzeige im
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
 * @param {number|null} [ftpGoal]  aktuelles FTP-Ziel aus `goals` (scripts/lib/goals.js);
 *   folgt dem `ftpPublic`-Schalter, `null` = keins gesetzt (Frontend nimmt dann
 *   den config.ts-Wert)
 */
function publicFtpFields(ftpHistory, ftpPublic, scalarFallback, todayISO, ftpGoal = null) {
  if (!ftpPublic) return { ftpPublic: false };
  const rampTests = (ftpHistory || []).filter((h) => h.source === "ramp-test");
  const current = ftpAt(rampTests, todayISO, scalarFallback);
  return {
    ftpPublic: true,
    ftp: current.ftpWatt ?? null,
    ftpGoal,
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

/** Open-Meteo-Archiv hat ~2 Tage Verzögerung — letzter abrufbarer Tag (ISO). */
function weatherEndISO() {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return d.toISOString().split("T")[0];
}

/**
 * Ergebnis eines Accounts per Upsert in die Tabellen schreiben (Fahrplan 26 E2).
 * Fehler werden geloggt (Result-Format), nicht geworfen — die Dateien der
 * Bestandsathleten sind zu diesem Zeitpunkt schon geschrieben.
 * @param {string} label  Log-Label (Slug / gekürzte Profil-ID)
 * @param {string|null|undefined} profileId  fehlt bei athlete_key-Zeilen ohne Login
 * @param {object} payload  das Payload-Objekt (Form wie früher rides*.json)
 * @param {{ rides?: {from: string, to: string}|null, wellness?: {from: string, to: string}|null }} window
 *   bei intervals.icu geladener Zeitraum — nur darin wird gelöscht
 * @param {AbortSignal} [signal]
 */
async function persistTraining(label, profileId, payload, window, signal) {
  if (!profileId) {
    log.info(`ℹ️  ${label}: keine profile_id (athlete_key-Zeile) — Tabellen übersprungen`);
    return;
  }
  const res = await saveTrainingData({
    url: ENV.SUPABASE_URL,
    serviceKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    profileId,
    payload,
    window,
    signal,
  });
  if (!res.ok) {
    log.error(`${label}: Tabellen schreiben fehlgeschlagen — ${res.error.code}: ${res.error.message}`);
    return;
  }
  const c = res.counts;
  const skipped = c.skipped.rides + c.skipped.wellness;
  log.info(
    `✅ ${label}: Tabellen — ${c.rides} Fahrten (−${c.deletedRides}), ${c.wellness} Wellness-Tage ` +
      `(−${c.deletedWellness})${skipped ? ` · übersprungen: ${c.skipped.rides}+${c.skipped.wellness}` : ""}`
  );
}

/**
 * Sync-Rumpf für jeden Account außer Athlet 1.
 * Alle athletenspezifischen Unterschiede kommen aus `entry`
 * (scripts/lib/athletes.js), nicht aus kopiertem Code. Erzeugt
 * `mapActivity2` + der Athlet-2/4-Output-Form
 * (`athleteName` + `...ftpPublic` + rides/wellness/…).
 *
 * `entry.requireCreds`: true (Athlet 2) → ohne intervals.icu-Key/-ID wird
 * der Athlet komplett übersprungen (nichts wird geschrieben). false (Athlet 4) → der Plan
 * wird trotzdem geschrieben (nur Plan, keine Fahrten,
 * `source:"plan-only"`).
 *
 * @param {import("./lib/athletes.js").SecondaryAthlete} entry
 * @param {object|undefined} cfg  Zeile aus loadSyncConfig() (fehlt → übersprungen)
 * @param {{ today: string, weatherEnd: string, formatCatalog: Array<object>,
 *   intervalBlockCache: object, signal?: AbortSignal }} ctx  geteilte Sync-Zustände aus main()
 */
async function syncSecondaryAthlete(entry, cfg, ctx) {
  const { today, weatherEnd, formatCatalog, intervalBlockCache, signal } = ctx;
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
        (entry.templateModule
          ? `Code-Vorlage ${entry.templateModule} wird übersprungen`
          : `keine Code-Vorlage`)
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
  // Fahrplan 12 E7: gehoben, damit sie im output-Objekt unten (außerhalb
  // dieses Blocks) sichtbar sind — bleiben für 1/2/4 (kein `creds`-Zweig
  // bzw. kein activityTypes) auf null/false.
  let hrMax = null;
  let hrRest = null;
  let hrEstimated = false;

  if (creds) {
    const activities = await getIntervalsActivities(
      entry.oldest,
      today,
      creds.apiKey,
      creds.athleteId,
      // Fahrplan 10 E6: nur Athlet 3 (Triathlet) zieht zusätzlich Lauf/Schwimm;
      // 1/2/4 haben kein activityTypes → exakt RIDE_TYPES wie vor E6.
      entry.activityTypes ?? RIDE_TYPES
    );
    const wellness = await getIntervalsWellness(entry.oldest, today, creds.apiKey, creds.athleteId);
    powerCurves = await getIntervalsPowerCurves(entry.oldest, today, creds.apiKey, creds.athleteId);

    // Eigener Standort aus athlete_sync_config — kein Rückfall auf Athlet 1
    const weatherData = await getHistoricalWeather(entry.oldest, weatherEnd, cfg.lat, cfg.lon);
    const weatherMap = buildWeatherMap(weatherData);
    Object.assign(weatherMap, buildWeatherMap(await getRecentWeather(cfg.lat, cfg.lon)));
    planningForecast = (await getPlanningForecast(cfg.lat, cfg.lon)) || {};

    // FTP-Grundlage für die IF-/Ist-Typerkennung:
    //  - `fixedFtp` gesetzt (Athlet 2: Ramp-Test 265W · Athlet 4: DEFAULT_FTP)
    //    → direkt nutzen.
    //  - `fixedFtp: null` + `npFallbackFtp` (Athlet 3, Triathlet ohne Ramp-Test)
    //    → aus dem besten NP ≥20min schätzen. Ohne solche Efforts bleibt
    //    `effectiveFtp` null; downstream fällt die Typerkennung dann auf
    //    "Außerplanmäßig" zurück (map-activity.js::inferTypFromIF, `!np || !ftp`).
    //    Ein echter/getesteter FTP wird später über Settings gepflegt.
    if (!effectiveFtp && entry.npFallbackFtp) {
      // Nur Rad-Aktivitäten (die FTP-Notschätzung ist ein Rad-Wert) mit
      // ≥20min-Power-Effort. P95 statt Math.max (Q6) — ein einzelner kaputter
      // Datenpunkt vergiftet sonst die Schätzung (E4: Athlet 3 → 425 W).
      const longRideNPs = activities
        .filter(
          (a) =>
            RIDE_TYPES.includes(a.type) &&
            (a.moving_time || 0) >= 20 * 60 &&
            a.icu_weighted_avg_watts
        )
        .map((a) => a.icu_weighted_avg_watts);
      const bestNP = longRideNPs.length ? percentile(longRideNPs, NP_FTP_PERCENTILE) : null;
      effectiveFtp = bestNP ? Math.round(bestNP * 0.95) : null;
      if (entry.logFtp) {
        log.info(
          bestNP
            ? `   ... FTP (${entry.name}): ${effectiveFtp}W (geschätzt aus NP-P95 ${Math.round(bestNP)}W ≥20min, n=${longRideNPs.length})`
            : `   ... FTP (${entry.name}): noch offen — keine ≥20min-Power-Efforts`
        );
      }
    } else if (entry.logFtp) {
      log.info(`   ... FTP (${entry.name}): ${effectiveFtp}W (Ramp-Test)`);
    }

    // Fahrplan 10 E6-Nachtrag: HF-Grenzen für den Multi-Sport-TRIMP. Ein
    // explizit gepflegter Profilwert (cfg.hrMax = Tanaka aus profiles.birthdate,
    // cfg.hrRest = profiles.resting_hr) gewinnt immer. Fehlt einer, aber der
    // Athlet hat HF-Trainingsdaten, wird er aus den Daten GESCHÄTZT — gleiches
    // Prinzip wie die NP-FTP-Notschätzung (Q6): lieber ein markiert-geschätzter
    // Wert als gar keine Lauf-/Schwimm-Last. Nur für Multi-Sport-Athleten
    // (entry.activityTypes gesetzt) — für 1/2/4 wird hrMax/hrRest ohnehin nie
    // genutzt (alle Zeilen sport:"ride"), der Block bleibt für sie stumm.
    hrMax = cfg.hrMax;
    hrRest = cfg.hrRest;
    if (entry.activityTypes) {
      // G13: in Phase 2 gibt es keinen gemessenen/config.ts-Literal-Weg —
      // auch cfg.hrMax (Tanaka aus profiles.birthdate) ist bereits eine
      // Altersschätzung, kein Messwert. Immer true, sobald dieser Zweig
      // läuft (Multi-Sport-Athlet).
      hrEstimated = true;
      if (hrMax == null) {
        // P98 der pro-Aktivität max_heartrate — robust gegen einen Sensor-Spike
        // (wie das NP-P95). max_heartrate ist bei trainierten Athleten ein
        // brauchbarer HFmax-Proxy, oft besser als eine Altersformel.
        const maxHrs = activities.map((a) => a.max_heartrate).filter((v) => v > 0);
        hrMax = maxHrs.length ? Math.round(percentile(maxHrs, 0.98)) : null;
        if (hrMax != null) {
          log.info(
            `   ... HFmax (${entry.name}): ${hrMax} bpm (geschätzt — P98 aus ${maxHrs.length} Aktivitäten, kein Profilwert)`
          );
        }
      }
      if (hrRest == null) {
        // Median der Wellness-Ruhepulse (Tageswerte, schon sauber); sonst der
        // niedrigste avgSleepingHR.
        const restHrs = Object.values(wellness)
          .map((w) => w.restingHR)
          .filter((v) => v > 0);
        if (restHrs.length) {
          hrRest = Math.round(percentile(restHrs, 0.5));
        } else {
          const sleepHrs = Object.values(wellness)
            .map((w) => w.avgSleepingHR)
            .filter((v) => v > 0);
          hrRest = sleepHrs.length ? Math.min(...sleepHrs) : null;
        }
        if (hrRest != null) {
          log.info(
            `   ... Ruhe-HF (${entry.name}): ${hrRest} bpm (geschätzt aus Wellness, kein Profilwert)`
          );
        }
      }
    }

    // Fahrplan 10 E6: für einen Triathleten kommen jetzt auch Lauf-/Schwimm-
    // Aktivitäten herein. Die radspezifische Nachbearbeitung (Blockerkennung,
    // Ein-/Ausrollen, Compliance-Match) läuft nur auf dem Rad-Subset —
    // `isRideActivity` ist die EINZIGE Klassifikationsstelle dafür und spiegelt
    // bewusst cyclingSportOf() aus map-activity.js (das ride.sport setzt):
    // alles außer eindeutig Lauf/Schwimm zählt als Rad, generische Typen wie
    // "Workout"/EBikeRide bleiben Rad wie vor E6. Für 1/2/4 (Fetch nur
    // RIDE_TYPES) ist das Subset == activities → 0 Verhaltensänderung.
    const isRideActivity = (a) => {
      const s = normalizeSport(a.type);
      return s !== "run" && s !== "swim";
    };
    const cyclingActivities = activities.filter(isRideActivity);

    // Blockerkennung, derselbe geteilte Cache wie bei Athlet 1 — nur Rad.
    await updateIntervalBlockCache(cyclingActivities, intervalBlockCache, {
      apiKey: creds.apiKey,
      ftpHistory,
      fallbackFtp: effectiveFtp,
    });

    // Reihenfolge bewusst wie `activities` (attachCompliance braucht den
    // Gleichlauf cyclingRides[i] <-> cyclingActs[i]) — Datumssortierung erst
    // danach. hrMax/hrRest (Migration 0035 bzw. oben aus den Daten geschätzt)
    // speisen den Multi-Sport-TRIMP-Pfad in mapActivity2 für Nicht-Rad-Zeilen.
    rides = activities.map((act) =>
      mapActivity2(
        act,
        wellness,
        weatherMap,
        effectiveFtp,
        effectivePlan,
        ftpHistory,
        intervalBlockCache,
        {
          hrMax,
          hrRest,
        }
      )
    );

    // Gezipptes Rad-Subset aus DEMSELBEN Prädikat wie oben (rides[i] gehört zu
    // activities[i]). Die Objektreferenzen bleiben in `rides`, die Nicht-Rad-
    // Zeilen laufen unverändert durch (TRIMP schon in mapActivity2 gesetzt).
    const cyclingRides = [];
    const cyclingActs = [];
    activities.forEach((a, i) => {
      if (isRideActivity(a)) {
        cyclingRides.push(rides[i]);
        cyclingActs.push(a);
      }
    });

    classifyCooldowns(cyclingRides, ftpHistory, effectiveFtp);
    logRpeFeelCoverage(cyclingRides, entry.name);

    const complianceCounts = attachCompliance(
      cyclingRides,
      cyclingActs,
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

    // Fahrplan 10 E6: Multi-Sport-TRIMP-Abdeckung je Sync melden (Muster
    // logWellnessCoverage) — eine Nicht-Rad-Zeile ohne TRIMP heißt fehlendes
    // HRavg/hrMax/hrRest (profiles.birthdate/resting_hr).
    const nonRideRides = rides.filter((r) => r.sport !== "ride");
    if (nonRideRides.length) {
      const withTrimp = nonRideRides.filter((r) => r.trimp != null).length;
      log.info(
        `   📊 Multi-Sport-TRIMP (${entry.name}): ${withTrimp}/${nonRideRides.length} Nicht-Rad-Zeilen mit TRIMP`
      );
      if (withTrimp < nonRideRides.length) {
        log.warn(
          `   ${nonRideRides.length - withTrimp} Nicht-Rad-Zeile(n) ohne TRIMP (${entry.name}) — ` +
            `HRavg/hrMax/hrRest prüfen (profiles.birthdate/resting_hr)`
        );
      }
    }

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
    today,
    (cfg?.ftpPublic ?? true) ? await loadFtpGoal(svc) : null
  );
  log.info(
    ftpPublicFields.ftpPublic
      ? `✅ FTP öffentlich (${entry.name}): ${ftpPublicFields.ftp ?? "–"}W · ` +
          `${ftpPublicFields.ftpHistory.length} Ramp-Test(s)`
      : `ℹ️  FTP öffentlich (${entry.name}): abgeschaltet — keine FTP-Werte im Payload`
  );

  const output = {
    athleteName: entry.name,
    ...ftpPublicFields,
    // Fahrplan 12 E7 (W5): nur für Multi-Sport-Athleten befüllt (1/2/4
    // bleiben ohne diese drei Felder — kein Rauschen im Payload-Diff).
    // Das `entry.activityTypes`-Gate ist Pflicht, nicht nur der hrMax/hrRest-
    // Null-Check: cfg.hrMax/cfg.hrRest (Tanaka aus profiles.birthdate) sind
    // athletenweite Profilwerte, die grundsätzlich auch für 1/4 gesetzt sein
    // könnten, sobald deren Supabase-Profil ein birthdate trägt — ohne dieses
    // Gate würden sie dann mit hrEstimated:false (falsch, da Alters-
    // formel, kein Messwert) ins Payload rutschen.
    ...(entry.activityTypes && (hrMax != null || hrRest != null)
      ? { hrMax, hrRest, hrEstimated }
      : {}),
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

  // Nur ein tatsächlich geladener Zeitraum darf Zeilen löschen.
  const loaded = creds ? { from: entry.oldest, to: today } : null;
  await persistTraining(
    entry.shortLabel,
    cfg.profileId,
    output,
    { rides: loaded, wellness: loaded },
    signal
  );
}

/**
 * Primärathlet (athlete1): eigener Pfad mit eingefrorener Plan-1-Historie,
 * Power-Curve-Blöcken, subjective.json und eigener Output-Form (s. athletes.js).
 * @param {object} cfg1  Zeile aus loadSyncConfig()
 * @param {{ formatCatalog: Array<object>, intervalBlockCache: object, signal?: AbortSignal }} ctx
 */
async function syncPrimaryAthlete(cfg1, ctx) {
  const { formatCatalog, intervalBlockCache, signal } = ctx;

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
  // Bei intervals.icu tatsächlich geladene Zeiträume (nur darin wird gelöscht).
  let ridesWindow = null;
  let wellnessWindow = null;

  // 2a. Wetter: Open-Meteo für gesamten Zeitraum (unabhängig von intervals.icu)
  const PLAN1_START = "2026-03-24";
  const PLAN1_FIRST_DATE = plan1.length > 0 ? plan1[0].date : PLAN1_START;
  const weatherEnd = weatherEndISO(); // Archive hat ~2 Tage Verzögerung
  const weatherData = await getHistoricalWeather(
    PLAN1_FIRST_DATE,
    weatherEnd,
    cfg1?.lat,
    cfg1?.lon
  );
  const weatherMap = buildWeatherMap(weatherData);
  // Forecast-API für die letzten 2 Tage (überbrückt Archive-Delay)
  const recentData = await getRecentWeather(cfg1?.lat, cfg1?.lon);
  const recentMap = buildWeatherMap(recentData);
  Object.assign(weatherMap, recentMap); // recentMap überschreibt ggf. ältere Archive-Werte

  // 2b. Plan 2: intervals.icu + subjective.json
  if (cfg1?.apiKey && cfg1?.athleteId) {
    const oldest = PLAN2_SCHEDULE[0].start;
    const today = new Date().toISOString().split("T")[0];
    // Kein Kappen aufs Plan-2-Ende mehr: Fahrten danach bekommen über
    // getPlan2WeekPhase() einfach week/phase = null (wie Athlet 2/4).
    const newest = today;
    ridesWindow = { from: oldest, to: newest };
    wellnessWindow = { from: PLAN1_START, to: newest };

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
    const ftpGoal1 =
      (cfg1?.ftpPublic ?? true)
        ? await loadFtpGoal({
            profileId: cfg1.profileId,
            serviceRoleKey: ENV.SUPABASE_SERVICE_ROLE_KEY,
          })
        : null;
    ftpPublicFields1 = publicFtpFields(ftpHistory, cfg1?.ftpPublic ?? true, null, today, ftpGoal1);
    log.info(
      ftpPublicFields1.ftpPublic
        ? `✅ FTP öffentlich: ${ftpPublicFields1.ftp ?? "–"}W · ${ftpPublicFields1.ftpHistory.length} Ramp-Test(s) im Payload`
        : `ℹ️  FTP öffentlich: abgeschaltet (profiles.ftp_public=false) — keine FTP-Werte in den Trainingsdaten`
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
      mapActivity(
        act,
        wellness,
        subjective,
        weatherMap,
        effectivePlan,
        ftpHistory,
        intervalBlockCache
      )
    );
    // Ausrollen nach einem harten Workout (gleicher Tag, kurz, deutlich
    // niedrigere Leistung) erbt sonst dieselbe Tages-Plankarte — analog zum
    // Fix für Athlet 2 weiter unten.
    classifyCooldowns(plan2, ftpHistory, DEFAULT_FTP);
    log.info(`✅ Plan 2: ${plan2.length} Rides aus intervals.icu`);
    logRpeFeelCoverage(plan2, "Athlet 1");

    // Soll-Ist-Matching + Compliance-Ampel (Progressionssteuerung C1/C2) —
    // nutzt dieselben planCards wie effectivePlan oben (kein zweiter Fetch).
    const complianceCounts = attachCompliance(
      plan2,
      activities,
      planCards,
      intervalBlockCache,
      ftpHistory,
      DEFAULT_FTP,
      formatCatalog
    );
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
  // nie im Frontend, nie in den Trainingsdaten)
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

  log.info(`
✅ ${rides.length} Fahrten (athlete1)`);
  log.info(`   Datenquellen: ${dataSources.join(", ")}`);
  log.info(
    `   Zeitraum: ${rides[0]?.dateISO || "?"} bis ${rides[rides.length - 1]?.dateISO || "?"}`
  );
  log.info(`   Quelle: ${output.source}`);

  await persistTraining(
    "athlete1",
    cfg1.profileId,
    output,
    { rides: ridesWindow, wellness: wellnessWindow },
    signal
  );
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
  // die Trainingsdaten still auf "nur Plan-1-Historie" zurückfallen (kein stiller
  // Fallback, s. Fahrplan 7 CRED3).
  if (!cfg1) {
    log.error(
      "athlete_sync_config: keine Zeile für Athlet 1 — die Trainingsdaten würden nur die Plan-1-Historie enthalten. Abbruch."
    );
    process.exitCode = 1;
    return;
  }
  if (!cfg1.apiKey || !cfg1.athleteId) {
    log.warn(
      "athlete_sync_config: Athlet-1-Zeile ohne intervals_api_key/-athlete_id — diesmal nur die Plan-1-Historie"
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

  const timings = [];
  const timeoutMs = accountTimeoutMs();
  const today = new Date().toISOString().split("T")[0];
  const weatherEnd = weatherEndISO();
  const run = (label, task) => runAccount(label, task, { timeoutMs, timings });

  // 1. Primärathlet (athlete1) — eigener Pfad, s. syncPrimaryAthlete().
  await run("athlete1", (signal) =>
    syncPrimaryAthlete(cfg1, { formatCatalog, intervalBlockCache, signal })
  );

  // 2. Sekundär-Athleten (2 + 3 + 4) — ein gemeinsamer Rumpf, je Athlet über
  //    die Felder in scripts/lib/athletes.js parametrisiert. Jeder Account
  //    läuft mit Zeitlimit; ein Fehler stoppt die anderen nicht.
  for (const entry of PROFILE_SYNC_ENTRIES) {
    await run(entry.slug, (signal) =>
      syncSecondaryAthlete(entry, syncConfig.get(entry.slug), {
        today,
        weatherEnd,
        formatCatalog,
        intervalBlockCache,
        signal,
      })
    );
  }

  // 3. Alle weiteren Accounts aus athlete_sync_config (Fahrplan 26 E2).
  for (const { entry, cfg } of listGenericAccounts(syncConfig, today)) {
    await run(entry.shortLabel, (signal) =>
      syncSecondaryAthlete(entry, cfg, { today, weatherEnd, formatCatalog, intervalBlockCache, signal })
    );
  }

  writeOutput(INTERVAL_BLOCKS_FILE, intervalBlockCache);
  log.info(
    `✅ ${Object.keys(intervalBlockCache).length} Aktivitäten im Blockerkennung-Cache → ${INTERVAL_BLOCKS_FILE}`
  );

  logTimings(timings);
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
