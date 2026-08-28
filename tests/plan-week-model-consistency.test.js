/* Tests: Plan-Wochen-Modell ↔ Plan-Definitionen (Drift-Wächter).

   scripts/lib/core/plan-week-model.js (byte-identisch zur app/src/core/-Kopie)
   trägt Woche/Phase/trainingWeekdays je Athlet als STATISCHE Struktur (RUH1-
   Entscheidungspunkt: bewusst keine data/*.json-Pipeline). Für Athlet 1 ist
   die Woche/Phase-Ebene aus PLAN2_SCHEDULE abgeleitet, die trainingWeekdays
   sind es NICHT — und Athlet 2/4 sind komplett von Hand übertragen.

   Dieser Test schließt die Lücke: verschiebt eine Plan-Definition später eine
   Phasengrenze, fügt eine Woche hinzu oder ändert einen Trainingstag, ohne
   dass plan-week-model.js mitgezogen wird, schlägt er fehl — statt dass
   planWeekFor()/isDeliberateRestDay() still eine veraltete Phase oder einen
   falschen Ruhe-/Trainings-Slot liefern (s. Code-Review Fahrplan 6 RUH3).

   Ableitungsregel (wie bei der Erst-Erstellung in RUH1): jeder Wochentag mit
   mindestens einer Session in der Plan-Definition ist ein Trainings-Slot,
   der Rest der Woche ist Ruhe-Slot. Seit RUH2 tragen die Plan-Definitionen
   keine "Ruhetag"-Einträge mehr — jede verbliebene Session zählt (auch eine
   reine "Notiz"-Karte wie Athlet 2s "Ausrüstung checken" vor dem Renntag). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN_WEEK_MODEL } from "../scripts/lib/core/plan-week-model.js";
import { PLANNED_SESSIONS } from "../scripts/lib/plan2.js";
import { PLANNED_SESSIONS_ATHLETE2 } from "../scripts/lib/plan-athlete2.js";
import { PLANNED_SESSIONS_ATHLETE4 } from "../scripts/lib/plan-athlete4.js";

/** ISO-Wochentag (1 = Mo … 7 = So), zeitzonenfrei über Date.UTC. */
function isoWeekday(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ((dow + 6) % 7) + 1;
}

/** Plan-Definition (Datum → Session mit week/phase) → Map<week, {phase, days:Set}>. */
function deriveWeeks(sessionsByDate, label) {
  const byWeek = new Map();
  for (const [date, s] of Object.entries(sessionsByDate)) {
    assert.ok(s.week, `${label}: Session ${date} ohne week`);
    assert.ok(s.phase, `${label}: Session ${date} ohne phase`);
    if (!byWeek.has(s.week)) byWeek.set(s.week, { phase: s.phase, days: new Set() });
    const w = byWeek.get(s.week);
    assert.equal(
      w.phase,
      s.phase,
      `${label}/${s.week}: uneinheitliche phase (${w.phase} vs. ${s.phase})`
    );
    w.days.add(isoWeekday(date));
  }
  return byWeek;
}

const sorted = (nums) => [...nums].sort((a, b) => a - b).join(",");

const CASES = [
  ["athlete1", PLANNED_SESSIONS],
  ["athlete2", PLANNED_SESSIONS_ATHLETE2],
  ["athlete4", PLANNED_SESSIONS_ATHLETE4],
];

for (const [athleteId, sessions] of CASES) {
  test(`${athleteId}: Plan-Wochen-Modell deckt sich mit der Plan-Definition`, () => {
    const derived = deriveWeeks(sessions, athleteId);
    const model = PLAN_WEEK_MODEL[athleteId];
    assert.ok(model && model.length, `${athleteId}: kein Modell-Eintrag`);

    const modelWeeks = new Set(model.map((w) => w.week));
    assert.deepEqual(
      [...modelWeeks].sort(),
      [...derived.keys()].sort(),
      `${athleteId}: Wochen-Schlüssel weichen ab (Modell vs. Plan-Definition)`
    );

    for (const mw of model) {
      const d = derived.get(mw.week);
      assert.equal(mw.phase, d.phase, `${athleteId}/${mw.week}: Phase Modell=${mw.phase} Plan=${d.phase}`);
      assert.equal(
        sorted(mw.trainingWeekdays),
        sorted(d.days),
        `${athleteId}/${mw.week}: trainingWeekdays Modell=[${sorted(mw.trainingWeekdays)}] abgeleitet=[${sorted(d.days)}]`
      );
    }
  });
}
