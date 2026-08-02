/* Tests: core/session-format-match.js::inferFormatId() (Ride↔Format-Brücke,
   D4b Schritt 1). Katalog-Fixture ist eine 1:1-Abschrift der relevanten
   Spalten aus supabase/migrations/0014_session_formats.sql (id, label,
   currency, axes.explicitSteps[].pctFtp) — bewusst nicht importiert (SQL,
   kein JS-Modul), aber bei einer Katalogänderung dort mitzuziehen. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { inferFormatId } from "../assets/js/core/session-format-match.js";

const CATALOG = [
  {
    id: "sweetspot-long",
    label: "Sweet Spot lang",
    currency: "zone-time",
    axes: { explicitSteps: [{ pctFtp: 88 }, { pctFtp: 88 }, { pctFtp: 90 }, { pctFtp: 90 }, { pctFtp: 91 }, { pctFtp: 90 }, { pctFtp: 91 }, { pctFtp: 90 }] },
  },
  {
    id: "threshold-long",
    label: "Schwelle lang",
    currency: "zone-time",
    axes: { explicitSteps: [{ pctFtp: 98 }, { pctFtp: 98 }, { pctFtp: 100 }, { pctFtp: 100 }, { pctFtp: 100 }, { pctFtp: 100 }, { pctFtp: 102 }] },
  },
  {
    id: "vo2-short",
    label: "VO2max kurz (30/15)",
    currency: "zone-time",
    axes: { explicitSteps: [{ pctFtp: 110 }, { pctFtp: 110 }, { pctFtp: 112 }, { pctFtp: 112 }] },
  },
  {
    id: "vo2-long",
    label: "VO2max lang",
    currency: "zone-time",
    axes: { explicitSteps: [{ pctFtp: 112 }, { pctFtp: 112 }, { pctFtp: 108 }, { pctFtp: 106 }, { pctFtp: 106 }] },
  },
  {
    id: "over-under",
    label: "Over-Under",
    currency: "over-time",
    axes: { explicitSteps: [{ pctFtpOver: 103, pctFtpUnder: 88 }] },
  },
  {
    id: "sprint-accessory",
    label: "Sprint-Zusatz",
    currency: "reps",
    axes: { explicitSteps: [{ reps: 3, workSec: 10 }] },
  },
];

function setStep({ reps = 3, workDurationS = 900, targetPct }) {
  return { kind: "set", reps, work: { duration_s: workDurationS, target_pct_ftp: targetPct }, recovery: { duration_s: 300, target_pct_ftp: 50 } };
}

test("inferFormatId: sweetspot-long (88-91%, keine Überlappung)", () => {
  const structure = { version: 1, steps: [setStep({ targetPct: 90, workDurationS: 900 })] };
  assert.equal(inferFormatId(structure, CATALOG), "sweetspot-long");
});

test("inferFormatId: threshold-long (98-102%, keine Überlappung)", () => {
  const structure = { version: 1, steps: [setStep({ targetPct: 100, workDurationS: 480 })] };
  assert.equal(inferFormatId(structure, CATALOG), "threshold-long");
});

test("inferFormatId: vo2-short (30/15-Bauart, work.duration_s <= Schwelle)", () => {
  const structure = { version: 1, steps: [setStep({ reps: 10, targetPct: 110, workDurationS: 30 })] };
  assert.equal(inferFormatId(structure, CATALOG), "vo2-short");
});

test("inferFormatId: vo2-long (3-5-min-Reps, work.duration_s > Schwelle)", () => {
  const structure = { version: 1, steps: [setStep({ reps: 4, targetPct: 112, workDurationS: 180 })] };
  assert.equal(inferFormatId(structure, CATALOG), "vo2-long");
});

test("inferFormatId: vo2-long bei pct außerhalb des vo2-short-Bands ist bereits ohne Tie-Break eindeutig (deckt core/workout-structure-derive.js's FAMILY_PCT_FTP[vo2-long]=109 ab)", () => {
  const structure = { version: 1, steps: [setStep({ reps: 5, targetPct: 109, workDurationS: 300 })] };
  assert.equal(inferFormatId(structure, CATALOG), "vo2-long");
});

test("inferFormatId: alternating -> over-under, unabhängig von pct-Werten", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 3,
        cycles: 9,
        duration_s: 1080,
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 0, target_pct_ftp: 88 }, // Feinheiten irrelevant fürs Routing
      },
    ],
  };
  assert.equal(inferFormatId(structure, CATALOG), "over-under");
});

test("inferFormatId: nur accessory-Schritte -> sprint-accessory", () => {
  const structure = {
    version: 1,
    steps: [{ kind: "accessory", subtype: "sprint", reps: 4, work: { duration_s: 10, target: "max" }, recovery: { duration_s: 240, target_pct_ftp: 50 } }],
  };
  assert.equal(inferFormatId(structure, CATALOG), "sprint-accessory");
});

test("inferFormatId: accessory neben set -> set bestimmt das Format (accessory zählt nicht in die Hauptklassifikation, L6.1)", () => {
  const structure = {
    version: 1,
    steps: [setStep({ targetPct: 90, workDurationS: 900 }), { kind: "accessory", subtype: "sprint", reps: 3, work: { duration_s: 10, target: "max" }, recovery: { duration_s: 240, target_pct_ftp: 50 } }],
  };
  assert.equal(inferFormatId(structure, CATALOG), "sweetspot-long");
});

test("inferFormatId: nur warmup/cooldown (keine matchbare Einheit) -> null", () => {
  const structure = { version: 1, steps: [{ kind: "warmup", duration_s: 600, target_pct_ftp: 55 }] };
  assert.equal(inferFormatId(structure, CATALOG), null);
});

test("inferFormatId: leerer/fehlender Katalog -> null", () => {
  const structure = { version: 1, steps: [setStep({ targetPct: 90, workDurationS: 900 })] };
  assert.equal(inferFormatId(structure, []), null);
  assert.equal(inferFormatId(structure, null), null);
});

test("inferFormatId: pct außerhalb aller Bänder -> null (kein Rateverfahren)", () => {
  const structure = { version: 1, steps: [setStep({ targetPct: 60, workDurationS: 900 })] };
  assert.equal(inferFormatId(structure, CATALOG), null);
});
