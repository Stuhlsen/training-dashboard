/* Tests: data-access/supabase/export-prefs.js

   Gleiches Muster wie tests/wellbeing.test.js: client.js wird per
   mock.module() durch einen Fake-Client ersetzt (tests/helpers/
   fake-supabase-client.js), geprüft wird Query-Aufbau, Row-Mapping und
   Result-Konvention von export-prefs.js selbst. */

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

const { getExportPrefs, setExportPrefs } = await import(u("data-access/supabase/export-prefs.js"));

/* ── getExportPrefs ──────────────────────────────────────────── */

test("getExportPrefs liest preset/event_id per profile_id-Filter und mappt die Antwort", async () => {
  fakeClient.handlers.export_prefs = (calls) => {
    assert.equal(calls.select, "preset, event_id");
    assert.deepEqual(calls.filters, [{ op: "eq", col: "profile_id", val: "profile-uuid" }]);
    assert.equal(calls.terminal, "maybeSingle");
    return { data: { preset: "event", event_id: "event-uuid" }, error: null };
  };
  const result = await getExportPrefs("profile-uuid");
  assert.equal(result.ok, true);
  assert.equal(result.preset, "event");
  assert.equal(result.eventId, "event-uuid");
});

test("getExportPrefs liefert preset:null/eventId:null, wenn noch nie gespeichert wurde (kein Row)", async () => {
  fakeClient.handlers.export_prefs = () => ({ data: null, error: null });
  const result = await getExportPrefs("profile-uuid");
  assert.equal(result.ok, true);
  assert.equal(result.preset, null);
  assert.equal(result.eventId, null);
});

test("getExportPrefs gibt ein Fehler-Result (Result-Konvention) bei einem Supabase-Fehler zurück", async () => {
  fakeClient.handlers.export_prefs = () => ({ data: null, error: { message: "network down" } });
  const result = await getExportPrefs("profile-uuid");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN");
  assert.equal(result.error.message, "network down");
});

/* ── setExportPrefs ──────────────────────────────────────────── */

test("setExportPrefs sendet profile_id/preset/event_id als Upsert auf profile_id", async () => {
  fakeClient.handlers.export_prefs = (calls) => {
    assert.equal(calls.method, "upsert");
    assert.deepEqual(calls.payload, {
      profile_id: "profile-uuid",
      preset: "reduce",
      event_id: null,
    });
    assert.equal(calls.upsertOpts.onConflict, "profile_id");
    return { data: null, error: null };
  };
  const result = await setExportPrefs("profile-uuid", { preset: "reduce", eventId: null });
  assert.equal(result.ok, true);
});

test("setExportPrefs setzt eine fehlende event_id auf null statt undefined", async () => {
  fakeClient.handlers.export_prefs = (calls) => {
    assert.equal(calls.payload.event_id, null);
    return { data: null, error: null };
  };
  const result = await setExportPrefs("profile-uuid", { preset: "general" });
  assert.equal(result.ok, true);
});

test("setExportPrefs gibt ein Fehler-Result bei einem Supabase-Fehler zurück", async () => {
  fakeClient.handlers.export_prefs = () => ({ data: null, error: { message: "constraint violation" } });
  const result = await setExportPrefs("profile-uuid", { preset: "build", eventId: null });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "UNKNOWN");
  assert.equal(result.error.message, "constraint violation");
});
