/* ============================================================
   __FIXTURES__/GOLDEN-MASTER/COMPUTE-SERIES.JS

   Die EINE Rechenkette hinter dem Golden-Master-Test (Fahrplan 10 E2,
   Vertrag V5). Bewusst KEIN nachgebauter Parallel-Algorithmus: ruft
   ausschließlich die echten core/-Funktionen, die auch die UI nutzt
   (PmcChart.tsx / answers-view-model.ts laden ihre CTL/ATL/TSB-Reihe
   über genau dieses densifyPmc()).

   Geteilt zwischen zwei Nutzern, damit Test und Erwartungswert nie
   auseinanderdriften können:
   - pmc-golden-master.test.js — vergleicht das Live-Ergebnis gegen
     das eingefrorene Erwartungs-JSON.
   - das (nicht committete) Wegwerf-Skript, das dieses Erwartungs-JSON
     einmalig erzeugt hat.

   Eingefroren wird bewusst nur der HISTORIEN-Teil der Reihe:
   densifyPmc() mit leerer Prognose (`[]`) und `todayIdx = -1`. Der
   Prognose-Schwanz der echten UI hängt an "heute" + Plankarten +
   Events und ist damit nicht deterministisch einfrierbar — er ist auch
   nicht das, was E3/E6 an den Bestandsathleten gefährden. Geschützt
   ist die reine Fahrt→CTL/ATL/TSB-Durchleitung plus die
   Lücken-Fortschreibung über projectPmc().
   ============================================================ */

import { normalizeRide } from "../../normalize.js";
import { onlyCyclingRides } from "../../activity-sport.js";
import { pmcSkeletonAnchor, densifyDays } from "../../days.js";
import { densifyPmc } from "../../pmc-series.js";

/**
 * Volle CTL/ATL/TSB-Historienreihe eines Athleten aus seinem rohen
 * `rides`-Array (wie es in `rides-N.json` unter `.rides` steht).
 *
 * Schritte = der I/O-freie Kern von api/pipeline.ts::toAthleteData plus
 * der Skelett-/densify-Aufbau aus PmcChart.tsx / answers-view-model.ts:
 *   1. normalizeRide() je Zeile   (ergänzt dateISO/dateShort/…)
 *   2. onlyCyclingRides()          (Fahrplan 10 E1 — der Sportart-Filter)
 *   3. pmcSkeletonAnchor()         (frühester Tag mit ctl+atl)
 *   4. Skelett anchor … letzter Fahrt-Tag (densifyDays)
 *   5. densifyPmc(skelett, rides, [], -1)  → lückenlose Reihe
 *
 * @param {Array<object>} rawRides
 * @returns {Array<{date: string, ctl: number|null, atl: number|null, tsb: number|null}>}
 *   Ein Eintrag je Skelett-Tag. Leeres Array, wenn kein Anker existiert
 *   (kein einziger Ride mit ctl+atl) — ein gültiger eingefrorener Zustand.
 */
export function goldenSeries(rawRides) {
  const rides = onlyCyclingRides((rawRides || []).map((r) => normalizeRide(r)));

  const anchorISO = pmcSkeletonAnchor(rides);
  if (!anchorISO) return [];

  const lastISO = rides
    .map((r) => r.dateISO)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!lastISO || lastISO < anchorISO) return [];

  const skeleton = densifyDays(anchorISO, lastISO);
  const { ctlVals, atlVals, tsbVals } = densifyPmc(skeleton, rides, [], -1);

  return skeleton.map((d, i) => ({
    date: d.dateISO,
    ctl: ctlVals[i],
    atl: atlVals[i],
    tsb: tsbVals[i],
  }));
}
