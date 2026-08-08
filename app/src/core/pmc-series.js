/* ============================================================
   CORE/PMC-SERIES.JS — Lückenlose CTL/ATL/TSB-Reihe + Pfad-Segmente
   (Etappe 8a)

   Portiert aus den bisher privaten Helfern in
   assets/js/ui/charts/pmc.js (densifyPmc Zeile 176, segmentsFor Zeile
   215) — dort direkt neben dem DOM-Rendering, weil vanilla keine
   pure/DOM-Trennung innerhalb einer Datei erzwingt. Hier bewusst als
   eigene, DOM-freie Datei (core/), NICHT als Ergänzung von core/pmc.js:
   core/pmc.js ist laut core/README.md ein bewusst byte-identischer Port
   von assets/js/core/pmc.js und bleibt das unangetastet.

   segmentsFor() bekommt hier bewusst KEINE scale/yOf-Callbacks (anders
   als im vanilla-Original) — Pixel-Mapping bleibt Sache der Komponente,
   diese Datei liefert nur Werte/Indizes und bleibt dadurch ohne
   Scale-Mock testbar.
   ============================================================ */

import { tsbOf, projectPmc } from "./pmc.js";

/**
 * Lückenlose CTL/ATL/TSB-Reihe über den gesamten Skelett-Bereich.
 *
 * CTL/ATL sind eine kontinuierlich geglättete Zustandsgröße — sie existieren
 * an JEDEM Tag, unabhängig davon, wie viele Tage seit der letzten Fahrt
 * vergangen sind. Statt einer willkürlichen Lauflängen-Schwelle wird für
 * JEDEN Tag ohne eigene Ride-Zeile über `projectPmc()` (TSS=0) vom letzten
 * bekannten CTL/ATL aus weiter zerfallen — dieselbe Fortschreibung, die
 * `currentPmc()` bereits für den "Aktuell"-Wert nutzt. Ab `todayIdx` werden
 * ausschließlich die bereits fertigen Werte aus `projectionDays` übernommen,
 * nie eigenständig weitergerechnet (X7, docs/phase-5-konzept-explorer.md §10.1).
 *
 * `rides` wird intern auf Zeilen mit gesetztem `ctl`/`atl` gefiltert und nach
 * `dateISO` sortiert (wie vanilla `pmc.js:553-555`) — Aufrufer übergeben die
 * rohe, ungefilterte Rides-Liste.
 *
 * @param {Array<{dateISO: string}>} skeleton
 * @param {import("../types.js").Ride[]} rides Roh, ungefiltert
 * @param {Array<{date: string, ctl: number, atl: number, tsb: number}>} projectionDays Prognosetage (bereits dicht)
 * @param {number} todayIdx Skelett-Index von "heute" (Prognosestart), -1 wenn unbekannt
 * @returns {{ctlVals: Array<number|null>, atlVals: Array<number|null>, tsbVals: Array<number|null>}}
 */
export function densifyPmc(skeleton, rides, projectionDays, todayIdx) {
  const sortedRides = (rides || [])
    .filter((r) => r.ctl != null && r.atl != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const rideByDate = new Map(sortedRides.map((r) => [r.dateISO, r]));
  const projByDate = new Map((projectionDays || []).map((r) => [r.date, r]));
  const n = skeleton.length;
  const ctlVals = new Array(n).fill(null);
  const atlVals = new Array(n).fill(null);
  const tsbVals = new Array(n).fill(null);
  const histEnd = todayIdx >= 0 ? todayIdx : n; // exklusiv — ab hier zählt nur projectionDays

  let last = null; // { ctl, atl, sinceIdx }
  for (let i = 0; i < histEnd; i++) {
    const ride = rideByDate.get(skeleton[i].dateISO);
    if (ride) {
      ctlVals[i] = ride.ctl;
      atlVals[i] = ride.atl;
      tsbVals[i] = tsbOf(ride);
      last = { ctl: ride.ctl, atl: ride.atl, sinceIdx: i };
    } else if (last) {
      const proj = projectPmc(last.ctl, last.atl, i - last.sinceIdx);
      ctlVals[i] = proj.ctl;
      atlVals[i] = proj.atl;
      tsbVals[i] = proj.tsb;
    }
    // sonst: vor der ersten bekannten Fahrt im sichtbaren Fenster — bleibt
    // null, kein erfundener Vorgeschichte-Wert.
  }
  for (let i = Math.max(histEnd, 0); i < n; i++) {
    const row = projByDate.get(skeleton[i].dateISO);
    if (row) {
      ctlVals[i] = row.ctl;
      atlVals[i] = row.atl;
      tsbVals[i] = row.tsb;
    }
  }
  return { ctlVals, atlVals, tsbVals };
}

/**
 * Baut zusammenhängende Segmente aus einer Werteserie, an `null`-Lücken
 * unterbrochen (kein Sprung über eine echte Datenlücke hinweg). Segmente
 * mit nur einem Punkt werden verworfen (kein sichtbarer Strich möglich).
 * @param {Array<number|null>} vals
 * @param {number} from
 * @param {number} to
 * @returns {Array<Array<{index: number, value: number}>>}
 */
export function segmentsFor(vals, from, to) {
  const segments = [];
  let current = [];
  for (let i = from; i <= to; i++) {
    const v = vals[i];
    if (v == null) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push({ index: i, value: v });
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
