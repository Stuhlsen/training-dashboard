/* Tests: state/write-authorization.js::canWriteForAthlete()

   Bugreport (Alex, live auf main, 31.07.2026): eingeloggt als Stuhlsen,
   Athleten-Toggle auf hc_diZee gestellt -> ein Event wurde bei hc_diZee
   angelegt. Ursache war NICHT die RLS (die erlaubt Trainer/Admin bewusst
   Schreibzugriff fuer einen anderen Athleten, s. 0004_events.sql), sondern
   dass ui/event-timeline.js (und analog ui/planned.js::_canEdit()) die
   Schreib-Buttons fuer JEDEN eingeloggten User zeigte, ohne zu pruefen, ob
   ueberhaupt eine Beziehung (Athlet selbst / dessen Trainer / Admin) zum
   gerade angezeigten Athleten besteht.

   canWriteForAthlete() spiegelt exakt die drei RLS-Faelle aus
   0001_initial_schema.sql/0004_events.sql fuer die UI-Sichtbarkeit:
   athlete_id = auth.uid() OR is_coach_of(athlete_id) OR is_admin().

   Mock-Aufbau wie tests/events-athlete-resolution.test.js/
   tests/plan-cards-move.test.js: state/write-authorization.js zieht
   state/plan-cards.js (resolveAthleteProfileId) und state/trainer-view.js
   (loadTrainerContext) mit, deren eigene data-access-Abhaengigkeiten
   (esm.sh-URL-Importe) unter node:test gestubbt werden muessen
   (--experimental-test-module-mocks, s. package.json). state/session.js
   wird ueber eine veraenderliche `mockSessionUser`-Closure gemockt, damit
   jeder Testfall einen anderen eingeloggten User simulieren kann. */

import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

let mockSessionUser = null;
let getProfileByDisplayNameCalls = 0;

mock.module(u("state/session.js"), {
  exports: {
    getSession: () => mockSessionUser,
    isAdmin: () => !!mockSessionUser?.isAdmin,
    isCoach: () => mockSessionUser?.role === "coach",
  },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: {
    findProfileIdByDisplayName: async (name) => ({
      ok: true,
      id: name === "hc_diZee" ? "profile-uuid-dizee" : "profile-uuid-stuhlsen",
    }),
    getProfileByDisplayName: async (name) => {
      getProfileByDisplayNameCalls++;
      if (name === "hc_diZee") {
        return { ok: true, profile: { id: "profile-uuid-dizee", coachId: "coach-uuid-dz" } };
      }
      return { ok: true, profile: { id: "profile-uuid-stuhlsen", coachId: "coach-uuid-st" } };
    },
  },
});
mock.module(u("data-access/supabase/trainer-view-prefs.js"), {
  exports: {
    getViewPrefs: async () => ({ ok: true, categories: [] }),
    setViewPrefs: async () => ({ ok: true }),
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
mock.module(u("data-access/intervals/push.js"), {
  exports: { pushCardWorkout: async () => ({ ok: true }) },
});

const { canWriteForAthlete } = await import(u("state/write-authorization.js"));

test("canWriteForAthlete: nicht eingeloggt -> false", async () => {
  mockSessionUser = null;
  assert.equal(await canWriteForAthlete("athlete1"), false);
});

test("canWriteForAthlete: Athlet betrachtet die eigene Seite -> true, ohne Trainer-Lookup", async () => {
  mockSessionUser = { id: "profile-uuid-stuhlsen", role: "athlete" };
  const before = getProfileByDisplayNameCalls;
  assert.equal(await canWriteForAthlete("athlete1"), true);
  assert.equal(getProfileByDisplayNameCalls, before, "Self-Match darf keinen Trainer-Lookup ausloesen");
});

test("canWriteForAthlete: eingeloggter Athlet ohne Beziehung zum angezeigten Athleten -> false", async () => {
  mockSessionUser = { id: "profile-uuid-stuhlsen", role: "athlete" };
  assert.equal(await canWriteForAthlete("athlete2"), false);
});

test("canWriteForAthlete: Trainer des angezeigten Athleten -> true", async () => {
  mockSessionUser = { id: "coach-uuid-dz", role: "coach" };
  assert.equal(await canWriteForAthlete("athlete2"), true);
});

test("canWriteForAthlete: Trainer eines ANDEREN Athleten -> false", async () => {
  mockSessionUser = { id: "coach-uuid-st", role: "coach" };
  assert.equal(await canWriteForAthlete("athlete2"), false);
});

test("canWriteForAthlete: Admin -> true unabhaengig vom angezeigten Athleten", async () => {
  mockSessionUser = { id: "irgendein-admin-uuid", role: "athlete", isAdmin: true };
  assert.equal(await canWriteForAthlete("athlete1"), true);
  assert.equal(await canWriteForAthlete("athlete2"), true);
});
