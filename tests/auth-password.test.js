/* Tests: data-access/supabase/auth.js::updatePassword() — Re-Authentifizierung
   vor dem eigentlichen Passwort-Update (C5.2). data-access/supabase/client.js
   lädt @supabase/supabase-js per esm.sh-URL, unter node:test nicht
   importierbar — wie tests/wellbeing.test.js wird client.js per mock.module()
   durch einen minimalen Fake-Client ersetzt (nur `auth.*`, kein `.from()`
   nötig, da auth.js keine Tabellen anfasst). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const EMAIL = "athlete@training-dashboard.dev";

let sessionEmail = EMAIL;
let reauthShouldFail = false;
let updateUserError = null;
let reauthCalls = [];
let updateUserCalls = [];

const fakeClient = {
  auth: {
    getSession: async () => ({ data: { session: sessionEmail ? { user: { email: sessionEmail } } : null } }),
    signInWithPassword: async ({ email, password }) => {
      reauthCalls.push({ email, password });
      return { error: reauthShouldFail ? { message: "Invalid login credentials" } : null };
    },
    updateUser: async ({ password }) => {
      updateUserCalls.push({ password });
      return { error: updateUserError };
    },
  },
};

mock.module(u("data-access/supabase/client.js"), {
  exports: { supabase: fakeClient, getAuthedClient: async () => fakeClient },
});

const { updatePassword } = await import(u("data-access/supabase/auth.js"));

function reset() {
  sessionEmail = EMAIL;
  reauthShouldFail = false;
  updateUserError = null;
  reauthCalls = [];
  updateUserCalls = [];
}

test("updatePassword: falsches aktuelles Passwort → Fehler, updateUser wird nicht aufgerufen", async () => {
  reset();
  reauthShouldFail = true;
  const result = await updatePassword("falsches-pw", "neues-passwort-123");
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Aktuelles Passwort ist falsch/);
  assert.equal(updateUserCalls.length, 0, "updateUser darf nach fehlgeschlagener Re-Auth nicht aufgerufen werden");
});

test("updatePassword: Re-Auth ok, aber updateUser scheitert (z.B. zu schwaches neues Passwort) → Fehler", async () => {
  reset();
  updateUserError = { message: "Password should be at least 6 characters." };
  const result = await updatePassword("richtiges-pw", "123");
  assert.equal(result.ok, false);
  assert.match(result.error.message, /6 characters/);
});

test("updatePassword: Erfolg — Re-Auth mit aktuellem Passwort, dann updateUser mit neuem", async () => {
  reset();
  const result = await updatePassword("richtiges-pw", "neues-passwort-123");
  assert.equal(result.ok, true);
  assert.deepEqual(reauthCalls, [{ email: EMAIL, password: "richtiges-pw" }]);
  assert.deepEqual(updateUserCalls, [{ password: "neues-passwort-123" }]);
});

test("updatePassword: keine Session → Fehler, kein Re-Auth-Versuch", async () => {
  reset();
  sessionEmail = null;
  const result = await updatePassword("irgendein-pw", "neues-passwort-123");
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Nicht eingeloggt/);
  assert.equal(reauthCalls.length, 0);
});
