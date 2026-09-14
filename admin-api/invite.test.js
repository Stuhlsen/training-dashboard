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

test("sendInvite: ok bei 200, gibt den action_link durch", async () => {
  const result = await sendInvite(
    "neu@example.com",
    ENV,
    fakeFetch(200, { id: "u1", action_link: "http://localhost/verify?token=abc&type=invite" })
  );
  assert.equal(result.ok, true);
  assert.equal(result.link, "http://localhost/verify?token=abc&type=invite");
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
