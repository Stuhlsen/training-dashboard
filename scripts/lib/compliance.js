/* ============================================================
   SCRIPTS/LIB/COMPLIANCE.JS — Orchestrierung Soll-Ist-Matching (C1/C2)
   (Progressionssteuerung — docs/konzept-progressionssteuerung.md)

   Verbindet die drei bereits vorhandenen Datenquellen zu ride.compliance:
     - plan_cards (scripts/lib/plan-cards-fetch.js, workout_structure)
     - rohe icu_intervals-Segmente (scripts/lib/interval-blocks.js-Cache)
     - die eigentliche Matching-/Ampel-Rechnung (core/compliance-match.js)

   Muss NACH classifyCooldowns() (map-activity.js) laufen: die Auswahl der
   Hauptfahrt bei mehreren Fahrten am selben Tag (pickPrimaryRide) verlässt
   sich auf ein bereits gesetztes typ === "Ausrollen".

   `rides`/`activities` müssen dieselbe Reihenfolge/Länge haben wie beim
   Mapping (plan2 = activities.map(act => mapActivity(act, ...))) — die
   Blockerkennung-Cache-Lookups (scripts/lib/interval-blocks.js) sind über
   die intervals.icu-Activity-ID indiziert, die im gemappten Ride-Objekt
   selbst nicht mehr vorkommt (dessen `id` wird erst später in
   generate-data.js sequentiell neu vergeben).
   ============================================================ */

import { ftpAt } from "./ftp-history.js";
import { pickPrimaryRide, shouldEvaluateCard, computeCompliance } from "../../assets/js/core/compliance-match.js";

/**
 * Fahrten nach Datum gruppiert der jeweiligen Plankarte gegenüberstellen
 * und `ride.compliance` setzen (nur bei echtem Match — kein Feld sonst,
 * Präzedenz `typDetection`).
 * @param {Array<Object>} rides bereits gemappte Ride-Objekte (in-place ergänzt)
 * @param {Array<{id:string|number}>} activities Rohdaten, gleiche Reihenfolge wie rides
 * @param {Array<{id:string, date:string, typ:string, workoutStructure:Object|null, status:string}>} cards
 * @param {Record<string, Object>} intervalBlockCache
 * @param {Array<{ftpWatt:number, validFrom:string}>} ftpHistory
 * @param {number} fallbackFtp
 * @returns {{green:number, yellow:number, red:number, evaluated:number}}
 */
export function attachCompliance(rides, activities, cards, intervalBlockCache, ftpHistory, fallbackFtp) {
  const counts = { green: 0, yellow: 0, red: 0, evaluated: 0 };

  const byDate = new Map();
  rides.forEach((ride, i) => {
    if (!ride.date) return;
    if (!byDate.has(ride.date)) byDate.set(ride.date, []);
    byDate.get(ride.date).push({ ride, activityId: activities[i]?.id });
  });

  const cardsByDate = new Map();
  for (const card of cards || []) {
    if (!card.date) continue;
    if (!cardsByDate.has(card.date)) cardsByDate.set(card.date, []);
    cardsByDate.get(card.date).push(card);
  }

  for (const [date, entries] of byDate) {
    const primary = pickPrimaryRide(entries.map((e) => e.ride));
    if (!primary) continue; // z.B. nur eine als "Ausrollen" erkannte Fahrt an diesem Tag
    const entry = entries.find((e) => e.ride === primary);
    if (!entry?.activityId) continue;

    const card = (cardsByDate.get(date) || []).find(shouldEvaluateCard);
    if (!card) continue; // keine Karte, Karte ohne Struktur, ausgefallen, oder rest (D6.1)

    const segments = intervalBlockCache[String(entry.activityId)]?.segments;
    if (!segments) continue; // noch nicht im Cache — nächster Sync holt es nach

    const { ftpWatt } = ftpAt(ftpHistory, date, fallbackFtp);
    const compliance = computeCompliance(card.workoutStructure, segments, ftpWatt, {
      rpe: primary.rpe ?? null,
      cardId: card.id,
    });
    if (!compliance) continue; // keine matchbaren Einheiten in der Struktur

    primary.compliance = compliance;
    counts.evaluated++;
    counts[compliance.rating]++;
  }

  return counts;
}
