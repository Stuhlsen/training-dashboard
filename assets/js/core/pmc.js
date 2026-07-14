/* ============================================================
   CORE/PMC.JS — Performance-Management-Berechnungen (kein DOM)
   CTL-Interpolation und TSB-Ableitung, getrennt vom Rendering.
   ============================================================ */

import { diffDays, localISODate } from "./format.js";

/** Zeitkonstanten der exponentiellen CTL/ATL-Glättung (Coggan-PMC-Modell) —
 *  dieselben Werte, mit denen intervals.icu/TrainingPeaks täglich fortschreiben. */
export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/** Schwelle (TSB-Punkte über `tsbTrend`s Fenster), unterhalb derer ein
 *  TSB-Trend als "stabil" statt "steigend"/"fallend" gilt. */
export const TSB_TREND_STABLE_BAND = 2;

/**
 * TSB einer Fahrt: explizit erfasst oder aus CTL − ATL abgeleitet.
 * @param {import("../types.js").Ride} r
 * @returns {number|null}
 */
export function tsbOf(r) {
  if (r.tsb != null) return r.tsb;
  if (r.ctl != null && r.atl != null) return r.ctl - r.atl;
  return null;
}

/**
 * Fehlende CTL-Werte linear zwischen bekannten Punkten interpolieren.
 * Randpunkte ohne Nachbarn übernehmen den nächstliegenden bekannten Wert.
 * Fahrten ganz ohne CTL-Kontext werden verworfen.
 * @param {import("../types.js").Ride[]} sorted Nach dateISO aufsteigend sortierte Fahrten
 * @returns {Array<import("../types.js").Ride & {ctlVal: number, interpolated: boolean}>}
 */
export function interpolateCtl(sorted) {
  return sorted
    .map((r, i) => {
      if (r.ctl != null) return { ...r, ctlVal: r.ctl, interpolated: false };
      const prev = sorted
        .slice(0, i)
        .reverse()
        .find((x) => x.ctl != null);
      const next = sorted.slice(i + 1).find((x) => x.ctl != null);
      if (prev && next) {
        const pi = sorted.indexOf(prev);
        const ni = sorted.indexOf(next);
        const t = (i - pi) / (ni - pi);
        return { ...r, ctlVal: prev.ctl + t * (next.ctl - prev.ctl), interpolated: true };
      }
      if (prev) return { ...r, ctlVal: prev.ctl, interpolated: true };
      if (next) return { ...r, ctlVal: next.ctl, interpolated: true };
      return null;
    })
    .filter(Boolean);
}

/**
 * Projiziert CTL/ATL um `days` Tage ohne weitere Last (TSS=0) vorwärts —
 * dieselbe Exponentialglättung, mit der CTL/ATL täglich fortgeschrieben
 * werden, hier auf lastfreie Tage angewendet (z. B. Ruhetage).
 * @param {number} ctl @param {number} atl @param {number} days
 * @returns {{ctl:number, atl:number, tsb:number}}
 */
export function projectPmc(ctl, atl, days) {
  const ctlOut = ctl * Math.pow((CTL_DAYS - 1) / CTL_DAYS, days);
  const atlOut = atl * Math.pow((ATL_DAYS - 1) / ATL_DAYS, days);
  return { ctl: ctlOut, atl: atlOut, tsb: ctlOut - atlOut };
}

/**
 * Aktueller PMC-Stand zu `todayISO`: letzte Fahrt mit einem TSB-Signal (s.
 * tsbOf() — expliziter Wert ODER aus ctl/atl abgeleitet, an oder vor
 * `todayISO`), bei vorhandenem ctl+atl lastfrei vorwärtsprojiziert. Ohne
 * diese Projektion bliebe der TSB an Ruhetagen auf dem Stand der letzten
 * Fahrt eingefroren, obwohl er sich real durch die ausbleibende Belastung
 * weiter erholt. Manuell gepflegte Plan-1-Fahrten (Notion) können einen
 * expliziten TSB ohne ctl/atl tragen (s. scripts/lib/notion.js) — dafür ist
 * keine Projektion möglich, daysProjected bleibt dann 0.
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {null | {ctl:number|null, atl:number|null, tsb:number, asOfDate:string, daysProjected:number}}
 */
export function currentPmc(rides, todayISO) {
  const withPmc = (rides || [])
    .filter((r) => r.dateISO && r.dateISO <= todayISO && tsbOf(r) != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (!withPmc.length) return null;
  const last = withPmc[withPmc.length - 1];
  if (last.ctl == null || last.atl == null) {
    return { ctl: last.ctl ?? null, atl: last.atl ?? null, tsb: tsbOf(last), asOfDate: last.dateISO, daysProjected: 0 };
  }
  const daysProjected = Math.max(0, diffDays(todayISO, last.dateISO));
  const projected = projectPmc(last.ctl, last.atl, daysProjected);
  return { ...projected, asOfDate: last.dateISO, daysProjected };
}

/**
 * TSB-Trend über die letzten `windowDays` Tage: vergleicht den aktuellen
 * (ggf. projizierten) TSB mit dem PMC-Stand vor `windowDays` Tagen.
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @param {number} [windowDays]
 * @returns {null | {direction:"steigend"|"fallend"|"stabil", delta:number}}
 */
export function tsbTrend(rides, todayISO, windowDays = 3) {
  const now = currentPmc(rides, todayISO);
  if (!now) return null;
  const past = new Date(`${todayISO}T00:00:00`);
  past.setDate(past.getDate() - windowDays);
  const pastPmc = currentPmc(rides, localISODate(past));
  if (!pastPmc) return null;
  const delta = Math.round((now.tsb - pastPmc.tsb) * 10) / 10;
  const direction =
    Math.abs(delta) < TSB_TREND_STABLE_BAND ? "stabil" : delta > 0 ? "steigend" : "fallend";
  return { direction, delta };
}
