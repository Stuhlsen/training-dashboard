/* Tests: data-access/supabase/events.js — events.is_test (D5, docs/
   konzept-progressionssteuerung.md, Schritt 3). Direkter Test der Schicht
   über den Fake-Supabase-Client (Muster wie tests/wellbeing.test.js), damit
   Query-Aufbau und Row-Mapping geprüft werden, nicht nur die state/-Schicht
   darüber (die reicht das Feld nur unverändert durch, s.
   tests/events-athlete-resolution.test.js). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { createFakeSupabaseClient } from "./helpers/fake-supabase-client.js";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const fakeClient = createFakeSupabaseClient();

mock.module(u("data-access/supabase/client.js"), {
  exports: {
    supabase: fakeClient,
    getAuthedClient: async () => fakeClient,
  },
});

const { listEvents, createEvent, updateEvent } = await import(u("data-access/supabase/events.js"));

test("listEvents: mappt is_test aus der Zeile", async () => {
  fakeClient.handlers.events = () => ({
    data: [
      { id: "e1", title: "Ramp Test", event_date: "2026-09-19", type: "race", priority: null, ftp_goal: null, is_test: true, note: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      { id: "e2", title: "GFNY Bremen", event_date: "2026-08-30", type: "race", priority: "main", ftp_goal: null, is_test: false, note: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
    ],
    error: null,
  });
  const result = await listEvents("athlete-uuid");
  assert.equal(result.ok, true);
  assert.equal(result.events[0].isTest, true);
  assert.equal(result.events[1].isTest, false);
});

test("createEvent: setzt is_test aus dem Payload, Default false ohne Angabe", async () => {
  let seenPayload = null;
  fakeClient.handlers.events = (calls) => {
    seenPayload = calls.payload;
    return { data: { id: "e3", title: "Test", event_date: "2026-09-19", type: "race", priority: null, ftp_goal: null, is_test: calls.payload.is_test, note: null, created_at: "x", updated_at: "x" }, error: null };
  };

  await createEvent("athlete-uuid", { title: "Ramp Test", eventDate: "2026-09-19", type: "race", isTest: true });
  assert.equal(seenPayload.is_test, true);

  await createEvent("athlete-uuid", { title: "GFNY Bremen", eventDate: "2026-08-30", type: "race" });
  assert.equal(seenPayload.is_test, false, "ohne isTest im Payload -> Default false");
});

test("updateEvent: type -> 'other' im Patch setzt is_test/priority/ftp_goal serverseitig auf null/false", async () => {
  let seenUpdates = null;
  fakeClient.handlers.events = (calls) => {
    seenUpdates = calls.payload;
    return { data: { id: "e1", title: "Sonstiges", event_date: "2026-08-01", type: "other", priority: null, ftp_goal: null, is_test: false, note: null, created_at: "x", updated_at: "x" }, error: null };
  };
  await updateEvent("e1", { type: "other", isTest: true, priority: "main", ftpGoal: 210 });
  assert.deepEqual(seenUpdates, { type: "other", priority: null, ftp_goal: null, is_test: false });
});

test("updateEvent: patcht is_test nur, wenn im patch enthalten", async () => {
  let seenUpdates = null;
  fakeClient.handlers.events = (calls) => {
    seenUpdates = calls.payload;
    return { data: { id: "e1", title: "Ramp Test", event_date: "2026-09-19", type: "race", priority: null, ftp_goal: null, is_test: true, note: null, created_at: "x", updated_at: "x" }, error: null };
  };

  await updateEvent("e1", { isTest: true });
  assert.deepEqual(seenUpdates, { is_test: true });

  await updateEvent("e1", { title: "Ramp Test (neu)" });
  assert.equal("is_test" in seenUpdates, false, "is_test bleibt unangetastet, wenn nicht im patch");
});
