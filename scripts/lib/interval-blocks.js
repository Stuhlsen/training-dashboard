/* ============================================================
   SCRIPTS/LIB/INTERVAL-BLOCKS.JS — Blockerkennung aus intervals.icu
   ?intervals=true (Fetch/Cache-Zwischenschritt, v2-Ist-Typerkennung,
   Kalibrierung 30.07.2026 — s. docs/offene-punkte.md)

   Fund aus der Kalibrierung: intervals.icu liefert pro Fahrt feingranulare
   Segmente (icu_intervals: start_time/end_time/average_watts/type/zone,
   oft nur Sekunden bis wenige Minuten lang) — kein "zu grob"-Problem.
   ABER: `type` (WORK/RECOVERY) ist ein RELATIVER Ausreißer-Detektor, kein
   absoluter FTP-Schwellenwert-Klassifikator. An der 21.07.-Kalibrierungs-
   fahrt (durchgehend IF 0,93, korrekt Sweet Spot) liegen etliche als
   RECOVERY markierte Segmente selbst bei 72–93 % IF — nur kein Ausreißer
   relativ zur unmittelbaren Umgebung. longestBlockAboveThreshold() mergt
   deshalb ALLE Segmente unabhängig von `type` anhand von average_watts
   gegen eine FTP-Schwelle. icu_groups (wiederkehrende Kurzeffort-Muster,
   z. B. "12× ein ~10s-Burst") ist für diesen Zweck nicht brauchbar und
   wird hier nicht verwendet.
   ============================================================ */

import { intervalsGet } from "./intervals.js";
import { log } from "./log.js";
import { ftpAt } from "./ftp-history.js";

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Längster zusammenhängender Block, dessen Leistung eine Schwelle erreicht.
 * Segmente unterhalb der Schwelle werden toleriert (reißen den Block nicht
 * ab), wenn sie höchstens `gapToleranceSec` dauern — Ampel, kurze Erholung
 * zwischen Intervall-Wiederholungen. Längere Unterbrechungen beenden den
 * Block. Rein, kein Netzwerk, unabhängig vom `type`-Feld (s. Kopfkommentar).
 * @param {Array<{start_time:number, end_time:number, average_watts:number}>} segments
 * @param {number} thresholdWatts
 * @param {number} gapToleranceSec
 * @returns {{startSec:number, endSec:number, totalDurationSec:number, workDurationSec:number, avgWatts:number}|null}
 */
export function longestBlockAboveThreshold(segments, thresholdWatts, gapToleranceSec) {
  if (!Array.isArray(segments) || !segments.length) return null;
  const sorted = [...segments].sort((a, b) => a.start_time - b.start_time);

  let best = null;
  let run = null; // { startSec, endSec, workDurationSec, weightedWattSecs }

  const finalizeRun = () => {
    if (!run || run.workDurationSec <= 0) return;
    const candidate = {
      startSec: run.startSec,
      endSec: run.endSec,
      totalDurationSec: run.endSec - run.startSec,
      workDurationSec: run.workDurationSec,
      avgWatts: Math.round(run.weightedWattSecs / run.workDurationSec),
    };
    if (!best || candidate.workDurationSec > best.workDurationSec) best = candidate;
  };

  for (const seg of sorted) {
    const dur = seg.end_time - seg.start_time;
    if (dur <= 0) continue;
    const qualifies = seg.average_watts >= thresholdWatts;

    if (qualifies) {
      if (!run) run = { startSec: seg.start_time, endSec: seg.end_time, workDurationSec: 0, weightedWattSecs: 0 };
      run.endSec = seg.end_time;
      run.workDurationSec += dur;
      run.weightedWattSecs += seg.average_watts * dur;
    } else if (run && dur <= gapToleranceSec) {
      // Toleriert: Block läuft weiter, die Lücke zählt weder zur
      // Arbeitszeit noch zur gewichteten Leistung.
      run.endSec = seg.end_time;
    } else {
      finalizeRun();
      run = null;
    }
  }
  finalizeRun();
  return best;
}

/** icu_intervals einer Aktivität laden. null bei Fehler/fehlenden Daten
 *  statt zu werfen — Aufrufer fällt dann auf "kein Block erkannt" zurück.
 *  @param {string|number} activityId @param {string} apiKey
 *  @returns {Promise<Array|null>} */
export async function fetchActivityIntervals(activityId, apiKey) {
  const data = await intervalsGet(`/activity/${activityId}?intervals=true`, apiKey);
  return data?.icu_intervals || null;
}

/**
 * Rohe icu_intervals-Segmente auf die für Cache/Matching gebrauchten Felder
 * reduzieren (Progressionssteuerung C1, docs/konzept-progressionssteuerung.md)
 * — kein Grund, das komplette API-Objekt je Segment zu cachen.
 * @param {Array<Object>} segments @returns {Array<{start_time:number, end_time:number, average_watts:number, type:string|null}>}
 */
function slimSegments(segments) {
  return segments.map((s) => ({
    start_time: s.start_time,
    end_time: s.end_time,
    average_watts: s.average_watts,
    type: s.type ?? null,
  }));
}

/**
 * Cache (in-place ergänzt) mit Blockerkennung für alle übergebenen
 * Aktivitäten füllen — bereits vollständig gecachte Aktivitäten werden
 * übersprungen (historische Aktivitäten sind unveränderlich, keine
 * Change-Detection nötig). "Vollständig" heißt seit C1
 * (docs/konzept-progressionssteuerung.md, Soll-Ist-Matching): der Eintrag
 * trägt bereits `segments` (rohe icu_intervals, s. slimSegments()) — ältere
 * Cache-Einträge (nur `longestBlock`, Stand v2-Ist-Typerkennung) gelten als
 * unvollständig und werden hier einmalig nachgeladen, derselbe throttled
 * Loop wie für neue Aktivitäten. `longestBlock` bleibt danach unverändert
 * aus denselben Segmenten berechnet — keine Regression für die bestehende
 * Typerkennung. Throttlet neue Abrufe: Sicherheitsmarge unter dem vom
 * intervals.icu-Maintainer genannten Limit (30/s Burst, 132/10s,
 * empfohlen 10/s — s. Bericht 30.07.2026), hier per Default 4/s.
 * @param {Array<{id:string|number, start_date_local:string}>} activities
 * @param {Record<string, Object>} cache wird in-place ergänzt
 * @param {{apiKey:string, ftpHistory:Array, fallbackFtp:number,
 *   thresholdIF?:number, gapToleranceSec?:number, minDelayMs?:number}} opts
 * @returns {Promise<{fetched:number, cached:number, failed:number}>}
 */
export async function updateIntervalBlockCache(activities, cache, opts) {
  const {
    apiKey,
    ftpHistory,
    fallbackFtp,
    // Sweet-Spot-Unterkante — identisch zu SESSION_CLASSIFY.ifTempoMax in
    // core/plan-config.js (bewusst hier dupliziert statt importiert: das
    // ist ein core/-Modul, scripts/lib/ importiert aus core/ nur reine
    // Logik ohne eigene Config-Objekte, s. map-activity.js-Präzedenzfall).
    thresholdIF = 0.9,
    // Toleriert Ampeln/kurze Erholung zwischen Intervall-Wiederholungen,
    // reißt aber bei einer echten, längeren Erholungsphase ab.
    gapToleranceSec = 90,
    minDelayMs = 250,
  } = opts;

  let fetched = 0;
  let cachedCount = 0;
  let failed = 0;

  for (const act of activities) {
    const key = String(act.id);
    if (cache[key]?.segments || cache[key]?.noData) {
      cachedCount++;
      continue;
    }
    const date = act.start_date_local.split("T")[0];
    const { ftpWatt } = ftpAt(ftpHistory, date, fallbackFtp);
    const thresholdWatts = Math.round(ftpWatt * thresholdIF);

    const segments = await fetchActivityIntervals(act.id, apiKey);
    if (!segments) {
      cache[key] = { noData: true, fetchedAt: new Date().toISOString() };
      failed++;
      if (minDelayMs > 0) await sleep(minDelayMs);
      continue;
    }

    cache[key] = {
      longestBlock: longestBlockAboveThreshold(segments, thresholdWatts, gapToleranceSec),
      segments: slimSegments(segments),
      thresholdWatts,
      gapToleranceSec,
      fetchedAt: new Date().toISOString(),
    };
    fetched++;
    if (minDelayMs > 0) await sleep(minDelayMs);
  }

  if (fetched > 0) {
    log.info(`   ... Blockerkennung: ${fetched} neu geladen, ${cachedCount} aus Cache, ${failed} fehlgeschlagen`);
  }
  return { fetched, cached: cachedCount, failed };
}
