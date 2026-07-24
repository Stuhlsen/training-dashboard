/* Tests: state/events.js — Auflösung der internen Athleten-Kennung
   ("athlete1"/"athlete2") auf die Supabase-Profil-UUID vor jeder events-Query.

   Bugreport (Browser-Konsole, Juli 2026): loadEvents()/createEvent() reichten
   Data.activeAthleteId ("athlete1") unverändert an data-access/supabase/
   events.js weiter, das damit `.eq("athlete_id", "athlete1")` gegen die
   `uuid`-Spalte `events.athlete_id` baute — PostgREST antwortete mit 400
   ("invalid input syntax for type uuid"). state/plan-cards.js/state/
   proposals.js lösten dieselbe Kennung schon immer korrekt auf
   (resolveAthleteProfileId, hier wiederverwendet statt dupliziert); dieser
   Test sichert nach, dass state/events.js jetzt denselben Weg geht.

   Mock-Aufbau wie tests/plan-cards-move.test.js: state/events.js importiert
   jetzt resolveAthleteProfileId aus state/plan-cards.js, dessen eigene
   data-access-Abhängigkeiten (esm.sh-URL-Importe) unter node:test gestubbt
   werden müssen (--experimental-test-module-mocks, s. package.json). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

let listEventsCalls = [];
let createEventCalls = [];

mock.module(u("data-access/supabase/events.js"), {
  exports: {
    listEvents: async (athleteId) => {
      listEventsCalls.push(athleteId);
      return { ok: true, events: [] };
    },
    createEvent: async (athleteId, event) => {
      createEventCalls.push({ athleteId, event });
      return { ok: true, event: { id: "event-1", ...event } };
    },
    updateEvent: async () => ({ ok: true, event: {} }),
    removeEvent: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/plan-cards.js"), {
  exports: {
    listPlanCards: async () => ({ ok: true, cards: [] }),
    updatePlanCard: async () => ({ ok: true, card: {} }),
    createPlanCard: async () => ({ ok: true, card: {} }),
    removePlanCard: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: { findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-stuhlsen" }) },
});
mock.module(u("data-access/intervals/push.js"), {
  exports: { pushCardWorkout: async () => ({ ok: true }) },
});
mock.module(u("state/session.js"), {
  exports: { getSession: () => ({ id: "user-1" }) },
});

const { loadEvents, createEvent } = await import(u("state/events.js"));

test("loadEvents: löst 'athlete1' auf die Profil-UUID auf, statt die interne Kennung an die Query zu reichen", async () => {
  listEventsCalls = [];
  const result = await loadEvents("athlete1");
  assert.equal(result.ok, true);
  assert.equal(listEventsCalls.length, 1);
  assert.equal(listEventsCalls[0], "profile-uuid-stuhlsen", "athlete_id-Filter muss die echte UUID sein, nicht 'athlete1'");
});

test("createEvent: löst 'athlete1' ebenfalls auf die Profil-UUID auf", async () => {
  createEventCalls = [];
  const result = await createEvent("athlete1", { title: "GFNY", eventDate: "2026-08-30", type: "race" });
  assert.equal(result.ok, true);
  assert.equal(createEventCalls.length, 1);
  assert.equal(createEventCalls[0].athleteId, "profile-uuid-stuhlsen");
});
