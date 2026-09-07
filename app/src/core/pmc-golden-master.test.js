/* ============================================================
   CORE/PMC-GOLDEN-MASTER.TEST.JS — Golden-Master der CTL/ATL/TSB-Reihe
   für Athlet 1, 2 und 4 (Fahrplan 10 „Multi-Sport", Etappe E2, Vertrag V5).

   ── Warum dieser Test existiert ────────────────────────────────
   Fahrplan 10 baut das Dashboard sportart-agnostisch um. Die harte
   Zusage an die Bestandsathleten: „Für Athlet 1/2/4 ändert sich kein
   einziger Wert." Spätere Last-Etappen (E3 = Sync-Athletenliste auf
   Config, E6 = Multi-Sport-TRIMP + Governor-Gate) fassen genau den Code
   an, über den diese Reihe entsteht.

   Dieser Test friert die VOLLE Historienreihe CTL/ATL/TSB je Athlet
   ein — nicht nur den „heute"-Tageswert. Eingang eingefroren:
   `__fixtures__/golden-master/rides-{1,2,4}.json` (Schnappschuss der
   echten `data/rides-N.json` vom 2026-09-07, ohne die reinen
   Anzeigefelder `name`/`notizen` — die trägt die Rechenkette nie und
   Athlet 1 hatte dort Ortskürzel). Erwartung eingefroren:
   `pmc-golden-master.expected.json`, aus genau diesem Fixture mit
   `compute-series.js::goldenSeries()` erzeugt.

   Die Rechenkette ist die ECHTE (`compute-series.js` ruft nur die
   core-Funktionen, die auch PmcChart.tsx / answers-view-model.ts
   nutzen) — kein nachgebauter Parallel-Algorithmus. Verglichen wird
   auf EXAKTE Gleichheit (`toEqual`), keine Toleranz, keine Rundung.

   ── Wann dieser Test bricht ───────────────────────────────────
   Wenn eine spätere Etappe unbemerkt die eigene Historie von Athlet
   1/2/4 verbogen hat — die Fahrt→CTL/ATL/TSB-Durchleitung oder die
   Lücken-Fortschreibung (`projectPmc()`) liefert für dieselben
   Eingangsdaten andere Zahlen.

   ── Was dann zu tun ist ───────────────────────────────────────
   Die auslösende Etappe STOPPT. Nicht das Fixture / das Erwartungs-JSON
   „nachziehen", um wieder grün zu werden — das wäre genau die stille
   Verbiegung, die der Test verhindern soll. Erst klären, warum sich der
   Wert bewegt hat, und ob das für die Bestandsathleten überhaupt
   passieren darf (Regel: nein). Nur wenn die Änderung nachweislich
   gewollt und für 1/2/4 unschädlich ist, wird das Erwartungs-JSON in
   einem eigenen, ausdrücklich begründeten Commit neu erzeugt.

   Gegenprobe zu V5 (bei jeder Fixture-Änderung erneut): einen Lastwert
   im Fixture verfälschen ⇒ dieser Test MUSS brechen.
   ============================================================ */

import { describe, it, expect } from "vitest";
import { goldenSeries } from "./__fixtures__/golden-master/compute-series.js";
import expected from "./__fixtures__/golden-master/pmc-golden-master.expected.json";
import ridesA1 from "./__fixtures__/golden-master/rides-1.json";
import ridesA2 from "./__fixtures__/golden-master/rides-2.json";
import ridesA4 from "./__fixtures__/golden-master/rides-4.json";

const FIXTURES = {
  1: ridesA1,
  2: ridesA2,
  4: ridesA4,
};

describe("PMC Golden Master — CTL/ATL/TSB für Athlet 1/2/4 (Fahrplan 10 V5)", () => {
  for (const athlete of [1, 2, 4]) {
    it(`Athlet ${athlete}: volle Reihe unverändert gegen den eingefrorenen Stand`, () => {
      const series = goldenSeries(FIXTURES[athlete]);

      // Erst die Länge — ein Reihen-Längenbruch soll nicht in einem
      // 200-Zeilen-Diff untergehen.
      expect(series.length).toBe(expected[String(athlete)].length);
      // Dann Tag für Tag, exakt.
      expect(series).toEqual(expected[String(athlete)]);
    });
  }
});
