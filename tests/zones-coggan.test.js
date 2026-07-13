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
  whatIfScaleMax,
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

/* Regressionen rund um den What-if-Slider (drei Runden Bugreports):
 * (1) Self-relative scaleMax (= reine Multiplikation aus ftp) macht die
 *     Zonenbreiten-ANTEILE für jeden FTP-Wert identisch (Faktor kürzt sich
 *     algebraisch heraus) UND friert den Ziel-Marker ein (Ziel === ftp,
 *     gleicher Kürzungseffekt) — Balken UND Ziel-Marker "hängen" fest.
 * (2) Eine rein FIXE Skala (unabhängig von ftp) löst (1), friert aber
 *     FTP-/eFTP-Marker ein (fixe Watt-Werte / fixe Skala = fixer Prozentsatz).
 * whatIfScaleMax() (Skalenmax + fester Watt-Puffer) löst beide Probleme
 * gleichzeitig: Zonenbreiten, Ziel-Marker UND FTP/eFTP-Marker bewegen sich
 * alle sichtbar mit dem Ziel-FTP. Die Container-Breite selbst ist davon
 * unberührt, da core/ nur Prozentwerte liefert — die Pixelbreite des
 * äußeren Skala-Containers setzt ui/overview.js nie per JS (manuell im
 * Browser verifiziert, nicht separat unit-testbar ohne DOM). */
test("whatIfScaleMax: KEINE reine Multiplikation von ftp (Puffer bricht die Selbstkürzung)", () => {
  // Bei purer Multiplikation (scaleMaxWatts(ftp) = 1.2×ftp) wäre
  // whatIfScaleMax(ftp)/ftp für jeden ftp identisch — mit Puffer nicht.
  const ratio = (ftp) => whatIfScaleMax(ftp) / ftp;
  assert.notEqual(ratio(210).toFixed(4), ratio(430).toFixed(4));
});

test("whatIfScaleMax: Zonenbreiten-Anteile unterscheiden sich sichtbar für unterschiedliche Ziel-FTP", () => {
  const relWidths = (ftp) => computeZones(ftp).map((z) => (z.bisW - z.vonW) / whatIfScaleMax(ftp));
  const at210 = relWidths(210);
  const at430 = relWidths(430);
  assert.notDeepEqual(at210, at430);
  assert.ok(Math.abs(at430[0] - at210[0]) > 0.03); // Z1: deutlich mehr als Rundungsrauschen
});

test("whatIfScaleMax: Ziel-Marker (Wert === ftp selbst) bewegt sich sichtbar mit dem Slider", () => {
  const zielPct = (ftp) => (ftp / whatIfScaleMax(ftp)) * 100;
  assert.ok(Math.abs(zielPct(430) - zielPct(210)) > 5); // Prozentpunkte
});

test("whatIfScaleMax: FTP-/eFTP-Marker (feste Watt-Werte) bewegen sich sichtbar, wenn NUR der Ziel-FTP (Slider) sich ändert", () => {
  const FIXED_FTP = 193; // reale, unveränderliche Athleten-FTP — nicht der Slider-Wert
  const pinPctAt = (targetFtp) => (FIXED_FTP / whatIfScaleMax(targetFtp)) * 100;
  const at210 = pinPctAt(210);
  const at430 = pinPctAt(430);
  assert.ok(Math.abs(at430 - at210) > 5); // Prozentpunkte — sichtbare Verschiebung, nicht eingefroren

  // Gegenprobe: unter reinem scaleMaxWatts (self-relative, ohne Puffer) wäre
  // die Verschiebung zwar vorhanden, aber der Ziel-Marker gleichzeitig fast
  // eingefroren (< 1 Prozentpunkt) — genau das Problem, das whatIfScaleMax löst.
  const zielPctSelfRelative = (ftp) => (ftp / scaleMaxWatts(ftp)) * 100;
  assert.ok(Math.abs(zielPctSelfRelative(430) - zielPctSelfRelative(210)) < 1);
});

test("whatIfScaleMax: wächst monoton mit ftp, 0 bei ungültigem ftp", () => {
  assert.ok(whatIfScaleMax(300) > whatIfScaleMax(210));
  assert.equal(whatIfScaleMax(0), 0);
  assert.equal(whatIfScaleMax(null), 0);
});
