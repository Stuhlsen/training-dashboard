/* Tests: Governor-multiSport-Zweig des Belastungswächters (core/loadguard.js,
   Fahrplan 10 E6). Der Zweig ist in E6 dormant (kein echter Aufrufer setzt
   multiSport:true) — hier mit synthetischem multiSport:true geprüft.

   Guardrail 1: für 1/2/4 (kein multiSport) ändert sich kein Wert — der
   Default-Zweig ist explizit gegengeprüft, nicht nur angenommen. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { riskLevel, buildLoadGuard, describeWeek, rideLoad } from "./loadguard.js";
import { OWN_LOAD_MEDIAN_WEEKS, WEEK_LOAD_CEILING_FACTOR } from "./plan-config.js";

const keyFn = (r) => r.week;
const sortFn = (a, b) => a.localeCompare(b);

/** Eine Woche = genau eine Fahrt mit gegebener Tageslast (tss). */
function wk(n, load) {
  const dd = String(n).padStart(2, "0");
  return { dateISO: `2026-01-${dd}`, week: `W${dd}`, tss: load };
}

/* ── riskLevel: drittes Argument ────────────────────────────── */

test("riskLevel: weekLoadOverCeiling ist optional, Default false → Verhalten wie vor E6", () => {
  assert.equal(riskLevel(2, 1.0), "ok");
  assert.equal(riskLevel(2, 1.0, false), "ok");
  assert.equal(riskLevel(7, 1.0), "caution"); // ramp > RAMP_OK_MAX
  assert.equal(riskLevel(9, 1.0), "high"); // ramp > RAMP_HIGH
});

test("riskLevel: weekLoadOverCeiling === true → immer 'high' (Schärfe wie ramp > RAMP_HIGH)", () => {
  assert.equal(riskLevel(2, 1.0, true), "high");
  assert.equal(riskLevel(null, null, true), "high");
});

/* ── buildLoadGuard: Eigenlast-Wochendeckel ─────────────────── */

test("buildLoadGuard: Konstanten wie im Fahrplan festgezurrt", () => {
  assert.equal(OWN_LOAD_MEDIAN_WEEKS, 6);
  assert.equal(WEEK_LOAD_CEILING_FACTOR, 1.5);
});

test("buildLoadGuard multiSport: Wochenlast über Median(Vorwochen) × 1,5 → 'high'", () => {
  // W01..W06 je 100 (Median 100), W07 = 200 > 150.
  const rides = [1, 2, 3, 4, 5, 6].map((n) => wk(n, 100)).concat(wk(7, 200));
  const rows = buildLoadGuard(rides, keyFn, sortFn, { multiSport: true });
  assert.equal(rows.length, 7);
  assert.equal(rows[6].risk, "high", "W07 bricht den Deckel");
  assert.deepEqual(
    rows.slice(0, 6).map((r) => r.risk),
    ["ok", "ok", "ok", "ok", "ok", "ok"],
    "die Vorwochen selbst brechen nichts"
  );
});

test("buildLoadGuard multiSport: Wochenlast knapp unter dem Deckel → unverändert 'ok'", () => {
  const rides = [1, 2, 3, 4, 5, 6].map((n) => wk(n, 100)).concat(wk(7, 149));
  const rows = buildLoadGuard(rides, keyFn, sortFn, { multiSport: true });
  assert.equal(rows[6].risk, "ok");
});

test("buildLoadGuard multiSport: die erste Woche hat keine Vorwochen → kein Deckel", () => {
  const rows = buildLoadGuard([wk(1, 5000)], keyFn, sortFn, { multiSport: true });
  assert.equal(rows[0].risk, "ok");
});

test("buildLoadGuard: der Median-Bezug ist auf OWN_LOAD_MEDIAN_WEEKS Vorwochen begrenzt", () => {
  // W01..W06 = 100, W07..W12 = 1000, W13 = 1400.
  // Fenster für W13 = W07..W12 → Median 1000 → 1400 < 1500 → "ok".
  // Ohne Begrenzung wäre der Median über alle 12 Vorwochen 550 → 1400 > 825 → "high".
  const rides = [];
  for (let n = 1; n <= 6; n++) rides.push(wk(n, 100));
  for (let n = 7; n <= 12; n++) rides.push(wk(n, 1000));
  rides.push(wk(13, 1400));
  const rows = buildLoadGuard(rides, keyFn, sortFn, { multiSport: true });
  assert.equal(rows[12].risk, "ok");
});

/* ── Guardrail 1: ohne multiSport exakt wie vor E6 ──────────── */

test("buildLoadGuard: ohne multiSport-Option identische Reihe wie mit multiSport:false", () => {
  const rides = [1, 2, 3, 4, 5, 6].map((n) => wk(n, 100)).concat(wk(7, 999));
  const a = buildLoadGuard(rides, keyFn, sortFn);
  const b = buildLoadGuard(rides, keyFn, sortFn, { multiSport: false });
  assert.deepEqual(a, b);
  assert.equal(a[6].risk, "ok", "die 999er-Woche eskaliert NICHT ohne multiSport");
});

/* ── Fahrplan 10 E8a: rideLoad sportart-abhängig ───────────── */

test("rideLoad: Rad (kein sport / 'ride') → tss bevorzugt, trimp Fallback — unverändert", () => {
  assert.equal(rideLoad({ tss: 80, trimp: 120 }), 80);
  assert.equal(rideLoad({ sport: "ride", tss: 80, trimp: 120 }), 80);
  assert.equal(rideLoad({ trimp: 55 }), 55);
  assert.equal(rideLoad({}), 0);
});

test("rideLoad: Nicht-Rad ('run'/'swim') → trimp bevorzugt (intervals-tss ist Rad-Modell)", () => {
  assert.equal(rideLoad({ sport: "run", tss: 80, trimp: 120 }), 120);
  assert.equal(rideLoad({ sport: "swim", tss: 40, trimp: 30 }), 30);
  assert.equal(rideLoad({ sport: "run", tss: 60 }), 60, "kein trimp → tss als Fallback");
  assert.equal(rideLoad({ sport: "run" }), 0);
});

/* ── Fahrplan 10 E8a: weekLoadOverCeiling + describeWeek ───── */

test("buildLoadGuard: jede Zeile trägt weekLoadOverCeiling (false ohne multiSport)", () => {
  const rides = [1, 2, 3, 4, 5, 6].map((n) => wk(n, 100)).concat(wk(7, 300));
  const plain = buildLoadGuard(rides, keyFn, sortFn);
  assert.equal(
    plain.every((r) => r.weekLoadOverCeiling === false),
    true,
  );
  const multi = buildLoadGuard(rides, keyFn, sortFn, { multiSport: true });
  assert.equal(multi[6].weekLoadOverCeiling, true, "W07 = 300 > Median 100 × 1,5");
});

test("describeWeek: ein deckel-getriebener 'high' heißt 'Eigenlast-Deckel', nicht Monotonie", () => {
  const d = describeWeek({ ramp: 2, monotony: 1.0, weekLoadOverCeiling: true, risk: "high" });
  assert.equal(d.label, "Eigenlast-Deckel");
  assert.match(d.detail, /Median/);
});
