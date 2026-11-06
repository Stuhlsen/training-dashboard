/* ============================================================
   CORE/GOAL-CHECK.JS — Ziel-Check gegen den eigenen eFTP-Trend (kein DOM)
   Fahrplan 43 V4. Bewertet nur das nötige Tempo gegen den eigenen
   Trend: keine Staffelung nach Trainingsstand, keine feste Watt-
   Grenze (kein belegter Effekt, s. planning/recherche/ziele-belege.md
   Abschnitt 1). Die Prognose liefert forecastFtp() — keine zweite
   Trendrechnung. Die Funktion holt selbst keine Daten und liefert nur
   Zahlen, keine Texte.
   ============================================================ */

import { forecastFtp } from "./ftp-forecast.js";

// Alle Grenzwerte: eigene Festlegung, keine Studienzahl (ziele-belege.md 1.6).

/** Jüngster eFTP-Punkt darf höchstens so alt sein (Tage). forecastFtp rechnet
 *  vom letzten Datenpunkt aus, nicht von heute — ohne diese Prüfung sähen
 *  alte Daten aktuell aus. Eigene Festlegung. */
export const MAX_STALE_DAYS = 28;

/** ETA weiter als 2 Jahre in der Zukunft wird nicht ausgegeben (Tage).
 *  Eigene Festlegung — nicht genauer tun, als wir sind. */
export const MAX_ETA_DAYS = 730;

/** Ziel mehr als 10 % über current gilt als ambitioniert. Rahmen aus der
 *  Meta-Analyse (+7,7 %, vermutlich überschätzt), die Grenze selbst ist
 *  eigene Festlegung. */
export const AMBITIOUS_GAIN = 0.1;

/** Zwischenziel-Horizont in Wochen. Eigene Festlegung. */
export const INTERIM_WEEKS = 6;

/** Mindestzuwachs des Zwischenziels als Anteil von current. Eigene Festlegung. */
export const INTERIM_MIN_GAIN = 0.02;

/** Rundungsschritt des Zwischenziels in Watt. Eigene Festlegung. */
export const INTERIM_STEP_W = 5;

/** Konfidenz aus Punktzahl und Bandbreite (high − low in Watt).
 *  Eigene Festlegung. */
export const CONFIDENCE_HIGH = { minPoints: 8, maxBand: 10 };
export const CONFIDENCE_MEDIUM = { minPoints: 5, maxBand: 20 };

const DAY_MS = 86400000;

const dayDiff = (fromISO, toISO) => Math.round((Date.parse(toISO) - Date.parse(fromISO)) / DAY_MS);

const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().split("T")[0];

const round1 = (x) => Math.round(x * 10) / 10;

/**
 * @param {{projected: number, low: number, high: number, nPoints: number}} fc
 * @returns {"low"|"medium"|"high"}
 */
function confidenceOf(fc) {
  const band = fc.high - fc.low;
  if (fc.nPoints >= CONFIDENCE_HIGH.minPoints && band <= CONFIDENCE_HIGH.maxBand) return "high";
  if (fc.nPoints >= CONFIDENCE_MEDIUM.minPoints && band <= CONFIDENCE_MEDIUM.maxBand) {
    return "medium";
  }
  return "low";
}

/** Zwischenziel: Trend mal Wochen, mindestens +2 %, auf 5 W gerundet,
 *  immer über current und höchstens target. */
function interimOf({ current, target, slope, todayISO, daysToTarget }) {
  const days =
    daysToTarget != null && daysToTarget > 0
      ? Math.min(INTERIM_WEEKS * 7, daysToTarget)
      : INTERIM_WEEKS * 7;
  const raw = current + Math.max((slope * days) / 7, current * INTERIM_MIN_GAIN);
  let watts = Math.round(raw / INTERIM_STEP_W) * INTERIM_STEP_W;
  if (watts <= current) watts = current + INTERIM_STEP_W;
  return { watts: Math.min(watts, target), dateISO: addDays(todayISO, days) };
}

function verdictOf({ slope, need, hasDate, overAmbitious }) {
  if (!hasDate) return "no-date";
  if (need != null && slope > 0 && slope >= need) return "on-track";
  if (slope <= 0 || overAmbitious) return "ambitious";
  return "tight";
}

/**
 * Realistischer Ziel-Check für ein FTP-Ziel aus dem eigenen eFTP-Trend.
 * @param {{
 *   current: number,
 *   target: number,
 *   targetDate?: string|null,
 *   history: Array<{date: string, eftp: number}>,
 *   todayISO: string,
 * }} input
 * @returns {{ok: true, verdict: "reached"|"on-track"|"tight"|"ambitious"|"no-date",
 *            confidence: "low"|"medium"|"high"|null,
 *            projectedAtDate: {projected: number, low: number, high: number}|null,
 *            etaISO: string|null, wattsPerWeek: number|null, needPerWeek: number|null,
 *            interimTarget: {watts: number, dateISO: string}|null}
 *          | {ok: false, reason: "too-little-data"|"invalid-input"}}
 */
export function assessFtpGoal({ current, target, targetDate, history, todayISO }) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) {
    return { ok: false, reason: "invalid-input" };
  }

  const sorted = [...(history || [])].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const isFresh = last != null && dayDiff(last.date, todayISO) <= MAX_STALE_DAYS;

  const daysToTarget = targetDate ? dayDiff(todayISO, targetDate) : null;
  const hasFutureDate = daysToTarget != null && daysToTarget > 0;

  const fc = isFresh ? forecastFtp(sorted, hasFutureDate ? targetDate : todayISO) : null;
  const projectedAtDate =
    fc && hasFutureDate ? { projected: fc.projected, low: fc.low, high: fc.high } : null;

  if (current >= target) {
    return {
      ok: true,
      verdict: "reached",
      confidence: fc ? confidenceOf(fc) : null,
      projectedAtDate,
      etaISO: null,
      wattsPerWeek: fc ? fc.slopePerWeek : null,
      needPerWeek: null,
      interimTarget: null,
    };
  }

  if (!fc) return { ok: false, reason: "too-little-data" };

  const slope = fc.slopePerWeek;
  const gap = target - current;
  const need = hasFutureDate ? gap / (daysToTarget / 7) : null;

  let etaISO = null;
  if (slope > 0) {
    const etaDays = Math.ceil((gap / slope) * 7);
    if (etaDays <= MAX_ETA_DAYS) etaISO = addDays(todayISO, etaDays);
  }

  return {
    ok: true,
    verdict: verdictOf({
      slope,
      need,
      hasDate: Boolean(targetDate),
      overAmbitious: target > current * (1 + AMBITIOUS_GAIN),
    }),
    confidence: confidenceOf(fc),
    projectedAtDate,
    etaISO,
    wattsPerWeek: slope,
    needPerWeek: need == null ? null : round1(need),
    interimTarget: interimOf({ current, target, slope, todayISO, daysToTarget }),
  };
}
