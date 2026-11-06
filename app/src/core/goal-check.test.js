import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { assessFtpGoal, MAX_STALE_DAYS, INTERIM_WEEKS } from "./goal-check.js";

const TODAY = "2026-11-05";

const addDays = (iso, n) =>
  new Date(new Date(iso).getTime() + n * 86400000).toISOString().split("T")[0];

/** Wöchentliche Reihe (chronologisch), endet bei endISO mit endValue, Anstieg perWeek. */
function history({ endISO = "2026-11-01", count = 8, endValue = 250, perWeek = 2, stepDays = 7 }) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push({
      date: addDays(endISO, -i * stepDays),
      eftp: endValue - (perWeek * (i * stepDays)) / 7,
    });
  }
  return out;
}

const base = (over = {}) => ({
  current: 250,
  target: 270,
  targetDate: "2027-02-04", // 13 Wochen nach TODAY
  history: history({}),
  todayISO: TODAY,
  ...over,
});

describe("assessFtpGoal", () => {
  test("positiver Trend, der reicht: on-track mit Prognose und ETA", () => {
    const r = assessFtpGoal(base());
    assert.equal(r.ok, true);
    assert.equal(r.verdict, "on-track");
    assert.equal(r.wattsPerWeek, 2);
    assert.equal(r.needPerWeek, 1.5);
    assert.deepEqual(r.projectedAtDate, { projected: 277, low: 275, high: 279 });
    assert.equal(r.etaISO, "2027-01-14");
    assert.equal(r.confidence, "high");
  });

  test("positiver Trend, der nicht reicht: tight", () => {
    const r = assessFtpGoal(base({ history: history({ perWeek: 1 }) }));
    assert.equal(r.verdict, "tight");
    assert.equal(r.wattsPerWeek, 1);
  });

  test("Ziel schon erreicht: reached, kein Zwischenziel, keine ETA", () => {
    const r = assessFtpGoal(base({ current: 270 }));
    assert.equal(r.ok, true);
    assert.equal(r.verdict, "reached");
    assert.equal(r.interimTarget, null);
    assert.equal(r.etaISO, null);
    assert.equal(r.needPerWeek, null);
  });

  test("Ziel erreicht auch bei zu wenig Daten: Trendfelder null", () => {
    const r = assessFtpGoal(base({ current: 280, history: [] }));
    assert.equal(r.ok, true);
    assert.equal(r.verdict, "reached");
    assert.equal(r.wattsPerWeek, null);
    assert.equal(r.projectedAtDate, null);
    assert.equal(r.etaISO, null);
    assert.equal(r.confidence, null);
    assert.equal(r.interimTarget, null);
  });

  test("zu wenig Punkte: too-little-data", () => {
    const r = assessFtpGoal(base({ history: history({ count: 2 }) }));
    assert.deepEqual(r, { ok: false, reason: "too-little-data" });
  });

  test("leere oder fehlende Historie: too-little-data", () => {
    assert.deepEqual(assessFtpGoal(base({ history: [] })), {
      ok: false,
      reason: "too-little-data",
    });
    assert.deepEqual(assessFtpGoal(base({ history: undefined })), {
      ok: false,
      reason: "too-little-data",
    });
  });

  test("alte Daten (jüngster Punkt > 28 Tage her): too-little-data", () => {
    const old = history({ endISO: addDays(TODAY, -(MAX_STALE_DAYS + 1)) });
    assert.deepEqual(assessFtpGoal(base({ history: old })), {
      ok: false,
      reason: "too-little-data",
    });
  });

  test("jüngster Punkt genau 28 Tage alt zählt noch", () => {
    const edge = history({ endISO: addDays(TODAY, -MAX_STALE_DAYS) });
    assert.equal(assessFtpGoal(base({ history: edge })).ok, true);
  });

  test("ungeordnete Historie wird wie geordnete behandelt", () => {
    const shuffled = [...history({})].reverse();
    assert.equal(assessFtpGoal(base({ history: shuffled })).wattsPerWeek, 2);
  });

  test("kein Datum: no-date, ETA aus Tempo, keine Termin-Felder", () => {
    const r = assessFtpGoal(base({ targetDate: null }));
    assert.equal(r.verdict, "no-date");
    assert.equal(r.needPerWeek, null);
    assert.equal(r.projectedAtDate, null);
    assert.equal(r.etaISO, "2027-01-14");
    assert.ok(r.interimTarget);
  });

  test("Datum in der Vergangenheit: kein needPerWeek, Trend entscheidet", () => {
    const r = assessFtpGoal(base({ targetDate: "2026-10-01" }));
    assert.equal(r.needPerWeek, null);
    assert.equal(r.projectedAtDate, null);
    assert.equal(r.verdict, "tight");
    assert.equal(r.interimTarget.dateISO, addDays(TODAY, INTERIM_WEEKS * 7));
  });

  test("Datum heute zählt wie Vergangenheit", () => {
    const r = assessFtpGoal(base({ targetDate: TODAY }));
    assert.equal(r.needPerWeek, null);
  });

  test("flacher Trend: ambitious, keine ETA", () => {
    const r = assessFtpGoal(base({ history: history({ perWeek: 0 }) }));
    assert.equal(r.verdict, "ambitious");
    assert.equal(r.etaISO, null);
    assert.equal(r.wattsPerWeek, 0);
  });

  test("negativer Trend: ambitious, keine ETA", () => {
    const r = assessFtpGoal(base({ history: history({ perWeek: -1 }) }));
    assert.equal(r.verdict, "ambitious");
    assert.equal(r.etaISO, null);
    assert.equal(r.wattsPerWeek, -1);
  });

  test("Ziel mehr als 10 % über current und Trend reicht nicht: ambitious", () => {
    const r = assessFtpGoal(
      base({ current: 200, target: 230, history: history({ endValue: 200, perWeek: 1 }) }),
    );
    assert.equal(r.verdict, "ambitious");
  });

  test("Ziel genau 10 % über current und Trend reicht nicht: tight", () => {
    const r = assessFtpGoal(
      base({ current: 200, target: 220, history: history({ endValue: 200, perWeek: 1 }) }),
    );
    assert.equal(r.verdict, "tight");
  });

  test("Ziel über 10 %, aber Trend reicht trotzdem: on-track", () => {
    const r = assessFtpGoal(
      base({ current: 200, target: 230, history: history({ endValue: 200, perWeek: 3 }) }),
    );
    assert.equal(r.verdict, "on-track");
  });

  test("ETA weiter als 2 Jahre: null", () => {
    const r = assessFtpGoal(base({ target: 270, history: history({ perWeek: 0.1 }) }));
    assert.equal(r.wattsPerWeek, 0.1);
    assert.equal(r.etaISO, null);
  });

  test("ungültige Eingabe: invalid-input", () => {
    assert.deepEqual(assessFtpGoal(base({ current: NaN })), {
      ok: false,
      reason: "invalid-input",
    });
    assert.deepEqual(assessFtpGoal(base({ target: undefined })), {
      ok: false,
      reason: "invalid-input",
    });
  });

  describe("confidence", () => {
    test("wenige Punkte: low", () => {
      assert.equal(assessFtpGoal(base({ history: history({ count: 3 }) })).confidence, "low");
    });

    test("mittlere Punktzahl, glatter Trend: medium", () => {
      assert.equal(assessFtpGoal(base({ history: history({ count: 5 }) })).confidence, "medium");
    });

    test("viele Punkte, aber breites Band: low", () => {
      const noisy = history({}).map((p, i) => ({ ...p, eftp: p.eftp + (i % 2 ? 15 : -15) }));
      assert.equal(assessFtpGoal(base({ history: noisy })).confidence, "low");
    });
  });

  describe("interimTarget", () => {
    const flat = (current, target, over = {}) =>
      assessFtpGoal(
        base({ current, target, history: history({ endValue: current, perWeek: 0 }), ...over }),
      ).interimTarget;

    test("Beispiel: current 210, target 230, flacher Trend ergibt 215", () => {
      assert.equal(flat(210, 230).watts, 215);
    });

    test("Datum: heute plus 6 Wochen", () => {
      assert.equal(flat(210, 230).dateISO, "2026-12-17");
    });

    test("Datum: targetDate, falls früher", () => {
      assert.equal(flat(210, 230, { targetDate: "2026-11-19" }).dateISO, "2026-11-19");
    });

    test("Trend größer als 2 %: Trend mal Wochen gewinnt", () => {
      const r = assessFtpGoal(
        base({ current: 250, target: 300, history: history({ perWeek: 3 }) }),
      );
      // 250 + 3*6 = 268 -> 270
      assert.equal(r.interimTarget.watts, 270);
    });

    test("Rundung gleich current: current plus 5 W", () => {
      assert.equal(flat(100, 120).watts, 105);
    });

    test("Deckelung auf target", () => {
      assert.equal(flat(228, 230).watts, 230);
    });

    test("nie unter current, auch bei negativem Trend", () => {
      const r = assessFtpGoal(
        base({ current: 250, target: 270, history: history({ perWeek: -2 }) }),
      );
      assert.ok(r.interimTarget.watts > 250);
    });

    test("Rundung auf 5 W", () => {
      assert.equal(flat(213, 260).watts % 5, 0);
    });
  });
});
