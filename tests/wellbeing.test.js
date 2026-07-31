/* Tests: data-access/supabase/wellbeing.js

   Erster direkter Test einer data-access/supabase/*-Datei — bisher wurde
   die Schicht nur indirekt über eine gemockte state/-Grenze getestet (s.
   tests/plan-cards-move.test.js). Hier wird stattdessen client.js selbst
   per mock.module() durch einen Fake-Client ersetzt (s.
   tests/helpers/fake-supabase-client.js), damit die eigentliche Logik in
   wellbeing.js (Query-Aufbau, Row-Mapping, Result-Konvention) geprüft wird,
   nicht nur die Aufrufer-Schicht darüber.

   Deckt jetzt auch upsertToday()/getRange() ab (docs/offene-punkte.md
   "upsertToday-Unit-Test fehlt") — kein Test existierte bisher, weil im
   Repo kein Mocking-Seam für den Supabase-Client vorlag (der wurde mit
   getSharedRange() im vorigen Schritt zusammen mit dem ersten Test
   eingeführt, s. tests/helpers/fake-supabase-client.js). getToday() gibt
   es nicht mehr (entfernt, s. Konzept Abschnitt 7 — state/wellbeing.js
   lädt seit dem Governor eine 2-Tage-Range statt eines Einzeltags). */

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

const { upsertToday, getRange, getSharedRange } = await import(u("data-access/supabase/wellbeing.js"));

/* ── upsertToday ─────────────────────────────────────────────── */

test("upsertToday sendet athlete_id/date/energy/muscle_feel/mood/note als Upsert und mappt die Antwort", async () => {
  fakeClient.handlers.wellbeing = (calls) => {
    assert.equal(calls.method, "upsert");
    assert.deepEqual(calls.payload, {
      athlete_id: "athlete-uuid",
      date: "2026-07-24",
      energy: 4,
      muscle_feel: 3,
      mood: 5,
      note: "Kopf dicht",
    });
    assert.equal(calls.upsertOpts.onConflict, "athlete_id,date", "Upsert-Konflikt auf (athlete_id, date)");
    return {
      data: {
        id: "row-1",
        date: "2026-07-24",
        energy: 4,
        muscle_feel: 3,
        mood: 5,
        note: "Kopf dicht",
        updated_at: "2026-07-24T10:00:00Z",
      },
      error: null,
    };
  };

  const result = await upsertToday("athlete-uuid", "2026-07-24", {
    energy: 4,
    muscleFeel: 3,
    mood: 5,
    note: "Kopf dicht",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.checkin, {
    id: "row-1",
    date: "2026-07-24",
    energy: 4,
    muscleFeel: 3,
    mood: 5,
    note: "Kopf dicht",
    updatedAt: "2026-07-24T10:00:00Z",
  });
});

test("upsertToday setzt eine fehlende Notiz auf null statt undefined", async () => {
  fakeClient.handlers.wellbeing = (calls) => {
    assert.equal(calls.payload.note, null);
    return {
      data: { id: "row-2", date: "2026-07-24", energy: 3, muscle_feel: 3, mood: 3, note: null, updated_at: "t" },
      error: null,
    };
  };
  const result = await upsertToday("athlete-uuid", "2026-07-24", { energy: 3, muscleFeel: 3, mood: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.checkin.note, null);
});

test("upsertToday gibt ein Fehler-Result (Result-Konvention) bei einem Supabase-Fehler zurück", async () => {
  fakeClient.handlers.wellbeing = () => ({ data: null, error: { message: "constraint violation" } });
  const result = await upsertToday("athlete-uuid", "2026-07-24", { energy: 1, muscleFeel: 1, mood: 1, note: null });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN");
  assert.equal(result.error.message, "constraint violation");
});

/* ── getRange ────────────────────────────────────────────────── */

test("getRange filtert nach athlete_id + Datumsbereich, sortiert aufsteigend, mappt alle Zeilen", async () => {
  fakeClient.handlers.wellbeing = (calls) => {
    assert.equal(calls.select, "id, date, energy, muscle_feel, mood, note, updated_at");
    assert.deepEqual(calls.filters, [
      { op: "eq", col: "athlete_id", val: "athlete-uuid" },
      { op: "gte", col: "date", val: "2026-07-23" },
      { op: "lte", col: "date", val: "2026-07-24" },
    ]);
    assert.deepEqual(calls.order, { col: "date", ascending: true });
    return {
      data: [
        { id: "r1", date: "2026-07-23", energy: 3, muscle_feel: 3, mood: 3, note: null, updated_at: "t1" },
        { id: "r2", date: "2026-07-24", energy: 4, muscle_feel: 4, mood: 4, note: "gut", updated_at: "t2" },
      ],
      error: null,
    };
  };
  const result = await getRange("athlete-uuid", "2026-07-23", "2026-07-24");
  assert.equal(result.ok, true);
  assert.equal(result.checkins.length, 2);
  assert.equal(result.checkins[1].muscleFeel, 4);
  assert.equal(result.checkins[1].note, "gut");
});

test("getRange liefert leer, ohne Fehler zu werfen, wenn keine Session vorliegt", async () => {
  authed = false;
  try {
    const result = await getRange("athlete-uuid", "2026-07-23", "2026-07-24");
    assert.equal(result.ok, true);
    assert.deepEqual(result.checkins, []);
  } finally {
    authed = true;
  }
});

test("getRange gibt ein Fehler-Result bei einem Supabase-Fehler zurück", async () => {
  fakeClient.handlers.wellbeing = () => ({ data: null, error: { message: "network down" } });
  const result = await getRange("athlete-uuid", "2026-07-23", "2026-07-24");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN");
  assert.equal(result.error.message, "network down");
});

/* ── getSharedRange (wellbeing_shared) ───────────────────────── */

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
