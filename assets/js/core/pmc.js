/* ============================================================
   CORE/PMC.JS — Performance-Management-Berechnungen (kein DOM)
   CTL-Interpolation und TSB-Ableitung, getrennt vom Rendering.
   ============================================================ */

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
