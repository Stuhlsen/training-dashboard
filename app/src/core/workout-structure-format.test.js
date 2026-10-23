/* Tests: core/workout-structure-format.js — workout_structure → Segmente,
   Kurztext und intervals.icu-Text. Reine Funktionen, keine Mocks. Die
   Over-Under-/30-15-Fixtures sind die Form, die plan-workout-select.js
   (overUnderWorkout/microBurstWorkout) erzeugt. */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import {
  usableStructure,
  structureSegments,
  structureTotalMin,
  structureSummary,
  structureIntervalsText,
  structureHardPctRange,
  structureRecoveries,
  structureTss,
} from "./workout-structure-format.js";
import { selectWorkout } from "./plan-workout-select.js";

const OVER_UNDER = {
  version: 1,
  steps: [
    { kind: "warmup", duration_s: 900, target_pct_ftp: 55 },
    {
      kind: "alternating",
      reps: 3,
      cycles: 3,
      duration_s: 540,
      over: { duration_s: 120, target_pct_ftp: 105 },
      under: { duration_s: 60, target_pct_ftp: 88 },
      recovery: { duration_s: 180, target_pct_ftp: 50 },
    },
    { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
  ],
};

const THIRTY_FIFTEEN = {
  version: 1,
  steps: [
    { kind: "warmup", duration_s: 900, target_pct_ftp: 55 },
    {
      kind: "alternating",
      reps: 2,
      cycles: 10,
      duration_s: 450,
      over: { duration_s: 30, target_pct_ftp: 110 },
      under: { duration_s: 15, target_pct_ftp: 50 },
      recovery: { duration_s: 300, target_pct_ftp: 50 },
    },
    { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
  ],
};

const SWEET_SPOT_CRIT = {
  version: 1,
  steps: [
    { kind: "warmup", duration_s: 720, target_pct_ftp: 55 },
    {
      kind: "set",
      reps: 3,
      work: { duration_s: 600, target_pct_ftp: 90 },
      recovery: { duration_s: 300, target_pct_ftp: 50 },
    },
    {
      kind: "accessory",
      subtype: "sprint",
      reps: 2,
      work: { duration_s: 12, target: "max" },
      recovery: { duration_s: 240, target_pct_ftp: 40 },
    },
    { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
  ],
};

const NUMERIC_WORKOUT = { warmup: 15, intervals: 3, duration: 9, rest: 3, cooldown: 10, pct: [88, 105] };

describe("usableStructure", () => {
  test("liefert die Struktur bei gültigem Intervall-Schritt und numerischem workout", () => {
    assert.equal(usableStructure({ workout: NUMERIC_WORKOUT, workoutStructure: OVER_UNDER }), OVER_UNDER);
  });

  test("null, wenn die Karte im Formular zur Blockform editiert wurde", () => {
    const card = { workout: { blocks: [{ type: "interval", text: "frei" }] }, workoutStructure: OVER_UNDER };
    assert.equal(usableStructure(card), null);
  });

  test("null bei fehlender oder ungültiger Struktur", () => {
    assert.equal(usableStructure({ workout: NUMERIC_WORKOUT, workoutStructure: null }), null);
    assert.equal(usableStructure({ workout: NUMERIC_WORKOUT, workoutStructure: { version: 2, steps: [] } }), null);
    assert.equal(usableStructure(null), null);
  });

  test("null bei reiner Dauerfahrt ohne set/alternating (Z2 bleibt beim alten Weg)", () => {
    const z2 = { version: 1, steps: [{ kind: "steady", duration_s: 3600, target_pct_ftp: 65 }] };
    assert.equal(usableStructure({ workout: NUMERIC_WORKOUT, workoutStructure: z2 }), null);
  });

  test("Struktur gilt auch ohne workout", () => {
    assert.equal(usableStructure({ workout: null, workoutStructure: OVER_UNDER }), OVER_UNDER);
  });
});

describe("structureSegments", () => {
  test("Over-Under: 3 Blöcke à 3 × over/under, Pause nur zwischen den Blöcken", () => {
    const segs = structureSegments(OVER_UNDER);
    const roles = segs.map((s) => s.role);
    const block = ["over", "under", "over", "under", "over", "under"];
    assert.deepEqual(roles, ["warmup", ...block, "recovery", ...block, "recovery", ...block, "cooldown"]);
    assert.deepEqual(segs[1], { role: "over", durationS: 120, pct: 105 });
    assert.deepEqual(segs[2], { role: "under", durationS: 60, pct: 88 });
  });

  test("30/15: 2 Sätze à 10 Mikro-Intervalle mit 5 min Satzpause", () => {
    const segs = structureSegments(THIRTY_FIFTEEN);
    assert.equal(segs.filter((s) => s.role === "over").length, 20);
    const recoveries = segs.filter((s) => s.role === "recovery");
    assert.equal(recoveries.length, 1);
    assert.equal(recoveries[0].durationS, 300);
  });

  test("Set gefolgt von Sprints behält seine letzte Pause, die letzte Sprintpause vor dem Cool-down fällt weg", () => {
    const roles = structureSegments(SWEET_SPOT_CRIT).map((s) => s.role);
    assert.deepEqual(roles, [
      "warmup",
      "work",
      "recovery",
      "work",
      "recovery",
      "work",
      "recovery",
      "sprint",
      "recovery",
      "sprint",
      "cooldown",
    ]);
    const sprint = structureSegments(SWEET_SPOT_CRIT).find((s) => s.role === "sprint");
    assert.equal(sprint?.pct, null);
  });

  test("steady-Schritt wird zu einem work-Segment", () => {
    const s = { version: 1, steps: [{ kind: "steady", duration_s: 1200, target_pct_ftp: 75 }] };
    assert.deepEqual(structureSegments(s), [{ role: "work", durationS: 1200, pct: 75 }]);
  });

  test("leere/kaputte Eingabe → leere Liste", () => {
    assert.deepEqual(structureSegments(null), []);
    assert.deepEqual(structureSegments({ steps: [null, { kind: "unbekannt" }] }), []);
  });
});

describe("structureTotalMin", () => {
  test("Over-Under: 15 + 3×9 + 2×3 + 10 = 58 min", () => {
    assert.equal(structureTotalMin(OVER_UNDER), 58);
  });
});

describe("structureSummary", () => {
  test("Over-Under als verschachtelter Block", () => {
    assert.equal(
      structureSummary(OVER_UNDER),
      "15 min Warm-up → 3× [3× (2 min @ 105 % / 1 min @ 88 %)] (Pause 3 min) → 10 min Cool-down · 58 min gesamt"
    );
  });

  test("30/15 mit Sekunden-Angaben und Satzpause", () => {
    assert.equal(
      structureSummary(THIRTY_FIFTEEN),
      "15 min Warm-up → 2× [10× (30 s @ 110 % / 15 s @ 50 %)] (Pause 5 min) → 10 min Cool-down · 45 min gesamt"
    );
  });

  test("Set und Sprints", () => {
    assert.equal(
      structureSummary(SWEET_SPOT_CRIT),
      "12 min Warm-up → 3× 10 min @ 90 % (Pause 5 min) → 2× Sprint 12 s max (Pause 4 min) → 10 min Cool-down · 71 min gesamt"
    );
  });

  test("Einzelwiederholung ohne Pausenangabe, krumme Dauer als m:ss", () => {
    const s = {
      version: 1,
      steps: [{ kind: "set", reps: 1, work: { duration_s: 90, target_pct_ftp: 120 }, recovery: { duration_s: 60, target_pct_ftp: 50 } }],
    };
    assert.equal(structureSummary(s), "1× 1:30 min @ 120 % · 2 min gesamt");
  });
});

describe("structureIntervalsText", () => {
  test("Over-Under: innere Zyklen ausgerollt unter EINER Wiederholungsebene", () => {
    const text = structureIntervalsText(OVER_UNDER, 90);
    assert.equal(
      text,
      [
        "Warmup",
        "- 15m 55% 85rpm",
        "",
        "Main Set 3x",
        "- 2m 105% 90rpm",
        "- 1m 88% 80rpm",
        "- 2m 105% 90rpm",
        "- 1m 88% 80rpm",
        "- 2m 105% 90rpm",
        "- 1m 88% 80rpm",
        "- 3m 50% 80rpm",
        "",
        "Cooldown",
        "- 10m 50% 80rpm",
      ].join("\n")
    );
  });

  test("30/15: Sekunden-Dauern, 10 Zyklen je Satz", () => {
    const text = structureIntervalsText(THIRTY_FIFTEEN, 90);
    assert.match(text, /^Main Set 2x$/m);
    assert.equal(text.match(/^- 30s 110% 90rpm$/gm)?.length, 10);
    assert.equal(text.match(/^- 15s 50% 80rpm$/gm)?.length, 10);
    assert.match(text, /^- 5m 50% 80rpm$/m);
  });

  test("Sprints als freeride mit Hinweistext, Set mit eigener Wiederholung", () => {
    const text = structureIntervalsText(SWEET_SPOT_CRIT, 90);
    assert.match(text, /^Main Set 3x\n- 10m 90% 90rpm\n- 5m 50% 80rpm$/m);
    assert.match(text, /^Sprints 2x\n- Sprint max 12s freeride\n- 4m 40% 80rpm$/m);
  });

  test("Kadenz folgt dem Athletenziel", () => {
    const text = structureIntervalsText(OVER_UNDER, 100);
    assert.match(text, /^- 15m 55% 95rpm$/m);
    assert.match(text, /^- 2m 105% 100rpm$/m);
  });

  test("krumme Dauer als XmYs", () => {
    const s = {
      version: 1,
      steps: [{ kind: "set", reps: 2, work: { duration_s: 90, target_pct_ftp: 120 }, recovery: { duration_s: 60, target_pct_ftp: 50 } }],
    };
    assert.match(structureIntervalsText(s, 90), /^- 1m30s 120% 90rpm$/m);
  });
});

describe("Generator-Ausgabe (plan-workout-select.js) läuft durch", () => {
  test("Over-Under aus selectWorkout() ist nutzbar und zeigt Over/Under", () => {
    const w = selectWorkout({ phase: "Schwelle", qualitySlot: 2, currentFtp: 180, targetDurationMin: 60 });
    const structure = usableStructure({ workout: w.workout, workoutStructure: w.workoutStructure });
    assert.ok(structure);
    const roles = new Set(structureSegments(structure).map((s) => s.role));
    assert.ok(roles.has("over") && roles.has("under"));
  });

  test("VO2max 30/15 aus selectWorkout() hat eine Satzpause", () => {
    const w = selectWorkout({ phase: "VO2max", qualitySlot: 2, currentFtp: 180, targetDurationMin: 60 });
    const structure = usableStructure({ workout: w.workout, workoutStructure: w.workoutStructure });
    assert.ok(structure);
    assert.ok(structureSegments(structure).some((s) => s.role === "recovery" && s.durationS === 300));
  });
});

describe("structureHardPctRange", () => {
  test("Over-Under: Unter bis Über", () => {
    assert.deepEqual(structureHardPctRange(OVER_UNDER), [88, 105]);
  });
  test("30/15: lockere 15 s @ 50 % zählen nicht als harte Phase", () => {
    assert.deepEqual(structureHardPctRange(THIRTY_FIFTEEN), [110, 110]);
  });
  test("Sprints ohne %FTP zählen nicht mit", () => {
    assert.deepEqual(structureHardPctRange(SWEET_SPOT_CRIT), [90, 90]);
  });
});

describe("structureRecoveries", () => {
  test("Over-Under: 2 Pausen à 3 min", () => {
    assert.deepEqual(structureRecoveries(OVER_UNDER), { count: 2, durationS: 180, pct: 50 });
  });
  test("30/15: nur die Satzpause, nicht die 15-s-Erholungen", () => {
    assert.deepEqual(structureRecoveries(THIRTY_FIFTEEN), { count: 1, durationS: 300, pct: 50 });
  });
  test("verschiedene Pausenlängen → null (kein einheitlicher Chip möglich)", () => {
    assert.equal(structureRecoveries(SWEET_SPOT_CRIT), null);
  });
});

describe("structureTss", () => {
  test("30/15: Σ Dauer × IF² / 36 über die Segmentfolge (ohne Pause nach dem letzten Satz)", () => {
    // 900·.55² + 20·30·1.1² + 20·15·.5² + 300·.5² + 600·.5², alles /36 = 36,04
    assert.equal(structureTss(THIRTY_FIFTEEN), 36);
  });
  test("Sprints ohne %FTP tragen nichts bei", () => {
    const onlySprint = { version: 1, steps: [{ kind: "accessory", subtype: "sprint", reps: 1, work: { duration_s: 12, target: "max" }, recovery: { duration_s: 60, target_pct_ftp: 40 } }] };
    assert.equal(structureTss(onlySprint), 0);
  });
});
