/* Tests: data-access/supabase/wellbeing.js

   Erster direkter Test einer data-access/supabase/*-Datei — bisher wurde
   die Schicht nur indirekt über eine gemockte state/-Grenze getestet (s.
   tests/plan-cards-move.test.js). Hier wird stattdessen client.js selbst
   per mock.module() durch einen Fake-Client ersetzt (s.
   tests/helpers/fake-supabase-client.js), damit die eigentliche Logik in
   wellbeing.js (Query-Aufbau, Row-Mapping, Result-Konvention) geprüft wird,
   nicht nur die Aufrufer-Schicht darüber.

   Vorerst nur getSharedRange() (neu, docs/offene-punkte.md "wellbeing_public/
   wellbeing_shared — kein Frontend-Konsument"). upsertToday()/getRange()
   folgen im nächsten Schritt (derselbe Seam, eigener Commit). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { createFakeSupabaseClient } from "./helpers/fake-supabase-client.js";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const fakeClient = createFakeSupabaseClient();
let authed = true;

mock.module(u("data-access/supabase/client.js"), {
  exports: {
    supabase: fakeClient,
    getAuthedClient: async () => (authed ? fakeClient : null),
  },
});

const { getSharedRange } = await import(u("data-access/supabase/wellbeing.js"));

test("getSharedRange fragt die wellbeing_shared-View ohne note-Spalte ab", async () => {
  fakeClient.handlers.wellbeing_shared = (calls) => {
    assert.equal(calls.select, "date, energy, muscle_feel, mood");
    assert.deepEqual(calls.filters, [
      { op: "eq", col: "athlete_id", val: "athlete-uuid" },
      { op: "gte", col: "date", val: "2026-07-24" },
      { op: "lte", col: "date", val: "2026-07-24" },
    ]);
    return { data: [{ date: "2026-07-24", energy: 5, muscle_feel: 4, mood: 5 }], error: null };
  };
  const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
  assert.equal(result.ok, true);
  assert.deepEqual(result.checkins, [{ date: "2026-07-24", energy: 5, muscleFeel: 4, mood: 5 }]);
  assert.equal(result.checkins[0].note, undefined, "note darf im Shared-Ergebnis nie auftauchen");
});

test("getSharedRange liefert leer, wenn der Athlet wellbeing_public nicht aktiviert hat (View filtert serverseitig)", async () => {
  fakeClient.handlers.wellbeing_shared = () => ({ data: [], error: null });
  const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
  assert.equal(result.ok, true);
  assert.deepEqual(result.checkins, []);
});

test("getSharedRange braucht keinen authentifizierten Client (funktioniert auch ohne Session)", async () => {
  authed = false;
  try {
    fakeClient.handlers.wellbeing_shared = () => ({
      data: [{ date: "2026-07-24", energy: 3, muscle_feel: 3, mood: 3 }],
      error: null,
    });
    const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
    assert.equal(result.ok, true);
    assert.equal(result.checkins.length, 1);
  } finally {
    authed = true;
  }
});

test("getSharedRange gibt ein Fehler-Result bei einem Supabase-Fehler zurück", async () => {
  fakeClient.handlers.wellbeing_shared = () => ({ data: null, error: { message: "view error" } });
  const result = await getSharedRange("athlete-uuid", "2026-07-24", "2026-07-24");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN");
  assert.equal(result.error.message, "view error");
});
