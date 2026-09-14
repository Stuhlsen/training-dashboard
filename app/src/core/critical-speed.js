/* ============================================================
   CORE/CRITICAL-SPEED.JS — Schwellenpace-/CS-Schätzung (kein DOM)

   Fahrplan 10 E7 — noch von niemandem konsumiert (E8 verdrahtet).

   MODELL: 2-Punkt-Critical-Speed. Aus zwei (annähernd erschöpfenden)
   Efforts unterschiedlicher Distanz:
       CS   = (d2 − d1) / (t2 − t1)        (Geschwindigkeit)
       D'   =  d1 − CS · t1                 (anaerobe Distanzreserve)
   Standard-Zeitfahrt-Methode (Monod & Scherrer 1965 für Kraft, auf
   Laufen/Schwimmen als „Critical Speed / Critical Swim Speed"
   übertragen; Swim-Smooth CSS nutzt exakt diese 2-Punkt-Form aus
   400 m + 200 m). Die einheitsneutrale Kernfunktion
   criticalSpeedFromTwoEfforts() deckt Lauf UND Schwimm ab —
   Schwimm-CSS wird mangels Daten (0 Aktivitäten, E0 2026-09-07) nur
   synthetisch getestet.

   KEIN intervals.icu-Threshold-Feld (LP1: selbst schätzen). KEIN
   Stream-Abruf — nur Ganzfahrt-km/min. Eine dauer-basierte CS über
   Streams ist offen, bis welche vorliegen.

   UNKALIBRIERT: die 2-Punkt-Formel setzt voraus, dass beide Efforts
   nahe erschöpfend waren. Athlet 3 hat 2 lockere Dauerläufe im Account
   — der geschätzte Wert unterschätzt dann die echte Schwelle. Das
   Ergebnis trägt `calibrated: false` + `note`, nie stillschweigend.
   ============================================================ */

import { ridesForSport } from "./activity-sport.js";
import { bestEffortPerBucket, STANDARD_RUN_DISTANCES_KM } from "./pace-curve.js";

/** @typedef {import("../types.js").Ride} Ride */

/** Standard-Distanz-Buckets Schwimmen, in KM — gleiche Einheit wie `ride.km`
 *  (intervals.icu liefert `distance` sportartunabhängig in Metern;
 *  `baseFields()` in scripts/lib/map-activity.js rechnet einheitlich
 *  km = distance/1000, gegen den Sync-Code geprüft, Fahrplan 14 E3).
 *  100/200/400/750/1500 m — verbreitete CSS-Test-/Bahn-Wettkampfdistanzen
 *  (Swim-Smooth 400+200-CSS-Test, dazu gängige Renndistanzen). */
export const STANDARD_SWIM_DISTANCES_KM = [0.1, 0.2, 0.4, 0.75, 1.5];

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);

/** Die zwei Efforts müssen sich in der Distanz deutlich unterscheiden,
 *  sonst wird Δd/Δt schlecht konditioniert (winziges Δd → ein Minute
 *  Zeitunterschied halbiert die geschätzte Geschwindigkeit). Ein echter
 *  CS-Test nutzt Efforts im Verhältnis ~3–4× (z. B. 3 min / 12 min).
 *  1,5× ist die untere Grenze, ab der die Gerade überhaupt tragfähig ist. */
const CS_MIN_DISTANCE_RATIO = 1.5;

/**
 * 2-Punkt-Critical-Speed aus zwei Efforts. Einheitsneutral: `distance`
 * und `duration` müssen konsistente Einheiten tragen; `speed` kommt in
 * `distance/duration` zurück. Die Reihenfolge der Argumente ist egal
 * (intern nach Dauer sortiert).
 * @param {{distance: number, duration: number}} a
 * @param {{distance: number, duration: number}} b
 * @returns {{speed: number, dPrime: number} | null}
 *   null, wenn die Efforts nicht monoton sind (gleiche/rückläufige
 *   Distanz oder Dauer) — dann ist die Gerade nicht bestimmbar.
 */
export function criticalSpeedFromTwoEfforts(a, b) {
  if (!a || !b) return null;
  const [p, q] = [a, b].sort((x, y) => x.duration - y.duration);
  const dd = q.distance - p.distance;
  const dt = q.duration - p.duration;
  if (dt <= 0 || dd <= 0) return null;
  const speed = dd / dt;
  return { speed, dPrime: p.distance - speed * p.duration };
}

/**
 * Geschätzte Schwellengeschwindigkeit (km/h) eines Athleten aus seinen
 * echten Aktivitäten — Laufen ODER Schwimmen (Fahrplan 14 E3: `sport`-
 * Parameter, bestehende Aufrufer bleiben unverändert auf `"run"`). Bildet
 * Distanz-Bucket-Bestwerte (geteilt mit pace-curve.js) und legt die
 * 2-Punkt-CS-Gerade durch die zwei am weitesten getrennten belegten Buckets.
 * @param {Ride[]} rides  volle Aktivitätsliste (wird intern auf `sport` gefiltert)
 * @param {{minDurationMin?: number, distances?: number[], sport?: "run"|"swim"}} [opts]
 *   `minDurationMin` Default sportabhängig: 15 (Lauf), 3 (Schwimmen — ein
 *   CSS-Test über 100/200/400 m dauert oft nur wenige Minuten).
 * @returns {{speed: number|null, calibrated: false} & Record<string, unknown>}
 *   Immer ein Objekt. `speed: null` + `reason`, wenn < 2 belegte
 *   Distanz-Buckets vorliegen (Degradations-Muster wie zoneTimes, nicht raten).
 */
export function estimateThresholdSpeed(rides, opts = {}) {
  const { sport = "run" } = opts;
  // Sportabhängiger Default: ein Schwimm-CSS-Test (100/200/400 m) dauert
  // oft nur wenige Minuten — der Lauf-Default (15 min) würde diese Buckets
  // fast nie erreichbar machen. 3 min filtert weiterhin kurze Einschwimm-/
  // Pausenabschnitte raus, ohne echte Testdistanzen zu verwerfen.
  const minDurationMin = opts.minDurationMin ?? (sport === "swim" ? 3 : 15);
  const distances =
    opts.distances || (sport === "swim" ? STANDARD_SWIM_DISTANCES_KM : STANDARD_RUN_DISTANCES_KM);
  // Sport-Gate über den geteilten Helfer (Guardrail 4), dann die
  // Effort-Mindestkriterien.
  const activities = ridesForSport(rides, sport).filter(
    (r) => num(r.min) >= minDurationMin && num(r.km) > 0
  );
  const efforts = bestEffortPerBucket(activities, distances);
  if (efforts.length < 2) {
    return {
      speed: null,
      calibrated: false,
      reason:
        `zu wenige belegte Distanz-Buckets (${efforts.length}/2) — die 2-Punkt-` +
        `Critical-Speed braucht zwei Efforts unterschiedlicher Distanz`,
    };
  }
  const lo = efforts[0];
  const hi = efforts[efforts.length - 1];
  if (hi.distance < lo.distance * CS_MIN_DISTANCE_RATIO) {
    return {
      speed: null,
      calibrated: false,
      reason:
        `Efforts zu nah beieinander (${lo.distance.toFixed(1)} km / ${hi.distance.toFixed(1)} km, ` +
        `Verhältnis < ${CS_MIN_DISTANCE_RATIO}) — Δd/Δt schlecht konditioniert, ` +
        `die CS-Schätzung wäre nicht belastbar`,
    };
  }
  const cs = criticalSpeedFromTwoEfforts(
    { distance: lo.distance, duration: lo.durationSec },
    { distance: hi.distance, duration: hi.durationSec }
  );
  if (!cs) {
    return {
      speed: null,
      calibrated: false,
      reason: "Efforts nicht monoton (Distanz/Zeit nicht aufsteigend) — CS-Gerade unbestimmt",
    };
  }
  // D' ≤ 0 ist physikalisch unmöglich (anaerobe Reserve kann nicht negativ
  // sein). Es entsteht, wenn der längere Effort AUCH der schnellere war —
  // dann war mindestens einer nicht erschöpfend, und die 2-Punkt-Gerade
  // kippt in einen unsinnigen Steilwert (bei Athlet 3s zwei lockeren
  // Dauerläufen live beobachtet: 24 km/h). Kein Wert statt eines
  // flagged-aber-kaputten (Muster wie die NP-FTP-Härtung in E6).
  if (cs.dPrime <= 0) {
    const longerLabel = sport === "swim" ? "das längere Schwimmen" : "der längere Lauf";
    return {
      speed: null,
      calibrated: false,
      reason:
        `Efforts nicht erschöpfend genug — 2-Punkt-CS ergibt negatives D' (${longerLabel} ` +
        "war schneller). Ein echter Schwellen-/Zeitfahrt-Effort fehlt.",
    };
  }
  return {
    speed: Math.round(cs.speed * 3600 * 100) / 100, // km/s → km/h
    dPrimeKm: Math.round(cs.dPrime * 1000) / 1000,
    calibrated: false,
    source: "2-point-cs",
    note:
      "2-Punkt-Critical-Speed aus zwei Ganzfahrt-Efforts. UNKALIBRIERT: setzt " +
      "voraus, dass beide Efforts nahe erschöpfend waren — bei lockeren " +
      "Dauerläufen unterschätzt das die echte Schwelle.",
    efforts: [
      { km: Math.round(lo.distance * 100) / 100, min: Math.round(lo.durationSec / 60) },
      { km: Math.round(hi.distance * 100) / 100, min: Math.round(hi.durationSec / 60) },
    ],
  };
}
