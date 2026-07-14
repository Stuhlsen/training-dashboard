/* Tests: Hero-Signaturen — Zonen-Band, FTP-Ring, nächste Einheit
   (core/ftp-progress.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pinPercent,
  ringProgress,
  nextPlannedSession,
  workoutWattRange,
  workoutDurationMinutes,
  estimateSessionTSS,
  buildMilestones,
} from "../assets/js/core/ftp-progress.js";

test("pinPercent klemmt auf 0–100", () => {
  assert.equal(pinPercent(150, 300), 50);
  assert.equal(pinPercent(400, 300), 100);
  assert.equal(pinPercent(-5, 300), 0);
  assert.equal(pinPercent(null, 300), null);
});

test("ringProgress: Anteil zwischen Basis und Ziel, geklemmt", () => {
  assert.equal(ringProgress(199, 166, 210), (199 - 166) / (210 - 166));
  assert.equal(ringProgress(166, 166, 210), 0);
  assert.equal(ringProgress(230, 166, 210), 1);
  assert.equal(ringProgress(null, 166, 210), 0);
  assert.equal(ringProgress(100, 200, 200), 1); // goal <= base → voll
});

const SESSIONS = [
  { date: "2026-07-02", name: "Sweet Spot 3×12", typ: "Sweet Spot" },
  { date: "2026-07-04", name: "Z2 Lang", typ: "Z2 Lang", km: 85 },
  { date: "2026-07-07", name: "Gruppenfahrt", typ: "Gruppenfahrt" },
];

test("nextPlannedSession: heute fällige Einheit gewinnt und ist isToday", () => {
  const next = nextPlannedSession(SESSIONS, {}, new Set(["2026-07-02"]), "2026-07-04");
  assert.equal(next.name, "Z2 Lang");
  assert.equal(next.isToday, true);
});

test("nextPlannedSession: erledigte und vergangene Termine werden übersprungen", () => {
  const next = nextPlannedSession(SESSIONS, {}, new Set(["2026-07-04"]), "2026-07-04");
  assert.equal(next.name, "Gruppenfahrt");
  assert.equal(next.isToday, false);
});

test("nextPlannedSession: adjustments — ausgefallen übersprungen, verschoben zählt am neuen Datum", () => {
  const adj = {
    "2026-07-04": { cancelled: true },
    "2026-07-07": { movedTo: "2026-07-05" },
  };
  const next = nextPlannedSession(SESSIONS, adj, new Set(), "2026-07-04");
  assert.equal(next.name, "Gruppenfahrt");
  assert.equal(next.date, "2026-07-05");
});

test("nextPlannedSession: nichts mehr offen → null", () => {
  assert.equal(nextPlannedSession(SESSIONS, {}, new Set(), "2026-09-30"), null);
  assert.equal(nextPlannedSession([], {}, new Set(), "2026-07-04"), null);
});

// Fixture aus scripts/lib/plan2.js ("2026-07-02": Sweet Spot 3×10 min,
// authored watts:[162,187] gelten nur für FTP=193 — Tests prüfen bewusst
// gegen einen ANDEREN ftp (210), um die Neu-Skalierung zu verifizieren.
const WORKOUT = { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, pct: [84, 97] };

test("workoutWattRange: skaliert pct auf aktuellen ftp, nicht den Autorenzeit-Wert", () => {
  // 210 × 0.84 = 176.4 → 176, 210 × 0.97 = 203.7 → 204 (NICHT das gespeicherte [162,187])
  assert.deepEqual(workoutWattRange(WORKOUT, 210), [176, 204]);
});

test("workoutWattRange: ohne pct (z.B. FTP-Ramp-Test) → null", () => {
  assert.equal(workoutWattRange({ pct: null }, 210), null);
  assert.equal(workoutWattRange(null, 210), null);
});

test("workoutWattRange: ohne pct aber mit watts (Athlet 2) → statischer watts-Wert", () => {
  assert.deepEqual(workoutWattRange({ pct: null, watts: [232, 245] }, 280), [232, 245]);
});

test("workoutWattRange: pct hat Vorrang vor watts (Neuskalierung schlägt Autorenwert)", () => {
  assert.deepEqual(workoutWattRange({ pct: [84, 97], watts: [162, 187] }, 210), [176, 204]);
});

test("workoutDurationMinutes: warmup + intervals×duration + (intervals-1)×rest + cooldown", () => {
  // 10 + 3×10 + 2×3 + 8 = 10 + 30 + 6 + 8 = 54
  assert.equal(workoutDurationMinutes(WORKOUT), 54);
});

test("workoutDurationMinutes: intervals=1 → kein Zwischen-Rest", () => {
  assert.equal(workoutDurationMinutes({ warmup: 10, intervals: 1, duration: 20, rest: 5, cooldown: 5 }), 35);
});

test("workoutDurationMinutes: leeres/fehlendes workout → 0", () => {
  assert.equal(workoutDurationMinutes(null), 0);
  assert.equal(workoutDurationMinutes({}), 0);
});

test("estimateSessionTSS: bekannte Eingabe ergibt handgerechneten Wert", () => {
  // Segmente: Warmup 10min@IF0.6, Hauptsatz 30min@IF0.905 (Mittel aus 84/97%),
  // Pausen 6min@IF0.5, Cooldown 8min@IF0.5 → Σ IF²×(min/60)×100 ≈ 52.78 → 53
  assert.equal(estimateSessionTSS(WORKOUT), 53);
});

test("estimateSessionTSS: höhere Zielintensität bei gleicher Dauer → höherer TSS", () => {
  const easier = { ...WORKOUT, pct: [60, 70] };
  const harder = { ...WORKOUT, pct: [100, 110] };
  assert.ok(estimateSessionTSS(harder) > estimateSessionTSS(easier));
});

test("estimateSessionTSS: deterministisch und ohne workout → 0", () => {
  assert.equal(estimateSessionTSS(WORKOUT), estimateSessionTSS(WORKOUT));
  assert.equal(estimateSessionTSS(null), 0);
});

test("estimateSessionTSS: ohne pct aber mit watts+ftp (Athlet 2) → watts-basierter IF statt 0", () => {
  const watout = { warmup: 10, intervals: 3, duration: 10, rest: 3, cooldown: 8, watts: [235, 265] };
  assert.ok(estimateSessionTSS(watout, 280) > 0);
  // ohne ftp bleibt der Hauptsatz-Anteil 0 (kein IF ableitbar) — kleiner als mit ftp
  assert.ok(estimateSessionTSS(watout, 280) > estimateSessionTSS(watout));
});

const ATHLETE1_CFG = {
  seasonStartFtp: 166,
  ftpMeasured: 193,
  ftpMeasuredDate: "2026-06-12",
  ftpGoal: 210,
};
const ATHLETE2_CFG = {
  seasonStartFtp: null,
  ftpMeasured: 265,
  ftpMeasuredDate: null,
  ftpGoal: 300,
};

test("buildMilestones: vollständige Config (Athlet 1) → 4 Einträge in Reihenfolge", () => {
  const ms = buildMilestones(ATHLETE1_CFG, 197);
  assert.deepEqual(
    ms.map((m) => m.label),
    ["Start-FTP", "Ramp-Test", "Aktuelle eFTP", "Saisonziel"]
  );
  assert.equal(ms[0].value, 166);
  assert.equal(ms[1].value, 193);
  assert.equal(ms[1].date, "2026-06-12");
  assert.equal(ms[2].value, 197);
  assert.equal(ms[3].value, 210);
});

test("buildMilestones: lückenhafte Config (Athlet 2) → weniger Einträge, kein Platzhalter", () => {
  const ms = buildMilestones(ATHLETE2_CFG, 261);
  assert.deepEqual(
    ms.map((m) => m.label),
    ["Ramp-Test", "Aktuelle eFTP", "Saisonziel"]
  );
  assert.equal("date" in ms[0], false);
});

test("buildMilestones: fehlender eFTP (null) → Eintrag fehlt komplett", () => {
  const ms = buildMilestones(ATHLETE1_CFG, null);
  assert.ok(!ms.some((m) => m.label === "Aktuelle eFTP"));
});

test("buildMilestones: keine Config → leeres Array", () => {
  assert.deepEqual(buildMilestones(null, 200), []);
});
