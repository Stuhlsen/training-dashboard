import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { LOW_START_HOURS, suggestSportHours } from "./goal-hours.js";

const g = (goalKey) => ({ goalKey });
const same = (hours) => ({ hours, fromGoal: false, goalKey: null });

describe("suggestSportHours — Stunden-Vorschlag aus Zielen (Fahrplan 44 E7)", () => {
  test("Laufen starten senkt die Lauf-Stunden auf den niedrigen Start", () => {
    const r = suggestSportHours({ sport: "run", defaultHours: 3, main: g("laufen_starten"), side: null });
    assert.deepEqual(r, { hours: LOW_START_HOURS.run, fromGoal: true, goalKey: "laufen_starten" });
    assert.ok(r.hours < 3);
  });

  test("auch als Nebenziel", () => {
    const r = suggestSportHours({ sport: "run", defaultHours: 3, main: g("ftp"), side: g("laufen_starten") });
    assert.equal(r.hours, LOW_START_HOURS.run);
    assert.equal(r.goalKey, "laufen_starten");
  });

  test("ohne passendes Ziel bleibt die Vorbelegung exakt gleich", () => {
    assert.deepEqual(suggestSportHours({ sport: "run", defaultHours: 3, main: null, side: null }), same(3));
    assert.deepEqual(suggestSportHours({ sport: "run", defaultHours: 3, main: g("ausdauer"), side: g("fit_bleiben") }), same(3));
    assert.deepEqual(suggestSportHours({ sport: "swim", defaultHours: 2, main: g("event"), side: null }), same(2));
  });

  test("Rad bleibt unberührt (M3), auch mit Laufen-starten-Ziel", () => {
    for (const h of [3, 6, 12]) {
      assert.deepEqual(suggestSportHours({ sport: "ride", defaultHours: h, main: g("laufen_starten"), side: null }), same(h));
    }
  });

  test("Sportfilter: Laufen starten wirkt nicht auf Schwimmen", () => {
    assert.deepEqual(suggestSportHours({ sport: "swim", defaultHours: 2, main: g("laufen_starten"), side: null }), same(2));
  });

  test("sonstiges und muskeln_kraft haben keine Wirkung", () => {
    for (const k of ["sonstiges", "muskeln_kraft"]) {
      assert.deepEqual(suggestSportHours({ sport: "run", defaultHours: 3, main: g(k), side: null }), same(3));
    }
  });

  test("hebt nie an: liegt die Vorbelegung schon niedriger, bleibt sie", () => {
    assert.deepEqual(
      suggestSportHours({ sport: "run", defaultHours: 1.5, main: g("laufen_starten"), side: null }),
      same(1.5),
    );
  });

  test("unbekannter Schlüssel und fehlende Ziele werfen nicht", () => {
    assert.deepEqual(suggestSportHours({ sport: "run", defaultHours: 3, main: g("gibt-es-nicht"), side: undefined }), same(3));
    assert.deepEqual(suggestSportHours({ sport: "run", defaultHours: 3 }), same(3));
  });
});
