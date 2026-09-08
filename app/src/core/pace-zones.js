/* ============================================================
   CORE/PACE-ZONES.JS — Pace-Zonen aus geschätzter Schwelle (kein DOM)

   Das Pace-Pendant zu core/zones.js::computeZones(ftp). Fahrplan 10 E7
   — noch von niemandem konsumiert (E8 verdrahtet).

   ANKER (Fahrplan 10 V4 / Q2): `sportZones.upperPct` ist der Anteil der
   Schwellen-GESCHWINDIGKEIT (aufsteigend, 1,0 = Schwellentempo), exakt
   dieselbe Denkweise wie % FTP beim Rad. Zone n endet, wo n+1 beginnt.

   SPORT-NEUTRAL (Q11): die Funktionen nehmen die Profil-Werte als
   Argument — kein `if (sport === …)`. `computePaceZones` wird mit
   runningZones (km/h) UND swimmingZones (m/s) getestet.

   GUARDRAIL 4 (Zonen-Vorbehalt): paceBandShares() ruft vorweg
   ridesForSport() — eine Pace-Bänderung bekommt so nie Rad- (oder
   sportfremde) Aktivitäten.

   NICHT hier: HF-Zonen (bpm-Bänder aus hrMax × %HFmax). hrMax lebt in
   der athlete3-Zeile in app/src/config.ts, die E8 anlegt — offen bis dahin.
   ============================================================ */

import { ridesForSport } from "./activity-sport.js";

/** @typedef {import("../types.js").Ride} Ride */
/** @typedef {import("../sports/types.js").SportZones} SportZones */

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);
const round2 = (v) => Math.round(v * 100) / 100;

/** Geschwindigkeit → Pace in Sekunden pro Distanz-Einheit. Zwei
 *  fertige Umrechner für die zwei Sportarten (Aufrufer wählt); jede
 *  gibt `null` bei Geschwindigkeit ≤ 0. */
export const PACE_FROM_KMH = (kmh) => (kmh > 0 ? 3600 / kmh : null); // → s/km
export const PACE_FROM_MPS_PER_100M = (mps) => (mps > 0 ? 100 / mps : null); // → s/100 m

/**
 * Pace-Trainingszonen für eine geschätzte Schwellengeschwindigkeit, als
 * lückenlose Kette — spiegelt zones.js::computeZones(ftp).
 * @param {number} thresholdSpeed  geschätzte Schwellen-/CS-Geschwindigkeit (> 0)
 * @param {SportZones} sportZones   runningZones | swimmingZones
 * @param {(speed: number) => number|null} [toPaceSec]  Umrechner (Default: km/h → s/km)
 * @returns {Array<{id: string, label: string, farbe: string, vonSpeed: number, bisSpeed: number, vonPaceSec: number|null, bisPaceSec: number|null}>}
 *   Genau upperPct.length Einträge; leeres Array bei ungültiger Schwelle.
 */
export function computePaceZones(thresholdSpeed, sportZones, toPaceSec = PACE_FROM_KMH) {
  if (!thresholdSpeed || thresholdSpeed <= 0 || !sportZones) return [];
  const { upperPct, meta } = sportZones;
  let prevSpeed = 0;
  return upperPct.map((pct, i) => {
    const bisSpeed = round2(thresholdSpeed * pct);
    const zone = {
      ...meta[i],
      vonSpeed: prevSpeed,
      bisSpeed,
      // schnellere Geschwindigkeit ⇒ kleinere Pace: vonPaceSec ≥ bisPaceSec.
      // Zone 1 beginnt bei Geschwindigkeit 0 ⇒ Pace unendlich ⇒ null.
      vonPaceSec: prevSpeed > 0 ? Math.round(/** @type {number} */ (toPaceSec(prevSpeed))) : null,
      bisPaceSec: Math.round(/** @type {number} */ (toPaceSec(bisSpeed))),
    };
    prevSpeed = bisSpeed;
    return zone;
  });
}

/**
 * Skalenmaximum der Pace-Skala = Ende der letzten Zone, analog
 * zones.js::scaleMaxWatts. In GESCHWINDIGKEIT (die Anzeige wächst
 * dynamisch aus der Schwelle — metrics.scaleMax ist `null`).
 * @param {number} thresholdSpeed
 * @param {SportZones} sportZones
 * @returns {number}
 */
export function paceScaleMax(thresholdSpeed, sportZones) {
  const zones = computePaceZones(thresholdSpeed, sportZones);
  return zones.length ? zones[zones.length - 1].bisSpeed : 0;
}

/**
 * Grobe Ganzfahrt-Intensitätsbänderung für Lauf/Schwimm — das
 * Pace-Pendant zu zones.js::overallBandsFromIF (kein zoneTimes für
 * Nicht-Rad). Ø-Tempo je Aktivität als Anteil der Schwelle, in
 * low/mid/high einsortiert (Grenzen aus `sportZones.ifBands`),
 * dauergewichtet. In der UI IMMER als „Näherung über Ø-Tempo" labeln.
 * @param {Ride[]} rides   volle Aktivitätsliste
 * @param {number} thresholdSpeed  geschätzte Schwellen-/CS-Geschwindigkeit (km/h)
 * @param {SportZones} sportZones
 * @param {"run"|"swim"} [sport]
 * @returns {null | {low: number, mid: number, high: number, total: number, shares: {low: number, mid: number, high: number}, hours: number, nActivities: number, source: "avg-pace"}}
 */
export function paceBandShares(rides, thresholdSpeed, sportZones, sport = "run") {
  if (!thresholdSpeed || thresholdSpeed <= 0 || !sportZones) return null;
  const { ifBands } = sportZones;
  const subset = ridesForSport(rides, sport);
  let low = 0,
    mid = 0,
    high = 0,
    n = 0;
  for (const r of subset) {
    const min = num(r.min);
    const kmh = num(r.kmh) || (num(r.km) > 0 && min > 0 ? num(r.km) / (min / 60) : 0);
    if (kmh <= 0 || min <= 0) continue;
    const frac = kmh / thresholdSpeed;
    const secs = min * 60;
    if (frac < ifBands.lowMax) low += secs;
    else if (frac <= ifBands.midMax) mid += secs;
    else high += secs;
    n++;
  }
  const total = low + mid + high;
  if (!total || !n) return null;
  const share = (v) => Math.round((v / total) * 1000) / 1000;
  return {
    low,
    mid,
    high,
    total,
    shares: { low: share(low), mid: share(mid), high: share(high) },
    hours: Math.round((total / 3600) * 10) / 10,
    nActivities: n,
    source: "avg-pace",
  };
}
