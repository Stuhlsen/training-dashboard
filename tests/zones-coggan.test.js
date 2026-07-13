/* Tests: Coggan-Leistungszonen für den Hero-Header (core/zones.js) —
   computeZones, sweetSpotBand, scaleMaxWatts, last7DayZoneTimes.
   Getrennt von den Ride-Historie-Bänderungstests in loadguard-readiness-
   zones.test.js / analysis-extensions.test.js (andere Zuständigkeit). */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeZones,
  sweetSpotBand,
  scaleMaxWatts,
  last7DayZoneTimes,
} from "../assets/js/core/zones.js";

test("computeZones(193): fünf Zonen mit korrekten, gerundeten Watt-Grenzen", () => {
  const zones = computeZones(193);
  assert.equal(zones.length, 5);
  assert.deepEqual(
    zones.map((z) => z.id),
    ["z1", "z2", "z3", "z4", "z5"]
  );
  // 193 × [0.55, 0.75, 0.90, 1.05, 1.20] = [106.15, 144.75, 173.7, 202.65, 231.6]
  assert.deepEqual(
    zones.map((z) => z.bisW),
    [106, 145, 174, 203, 232]
  );
  assert.equal(zones[0].vonW, 0);
});

test("computeZones: lückenlose Kette (Zone n.bisW === Zone n+1.vonW)", () => {
  for (const ftp of [193, 210, 300, 430]) {
    const zones = computeZones(ftp);
    for (let i = 0; i < zones.length - 1; i++) {
      assert.equal(zones[i].bisW, zones[i + 1].vonW);
    }
  }
});

test("computeZones(210): Rundungs-Grenzfall exakt bei .5", () => {
  // 210 × 0.55 = 115.5 → 116 (Math.round rundet .5 aufwärts)
  const zones = computeZones(210);
  assert.equal(zones[0].bisW, 116);
});

test("computeZones(300): Grenzen für Athlet-2-Ziel-FTP", () => {
  // 300 × [0.55, 0.75, 0.90, 1.05, 1.20] = [165, 225, 270, 315, 360]
  const zones = computeZones(300);
  assert.deepEqual(
    zones.map((z) => z.bisW),
    [165, 225, 270, 315, 360]
  );
});

test("computeZones(430): Referenz-Obergrenze (Profi-Niveau), zweiter Rundungsfall", () => {
  // 430 × 0.55 = 236.5 → 237
  const zones = computeZones(430);
  assert.equal(zones[0].bisW, 237);
  // 430 × 1.20 = 516
  assert.equal(zones[4].bisW, 516);
});

test("computeZones: genau 5 Einträge, keine Z6-Zone im Array (Kappung)", () => {
  const zones = computeZones(300);
  assert.equal(zones.length, 5);
  assert.ok(!zones.some((z) => z.id === "z6"));
});

test("computeZones: ungültige Eingaben → leeres Array", () => {
  assert.deepEqual(computeZones(0), []);
  assert.deepEqual(computeZones(null), []);
  assert.deepEqual(computeZones(-10), []);
});

test("sweetSpotBand(193): 88–94% FTP, liegt zwischen Z3- und Z4-Bereich", () => {
  // 193 × [0.88, 0.94] = [169.84, 181.42] → [170, 181]
  const band = sweetSpotBand(193);
  assert.deepEqual(band, { vonW: 170, bisW: 181 });
  const zones = computeZones(193);
  const z3 = zones.find((z) => z.id === "z3");
  const z4 = zones.find((z) => z.id === "z4");
  // Overlay überspannt die Z3/Z4-Grenze (liegt nicht komplett in einer Zone)
  assert.ok(band.vonW < z4.vonW && band.bisW > z3.bisW);
});

test("sweetSpotBand(210/300/430): korrekt gerundete 88%/94%-Werte", () => {
  assert.deepEqual(sweetSpotBand(210), { vonW: Math.round(210 * 0.88), bisW: Math.round(210 * 0.94) });
  assert.deepEqual(sweetSpotBand(300), { vonW: 264, bisW: 282 });
  assert.deepEqual(sweetSpotBand(430), { vonW: 378, bisW: 404 });
});

test("scaleMaxWatts: entspricht immer computeZones(ftp)[4].bisW", () => {
  for (const ftp of [193, 210, 300, 430]) {
    assert.equal(scaleMaxWatts(ftp), computeZones(ftp)[4].bisW);
  }
});

test("scaleMaxWatts: ungültiger FTP → 0", () => {
  assert.equal(scaleMaxWatts(0), 0);
});

const RIDES_7D = [
  { dateISO: "2026-07-13", zoneTimes: [600, 300, 0, 0, 0] }, // heute
  { dateISO: "2026-07-10", zoneTimes: [1200, 0, 0, 0, 0] }, // vor 3 Tagen
  { dateISO: "2026-07-07", zoneTimes: [0, 0, 600, 0, 0] }, // genau vor 6 Tagen (Grenze, inklusiv)
  { dateISO: "2026-07-06", zoneTimes: [0, 0, 0, 900, 0] }, // vor 7 Tagen (außerhalb, exklusiv)
  { dateISO: "2026-07-12", zoneTimes: [0, 0, 0, 0, 200] }, // gestern
];

test("last7DayZoneTimes: summiert Rides im 7-Tage-Fenster, ältere ausgeschlossen", () => {
  const secs = last7DayZoneTimes(RIDES_7D, "2026-07-13");
  // Fenster: 2026-07-07 bis 2026-07-13 (inklusiv, 7 Tage) — 07-06 fällt raus
  assert.deepEqual(secs, [1800, 300, 600, 0, 200]);
});

test("last7DayZoneTimes: Rides ohne zoneTimes tragen 0 bei statt zu crashen", () => {
  const rides = [{ dateISO: "2026-07-13" }, { dateISO: "2026-07-12", zoneTimes: null }];
  assert.deepEqual(last7DayZoneTimes(rides, "2026-07-13"), [0, 0, 0, 0, 0]);
});

test("last7DayZoneTimes: leeres rides-Array → Array aus Nullen", () => {
  assert.deepEqual(last7DayZoneTimes([], "2026-07-13"), [0, 0, 0, 0, 0]);
  assert.deepEqual(last7DayZoneTimes(null, "2026-07-13"), [0, 0, 0, 0, 0]);
});

test("last7DayZoneTimes: Index ≥4 wird zu Z5+ zusammengefasst", () => {
  const rides = [{ dateISO: "2026-07-13", zoneTimes: [0, 0, 0, 0, 100, 50, 25] }];
  const secs = last7DayZoneTimes(rides, "2026-07-13");
  assert.equal(secs[4], 175);
});

/* Regression: What-if-Slider-Bug — die Hero-Leistungsskala (ui/overview.js)
 * rendert Zonenbreiten als (bisW - vonW) / scaleMax. Wird scaleMax bei JEDEM
 * Slider-Tick erneut aus scaleMaxWatts(whatIfFtp) berechnet (self-relative),
 * sind die Breiten-Anteile für JEDEN FTP-Wert IDENTISCH (Zone-Grenzen UND
 * Skalenmax skalieren mit demselben Faktor, kürzt sich exakt heraus) — der
 * Slider bewegt dann zwar Pins/Zahlen, aber die farbigen Balken bleiben
 * optisch "eingefroren". Der Fix in ui/overview.js hält scaleMax fest auf
 * scaleMaxWatts(WHATIF_MAX_FTP) (430, dem Slider-Obergrenze), sodass die
 * Breiten mit whatIfFtp echt variieren. Dieser Test pinnt genau das fest. */
test("Regression: Zonenbreiten relativ zu FESTER Skala unterscheiden sich für unterschiedliche Ziel-FTP (What-if-Slider muss die Balken sichtbar verändern)", () => {
  const WHATIF_MAX_FTP = 430; // muss zum Slider-max in ui/overview.js passen
  const fixedScale = scaleMaxWatts(WHATIF_MAX_FTP);
  const relWidths = (ftp) => computeZones(ftp).map((z) => (z.bisW - z.vonW) / fixedScale);

  const at210 = relWidths(210);
  const at430 = relWidths(WHATIF_MAX_FTP);
  assert.notDeepEqual(at210, at430);
  // Z1 füllt bei 210W nur ~22% der festen Skala, bei 430W ~46% — deutlich sichtbarer Unterschied
  assert.ok(at430[0] - at210[0] > 0.15);

  // Gegenprobe: die alte (fehlerhafte) self-relative Rechnung liefert für
  // jeden FTP praktisch dieselben Anteile (Rundungsrauschen < 0.5 Prozentpunkte)
  const relWidthsSelfRelative = (ftp) => computeZones(ftp).map((z) => (z.bisW - z.vonW) / scaleMaxWatts(ftp));
  const selfAt210 = relWidthsSelfRelative(210);
  const selfAt430 = relWidthsSelfRelative(WHATIF_MAX_FTP);
  for (let i = 0; i < selfAt210.length; i++) {
    assert.ok(Math.abs(selfAt210[i] - selfAt430[i]) < 0.005);
  }

  // Am Slider-Maximum füllt Zone 5 exakt die feste Skala aus (kein Überlauf möglich)
  assert.equal(computeZones(WHATIF_MAX_FTP)[4].bisW, fixedScale);
});
