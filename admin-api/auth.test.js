const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyJwt, requireAdmin } = require("./auth.js");

const SECRET = "test-secret";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Signiert wie ein echtes GoTrue-JWT, nur fuer die Tests hier — Gegenstueck
// zu verifyJwt(), gleiches Muster wie scripts/generate-jwt-keys.js.
function signJwt(payload, secret = SECRET) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64url(signature)}`;
}

function validPayload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { sub: "user-123", role: "authenticated", iat: now, exp: now + 3600, ...overrides };
}

test("verifyJwt akzeptiert ein gueltiges, unabgelaufenes Token", () => {
  const token = signJwt(validPayload());
  const payload = verifyJwt(token, SECRET);
  assert.equal(payload?.sub, "user-123");
});

test("verifyJwt lehnt eine falsche Signatur ab", () => {
  const token = signJwt(validPayload(), "anderes-secret");
  assert.equal(verifyJwt(token, SECRET), null);
});

test("verifyJwt lehnt ein abgelaufenes Token ab", () => {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(validPayload({ iat: now - 7200, exp: now - 3600 }));
  assert.equal(verifyJwt(token, SECRET), null);
});

test("verifyJwt lehnt kaputtes Token-Format ab", () => {
  assert.equal(verifyJwt("nicht.genug.teile.hier", SECRET), null);
  assert.equal(verifyJwt("", SECRET), null);
});

test("requireAdmin: 401 ohne Authorization-Header", async () => {
  const result = await requireAdmin(undefined, { JWT_SECRET: SECRET, POSTGREST_INTERNAL_URL: "http://x" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireAdmin: 401 bei ungueltigem Token", async () => {
  const result = await requireAdmin("Bearer kaputt", {
    JWT_SECRET: SECRET,
    POSTGREST_INTERNAL_URL: "http://x",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("requireAdmin: 403 wenn profiles_visible is_admin=false liefert", async () => {
  const token = signJwt(validPayload());
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [{ is_admin: false }],
  });
  const result = await requireAdmin(
    `Bearer ${token}`,
    { JWT_SECRET: SECRET, POSTGREST_INTERNAL_URL: "http://postgrest" },
    fakeFetch
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

test("requireAdmin: ok bei is_admin=true", async () => {
  const token = signJwt(validPayload());
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [{ is_admin: true }],
  });
  const result = await requireAdmin(
    `Bearer ${token}`,
    { JWT_SECRET: SECRET, POSTGREST_INTERNAL_URL: "http://postgrest" },
    fakeFetch
  );
  assert.equal(result.ok, true);
  assert.equal(result.sub, "user-123");
});

test("requireAdmin: 502 wenn PostgREST nicht erreichbar ist", async () => {
  const token = signJwt(validPayload());
  const fakeFetch = async () => {
    throw new Error("connection refused");
  };
  const result = await requireAdmin(
    `Bearer ${token}`,
    { JWT_SECRET: SECRET, POSTGREST_INTERNAL_URL: "http://postgrest" },
    fakeFetch
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
});
