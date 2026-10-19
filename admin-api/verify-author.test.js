// Fahrplan 29 V2 — Routen POST /admin/users/:id/(un)verify-author: nur Admin, Ergebnisform,
// Fehlerpfade. Die Logik selbst (Audit-Log vor der Aenderung, return=minimal, UUID-Pruefung)
// testet users.test.js; hier geht es um Auth, Routing und Antworten.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");

function makeJwt(sub, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const JWT_SECRET = "test-secret";
process.env.JWT_SECRET = JWT_SECRET;
process.env.POSTGREST_INTERNAL_URL = "http://postgrest";
process.env.GOTRUE_INTERNAL_URL = "http://gotrue";
process.env.SUPABASE_SERVICE_ROLE_KEY = "srv-key";
delete process.env.SUPER_ADMIN_ID;

const { server } = require("./server.js");

const ADMIN = "11111111-1111-4111-8111-111111111111";
const TARGET = "33333333-3333-4333-8333-333333333333";
const TOKEN_ADMIN = makeJwt(ADMIN, JWT_SECRET);

/** isAdmin steuert profiles_visible (Admin-Check); `known` ob das Zielprofil existiert. */
function fakeBackend({ isAdmin = true, known = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    calls.push({ method, url, body: options.body });
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (url.includes("profiles_visible")) return reply(200, [{ is_admin: isAdmin }]);
    if (url === "http://postgrest/admin_audit_log") return reply(201, {});
    if (url.startsWith("http://postgrest/profiles?id=") && method === "GET") return reply(200, known ? [{ id: TARGET }] : []);
    if (url.startsWith("http://postgrest/profiles?id=") && method === "PATCH") return reply(204, null);
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
  return { calls, fetchImpl };
}

function post(port, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function withBackend(options, callback) {
  const backend = fakeBackend(options);
  const origFetch = globalThis.fetch;
  globalThis.fetch = backend.fetchImpl;
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try {
        await callback(server.address().port, backend.calls);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        globalThis.fetch = origFetch;
        server.close();
      }
    });
  });
}

const writes = (calls) => calls.filter((c) => c.method === "PATCH" || c.url.endsWith("/admin_audit_log"));

test("verify-author: Admin verifiziert -> 200 { ok, isVerifiedAuthor: true }, Flag und Audit geschrieben", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, `/admin/users/${TARGET}/verify-author`, TOKEN_ADMIN);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, isVerifiedAuthor: true });
    const patch = calls.find((c) => c.method === "PATCH");
    assert.deepEqual(JSON.parse(patch.body), { is_verified_author: true });
    const audit = JSON.parse(calls.find((c) => c.url.endsWith("/admin_audit_log")).body);
    assert.equal(audit.actor_id, ADMIN);
    assert.equal(audit.action, "verify_author");
  });
});

test("unverify-author: Admin entzieht -> 200 { ok, isVerifiedAuthor: false }", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, `/admin/users/${TARGET}/unverify-author`, TOKEN_ADMIN);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, isVerifiedAuthor: false });
    assert.deepEqual(JSON.parse(calls.find((c) => c.method === "PATCH").body), { is_verified_author: false });
    assert.equal(JSON.parse(calls.find((c) => c.url.endsWith("/admin_audit_log")).body).action, "unverify_author");
  });
});

test("verify-author: ein Nicht-Admin bekommt 403 und es wird nichts geschrieben", async () => {
  await withBackend({ isAdmin: false }, async (port, calls) => {
    for (const action of ["verify-author", "unverify-author"]) {
      const res = await post(port, `/admin/users/${TARGET}/${action}`, TOKEN_ADMIN);
      assert.equal(res.status, 403, action);
      assert.equal(res.body.ok, false);
    }
    assert.equal(writes(calls).length, 0);
  });
});

test("verify-author: ohne Token 401, ohne einen einzigen Backend-Aufruf", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, `/admin/users/${TARGET}/verify-author`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "TOKEN_INVALID");
    assert.equal(calls.length, 0);
  });
});

test("verify-author: unbekanntes Profil -> 404 NO_DATA, nichts geschrieben", async () => {
  await withBackend({ known: false }, async (port, calls) => {
    const res = await post(port, `/admin/users/${TARGET}/verify-author`, TOKEN_ADMIN);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NO_DATA");
    assert.equal(writes(calls).length, 0);
  });
});

test("verify-author: keine UUID in der URL -> 404, kein Profil-Zugriff ausser dem Admin-Check", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, "/admin/users/nicht-gueltig/verify-author", TOKEN_ADMIN);
    assert.equal(res.status, 404);
    assert.equal(calls.filter((c) => !c.url.includes("profiles_visible")).length, 0);
  });
});

test("verify-author: eine unbekannte Aktion bleibt 404 NOT_FOUND", async () => {
  await withBackend({}, async (port) => {
    const res = await post(port, `/admin/users/${TARGET}/frobnicate`, TOKEN_ADMIN);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });
});
