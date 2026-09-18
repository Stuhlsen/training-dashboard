const test = require("node:test");
const assert = require("node:assert/strict");
const { sendInvite } = require("./invite.js");

const ENV = { GOTRUE_INTERNAL_URL: "http://gotrue", SUPABASE_SERVICE_ROLE_KEY: "srv-key" };

function fakeFetch(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test("sendInvite: ok bei 200, gibt den hashed_token durch", async () => {
  const result = await sendInvite(
    "neu@example.com",
    ENV,
    fakeFetch(200, { id: "u1", hashed_token: "abc123" })
  );
  assert.equal(result.ok, true);
  assert.equal(result.hashedToken, "abc123");
});

test("sendInvite: 409 bei GoTrue email_exists", async () => {
  const result = await sendInvite(
    "schon-da@example.com",
    ENV,
    fakeFetch(422, { code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" })
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error.message, /already been registered/);
});

test("sendInvite: 400 bei ungueltiger E-Mail", async () => {
  const result = await sendInvite(
    "",
    ENV,
    fakeFetch(400, { code: 400, error_code: "validation_failed", msg: "An email address is required" })
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("sendInvite: 502 bei unbekanntem GoTrue-Fehler", async () => {
  const result = await sendInvite("x@example.com", ENV, fakeFetch(500, {}));
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
});

test("sendInvite: 502 wenn GoTrue nicht erreichbar ist", async () => {
  const throwingFetch = async () => {
    throw new Error("connection refused");
  };
  const result = await sendInvite("x@example.com", ENV, throwingFetch);
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error.code, "NETWORK");
});

test("sendInvite: patcht profiles.role/is_admin nach dem Anlegen (Default athlete/false)", async () => {
  const calls = [];
  const recordingFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/admin/generate_link")) {
      return { ok: true, status: 200, json: async () => ({ id: "u1", hashed_token: "abc123" }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const envWithPostgrest = { ...ENV, POSTGREST_INTERNAL_URL: "http://postgrest" };

  const result = await sendInvite("neu@example.com", envWithPostgrest, recordingFetch);
  assert.equal(result.ok, true);

  const profilePatch = calls.find((c) => c.url.startsWith("http://postgrest/profiles"));
  assert.ok(profilePatch, "kein PATCH gegen /profiles gefunden");
  assert.equal(profilePatch.options.method, "PATCH");
  assert.equal(profilePatch.url, "http://postgrest/profiles?id=eq.u1");
  assert.deepEqual(JSON.parse(profilePatch.options.body), { role: "athlete", is_admin: false });
});

test("sendInvite: gibt profileRole/isAdmin aus dem Aufruf an das PATCH weiter", async () => {
  const calls = [];
  const recordingFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/admin/generate_link")) {
      return { ok: true, status: 200, json: async () => ({ id: "u2", hashed_token: "def456" }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const envWithPostgrest = { ...ENV, POSTGREST_INTERNAL_URL: "http://postgrest" };

  const result = await sendInvite("coach@example.com", envWithPostgrest, recordingFetch, {
    profileRole: "coach",
    isAdmin: true,
  });
  assert.equal(result.ok, true);

  const profilePatch = calls.find((c) => c.url.startsWith("http://postgrest/profiles"));
  assert.deepEqual(JSON.parse(profilePatch.options.body), { role: "coach", is_admin: true });
});
