/* ============================================================
   SCRIPTS/LIB/MAP-ACTIVITY.JS — intervals.icu-Activity → Ride
   Typ-Ableitung aus dem Intensity Factor (rein, testbar) und
   die beiden Mapper für Athlet 1 (Plan 2) und Athlet 2.
   ============================================================ */

import { effectiveSessions } from "../../assets/js/core/planning.js";
import { classifySession } from "../../assets/js/core/session-classify.js";
import { ftpAt } from "./ftp-history.js";
import { PLANNED_SESSIONS, getPlan2WeekPhase } from "./plan2.js";
import { PLANNED_SESSIONS_ATHLETE2 } from "./plan-athlete2.js";
import { getWeatherForRide } from "./weather.js";
import { log } from "./log.js";
import { countFieldCoverage } from "./coverage.js";

/** Fallback-FTP für die Typ-Ableitung — wird bei neuem Ramp-Test aktualisiert */
export const DEFAULT_FTP = 193;

/**
 * Baut aus einer statischen Plankarten-Map + adjustments.json den Index
 * "welche Plankarte gilt aktuell für Datum X" — berücksichtigt Verschiebungen
 * (movedTo) und Ausfälle (cancelled). Ohne diesen Schritt würde die Ride-
 * Zuordnung (mapActivity/mapActivity2) nach einem Kartentausch im Planungstab
 * weiter die ursprüngliche, unverschobene Karte für ein Datum liefern.
 * Nutzt effectiveSessions() (core/planning.js) statt die Adjustment-Auflösung
 * ein zweites Mal zu duplizieren.
 * @param {Record<string, Object>} sessionsByDate PLANNED_SESSIONS[_ATHLETE2]
 * @param {Record<string, Object>} [adjustments]
 * @returns {Record<string, Object>} Datum → aktuell gültige Session
 */
export function buildEffectivePlanIndex(sessionsByDate, adjustments) {
  const sessions = Object.entries(sessionsByDate).map(([date, s]) => ({ date, ...s }));
  const effective = effectiveSessions(sessions, adjustments);

  const index = {};
  // Zwei Durchgänge statt eines: eine verschobene Session (originalDate
  // gesetzt) MUSS eine unverschobene Session verdrängen, die zufällig auf
  // ihrem Zieldatum "wohnt" (einseitige Verschiebung auf ein Datum mit
  // eigener, unveränderter Karte — kein wechselseitiger Tausch). Ein
  // einziger Durchgang wäre von der Object.entries-Reihenfolge (= Datums-
  // Reihenfolge in PLANNED_SESSIONS) abhängig und könnte die verschobene
  // Session je nach Zufall stillschweigend verlieren.
  for (const s of effective) if (!s.originalDate) index[s.date] = s;
  for (const s of effective) if (s.originalDate) index[s.date] = s;
  return index;
}

/**
 * Trainingstyp aus NP/FTP (Intensity Factor) ableiten, wenn kein Plan-Match.
 * Rein und testbar — Grenzwerte siehe tests/typ-inferenz.test.js.
 * @param {number|null|undefined} np Normalized Power
 * @param {number} min Fahrtdauer in Minuten
 * @param {number|null} [ftp]
 * @returns {string}
 */
export function inferTypFromIF(np, min, ftp = DEFAULT_FTP) {
  if (!np || !ftp) return "Außerplanmäßig";
  const ifVal = np / ftp;
  // Kurze Fahrten (<30 min) mit hohem IF = Intervall/Test
  if (min < 30 && ifVal > 0.95) return "FTP-Test";
  if (ifVal < 0.75) {
    // Niedriger IF allein heißt nicht "Erholung" — lange Fahrten mit
    // niedrigem NP sind typischerweise Grundlagenausdauer, nicht Recovery
    if (min >= 120) return "Z2 Lang";
    if (min >= 60) return "Z2 Dauer";
    return "Z1 Recovery";
  }
  if (ifVal < 0.85) return "Z2 Dauer";
  if (ifVal < 0.9) return "Tempo";
  if (ifVal < 0.95) return "Sweet Spot";
  if (ifVal < 1.05) return "Schwelle";
  return "VO2max";
}

/**
 * Datenbasierte Ist-Typerkennung (core/session-classify.js) für eine
 * Aktivität aufrufen. `ftpWatt` MUSS die am Fahrttag gültige FTP sein,
 * nicht die heutige — kommt vom Aufrufer bereits fertig aufgelöst
 * (ftpAt(ftpHistory, date, fallbackFtp), s. mapActivity()/mapActivity2()).
 *
 * Nutzt bewusst NICHT mehr `act.icu_eftp` (Stand vor der FTP-Historie,
 * 30.07.2026): eFTP ist intervals.icus laufend nachgeführte SCHÄTZUNG aus
 * den jüngsten Aktivitäten — schwankt je nach Tagesform/Anstrengung dieser
 * einen Fahrt und ist damit kein stabiler Referenzpunkt für "wie hart war
 * das relativ zu meiner damaligen Schwelle". ftp_history trägt die
 * bewusst vom Athleten eingetragene, gemessene Ramp-Test-FTP — die
 * inhaltlich richtige Grundlage für die IF-Berechnung. `act.icu_eftp`
 * bleibt unverändert in `ride.eftp` erhalten (baseFields()) — dort speist
 * es weiterhin die eFTP-Trend-Prognose (core/ftp-forecast.js), ein
 * bewusst anderer Zweck als die Ist-Typerkennung hier.
 * @param {Object} act
 * @param {number} min
 * @param {number} ftpWatt am Fahrttag gültige FTP, bereits aufgelöst
 * @param {Object|null} [longestBlock] aus dem Blockerkennung-Cache
 *   (scripts/lib/interval-blocks.js), Aufrufer schlägt per Activity-ID nach
 * @returns {ReturnType<typeof classifySession>}
 */
function detectSession(act, min, ftpWatt, longestBlock = null) {
  return classifySession({
    np: act.icu_weighted_avg_watts,
    ftp: ftpWatt,
    min,
    zoneTimes: act.icu_zone_times || null,
    longestBlock,
  });
}

/** Gemeinsame Feldmenge beider Mapper */
function baseFields(act, weather) {
  const min = Math.round((act.moving_time || 0) / 60);
  return {
    date: act.start_date_local.split("T")[0],
    startTime: act.start_date_local || null,
    km: Math.round((act.distance || 0) / 100) / 10,
    min,
    kmh: Math.round((act.average_speed || 0) * 3.6 * 10) / 10,
    watt: act.icu_average_watts,
    maxWatt: null,
    np: act.icu_weighted_avg_watts,
    hf: act.average_heartrate,
    hfMax: act.max_heartrate,
    kad: act.average_cadence ? Math.round(act.average_cadence) : null,
    hoehe: act.total_elevation_gain,
    tss: act.icu_training_load,
    if: act.icu_intensity ? Math.round(act.icu_intensity) / 100 : null,
    vi: act.icu_variability_index ? Math.round(act.icu_variability_index * 100) / 100 : null,
    trimp: act.trimp ? Math.round(act.trimp) : null,
    ctl: act.icu_ctl ? Math.round(act.icu_ctl * 10) / 10 : null,
    atl: act.icu_atl ? Math.round(act.icu_atl * 10) / 10 : null,
    tsb:
      act.icu_ctl != null && act.icu_atl != null
        ? Math.round((act.icu_ctl - act.icu_atl) * 10) / 10
        : null,
    decoupling: act.decoupling != null ? Math.round(act.decoupling * 10) / 10 : null,
    dtl: act.icu_training_load,
    // Zeit in Leistungszonen (Sekunden je Zone) und eFTP zum Fahrtzeitpunkt.
    // Feldnamen defensiv: intervals.icu liefert icu_zone_times als Array von
    // Sekunden ODER als Array von {id, secs} — Normalisierung im Frontend
    // (core/zones.js). Fehlende Felder bleiben null (ältere Aktivitäten).
    zoneTimes: act.icu_zone_times || null,
    eftp: act.icu_eftp || null,
    // Nach-Fahrt-Befinden, vom Athleten direkt in intervals.icu eingetragen
    // (nicht zu verwechseln mit `feel` unten — dem manuellen Dropdown-Wert
    // aus subjective.json/Fahrtenbuch, s. baseFields-Aufrufer). Feldnamen
    // laut intervals.icu-API (perceived_exertion/feel); Ist-Befüllung wird
    // pro Sync-Lauf via logRpeFeelCoverage() verifiziert statt angenommen.
    rpe: act.perceived_exertion ?? null,
    feelIcu: act.feel ?? null,
    weather,
    wetter: weather
      ? `${weather.temp}°C`
      : act.average_temp
        ? `~${Math.round(act.average_temp)}°C`
        : null,
    source: "intervals.icu",
  };
}

/** Non-null-Zählung für rpe/feelIcu über gemappte Rides.
 *  @param {Array<Object>} rides @returns {{rpe: number, feelIcu: number}} */
export function rpeFeelCoverage(rides) {
  return /** @type {{rpe: number, feelIcu: number}} */ (countFieldCoverage(rides, ["rpe", "feelIcu"]));
}

/** Verifikationslog: sind rpe/feelIcu aus intervals.icu real befüllt?
 *  Grundlage, um die angenommenen API-Feldnamen (perceived_exertion/feel)
 *  gegen einen echten Sync-Lauf zu bestätigen (s. Kommentar in baseFields()).
 *  @param {Array<Object>} rides @param {string} label z.B. "Athlet 1" */
export function logRpeFeelCoverage(rides, label) {
  const { rpe, feelIcu } = rpeFeelCoverage(rides);
  const total = (rides || []).length;
  log.info(`   📊 RPE/Feel-Abdeckung (intervals.icu) ${label}: rpe ${rpe}/${total} · feelIcu ${feelIcu}/${total}`);
  const empty = [];
  if (total > 0 && rpe === 0) empty.push("rpe (perceived_exertion)");
  if (total > 0 && feelIcu === 0) empty.push("feelIcu (feel)");
  if (empty.length) {
    log.warn(`   Nicht befüllt (${label}): ${empty.join(", ")} — Feldnamen prüfen`);
  }
}

/** Wellness-Felder eines Tages @param {Object} w */
function wellnessFields(w) {
  return {
    ruhepuls: w.restingHR || null,
    hrv: w.hrvSDNN || null,
    avgSleepingHR: w.avgSleepingHR || null,
    sleepHours: w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null,
  };
}

/** Startstunde aus start_date_local, oder null (→ Wetter-Fallback 09:00) */
function startHourOf(act) {
  return act.start_date_local ? parseInt(act.start_date_local.split("T")[1]?.split(":")[0]) : null;
}

// === intervals.icu Activity → Ride-Objekt (Athlet 1, Plan 2) ===
// `ftpHistory` (Migration 0009, scripts/lib/ftp-history.js) ist optional —
// ohne sie (leeres Array, z.B. wenn SUPABASE_*-Secrets fehlen) verhält
// sich ftpAt() wie zuvor: DEFAULT_FTP für jede Fahrt, unverändertes
// Verhalten (s. generate-data.js für die Herkunft von ftpHistory).
// `intervalBlockCache` (scripts/lib/interval-blocks.js) ebenso optional —
// ohne Eintrag für diese Activity-ID (z.B. noch nicht abgerufen) bleibt
// longestBlock null, detectSession() verhält sich dann wie vor der
// Blockerkennung.
export function mapActivity(
  act,
  wellness,
  subjective,
  weatherMap,
  effectivePlan = PLANNED_SESSIONS,
  ftpHistory = [],
  intervalBlockCache = {}
) {
  const date = act.start_date_local.split("T")[0];
  const { week, phase } = getPlan2WeekPhase(date);
  const w = wellness[date] || {};
  const s = subjective[date] || {};
  const planned = effectivePlan[date] || {};

  const np = act.icu_weighted_avg_watts;
  const min = Math.round((act.moving_time || 0) / 60);

  // Priorität: 1) subjective.json  2) Trainingsplan  3) IF-Berechnung
  // `typ` bleibt bewusst unverändert (heutiges Verhalten, inferTypFromIF()
  // bleibt der Fallback dafür, unverändert auf DEFAULT_FTP statt ftpAt() —
  // s. "typ bleibt unangetastet"-Konvention) — typSource dokumentiert nur,
  // welcher der drei Fälle gegriffen hat. `typDetected`/`typDetection`
  // kommen UNABHÄNGIG davon aus core/session-classify.js und verändern
  // typ/typSource hier bewusst NICHT — welche Konsumenten künftig
  // typDetected statt typ lesen, entscheidet ein späterer Schritt bewusst
  // einzeln (Schichtenregel/Konservativität wie in Schritt 2 begründet).
  const typ = s.typ || planned.typ || inferTypFromIF(np, min);
  const typSource = s.typ ? "subjective" : planned.typ ? "plan" : "inferred";
  const name = s.name || planned.name || act.name || "Radfahren";
  const { ftpWatt } = ftpAt(ftpHistory, date, DEFAULT_FTP);
  const longestBlock = intervalBlockCache[String(act.id)]?.longestBlock ?? null;
  const detection = detectSession(act, min, ftpWatt, longestBlock);

  // Wetter: exakte Startzeit aus intervals.icu
  const weather = getWeatherForRide(weatherMap, date, startHourOf(act), min);

  return {
    name,
    week,
    phase,
    typ,
    typPlanned: planned.typ ?? null,
    typDetected: detection.type,
    typDetection: detection,
    typSource,
    dataSource: "intervals",
    ...baseFields(act, weather),
    ...wellnessFields(w),
    feel: s.feel || null,
    notizen: s.notizen || null,
  };
}

// === intervals.icu Activity → Ride-Objekt (Athlet 2, GFNY Bremen 2026) ===
// week/phase bleiben bewusst null — der Plan-Bezug läuft ausschließlich
// über die eigenständigen plannedSessions/adjustments-Felder (siehe
// generate-data.js), nicht über ride.week/ride.phase. Das hält
// hasOwnPlan() in app.js unangetastet (steuert weiterhin Athlet-1-exklusive
// Inhalte wie FTP-Retest-Text/Periodisierungs-Sektion), während der
// Planungstab trotzdem funktioniert. Data.weekly() selbst hängt seit dem
// Umbau "Plan 1/2 → Kalenderwoche" nicht mehr an r.week (immer
// isoWeekKey(r.dateISO)), ist von week:null hier also ohnehin unberührt.
// `ftpHistory` optional (leer -> estimatedFtp für jede Fahrt, unverändertes
// Verhalten) — Athlet 2 hat vermutlich keine eigene ftp_history-Historie
// gepflegt (kein Ramp-Test-Konzept in derselben Form), das ist hier bewusst
// KEIN Sonderfall: ftpAt() fällt auf estimatedFtp zurück, wenn die Tabelle
// für dieses Profil leer ist — exakt wie bisher, ohne eigenen Code-Zweig.
export function mapActivity2(
  act,
  wellness,
  weatherMap,
  estimatedFtp,
  effectivePlan = PLANNED_SESSIONS_ATHLETE2,
  ftpHistory = [],
  intervalBlockCache = {}
) {
  const date = act.start_date_local.split("T")[0];
  const w = wellness[date] || {};
  const planned = effectivePlan[date] || {};

  const np = act.icu_weighted_avg_watts;
  const min = Math.round((act.moving_time || 0) / 60);
  const { ftpWatt } = ftpAt(ftpHistory, date, estimatedFtp);
  const longestBlock = intervalBlockCache[String(act.id)]?.longestBlock ?? null;
  const detection = detectSession(act, min, ftpWatt, longestBlock);

  const weather = getWeatherForRide(weatherMap, date, startHourOf(act), min);

  return {
    name: planned.name || act.name || "Radfahren",
    week: null,
    phase: null,
    // Kein subjective.json bei Athlet 2 (read-only, keine Befinden-Erfassung)
    // — nur Plan oder IF-Berechnung, s. Kommentar bei mapActivity() zu
    // typPlanned/typDetected/typSource.
    typ: planned.typ || inferTypFromIF(np, min, estimatedFtp),
    typPlanned: planned.typ ?? null,
    typDetected: detection.type,
    typDetection: detection,
    typSource: planned.typ ? "plan" : "inferred",
    // Athlet 2 kommt vollständig aus intervals.icu (kein Notion-Anteil) —
    // dieselbe Datenherkunfts-Semantik wie Athlet 1s intervals.icu-Ära.
    dataSource: "intervals",
    ...baseFields(act, weather),
    ...wellnessFields(w),
    feel: null,
    notizen: null,
  };
}

/**
 * Erkennt ein kurzes, niedrig-intensives Workout direkt nach einem harten
 * (renn-artigen) Workout am selben Tag und markiert es als "Ausrollen" statt
 * der vom Datum geerbten Plankarten-Bezeichnung. Notwendig, weil die
 * Plan-Zuordnung pro Kalendertag erfolgt (ein Eintrag in PLANNED_SESSIONS*)
 * — bei zwei echten Aktivitäten am selben Tag (Rennen + Ausrollen) würden
 * sonst beide dieselbe (Renn-)Bezeichnung erben.
 * Rein, testbar — siehe tests/map-activity.test.js.
 * @param {Array<Object>} rides bereits gemappte Ride-Objekte
 * @param {number|null} [ftp]
 * @returns {Array<Object>} rides (in-place korrigiert)
 */
export function classifyCooldowns(rides, ftp) {
  const byDate = new Map();
  for (const r of rides) {
    if (!r.date) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  for (const dayRides of byDate.values()) {
    if (dayRides.length < 2) continue;
    dayRides.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    for (let i = 1; i < dayRides.length; i++) {
      const prior = dayRides[i - 1];
      const cur = dayRides[i];
      const priorPower = prior.np ?? prior.watt;
      const curPower = cur.np ?? cur.watt;
      const priorIF = ftp && priorPower ? priorPower / ftp : 0;
      const curIF = ftp && curPower ? curPower / ftp : 0;
      const priorWasHard = priorIF >= 0.9;
      // Zusätzlich zum relativen Verhältnis (curIF <= priorIF*0.6) eine
      // absolute Obergrenze: sonst würde ein selbst noch harter zweiter
      // Effort (z.B. IF 1.1 nach einem Extrem-Sprint IF 2.0) fälschlich
      // als "Ausrollen" durchgehen, nur weil er relativ leichter war.
      const curIsShortEasy =
        (cur.min ?? Infinity) <= 25 && curIF > 0 && curIF <= 0.55 && curIF <= priorIF * 0.6;
      if (priorWasHard && curIsShortEasy && isShortlyAfter(prior, cur)) {
        cur.typ = "Ausrollen";
        cur.name = "Ausrollen";
        // Überschreibt ggf. eine schon gesetzte typSource ("plan"/"subjective")
        // — die Ausrollen-Einstufung kommt aus dieser IF/Dauer-Heuristik, nicht
        // mehr aus der ursprünglichen Quelle, sonst würde typSource lügen.
        cur.typSource = "inferred";
      }
    }
  }
  return rides;
}

/**
 * Prüft, ob `cur` zeitlich unmittelbar (≤90 Min Pause) nach dem Ende von
 * `prior` beginnt — verhindert, dass zwei unabhängige, nur zufällig am
 * selben Kalendertag liegende Fahrten (z.B. Rennen morgens, Pendel-Fahrt
 * abends) als Ausrollen-Paar erkannt werden.
 * @param {Object} prior @param {Object} cur
 */
function isShortlyAfter(prior, cur) {
  if (!prior.startTime || !cur.startTime) return false;
  const priorEnd = new Date(prior.startTime).getTime() + (prior.min || 0) * 60000;
  const curStart = new Date(cur.startTime).getTime();
  const gapMin = (curStart - priorEnd) / 60000;
  return gapMin >= -5 && gapMin <= 90;
}
