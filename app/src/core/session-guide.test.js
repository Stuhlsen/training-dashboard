/* Tests: Guide-Bauer für Trainingskarten (core/session-guide.js)
   — Fahrplan 34, E2: Lücken füllen, Kadenz, Fueling, Klartext-Export. */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import {
  buildSessionGuide,
  fuelingDuring,
  fuelingBefore,
  sessionGuideText,
  rpeCompareText,
  FUEL_NOT_NEEDED_MAX_MIN,
  FUEL_SMALL_MAX_MIN,
  FUEL_LONG_MIN,
  PRE_MEAL_G_PER_KG,
} from "./session-guide.js";
import { GUIDE_SOURCE_BY_KEY } from "./session-guide-sources.js";
import { mainIntervalSummary, sprintReps } from "./workout-structure-format.js";

const WARM = { kind: "warmup", duration_s: 600, target_pct_ftp: 55 };
const COOL = { kind: "cooldown", duration_s: 300, target_pct_ftp: 50 };
const SS_SET = {
  kind: "set",
  reps: 3,
  work: { duration_s: 720, target_pct_ftp: 90 },
  recovery: { duration_s: 300, target_pct_ftp: 55 },
};
const ALT = {
  kind: "alternating",
  reps: 3,
  cycles: 3,
  duration_s: 540,
  over: { duration_s: 60, target_pct_ftp: 105 },
  under: { duration_s: 120, target_pct_ftp: 85 },
  recovery: { duration_s: 300, target_pct_ftp: 55 },
};
const SPRINT = {
  kind: "accessory",
  subtype: "sprint",
  reps: 4,
  work: { duration_s: 10, target: "max" },
  recovery: { duration_s: 120, target_pct_ftp: 50 },
};

const struct = (...steps) => ({ version: 1, steps });
const card = (typ, workoutStructure, extra = {}) => ({ typ, workoutStructure, durationMin: 90, ...extra });
const CTX = { cadenceTarget: 90, weightKg: 70, ftp: 250 };
const ctx = (extra = {}) => ({ ...CTX, ...extra });
const section = (guide, id) => guide.sections.find((s) => s.id === id);
const overUnder = () => card("Schwelle", struct(WARM, ALT, COOL));

describe("Hilfsfunktionen in workout-structure-format", () => {
  test("mainIntervalSummary: set → Wiederholungen, Arbeitsdauer, %FTP", () => {
    assert.deepEqual(mainIntervalSummary(struct(WARM, SS_SET, COOL)), { reps: 3, workS: 720, pctRange: [90, 90] });
  });
  test("mainIntervalSummary: alternating → Blockdauer, Über/Unter-Spanne", () => {
    assert.deepEqual(mainIntervalSummary(struct(WARM, ALT, COOL)), { reps: 3, workS: 540, pctRange: [85, 105] });
  });
  test("mainIntervalSummary: lockere Unter-Phase (< 70 %) zählt nicht zur Spanne", () => {
    const alt = { ...ALT, under: { duration_s: 15, target_pct_ftp: 50 } };
    assert.deepEqual(mainIntervalSummary(struct(alt)).pctRange, [105, 105]);
  });
  test("mainIntervalSummary: ohne Struktur / ohne Intervallschritt → null", () => {
    assert.equal(mainIntervalSummary(null), null);
    assert.equal(mainIntervalSummary(struct(WARM, COOL)), null);
  });
  test("sprintReps: Sprint-Schritt → Anzahl, sonst null", () => {
    assert.equal(sprintReps(struct(SS_SET, SPRINT)), 4);
    assert.equal(sprintReps(struct(SS_SET)), null);
    assert.equal(sprintReps(null), null);
  });
});

describe("buildSessionGuide — Grundform", () => {
  test("unbekannter Typ / keine Karte → null", () => {
    assert.equal(buildSessionGuide(card("Rennen", null), ctx()), null);
    assert.equal(buildSessionGuide(null, ctx()), null);
  });

  test("Rekom (Lauf, Schwimmen) → null", () => {
    assert.equal(buildSessionGuide(card("Rekom", null, { sport: "run" }), ctx()), null);
    assert.equal(buildSessionGuide(card("Rekom", null, { sport: "swim" }), ctx()), null);
  });

  test("Abschnitte in fester Reihenfolge", () => {
    const guide = buildSessionGuide(overUnder(), ctx());
    assert.equal(guide.key, "ride:over-under");
    assert.deepEqual(guide.rpe, { min: 7, max: 8 });
    assert.deepEqual(
      guide.sections.map((s) => s.id),
      ["ziel", "rpe", "cue", "kadenz", "fuelPre", "fuelInter"]
    );
    for (const s of guide.sections) assert.ok(s.title && s.text, s.id);
  });

  test("alle quelleKeys existieren in den Quellen", () => {
    const guide = buildSessionGuide(card("Sweet Spot", struct(SS_SET, SPRINT), { durationMin: 200 }), ctx());
    for (const s of guide.sections) for (const k of s.quelleKeys) assert.ok(GUIDE_SOURCE_BY_KEY.has(k), k);
  });

  test("deterministisch: gleiche Eingabe → gleiches Ergebnis", () => {
    const a = buildSessionGuide(overUnder(), ctx());
    const b = buildSessionGuide(overUnder(), ctx());
    assert.deepEqual(a, b);
  });

  test("verändert die Karte nicht", () => {
    const c = overUnder();
    const snapshot = JSON.stringify(c);
    buildSessionGuide(c, ctx());
    assert.equal(JSON.stringify(c), snapshot);
  });
});

describe("buildSessionGuide — Lücken im Cue (V3)", () => {
  test("Over-Under mit Struktur + FTP → Anzahl, Dauer, Wattbereich", () => {
    const cue = section(buildSessionGuide(overUnder(), ctx()), "cue").text;
    assert.match(cue, /drei Blöcke/);
    assert.match(cue, /je 9 Minuten/);
    assert.match(cue, /213–263 W/); // 250 W × 85 % bzw. 105 %, gerundet
    assert.doesNotMatch(cue, /[{}]|undefined/);
  });

  test("Sweet Spot: Einzelwert wird als ein Watt-Wert gezeigt", () => {
    const cue = section(buildSessionGuide(card("Sweet Spot", struct(WARM, SS_SET, COOL)), ctx()), "cue").text;
    assert.match(cue, /drei Intervalle von je 12 Minuten im Bereich 225 W/);
  });

  test("ohne Struktur → Fallback-Fassung", () => {
    // Ohne Struktur ist die Karte keine Over-Under-Karte mehr, sondern „Schwelle lang".
    const guide = buildSessionGuide(card("Schwelle", null), ctx());
    assert.equal(guide.key, "ride:threshold-long");
    const cue = section(guide, "cue").text;
    assert.match(cue, /^Fahre die Intervalle im Zielbereich der Karte/);
    assert.doesNotMatch(cue, /[{}]|undefined/);
  });

  test("ohne FTP (null/0/undefined) → Fallback-Fassung", () => {
    for (const ftp of [null, 0, undefined]) {
      const cue = section(buildSessionGuide(overUnder(), ctx({ ftp })), "cue").text;
      assert.match(cue, /wie es die Karte vorgibt/, String(ftp));
      assert.doesNotMatch(cue, /[{}]|undefined/);
    }
  });

  test("Karte mit nur einer Wiederholung → Fallback statt „ein Intervalle“", () => {
    const one = { ...SS_SET, reps: 1 };
    const cue = section(buildSessionGuide(card("Sweet Spot", struct(one)), ctx()), "cue").text;
    assert.match(cue, /Fahre die Intervalle im Zielbereich der Karte/);
  });

  test("Zahlwort bis 12, darüber Ziffer", () => {
    const cueFor = (reps) =>
      section(buildSessionGuide(card("Sweet Spot", struct({ ...SS_SET, reps })), ctx()), "cue").text;
    assert.match(cueFor(2), /^Fahre zwei Intervalle/);
    assert.match(cueFor(12), /^Fahre zwölf Intervalle/);
    assert.match(cueFor(13), /^Fahre 13 Intervalle/);
  });

  test("halbe Minuten mit Komma", () => {
    const set = { ...SS_SET, work: { duration_s: 90, target_pct_ftp: 120 } };
    const cue = section(buildSessionGuide(card("VO2max", struct(set)), ctx()), "cue").text;
    assert.match(cue, /je 1,5 Minuten/);
  });

  test("keine Vorlage lässt je Lücken im Text — alle Typen, mit und ohne Daten", () => {
    const typen = ["Sweet Spot", "Schwelle", "VO2max", "FTP-Test", "Z2 Lang", "Z2 Dauer", "Z1 Recovery"];
    const structures = [null, struct(WARM, SS_SET, COOL), struct(WARM, ALT, COOL), struct(SS_SET, SPRINT)];
    const empty = ctx({ ftp: null, cadenceTarget: null, weightKg: null });
    for (const typ of typen)
      for (const ws of structures)
        for (const c of [ctx(), empty]) {
          const guide = buildSessionGuide(card(typ, ws), c);
          for (const s of guide.sections) assert.doesNotMatch(`${s.text} ${s.hint ?? ""}`, /[{}]|undefined|null|NaN/, typ);
        }
  });
});

describe("buildSessionGuide — Sprint-Zusatz", () => {
  test("Sprint-Schritt → Zusatzsatz im Cue", () => {
    const guide = buildSessionGuide(card("Sweet Spot", struct(WARM, SS_SET, SPRINT, COOL)), ctx());
    assert.match(section(guide, "cue").text, /vier kurze Sprints mit voller Kraft/);
    assert.equal(guide.key, "ride:sweetspot-long");
  });

  test("ohne Sprint-Schritt kein Zusatz", () => {
    const guide = buildSessionGuide(card("Sweet Spot", struct(WARM, SS_SET, COOL)), ctx());
    assert.doesNotMatch(section(guide, "cue").text, /Sprint/);
  });
});

describe("buildSessionGuide — Kadenz", () => {
  test("cadenceTarget 90 → Zahl im Satz", () => {
    const text = section(buildSessionGuide(overUnder(), ctx({ cadenceTarget: 90 })), "kadenz").text;
    assert.match(text, /90 U\/min/);
  });

  test("cadenceTarget null → allgemeiner Satz ohne Zahl", () => {
    const text = section(buildSessionGuide(overUnder(), ctx({ cadenceTarget: null })), "kadenz").text;
    assert.match(text, /flüssige Trittfrequenz/);
    assert.doesNotMatch(text, /\d/);
  });

  test("unbrauchbare Kadenz (0, negativ, NaN) → allgemeiner Satz", () => {
    for (const cadenceTarget of [0, -5, Number.NaN]) {
      const text = section(buildSessionGuide(overUnder(), ctx({ cadenceTarget })), "kadenz").text;
      assert.match(text, /flüssige Trittfrequenz/, String(cadenceTarget));
    }
  });
});

describe("fuelingDuring (V4)", () => {
  test("Konstanten", () => {
    assert.equal(FUEL_NOT_NEEDED_MAX_MIN, 45);
    assert.equal(FUEL_SMALL_MAX_MIN, 60);
    assert.equal(FUEL_LONG_MIN, 150);
  });

  test("44 min → Wasser reicht, kein Hinweis", () => {
    const r = fuelingDuring(44, "ride");
    assert.equal(r.text, "Wasser reicht.");
    assert.equal(r.hint, null);
  });

  test("45 min → Wasser + Schluck Sportgetränk", () => {
    assert.equal(fuelingDuring(45, "ride").text, "Wasser reicht. Bei harten Einheiten hilft ein Schluck Sportgetränk.");
  });

  test("59 min → noch Wasser-Stufe", () => {
    assert.match(fuelingDuring(59, "ride").text, /Schluck Sportgetränk/);
  });

  test("60 min → 30–60 g/h mit Hinweis auf größere Fahrer", () => {
    const r = fuelingDuring(60, "ride");
    assert.equal(r.text, "30–60 g KH pro Stunde");
    assert.match(r.hint, /Größere, kräftigere Fahrer/);
    assert.deepEqual(r.quelleKeys, ["acsm-2016", "morton-2026", "ijaz-2025"]);
  });

  test("150 min → noch 30–60 g/h", () => {
    assert.equal(fuelingDuring(150, "ride").text, "30–60 g KH pro Stunde");
  });

  test("151 min → 60–90 g/h mit 120-g-Hinweis und eigener Setzung", () => {
    const r = fuelingDuring(151, "ride");
    assert.equal(r.text, "60–90 g KH pro Stunde");
    assert.match(r.hint, /Bis 120 g\/h nur, wenn dein Magen das im Training gelernt hat\./);
    assert.match(r.hint, /Größere, kräftigere Fahrer/);
    assert.ok(r.quelleKeys.includes("eigene-setzung"));
  });

  test("Schwimmen → null", () => {
    assert.equal(fuelingDuring(120, "swim"), null);
  });

  test("ungültige Dauer → null", () => {
    for (const d of [null, undefined, Number.NaN, -1, 0]) assert.equal(fuelingDuring(d, "ride"), null, String(d));
  });

  test("alle quelleKeys sind bekannt", () => {
    for (const d of [30, 50, 90, 200])
      for (const k of fuelingDuring(d, "ride").quelleKeys) assert.ok(GUIDE_SOURCE_BY_KEY.has(k), k);
  });
});

describe("fuelingBefore (V4)", () => {
  test("Konstante", () => {
    assert.deepEqual(PRE_MEAL_G_PER_KG, [1, 4]);
  });

  test("60 min → normale Mahlzeit reicht", () => {
    const r = fuelingBefore(60, 70);
    assert.equal(r.text, "Deine normale Mahlzeit reicht.");
    assert.equal(r.hint, null);
    assert.deepEqual(r.quelleKeys, ["eigene-setzung"]);
  });

  test("61 min, 70 kg → ca. 70–280 g", () => {
    const r = fuelingBefore(61, 70);
    assert.match(r.text, /kohlenhydratreiche Mahlzeit/);
    assert.equal(r.hint, "1–4 g KH pro kg (bei dir ca. 70–280 g)");
    assert.deepEqual(r.quelleKeys, ["acsm-2016"]);
  });

  test("Gramm auf 10 g gerundet", () => {
    assert.equal(fuelingBefore(90, 72.4).hint, "1–4 g KH pro kg (bei dir ca. 70–290 g)");
  });

  test("ohne Gewicht (null/0/negativ/NaN) → nur pro kg", () => {
    for (const w of [null, undefined, 0, -3, Number.NaN])
      assert.equal(fuelingBefore(90, w).hint, "1–4 g KH pro kg Körpergewicht", String(w));
  });

  test("ungültige Dauer → null", () => {
    assert.equal(fuelingBefore(null, 70), null);
  });
});

describe("buildSessionGuide — Fueling-Abschnitte", () => {
  test("70 kg, 90 min → ca. 70–280 g im Abschnitt Essen vorher", () => {
    const pre = section(buildSessionGuide(overUnder(), ctx()), "fuelPre");
    assert.match(pre.hint, /ca\. 70–280 g/);
  });

  test("weightKg null → Satz ohne Gramm", () => {
    const pre = section(buildSessionGuide(overUnder(), ctx({ weightKg: null })), "fuelPre");
    assert.equal(pre.hint, "1–4 g KH pro kg Körpergewicht");
  });

  test("Dauer aus der Karte; fehlt sie → aus der Struktur; sonst kein Fueling", () => {
    const withStruct = card("Sweet Spot", struct(WARM, SS_SET, COOL), { durationMin: null });
    assert.ok(section(buildSessionGuide(withStruct, ctx()), "fuelInter"), "Dauer aus Struktur");
    const g2 = buildSessionGuide(card("Sweet Spot", null, { durationMin: null }), ctx());
    assert.equal(section(g2, "fuelPre"), undefined);
    assert.equal(section(g2, "fuelInter"), undefined);
    assert.ok(section(g2, "ziel"));
  });

  test("kurze Karte: „Wasser reicht.“ statt Ausblenden", () => {
    const g = buildSessionGuide(card("Z1 Recovery", null, { durationMin: 40 }), ctx());
    assert.equal(section(g, "fuelInter").text, "Wasser reicht.");
    assert.equal(section(g, "fuelPre").text, "Deine normale Mahlzeit reicht.");
  });
});

describe("sessionGuideText (V6)", () => {
  test("eine Zeile je Abschnitt, in fester Reihenfolge", () => {
    const text = sessionGuideText(buildSessionGuide(overUnder(), ctx()));
    const lines = text.split("\n");
    assert.equal(lines.length, 6);
    assert.deepEqual(
      lines.map((l) => l.split(":")[0]),
      ["Ziel", "RPE 7–8", "So fährst du es", "Kadenz", "Essen vorher", "Essen während"]
    );
  });

  test("Essen vorher endet mit „1–4 g KH pro kg“, keine persönliche Gramm-Zahl", () => {
    for (const weightKg of [70, null]) {
      const text = sessionGuideText(buildSessionGuide(overUnder(), ctx({ weightKg })));
      const pre = text.split("\n").find((l) => l.startsWith("Essen vorher:"));
      assert.ok(pre.endsWith("1–4 g KH pro kg"), pre);
      assert.doesNotMatch(text, /bei dir|280|Körpergewicht/);
    }
  });

  test("Karte mit nur „Deine normale Mahlzeit reicht.“ bleibt ohne Gramm-Zusatz", () => {
    const text = sessionGuideText(buildSessionGuide(card("Z1 Recovery", null, { durationMin: 30 }), ctx()));
    assert.match(text, /Essen vorher: Deine normale Mahlzeit reicht\./);
  });

  test("Fueling-Hinweis steht in der Essen-während-Zeile", () => {
    const text = sessionGuideText(buildSessionGuide(card("Z2 Lang", null, { durationMin: 200 }), ctx()));
    const line = text.split("\n").find((l) => l.startsWith("Essen während:"));
    assert.match(line, /60–90 g KH pro Stunde\. Bis 120 g\/h/);
  });

  test("nur erlaubte Zeichen: ASCII, Umlaute, „–“", () => {
    const g = buildSessionGuide(card("Sweet Spot", struct(WARM, SS_SET, SPRINT, COOL), { durationMin: 200 }), ctx());
    assert.doesNotMatch(sessionGuideText(g), /[^\x20-\x7E\nÄÖÜäöüß–]/);
  });

  test("leerer Guide / null → leerer String", () => {
    assert.equal(sessionGuideText(null), "");
    assert.equal(sessionGuideText({ key: "x", rpe: { min: 1, max: 2 }, sections: [] }), "");
  });

  test("RPE-Band mit gleichem Wert ohne Bindestrich", () => {
    const text = sessionGuideText({
      key: "x",
      rpe: { min: 5, max: 5 },
      sections: [{ id: "rpe", title: "RPE", text: "Mittel.", quelleKeys: [] }],
    });
    assert.equal(text, "RPE 5: Mittel.");
  });
});

/* ---------- E6: Lauf + Schwimmen ---------- */

const run = (typ, extra = {}) => card(typ, null, { sport: "run", ...extra });
const swim = (typ, extra = {}) => card(typ, null, { sport: "swim", ...extra });
const ids = (guide) => guide.sections.map((x) => x.id);

describe("buildSessionGuide — Lauf (E6)", () => {
  test("alle vier Lauf-Typen liefern einen Guide mit festem Abschnitts-Gerüst", () => {
    for (const typ of ["Dauerlauf", "Longrun", "Tempolauf", "Intervalle"]) {
      const guide = buildSessionGuide(run(typ), ctx());
      assert.equal(guide.key, `run:${typ.toLowerCase()}`, typ);
      assert.deepEqual(ids(guide), ["ziel", "rpe", "cue", "kadenz", "fuelPre", "fuelInter"], typ);
    }
  });

  test("RPE-Bänder: Dauerlauf 2–3, Tempolauf 6–7, Intervalle 8–9", () => {
    assert.deepEqual(buildSessionGuide(run("Dauerlauf"), ctx()).rpe, { min: 2, max: 3 });
    assert.deepEqual(buildSessionGuide(run("Tempolauf"), ctx()).rpe, { min: 6, max: 7 });
    assert.deepEqual(buildSessionGuide(run("Intervalle"), ctx()).rpe, { min: 8, max: 9 });
  });

  test("Schrittfrequenz-Satz statt Kadenz: vorsichtig, mit figueiredo-2025", () => {
    const k = section(buildSessionGuide(run("Dauerlauf"), ctx()), "kadenz");
    assert.equal(k.title, "Schrittfrequenz");
    assert.match(k.text, /Schrittfrequenz/);
    assert.match(k.text, /5–10 %/);
    assert.ok(k.quelleKeys.includes("figueiredo-2025"));
    assert.ok(!/garantier|verhindert|schützt|heilt/i.test(k.text), "kein Medizin-Versprechen");
  });

  test("Rad-Kadenzziel (U/min) wirkt auf Lauf nicht", () => {
    const k = section(buildSessionGuide(run("Dauerlauf"), ctx({ cadenceTarget: 90 })), "kadenz");
    assert.ok(!/90|U\/min/.test(k.text));
    assert.equal(k.text, section(buildSessionGuide(run("Dauerlauf"), ctx({ cadenceTarget: null })), "kadenz").text);
  });

  test("Lauf-Cue ist immer die Fallback-Fassung, auch mit Rad-Struktur und FTP", () => {
    const withStruct = run("Intervalle", { workoutStructure: struct(WARM, SS_SET, COOL) });
    const guide = buildSessionGuide(withStruct, ctx({ ftp: 250 }));
    const plain = buildSessionGuide(run("Intervalle"), ctx({ ftp: null }));
    assert.equal(section(guide, "cue").text, section(plain, "cue").text);
    assert.ok(!/[{}]|undefined|null|\d\s*W\b/.test(section(guide, "cue").text));
    assert.equal(section(guide, "cue").title, "So läufst du es");
  });

  test("Sprint-Zusatz gibt es nur beim Rad", () => {
    const sprintRun = run("Dauerlauf", { workoutStructure: struct(SS_SET, SPRINT) });
    assert.ok(!/Sprint/.test(section(buildSessionGuide(sprintRun, ctx()), "cue").text));
  });

  test("Kurzeinheit (30 min): „Wasser reicht.“, normale Mahlzeit vorher", () => {
    const guide = buildSessionGuide(run("Dauerlauf", { durationMin: 30 }), ctx());
    assert.equal(section(guide, "fuelInter").text, "Wasser reicht.");
    assert.equal(section(guide, "fuelPre").text, "Deine normale Mahlzeit reicht.");
  });

  test("langer Lauf: g/h nach Dauer, Hinweis spricht Läufer an (nicht „Fahrer“)", () => {
    const fuel = section(buildSessionGuide(run("Longrun", { durationMin: 120 }), ctx()), "fuelInter");
    assert.equal(fuel.text, "30–60 g KH pro Stunde");
    assert.match(fuel.hint, /Läufer/);
    assert.ok(!/Fahrer/.test(fuel.hint));
    assert.ok(fuel.quelleKeys.includes("eigene-setzung"), "Übertragung von Rad-Studie ehrlich markiert");
    const ultra = section(buildSessionGuide(run("Longrun", { durationMin: 170 }), ctx()), "fuelInter");
    assert.equal(ultra.text, "60–90 g KH pro Stunde");
    assert.ok(!/Fahrer/.test(ultra.hint));
  });

  test("Rad-Hinweis bleibt „Fahrer“ und ohne eigene-setzung bei 60–150 min", () => {
    const fuel = section(buildSessionGuide(card("Z2 Lang", null, { durationMin: 120 }), ctx()), "fuelInter");
    assert.match(fuel.hint, /Fahrer/);
    assert.ok(!fuel.quelleKeys.includes("eigene-setzung"));
  });

  test("Essen vorher bei langem Lauf mit Gewicht: persönliche Gramm-Spanne", () => {
    const pre = section(buildSessionGuide(run("Longrun", { durationMin: 120 }), ctx({ weightKg: 70 })), "fuelPre");
    assert.match(pre.hint, /70–280 g/);
  });

  test("alle quelleKeys der Lauf-Abschnitte existieren", () => {
    const guide = buildSessionGuide(run("Tempolauf", { durationMin: 200 }), ctx());
    for (const x of guide.sections) for (const k of x.quelleKeys) assert.ok(GUIDE_SOURCE_BY_KEY.has(k), k);
  });
});

describe("buildSessionGuide — Schwimmen (E6)", () => {
  test("ohne Kadenz und ohne „Essen während“ (Q12, Q13) — auch bei langer Einheit", () => {
    for (const typ of ["Longswim", "Technik", "Intervalle"]) {
      const guide = buildSessionGuide(swim(typ, { durationMin: 200 }), ctx());
      assert.equal(guide.key, `swim:${typ.toLowerCase()}`);
      assert.deepEqual(ids(guide), ["ziel", "rpe", "cue", "fuelPre"], typ);
    }
  });

  test("Kurzeinheit: „Essen vorher“ ist die normale Mahlzeit", () => {
    const guide = buildSessionGuide(swim("Technik", { durationMin: 30 }), ctx());
    assert.deepEqual(ids(guide), ["ziel", "rpe", "cue", "fuelPre"]);
    assert.equal(section(guide, "fuelPre").text, "Deine normale Mahlzeit reicht.");
  });

  test("Cue-Titel für Schwimmen, ohne Lücken/Watt", () => {
    const c = section(buildSessionGuide(swim("Intervalle", { workoutStructure: struct(SS_SET) }), ctx()), "cue");
    assert.equal(c.title, "So schwimmst du es");
    assert.ok(!/[{}]|undefined|null|\d\s*W\b/.test(c.text));
  });

  test("Longswim/Technik: RPE 2–4", () => {
    assert.deepEqual(buildSessionGuide(swim("Longswim"), ctx()).rpe, { min: 2, max: 4 });
    assert.deepEqual(buildSessionGuide(swim("Technik"), ctx()).rpe, { min: 2, max: 4 });
  });
});

describe("buildSessionGuide — swim:intervalle nach Phase (Q15)", () => {
  const rpeOf = (c, extraCtx = {}) => buildSessionGuide(c, ctx(extraCtx)).rpe;

  test("Phase Schwelle → 6–7", () => {
    assert.deepEqual(rpeOf(swim("Intervalle", { phase: "Schwelle" })), { min: 6, max: 7 });
  });

  test("Phase VO2max → 8–9, auch im RPE-Text", () => {
    const guide = buildSessionGuide(swim("Intervalle", { phase: "VO2max" }), ctx());
    assert.deepEqual(guide.rpe, { min: 8, max: 9 });
    assert.match(section(guide, "rpe").text, /Sehr hart/);
  });

  test("ohne Phase, unbekannte Phase oder Prototyp-Name → Default Schwelle", () => {
    for (const phase of [undefined, null, "", "Grundlage", "Taper", "constructor", "__proto__"]) {
      const guide = buildSessionGuide(swim("Intervalle", { phase }), ctx());
      assert.deepEqual(guide.rpe, { min: 6, max: 7 }, String(phase));
      assert.match(section(guide, "rpe").text, /gleichmäßig haltbar/, String(phase));
    }
  });

  test("ctx.phase springt ein, wenn die Karte keine Phase trägt; die Karte gewinnt", () => {
    assert.deepEqual(rpeOf(swim("Intervalle"), { phase: "VO2max" }), { min: 8, max: 9 });
    assert.deepEqual(rpeOf(swim("Intervalle", { phase: "Schwelle" }), { phase: "VO2max" }), { min: 6, max: 7 });
  });

  test("andere Typen ignorieren die Phase (Lauf-Intervalle 8–9, Tempolauf 6–7, Rad Schwelle 6–7)", () => {
    assert.deepEqual(rpeOf(run("Intervalle", { phase: "Schwelle" })), { min: 8, max: 9 });
    assert.deepEqual(rpeOf(run("Tempolauf", { phase: "VO2max" })), { min: 6, max: 7 });
    assert.deepEqual(rpeOf(card("Schwelle", null, { phase: "VO2max" })), { min: 6, max: 7 });
  });

  test("gibt kein veränderbares Band aus der Tabelle heraus", () => {
    const guide = buildSessionGuide(swim("Intervalle", { phase: "VO2max" }), ctx());
    guide.rpe.min = 1;
    assert.deepEqual(buildSessionGuide(swim("Intervalle", { phase: "VO2max" }), ctx()).rpe, { min: 8, max: 9 });
  });
});

describe("sessionGuideText — Lauf und Schwimmen (E6)", () => {
  test("Lauf: Zeilen mit Titel der Sportart, ohne Quellen und ohne persönliche Gramm-Zahl", () => {
    const text = sessionGuideText(buildSessionGuide(run("Longrun", { durationMin: 120 }), ctx({ weightKg: 70 })));
    const labels = text.split("\n").map((l) => l.split(":")[0]);
    assert.deepEqual(labels, ["Ziel", "RPE 2–3", "So läufst du es", "Schrittfrequenz", "Essen vorher", "Essen während"]);
    assert.ok(!/280|bei dir/.test(text));
    assert.ok(!/doi|Quelle/i.test(text));
  });

  test("Schwimmen: weder Kadenz- noch „Essen während“-Zeile", () => {
    const text = sessionGuideText(buildSessionGuide(swim("Longswim", { durationMin: 90 }), ctx()));
    assert.ok(!/Kadenz|Schrittfrequenz|Essen während/.test(text));
    assert.match(text, /^Ziel: /);
    assert.match(text, /\nSo schwimmst du es: /);
  });

  test("Schwimm-Intervalle VO2max: RPE-Zeile trägt das Phasen-Band", () => {
    const text = sessionGuideText(buildSessionGuide(swim("Intervalle", { phase: "VO2max" }), ctx()));
    assert.match(text, /\nRPE 8–9: /);
  });

  test("Rad-Export bleibt unverändert („So fährst du es“, „Kadenz“)", () => {
    const text = sessionGuideText(buildSessionGuide(overUnder(), ctx()));
    assert.match(text, /\nSo fährst du es: /);
    assert.match(text, /\nKadenz: /);
  });
});

describe("rpeCompareText (E7)", () => {
  const band = { min: 6, max: 7 };

  test("Band + Ist-RPE: reiner Text, ohne Urteil", () => {
    assert.equal(rpeCompareText(band, 8), "Ziel 6–7 · gefahren 8");
  });

  test("einzelner Wert statt Band", () => {
    assert.equal(rpeCompareText({ min: 5, max: 5 }, 5), "Ziel 5 · gefahren 5");
  });

  test("ohne Ist-RPE: null", () => {
    assert.equal(rpeCompareText(band, null), null);
    assert.equal(rpeCompareText(band, undefined), null);
  });

  test("Ist-RPE außerhalb 1–10 oder keine ganze Zahl: ignorieren", () => {
    for (const bad of [0, 11, -1, 7.5, NaN, Infinity, "8", true]) {
      assert.equal(rpeCompareText(band, bad), null, String(bad));
    }
  });

  test("Randwerte 1 und 10 zählen", () => {
    assert.equal(rpeCompareText(band, 1), "Ziel 6–7 · gefahren 1");
    assert.equal(rpeCompareText(band, 10), "Ziel 6–7 · gefahren 10");
  });

  test("ungültiges Band: null", () => {
    assert.equal(rpeCompareText(null, 8), null);
    assert.equal(rpeCompareText({ min: NaN, max: 7 }, 8), null);
  });

  test("Text enthält nie „zu hart“/„zu leicht“", () => {
    for (let r = 1; r <= 10; r++) assert.doesNotMatch(rpeCompareText(band, r), /zu hart|zu leicht/i);
  });
});
