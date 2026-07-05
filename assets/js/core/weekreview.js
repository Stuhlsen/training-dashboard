/* ============================================================
   CORE/WEEKREVIEW.JS — Wochenrückblick (kein DOM)
   Fasst die letzte abgeschlossene Trainingswoche (Mo–So) zu einer
   erzählbaren Karte zusammen: Umfang, stärkste Leistung, Wetter-
   Highlight, Plan-Erfüllung. Der wiederkehrende Rückblick-Moment,
   der regelmäßiges Reinschauen belohnt.
   ============================================================ */

/** Mo–So-Bereich der letzten abgeschlossenen Woche vor todayISO
 *  @param {string} todayISO @returns {{from: string, to: string}} */
export function lastCompletedWeekRange(todayISO) {
  const d = new Date(todayISO + "T00:00:00");
  const dow = (d.getDay() + 6) % 7; // Mo=0
  const thisMonday = new Date(d);
  thisMonday.setDate(d.getDate() - dow);
  const to = new Date(thisMonday);
  to.setDate(thisMonday.getDate() - 1); // letzter Sonntag
  const from = new Date(to);
  from.setDate(to.getDate() - 6); // Montag davor
  const iso = (x) => x.toISOString().split("T")[0];
  return { from: iso(from), to: iso(to) };
}

/**
 * Rückblick der letzten abgeschlossenen Woche.
 * @param {import("../types.js").Ride[]} rides
 * @param {Array<{date: string}>} plannedSessions
 * @param {Record<string, {cancelled?: boolean, movedTo?: string}>} adjustments
 * @param {string} todayISO
 * @returns {null | Object} null wenn die Woche keine Fahrten hatte
 */
export function buildWeekReview(rides, plannedSessions, adjustments, todayISO) {
  const { from, to } = lastCompletedWeekRange(todayISO);
  const wr = rides.filter((r) => r.dateISO >= from && r.dateISO <= to);
  if (!wr.length) return null;

  const sum = (k) => wr.reduce((s, r) => s + (r[k] || 0), 0);

  // Stärkste Leistung: höchste NP, sonst längste Fahrt
  const byNp = wr.filter((r) => r.np).sort((a, b) => b.np - a.np);
  const byKm = [...wr].sort((a, b) => (b.km || 0) - (a.km || 0));
  const best = byNp[0] || byKm[0];

  // Wetter-Highlight: härteste Bedingung der Woche
  let weatherNote = null;
  const withW = wr.filter((r) => r.weather?.temp != null);
  if (withW.length) {
    const hot = withW.reduce((m, r) => (r.weather.temp > m.weather.temp ? r : m));
    const windy = withW.reduce((m, r) => ((r.weather.windSpeed || 0) > (m.weather.windSpeed || 0) ? r : m));
    const rainy = withW.filter((r) => (r.weather.precip || 0) > 0.5);
    if (hot.weather.temp >= 30) weatherNote = `Bei ${hot.weather.temp}\u00A0°C gefahren`;
    else if ((windy.weather.windSpeed || 0) >= 28) weatherNote = `${Math.round(windy.weather.windSpeed)}\u00A0km/h Wind getrotzt`;
    else if (rainy.length) weatherNote = `${rainy.length}× im Regen unterwegs`;
    else if (hot.weather.temp <= 5) weatherNote = `Bei ${hot.weather.temp}\u00A0°C durchgezogen`;
  }

  // Plan-Erfüllung (nur mit Trainingsplan): geplante Termine der Woche nach
  // Adjustments (ausgefallen raus, verschoben aufs neue Datum) vs. Fahrten
  let plan = null;
  if (plannedSessions?.length) {
    const adj = adjustments || {};
    const effective = plannedSessions
      .map((s) => {
        const a = adj[s.date];
        if (a?.cancelled) return null;
        return a?.movedTo ? { ...s, date: a.movedTo } : s;
      })
      .filter((s) => s && s.date >= from && s.date <= to);
    if (effective.length) {
      const doneDates = new Set(wr.map((r) => r.dateISO));
      const done = effective.filter((s) => doneDates.has(s.date)).length;
      plan = { planned: effective.length, done };
    }
  }

  return {
    from, to,
    rides: wr.length,
    km: Math.round(sum("km") * 10) / 10,
    min: Math.round(sum("min")),
    tss: Math.round(sum("tss")),
    best: best ? { name: best.name || best.typ || "Fahrt", np: best.np || null, km: best.km || null, date: best.dateISO } : null,
    weatherNote,
    plan,
  };
}
