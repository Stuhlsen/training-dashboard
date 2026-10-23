/* Tests: Trainings-Guide-Texte (core/session-guide-texts.js) und Quellen
   (core/session-guide-sources.js) — Fahrplan 34, E1. */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { SESSION_GUIDE_TEXTS, GUIDE_CUE_PLACEHOLDERS } from "./session-guide-texts.js";
import {
  GUIDE_SOURCE_KEYS,
  SESSION_GUIDE_SOURCES,
  GUIDE_SOURCE_BY_KEY,
} from "./session-guide-sources.js";
import { ZONE_SOURCE_STATUS } from "./zone-sources.js";

const RIDE_KEYS = [
  "ride:sweetspot-long",
  "ride:threshold-long",
  "ride:over-under",
  "ride:vo2-long",
  "ride:vo2-short",
  "ride:sprint-accessory",
  "ride:ftp-test",
  "ride:z2-lang",
  "ride:z2-dauer",
  "ride:z1-recovery",
];

const RUN_KEYS = ["run:dauerlauf", "run:longrun", "run:tempolauf", "run:intervalle"];
const SWIM_KEYS = ["swim:longswim", "swim:technik", "swim:intervalle"];
const ALL_KEYS = [...RIDE_KEYS, ...RUN_KEYS, ...SWIM_KEYS];
/** Rad-Familien mit Lücken in der Vorlage. */
const INTERVAL_KEYS = ["ride:sweetspot-long", "ride:threshold-long", "ride:over-under", "ride:vo2-long", "ride:vo2-short"];

/* Beleg §2c, 1:1 */
const EXPECTED_RPE = {
  "run:dauerlauf": [2, 3],
  "run:longrun": [2, 3],
  "run:tempolauf": [6, 7],
  "run:intervalle": [8, 9],
  "swim:longswim": [2, 4],
  "swim:technik": [2, 4],
  "swim:intervalle": [6, 7], // Default = Phase Schwelle, s. rpeByPhase
  "ride:z1-recovery": [1, 2],
  "ride:z2-dauer": [2, 3],
  "ride:z2-lang": [2, 3],
  "ride:sweetspot-long": [5, 6],
  "ride:threshold-long": [6, 7],
  "ride:over-under": [7, 8],
  "ride:vo2-long": [8, 9],
  "ride:vo2-short": [8, 9],
  "ride:sprint-accessory": [9, 10],
  "ride:ftp-test": [9, 10],
};

const EXPECTED_GEFUEHL = {
  "run:dauerlauf": "Locker, du kannst ganze Sätze sprechen.",
  "run:longrun": "Locker, du kannst ganze Sätze sprechen.",
  "run:tempolauf": "Hart, aber gleichmäßig haltbar. Sprechen nur in kurzen Sätzen.",
  "run:intervalle": "Sehr hart. Die letzte Minute jedes Intervalls ist schwer.",
  "swim:longswim": "Ruhig, Fokus auf saubere Züge.",
  "swim:technik": "Ruhig, Fokus auf saubere Züge.",
  "swim:intervalle": "Hart, aber gleichmäßig haltbar. Sprechen nur in kurzen Sätzen.",
  "ride:z1-recovery": "Ganz locker, du könntest ewig weiterfahren.",
  "ride:z2-dauer": "Locker, du kannst ganze Sätze sprechen.",
  "ride:z2-lang": "Locker, du kannst ganze Sätze sprechen.",
  "ride:sweetspot-long": "Fordernd, aber mit Reserve. Am Ende geht noch eine Wiederholung.",
  "ride:threshold-long": "Hart, aber gleichmäßig haltbar. Sprechen nur in kurzen Sätzen.",
  "ride:over-under": "Die Über-Teile brennen, in den Unter-Teilen erholst du dich kaum.",
  "ride:vo2-long": "Sehr hart. Die letzte Minute jedes Intervalls ist schwer.",
  "ride:vo2-short": "Sehr hart in Summe, auch wenn jedes Stück kurz ist.",
  "ride:sprint-accessory": "Kurz alles geben, dann ganz locker.",
  "ride:ftp-test": "Am Ende ganz leer, aber gleichmäßig dorthin.",
};

const textFields = (e) => [e.ziel, e.gefuehl, e.cue.template, e.cue.fallback, e.abbruch];

describe("SESSION_GUIDE_TEXTS — Aufbau", () => {
  test("genau die Schlüssel aus V2 (Rad, Lauf, Schwimmen)", () => {
    assert.deepEqual(Object.keys(SESSION_GUIDE_TEXTS).sort(), [...ALL_KEYS].sort());
  });

  test("Tabelle und Einträge sind eingefroren", () => {
    assert.ok(Object.isFrozen(SESSION_GUIDE_TEXTS));
    for (const key of ALL_KEYS) {
      const e = SESSION_GUIDE_TEXTS[key];
      assert.ok(Object.isFrozen(e), key);
      assert.ok(Object.isFrozen(e.rpe), key);
      assert.ok(Object.isFrozen(e.cue), key);
      assert.ok(Object.isFrozen(e.quelleKeys), key);
    }
  });

  for (const key of ALL_KEYS) {
    test(`${key}: alle Pflichtfelder gefüllt`, () => {
      const e = SESSION_GUIDE_TEXTS[key];
      for (const f of textFields(e)) {
        assert.equal(typeof f, "string", key);
        assert.ok(f.trim().length > 0, key);
      }
      assert.ok(Array.isArray(e.quelleKeys) && e.quelleKeys.length > 0, key);
    });

    test(`${key}: 1 ≤ rpe.min ≤ rpe.max ≤ 10, ganze Zahlen`, () => {
      const { min, max } = SESSION_GUIDE_TEXTS[key].rpe;
      assert.ok(Number.isInteger(min) && Number.isInteger(max), key);
      assert.ok(min >= 1 && min <= max && max <= 10, key);
    });
  }
});

describe("SESSION_GUIDE_TEXTS — Inhalte aus dem Beleg", () => {
  for (const key of ALL_KEYS) {
    test(`${key}: RPE-Band und Gefühls-Satz wie Beleg §2c`, () => {
      const e = SESSION_GUIDE_TEXTS[key];
      assert.deepEqual([e.rpe.min, e.rpe.max], EXPECTED_RPE[key]);
      assert.equal(e.gefuehl, EXPECTED_GEFUEHL[key]);
    });
  }
});

describe("SESSION_GUIDE_TEXTS — Lücken und Zahlen", () => {
  test("Vorlagen nutzen nur {reps}, {workMin}, {wattRange}", () => {
    for (const key of ALL_KEYS) {
      const found = SESSION_GUIDE_TEXTS[key].cue.template.match(/\{[^}]*\}/g) ?? [];
      for (const p of found) {
        assert.ok(GUIDE_CUE_PLACEHOLDERS.includes(p), `${key}: ${p}`);
      }
    }
  });

  test("Fallback-Fassung und alle übrigen Texte enthalten keine Lücke", () => {
    for (const key of ALL_KEYS) {
      const e = SESSION_GUIDE_TEXTS[key];
      for (const f of [e.ziel, e.gefuehl, e.cue.fallback, e.abbruch]) {
        assert.ok(!/[{}]|undefined|null/.test(f), `${key}: ${f}`);
      }
    }
  });

  test("keine Prozent- oder Watt-Zahlen in den Texten (die kommen nur über Lücken)", () => {
    for (const key of ALL_KEYS) {
      for (const f of textFields(SESSION_GUIDE_TEXTS[key])) {
        assert.ok(!/%|\d\s*(W|Watt)\b/.test(f), `${key}: ${f}`);
      }
    }
  });

  test("Vorlagen enthalten keine feste Zahl außer den Lücken", () => {
    for (const key of ALL_KEYS) {
      assert.ok(!/\d/.test(SESSION_GUIDE_TEXTS[key].cue.template), key);
    }
  });

  test("Intervall-Familien haben mindestens eine Lücke in der Vorlage", () => {
    for (const key of INTERVAL_KEYS) {
      assert.ok(/\{(reps|workMin|wattRange)\}/.test(SESSION_GUIDE_TEXTS[key].cue.template), key);
    }
  });
});

describe("SESSION_GUIDE_TEXTS — Ton", () => {
  test("Abbruchregel ist neutral: kein Druck, keine Schuld", () => {
    for (const key of ALL_KEYS) {
      const a = SESSION_GUIDE_TEXTS[key].abbruch;
      assert.ok(!/musst|versagt|schwach|nur wer|durchbeißen|aufgeben/i.test(a), key);
    }
  });
});

describe("Quellen", () => {
  test("jeder quelleKey der Texte existiert in session-guide-sources.js", () => {
    for (const key of ALL_KEYS) {
      for (const q of SESSION_GUIDE_TEXTS[key].quelleKeys) {
        assert.ok(GUIDE_SOURCE_BY_KEY.has(q), `${key}: ${q}`);
      }
    }
  });

  test("alle sechs geplanten Einträge sind da", () => {
    for (const k of ["morton-2026", "acsm-2016", "ijaz-2025", "nuuttila-2025", "figueiredo-2025", "eigene-setzung"]) {
      assert.ok(GUIDE_SOURCE_BY_KEY.has(k), k);
    }
    assert.equal(SESSION_GUIDE_SOURCES.length, 6);
  });

  test("Status: Studien primär, eigene Setzung unbelegt", () => {
    for (const k of ["morton-2026", "acsm-2016", "ijaz-2025", "nuuttila-2025", "figueiredo-2025"]) {
      assert.equal(GUIDE_SOURCE_BY_KEY.get(k).status, ZONE_SOURCE_STATUS.PRIMAER, k);
    }
    assert.equal(GUIDE_SOURCE_BY_KEY.get("eigene-setzung").status, ZONE_SOURCE_STATUS.UNBELEGT);
  });

  test("Format wie zone-sources: key, title, link, note, status; Schlüssel eindeutig", () => {
    const seen = new Set();
    for (const s of SESSION_GUIDE_SOURCES) {
      for (const f of ["key", "title", "link", "note", "status"]) {
        assert.equal(typeof s[f], "string", `${s.key}.${f}`);
        assert.ok(s[f].length > 0, `${s.key}.${f}`);
      }
      assert.ok(!seen.has(s.key), s.key);
      seen.add(s.key);
      assert.ok(Object.isFrozen(s), s.key);
    }
  });

  test("Studien tragen eine DOI-Adresse, die eigene Setzung keine", () => {
    for (const k of ["morton-2026", "acsm-2016", "ijaz-2025", "nuuttila-2025", "figueiredo-2025"]) {
      assert.match(GUIDE_SOURCE_BY_KEY.get(k).url, /^https:\/\/doi\.org\/10\./, k);
    }
    assert.equal(GUIDE_SOURCE_BY_KEY.get("eigene-setzung").url, undefined);
  });

  test("GUIDE_SOURCE_KEYS deckt jeden Eintrag ab", () => {
    assert.deepEqual(
      Object.values(GUIDE_SOURCE_KEYS).sort(),
      SESSION_GUIDE_SOURCES.map((s) => s.key).sort()
    );
  });
});

describe("SESSION_GUIDE_TEXTS — Lauf und Schwimmen (E6)", () => {
  test("Lauf und Schwimmen haben keine Lücken: Vorlage == Fallback", () => {
    for (const key of [...RUN_KEYS, ...SWIM_KEYS]) {
      const { template, fallback } = SESSION_GUIDE_TEXTS[key].cue;
      assert.equal(template, fallback, key);
    }
  });

  test("Lauf und Schwimmen tragen eine Fußnote zur eigenen Setzung", () => {
    for (const key of [...RUN_KEYS, ...SWIM_KEYS]) {
      assert.ok(SESSION_GUIDE_TEXTS[key].quelleKeys.includes("eigene-setzung"), key);
    }
  });

  test("Tempolauf trägt die Läufer-Studie zur Schwelle (nuuttila-2025)", () => {
    assert.ok(SESSION_GUIDE_TEXTS["run:tempolauf"].quelleKeys.includes("nuuttila-2025"));
  });

  test("nur swim:intervalle hat rpeByPhase", () => {
    for (const key of ALL_KEYS) {
      assert.equal("rpeByPhase" in SESSION_GUIDE_TEXTS[key], key === "swim:intervalle", key);
    }
  });

  test("swim:intervalle: Schwelle 6–7, VO2max 8–9, eingefroren, Default == Schwelle", () => {
    const e = SESSION_GUIDE_TEXTS["swim:intervalle"];
    assert.deepEqual([e.rpeByPhase.Schwelle.min, e.rpeByPhase.Schwelle.max], [6, 7]);
    assert.deepEqual([e.rpeByPhase.VO2max.min, e.rpeByPhase.VO2max.max], [8, 9]);
    assert.deepEqual([e.rpe.min, e.rpe.max], [e.rpeByPhase.Schwelle.min, e.rpeByPhase.Schwelle.max]);
    assert.equal(e.gefuehl, e.rpeByPhase.Schwelle.gefuehl);
    assert.ok(Object.isFrozen(e.rpeByPhase) && Object.isFrozen(e.rpeByPhase.VO2max));
    assert.equal(e.rpeByPhase.VO2max.gefuehl, "Sehr hart. Die letzte Minute jedes Intervalls ist schwer.");
  });

  test("Phasen-Varianten sind gültig: ganze Zahlen 1–10, Text gefüllt", () => {
    for (const v of Object.values(SESSION_GUIDE_TEXTS["swim:intervalle"].rpeByPhase)) {
      assert.ok(Number.isInteger(v.min) && Number.isInteger(v.max) && v.min >= 1 && v.min <= v.max && v.max <= 10);
      assert.ok(v.gefuehl.trim().length > 0 && !/[{}]|undefined|null/.test(v.gefuehl));
    }
  });
});
