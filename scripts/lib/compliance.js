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

   Rückwirkende Strukturableitung (Auftrag "Rückwirkende Strukturableitung
   für den Altbestand"): trägt eine Karte KEINE echte workout_structure,
   versucht resolveEvaluableCard() ersatzweise core/workout-structure-
   derive.js gegen ihren Freitext-Titel — rein in-memory, bei jedem Lauf neu
   berechnet, NIE nach plan_cards zurückgeschrieben. Die entstehende
   Compliance trägt dann `derived: true` als Begleitfeld (nicht innerhalb
   der Struktur selbst, s. dortiger Kopfkommentar).

   Ride↔Format-Brücke (Auftrag "Ride↔Format-Brücke, Verdrahtung, echte
   Sperre", Schritt 1): direkt nach computeCompliance() zusätzlich
   core/session-format-match.js::inferFormatId() gegen dieselbe (echte oder
   abgeleitete) Struktur aufrufen und, falls eindeutig, als
   `compliance.matchedFormatId` ergänzen — der fehlende Katalogbezug, den
   state/ladder.js::getPresetSuggestion() für einen echten Stufenvorschlag
   braucht. `formatCatalog` ist ein optionaler letzter Parameter (leeres
   Array/undefined -> matchedFormatId bleibt unbesetzt, kein Fehler) —
   bestehende Aufrufer ohne dieses Argument (scripts/backtest-ladder.js)
   bleiben unverändert gültig.
   ============================================================ */

import { ftpAt } from "./ftp-history.js";
import { pickPrimaryRide, shouldEvaluateCard, computeCompliance } from "./core/compliance-match.js";
import { deriveWorkoutStructure } from "./core/workout-structure-derive.js";
import { inferFormatId } from "./core/session-format-match.js";

/**
 * Welche Karte eines Tages ausgewertet wird, und mit welcher Struktur:
 * zuerst wie bisher eine Karte mit echter, gültiger workout_structure
 * (shouldEvaluateCard), sonst — für Karten, die NICHT ausgefallen/rest sind
 * und (noch) keine Struktur tragen — ein Ableitungsversuch aus dem Titel.
 * Eine Karte mit bereits vorhandenem (auch ungültigem/leerem)
 * workoutStructure wird nie zur Ableitung herangezogen, um eine absichtlich
 * unvollständige echte Karte nicht stillschweigend zu überschreiben.
 * @param {Array<{name?:string, status?:string, typ?:string, workoutStructure?:any}>} cardsOfDay
 * @returns {{card:Object, structure:Object, derived:boolean}|null}
 */
function resolveEvaluableCard(cardsOfDay) {
  const list = cardsOfDay || [];
  const real = list.find(shouldEvaluateCard);
  if (real) return { card: real, structure: real.workoutStructure, derived: false };

  for (const card of list) {
    if (!card || card.status === "ausgefallen" || card.typ === "rest" || card.workoutStructure) continue;
    const derivedResult = deriveWorkoutStructure(card.name);
    if (derivedResult) return { card, structure: derivedResult.structure, derived: true };
  }
  return null;
}

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
 * @param {Array<{id:string, label?:string, currency:string, axes?:Object}>} [formatCatalog] session_formats (Ride↔Format-Brücke)
 * @returns {{green:number, yellow:number, red:number, evaluated:number}}
 */
export function attachCompliance(rides, activities, cards, intervalBlockCache, ftpHistory, fallbackFtp, formatCatalog = []) {
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

    const resolved = resolveEvaluableCard(cardsByDate.get(date));
    if (!resolved) continue; // keine Karte, keine (echte oder ableitbare) Struktur, ausgefallen, oder rest (D6.1)

    const segments = intervalBlockCache[String(entry.activityId)]?.segments;
    if (!segments) continue; // noch nicht im Cache — nächster Sync holt es nach

    const { ftpWatt } = ftpAt(ftpHistory, date, fallbackFtp);
    const compliance = computeCompliance(resolved.structure, segments, ftpWatt, {
      rpe: primary.rpe ?? null,
      cardId: resolved.card.id,
    });
    if (!compliance) continue; // keine matchbaren Einheiten in der Struktur
    if (resolved.derived) compliance.derived = true;

    const formatId = inferFormatId(resolved.structure, formatCatalog);
    if (formatId) compliance.matchedFormatId = formatId;

    primary.compliance = compliance;
    counts.evaluated++;
    counts[compliance.rating]++;
  }

  return counts;
}
