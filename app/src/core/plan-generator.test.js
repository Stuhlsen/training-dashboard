/* Tests: core/plan-generator.js::generatePlan() — Fahrplan 8 E2.
   Reiner Generator-Kern: pyramidal + linear, kein I/O. Prüft Rampe,
   Erholungswochen, Taper/Event-Fenster, Level-Defaults, Adherence-Anpassung,
   FTP-Ziel, Kartenstruktur und Determinismus. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { generatePlan, emptyHistory, levelDefaultWeekTss, qualityWeekdays } from "./plan-generator.js";
import { CONFLICT_THRESHOLDS } from "./plan-config.js";
import { CTL_DAYS, ATL_DAYS } from "./pmc.js";
import { validateWorkoutStructure } from "./workout-validator.js";

/** Vollständiger fortgeschrittener Event-Input mit Historie. */
function eventInput(over = {}) {
  return {
    startDate: "2026-09-07", // Montag
    mode: "event",
    eventDate: "2026-11-29", // Sonntag, 12 Wochen später
    trainingWeekdays: [1, 2, 4, 6],
    weeklyHours: 8,
    currentFtp: 250,
    ftpMeasuredDate: "2026-08-20",
    ftpTarget: null,
    indoorShare: 0.4,
    focus: "allgemein",
    level: "fortgeschritten",
    model: "pyramidal",
    history: {
      weeklyActualTss: [420, 440, 455, 460],
      currentCtl: 62,
      currentEftp: 255,
      planAdherence: 0.85,
      ageYears: 34,
      powerCurveWeakness: null,
    },
    ...over,
  };
}

/** Einsteiger, open-Modus, keine Historie. */
function openInput(over = {}) {
  return {
    startDate: "2026-09-07",
    mode: "open",
    weeks: 10,
    trainingWeekdays: [2, 4, 6, 7],
    weeklyHours: 6,
    currentFtp: null,
    ftpMeasuredDate: null,
    ftpTarget: null,
    indoorShare: 1,
    focus: "allgemein",
    level: "einsteiger",
    model: "linear",
    history: emptyHistory(),
    ...over,
  };
}

/** Wochen-CTL-Fortschreibung wie im Generator (Kontrollrechnung). */
function ctlAfterWeek(start, weekTss, tau) {
  let v = start;
  for (let d = 0; d < 7; d++) v += (weekTss / 7 - v) / tau;
  return v;
}

test("levelDefaultWeekTss: bleibt im level-typischen Korridor", () => {
  assert.equal(levelDefaultWeekTss("einsteiger", 6), 270);
  assert.equal(levelDefaultWeekTss("einsteiger", 20), 350); // gedeckelt
  assert.equal(levelDefaultWeekTss("fortgeschritten", 8), 520);
  assert.equal(levelDefaultWeekTss("fortgeschritten", 20), 600); // gedeckelt
});

test("qualityWeekdays: erster Tag + spätester mit ≥ 2 Tagen Abstand", () => {
  assert.deepEqual(qualityWeekdays([1, 2, 4, 5, 6]), [1, 6]);
  assert.deepEqual(qualityWeekdays([2, 3, 4, 6, 7]), [2, 7]);
  assert.deepEqual(qualityWeekdays([3, 4]), [3, 4]); // kein Abstand ≥ 2 → letzter Tag
  assert.deepEqual(qualityWeekdays([5]), [5]);
});

test("event-Modus: Wochenzahl, 2 Taper-Wochen, letzte Woche Phase 'Taper'", () => {
  const plan = generatePlan(eventInput());
  assert.equal(plan.weeks.length, 12);
  const taper = plan.weeks.filter((w) => w.phase === "Taper");
  assert.equal(taper.length, 2);
  assert.equal(plan.weeks.at(-1).phase, "Taper");
  // Taper-TSS fällt gegenüber der letzten Aufbau-Woche
  const lastBuild = plan.weeks[plan.weeks.length - 3];
  assert.ok(plan.weeks.at(-1).targetTss < lastBuild.targetTss);
});

test("event-Modus: Renntag-TSB-Prognose liegt im eventWindowMain-Fenster (keine Warnung)", () => {
  const plan = generatePlan(eventInput());
  const outsideWarn = plan.warnings.find((w) => w.includes("Renntag-TSB-Prognose"));
  assert.equal(outsideWarn, undefined, `unerwartete Warnung: ${outsideWarn}`);

  // Kontrollrechnung: CTL/ATL über alle Wochen projizieren, TSB am Ende prüfen.
  let ctl = 62;
  let atl = 62;
  for (const w of plan.weeks) {
    ctl = ctlAfterWeek(ctl, w.targetTss, CTL_DAYS);
    atl = ctlAfterWeek(atl, w.targetTss, ATL_DAYS);
  }
  const [lo, hi] = CONFLICT_THRESHOLDS.eventWindowMain;
  assert.ok(ctl - atl >= lo && ctl - atl <= hi, `Renntag-TSB ${(ctl - atl).toFixed(1)} außerhalb [${lo},${hi}]`);
});

test("CTL-Rampe: kein Bau-Woche überschreitet ctlRampWarn; ctlRampInfo nur mit Warnung", () => {
  const plan = generatePlan(eventInput());
  let ctl = 62;
  for (const w of plan.weeks) {
    const before = ctl;
    ctl = ctlAfterWeek(ctl, w.targetTss, CTL_DAYS);
    const ramp = ctl - before;
    assert.ok(
      ramp <= CONFLICT_THRESHOLDS.ctlRampWarn + 1e-6,
      `Woche ${w.index + 1}: Rampe ${ramp.toFixed(2)} > ctlRampWarn`
    );
    if (ramp > CONFLICT_THRESHOLDS.ctlRampInfo + 1e-6 && !w.isRecovery && w.phase !== "Taper") {
      const hasWarn = plan.warnings.some((x) => x.includes(`Woche ${w.index + 1}:`));
      assert.ok(hasWarn, `Woche ${w.index + 1}: Rampe ${ramp.toFixed(2)} ohne Warnung`);
    }
  }
});

test("Erholungswoche: targetTss ≤ 60 % des Mittels der Nachbarwochen", () => {
  const plan = generatePlan(eventInput());
  const rec = plan.weeks.filter((w) => w.isRecovery);
  assert.ok(rec.length >= 1, "mindestens eine Erholungswoche erwartet");
  for (const w of rec) {
    const prev = plan.weeks[w.index - 1];
    const next = plan.weeks[w.index + 1];
    const neigh = [prev, next].filter(Boolean).map((n) => n.targetTss);
    const mean = neigh.reduce((s, x) => s + x, 0) / neigh.length;
    assert.ok(w.targetTss <= mean * 0.6, `Erholungswoche ${w.index + 1}: ${w.targetTss} > 60% von ${mean}`);
  }
});

test("open-Modus ohne Historie: Level-Defaults greifen, kein NaN, kein Taper", () => {
  const plan = generatePlan(openInput());
  assert.equal(plan.weeks.length, 10);
  assert.ok(!plan.weeks.some((w) => w.phase === "Taper"));
  // Woche 1 startet nahe dem Einsteiger-Default (6 h → 270)
  assert.ok(Math.abs(plan.weeks[0].targetTss - 270) <= 40, `Woche 1 TSS ${plan.weeks[0].targetTss}`);
  for (const w of plan.weeks) {
    assert.ok(Number.isFinite(w.targetTss), `targetTss NaN in Woche ${w.index + 1}`);
    for (const c of w.cards) {
      assert.ok(Number.isFinite(c.tssPlanned), `tssPlanned NaN: ${c.date}`);
      assert.ok(Number.isFinite(c.durationMin), `durationMin NaN: ${c.date}`);
    }
  }
});

test("Einsteiger ohne FTP: ftpTarget null, Karten tragen pct aber keine watts", () => {
  const plan = generatePlan(openInput());
  assert.equal(plan.ftpTarget, null);
  for (const w of plan.weeks) {
    for (const c of w.cards) {
      if (!c.workout) continue;
      assert.ok(Array.isArray(c.workout.pct), `${c.date}: pct fehlt`);
      assert.equal(c.workout.watts, undefined, `${c.date}: watts trotz fehlender FTP`);
    }
  }
});

test("mit FTP: Qualitätskarten tragen watts, ftpTarget projiziert (gedeckelt auf +12 %)", () => {
  const plan = generatePlan(eventInput());
  assert.ok(plan.ftpTarget > 250 && plan.ftpTarget <= Math.round(250 * 1.12));
  const q = plan.weeks.flatMap((w) => w.cards).find((c) => c.isQuality);
  assert.ok(q && Array.isArray(q.workout.watts), "Qualitätskarte ohne watts");
});

test("explizites ftpTarget wird unverändert übernommen", () => {
  const plan = generatePlan(eventInput({ ftpTarget: 275 }));
  assert.equal(plan.ftpTarget, 275);
});

test("planAdherence < 0.7: ein Trainingstag weniger + flachere Rampe", () => {
  const strong = generatePlan(eventInput());
  const weak = generatePlan(eventInput({ history: { ...eventInput().history, planAdherence: 0.5 } }));

  const strongDays = strong.weekModel[0].trainingWeekdays.length;
  const weakDays = weak.weekModel[0].trainingWeekdays.length;
  assert.equal(weakDays, strongDays - 1);
  assert.ok(weak.warnings.some((w) => w.includes("unter 70")));

  // flachere Rampe → Peak-Woche hat weniger TSS
  const peak = (p) => Math.max(...p.weeks.filter((w) => !w.isRecovery && w.phase !== "Taper").map((w) => w.targetTss));
  assert.ok(peak(weak) < peak(strong));
});

test("FTP-Testtag: veraltete FTP → Test in Woche 1, Plan-Ende hat einen Test", () => {
  const plan = generatePlan(eventInput({ ftpMeasuredDate: "2026-01-01" })); // > 42 Tage alt
  const week1Test = plan.weeks[0].cards.find((c) => c.isTest);
  assert.ok(week1Test && week1Test.typ === "FTP-Test", "kein Starttest in Woche 1");
  assert.ok(plan.weeks.at(-1).cards.some((c) => c.isTest), "kein Test am Plan-Ende");
  // Testkarte ersetzt einen Slot, ist nie zugleich Qualität
  for (const w of plan.weeks) {
    for (const c of w.cards) if (c.isTest) assert.equal(c.isQuality, false);
  }
});

test("frische FTP (< 42 Tage): kein Starttest in Woche 1", () => {
  const plan = generatePlan(eventInput({ ftpMeasuredDate: "2026-08-25" }));
  assert.ok(!plan.weeks[0].cards.some((c) => c.isTest));
});

test("Kartenstruktur: workout_structure ist schema-valide, Karten chronologisch, isoWeek gesetzt", () => {
  const plan = generatePlan(eventInput());
  for (const w of plan.weeks) {
    assert.match(w.isoWeek, /^\d{4}-KW\d{2}$/);
    let prevDate = "";
    for (const c of w.cards) {
      assert.ok(c.date >= prevDate, `Karten nicht chronologisch in Woche ${w.index + 1}`);
      prevDate = c.date;
      assert.equal(c.isoWeek, w.isoWeek);
      assert.equal(c.phase, w.phase);
      if (c.workoutStructure) {
        const res = validateWorkoutStructure(c.workoutStructure);
        assert.ok(res.valid, `ungültige Struktur ${c.date}: ${JSON.stringify(res.errors)}`);
      }
    }
  }
});

/** Strukturierte harte Intervallzeit (Minuten) einer workoutStructure:
 *  set-Arbeit + „over"-Anteil alternierender Blöcke. */
function hardMinutes(structure) {
  if (!structure || !Array.isArray(structure.steps)) return 0;
  let m = 0;
  for (const s of structure.steps) {
    if (s.kind === "set") m += (s.reps * s.work.duration_s) / 60;
    else if (s.kind === "alternating") m += (s.reps * s.cycles * s.over.duration_s) / 60;
  }
  return m;
}

test("polarized: keine Sweet-Spot-Phase, Qualität der Aufbauwochen nur Schwelle/VO2max, lockere Tage strikt Z2", () => {
  const plan = generatePlan(eventInput({ model: "polarized" }));
  // Keine Woche trägt die Phase "Sweet Spot" (nach dem kurzen Grundlagen-Block
  // nur noch abwechselnd Schwelle/VO2max).
  assert.ok(!plan.weeks.some((w) => w.phase === "Sweet Spot"));
  for (const w of plan.weeks) {
    for (const c of w.cards) {
      if (c.isTest) continue;
      if (c.isQuality) {
        assert.ok(["Sweet Spot", "Schwelle", "VO2max"].includes(c.typ), `${c.date}: Qualität typ ${c.typ}`);
        // Aufbauwochen der polarisierten Phase: Qualität == Phase (Schwelle/VO2max).
        if (w.phase === "Schwelle" || w.phase === "VO2max") {
          assert.equal(c.typ, w.phase, `${c.date}: Qualität typ ${c.typ} ≠ Phase ${w.phase}`);
        }
      } else {
        assert.equal(c.workout?.zone, "Z2", `${c.date}: lockerer Tag nicht Z2`);
        assert.ok(c.workout.pct[1] <= 75, `${c.date}: lockerer Tag pct ${c.workout.pct}`);
      }
    }
  }
});

test("polarized: strukturierte harte Zeit < 25 % der Gesamtdauer (80/20-TID-Näherung)", () => {
  const plan = generatePlan(eventInput({ model: "polarized" }));
  let hard = 0;
  let total = 0;
  for (const w of plan.weeks) {
    for (const c of w.cards) {
      total += c.durationMin;
      hard += hardMinutes(c.workoutStructure);
    }
  }
  assert.ok(total > 0 && hard / total <= 0.25, `harte Zeit ${((100 * hard) / total).toFixed(1)} %`);
});

test("block: 3 zusammenhängende System-Blöcke (2–3 Wo), Erholung dazwischen, Qualität = Blocksystem", () => {
  const plan = generatePlan(eventInput({ model: "block" }));
  const nonTaper = plan.weeks.filter((w) => w.phase !== "Taper");
  const runs = [];
  for (const w of nonTaper) {
    if (runs.length && runs.at(-1).phase === w.phase) runs.at(-1).weeks.push(w);
    else runs.push({ phase: w.phase, weeks: [w] });
  }
  const systems = ["VO2max", "Schwelle", "Sweet Spot"];
  const sysRuns = runs.filter((r) => systems.includes(r.phase));
  assert.equal(sysRuns.length, 3, JSON.stringify(runs.map((r) => `${r.phase}×${r.weeks.length}`)));
  assert.deepEqual(sysRuns.map((r) => r.phase), systems);
  for (const r of sysRuns) {
    assert.ok(r.weeks.length >= 2 && r.weeks.length <= 3, `${r.phase}: ${r.weeks.length} Wochen`);
    for (const w of r.weeks) {
      for (const c of w.cards) {
        if (c.isQuality) assert.equal(c.typ, r.phase, `${c.date}: Qualität typ ${c.typ} ≠ Block ${r.phase}`);
      }
    }
  }
  assert.ok(runs.some((r) => r.phase === "Erholung"), "keine Erholungswoche zwischen den Blöcken");
});

test("polarized + block: deterministisch (gleicher Input → gleicher Output)", () => {
  for (const model of ["polarized", "block"]) {
    assert.deepEqual(generatePlan(eventInput({ model })), generatePlan(eventInput({ model })));
  }
});

test("polarized + block: CTL-Rampe hält ctlRampWarn, Kartenstruktur schema-valide", () => {
  for (const model of ["polarized", "block"]) {
    const plan = generatePlan(eventInput({ model }));
    let ctl = 62;
    for (const w of plan.weeks) {
      const before = ctl;
      ctl = ctlAfterWeek(ctl, w.targetTss, CTL_DAYS);
      assert.ok(ctl - before <= CONFLICT_THRESHOLDS.ctlRampWarn + 1e-6, `${model} Woche ${w.index + 1}: Rampe ${(ctl - before).toFixed(2)}`);
      for (const c of w.cards) {
        assert.ok(Number.isFinite(c.tssPlanned) && Number.isFinite(c.durationMin), `${model} ${c.date}: NaN`);
        if (c.workoutStructure) {
          const res = validateWorkoutStructure(c.workoutStructure);
          assert.ok(res.valid, `${model} ${c.date}: ${JSON.stringify(res.errors)}`);
        }
      }
    }
  }
});

test("linear vs. pyramidal: linear hat mehr Grundlagen-Wochen", () => {
  const lin = generatePlan(eventInput({ model: "linear" }));
  const pyr = generatePlan(eventInput({ model: "pyramidal" }));
  const count = (p, phase) => p.weeks.filter((w) => w.phase === phase).length;
  assert.ok(count(lin, "Grundlage") > count(pyr, "Grundlage"));
});

test("Determinismus: gleicher Input → gleicher Output", () => {
  const a = generatePlan(eventInput());
  const b = generatePlan(eventInput());
  assert.deepEqual(a, b);
});

test("zu kurzer Plan wird auf 3 Wochen angehoben, mit Warnung", () => {
  const plan = generatePlan(openInput({ weeks: 1 }));
  assert.equal(plan.weeks.length, 3);
  assert.ok(plan.warnings.some((w) => w.includes("zu kurz")));
});

/* ── E10: Power-Curve-Schwäche verschiebt eine Aufbau-Woche ─────── */

const phaseCount = (plan, phase) => plan.weeks.filter((w) => w.phase === phase).length;

test("E10: powerCurveWeakness 'vo2' bei focus 'allgemein' → eine VO2max-Woche mehr", () => {
  const base = generatePlan(eventInput());
  const biased = generatePlan(
    eventInput({ history: { ...eventInput().history, powerCurveWeakness: "vo2" } })
  );
  assert.equal(phaseCount(biased, "VO2max"), phaseCount(base, "VO2max") + 1);
  // Gesamtwochenzahl + Taper unverändert, genau eine Nicht-Grundlage-Phase gibt ab.
  assert.equal(biased.weeks.length, base.weeks.length);
  assert.equal(phaseCount(biased, "Grundlage"), phaseCount(base, "Grundlage"));
  assert.ok(phaseCount(biased, "Sweet Spot") + phaseCount(biased, "Schwelle")
    === phaseCount(base, "Sweet Spot") + phaseCount(base, "Schwelle") - 1);
  assert.ok(biased.warnings.some((w) => w.includes("Power-Kurve")));
});

test("E10: CTL-Rampe hält weiter die Hartgrenze trotz Verschiebung", () => {
  const biased = generatePlan(
    eventInput({ history: { ...eventInput().history, powerCurveWeakness: "vo2" } })
  );
  let ctl = eventInput().history.currentCtl;
  for (const w of biased.weeks) {
    const next = ctlAfterWeek(ctl, w.targetTss, CTL_DAYS);
    assert.ok(next - ctl <= CONFLICT_THRESHOLDS.ctlRampWarn + 1e-9, `Woche ${w.index}: Rampe ${(next - ctl).toFixed(2)}`);
    ctl = next;
  }
});

test("E10: anderer Fokus als 'allgemein' → keine Verschiebung", () => {
  const withWeakness = generatePlan(
    eventInput({ focus: "berg", history: { ...eventInput().history, powerCurveWeakness: "threshold" } })
  );
  const without = generatePlan(
    eventInput({ focus: "berg", history: { ...eventInput().history, powerCurveWeakness: null } })
  );
  assert.deepEqual(withWeakness, without);
});

test("E10: Verschiebung ist deterministisch", () => {
  const mk = () => generatePlan(
    eventInput({ history: { ...eventInput().history, powerCurveWeakness: "threshold" } })
  );
  assert.deepEqual(mk(), mk());
});

test("weekModel spiegelt Wochen 1:1 (V4)", () => {
  const plan = generatePlan(eventInput());
  assert.equal(plan.weekModel.length, plan.weeks.length);
  for (let i = 0; i < plan.weeks.length; i++) {
    assert.equal(plan.weekModel[i].week, plan.weeks[i].isoWeek);
    assert.equal(plan.weekModel[i].phase, plan.weeks[i].phase);
    assert.equal(plan.weekModel[i].targetTss, plan.weeks[i].targetTss);
    assert.equal(plan.weekModel[i].start, plan.weeks[i].start);
  }
});

/* ── E13: „Rest neu berechnen" (regenerateFrom + baseWeekModel) ──────── */

/** Ein Ur-Plan aus einem vollen Erst-Lauf → als eingefrorene Blockstruktur. */
function baseModelFrom(over = {}) {
  return generatePlan(eventInput(over)).weekModel;
}

test("E13: kein regenerateFrom → Ausgabe unverändert (Regression)", () => {
  const withoutFields = generatePlan(eventInput());
  // baseWeekModel allein (ohne regenerateFrom) darf nichts ändern.
  const withBaseOnly = generatePlan(eventInput({ baseWeekModel: baseModelFrom() }));
  assert.deepEqual(withBaseOnly, withoutFields);
});

test("E13: Wochen vor regenerateFrom sind byte-gleich zum baseWeekModel, ohne Karten", () => {
  const base = baseModelFrom();
  const regenerateFrom = base[4].start; // ab Woche 5 neu rechnen
  const plan = generatePlan(eventInput({ baseWeekModel: base, regenerateFrom }));

  assert.equal(plan.weeks.length, base.length);
  for (let i = 0; i < 4; i++) {
    assert.equal(plan.weeks[i].phase, base[i].phase);
    assert.equal(plan.weeks[i].targetTss, base[i].targetTss);
    assert.equal(plan.weeks[i].start, base[i].start);
    assert.equal(plan.weeks[i].end, base[i].end);
    assert.equal(plan.weeks[i].isoWeek, base[i].week);
    assert.equal(plan.weeks[i].cards.length, 0, `Woche ${i + 1} sollte eingefroren sein`);
    assert.equal(plan.weekModel[i].targetTss, base[i].targetTss);
  }
  // ab der Schnittwoche wieder echte Karten
  assert.ok(plan.weeks[4].cards.length > 0);
  assert.ok(plan.weeks.at(-1).cards.length > 0);
});

test("E13: Tail-Phasen bleiben, aber frische Historie ändert die Tail-TSS", () => {
  const base = baseModelFrom();
  const regenerateFrom = base[4].start;
  const hi = generatePlan(
    eventInput({
      baseWeekModel: base,
      regenerateFrom,
      history: { ...eventInput().history, currentCtl: 75, weeklyActualTss: [520, 540, 560, 580] },
    })
  );
  const lo = generatePlan(
    eventInput({
      baseWeekModel: base,
      regenerateFrom,
      history: { ...eventInput().history, currentCtl: 40, weeklyActualTss: [260, 270, 280, 290] },
    })
  );
  // Phasen-Struktur im Schwanz unberührt
  for (let i = 4; i < base.length; i++) {
    assert.equal(hi.weeks[i].phase, base[i].phase);
    assert.equal(lo.weeks[i].phase, base[i].phase);
  }
  // aber die Last unterscheidet sich mit der Form
  assert.ok(hi.weeks[5].targetTss > lo.weeks[5].targetTss);
  // eingefrorener Kopf identisch
  for (let i = 0; i < 4; i++) assert.equal(hi.weeks[i].targetTss, lo.weeks[i].targetTss);
});

test("E13: CTL-Rampe im Schwanz hält die Hartgrenze ab der frischen currentCtl", () => {
  const base = baseModelFrom();
  const regenerateFrom = base[4].start;
  const plan = generatePlan(
    eventInput({ baseWeekModel: base, regenerateFrom, history: { ...eventInput().history, currentCtl: 55 } })
  );
  let ctl = 55;
  for (let i = 4; i < plan.weeks.length; i++) {
    const next = ctlAfterWeek(ctl, plan.weeks[i].targetTss, CTL_DAYS);
    assert.ok(
      next - ctl <= CONFLICT_THRESHOLDS.ctlRampWarn + 1e-6,
      `Woche ${i + 1}: Rampe ${(next - ctl).toFixed(2)}`
    );
    ctl = next;
  }
});

test("E13: FTP-Testtag nur im neu gerechneten Bereich", () => {
  const base = baseModelFrom();
  const regenerateFrom = base[6].start;
  const plan = generatePlan(eventInput({ baseWeekModel: base, regenerateFrom }));
  for (let i = 0; i < 6; i++) {
    assert.ok(!plan.weeks[i].cards.some((c) => c.isTest), `Woche ${i + 1} trägt einen Testtag`);
  }
});

test("E13: deterministisch (gleicher Input → gleicher Output)", () => {
  const base = baseModelFrom();
  const mk = () =>
    generatePlan(eventInput({ baseWeekModel: base, regenerateFrom: base[3].start }));
  assert.deepEqual(mk(), mk());
});
