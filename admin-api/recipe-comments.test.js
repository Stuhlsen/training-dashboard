// Fahrplan 30 B5 — DELETE /admin/recipe-comments/:id: nur Admin, Audit-Log VOR dem Löschen
// (nur IDs, nie der Text), Fehlerpfade.
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
const WRITER = "22222222-2222-4222-8222-222222222222";
const RECIPE = "33333333-3333-4333-8333-333333333333";
const COMMENT = "44444444-4444-4444-8444-444444444444";
const TOKEN_ADMIN = makeJwt(ADMIN, JWT_SECRET);
const TOKEN_USER = makeJwt(WRITER, JWT_SECRET);

/**
 * isAdmin steuert profiles_visible (Admin-Check); exists = false lässt die Suche leer;
 * deleteRows steuert, wie viele Zeilen das DELETE trifft; auditOk = false lässt das Audit-Log scheitern.
 */
function fakeBackend({ isAdmin = true, exists = true, deleteRows = 1, auditOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    calls.push({ method, url, body: options.body });
    const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
    if (url.includes("profiles_visible")) return reply(200, [{ is_admin: isAdmin }]);
    if (url === "http://postgrest/admin_audit_log") return auditOk ? reply(201, {}) : reply(500, {});
    if (url.startsWith("http://postgrest/recipe_comments?id=") && method === "GET") {
      return reply(200, exists ? [{ id: COMMENT, recipe_id: RECIPE, athlete_id: WRITER }] : []);
    }
    if (url.startsWith("http://postgrest/recipe_comments?id=") && method === "DELETE") {
      return reply(200, Array.from({ length: deleteRows }, () => ({ id: COMMENT })));
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
  return { calls, fetchImpl };
}

function request(port, path, token, method = "DELETE") {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
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

const writes = (calls) => calls.filter((c) => c.method === "DELETE" || c.url.endsWith("/admin_audit_log"));
const path = `/admin/recipe-comments/${COMMENT}`;

test("Admin löscht einen Kommentar -> 200, Audit VOR dem DELETE, nur IDs im Log", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await request(port, path, TOKEN_ADMIN);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const w = writes(calls);
    assert.equal(w.length, 2);
    assert.ok(w[0].url.endsWith("/admin_audit_log"), "Audit muss vor dem Löschen kommen");
    const audit = JSON.parse(w[0].body);
    assert.equal(audit.actor_id, ADMIN);
    assert.equal(audit.target_user_id, WRITER);
    assert.equal(audit.action, "delete_recipe_comment");
    assert.deepEqual(audit.details, { commentId: COMMENT, recipeId: RECIPE });

    assert.equal(w[1].method, "DELETE");
    assert.equal(w[1].url, `http://postgrest/recipe_comments?id=eq.${COMMENT}`);
  });
});

test("kein Admin -> 403, nichts gelesen oder geschrieben", async () => {
  await withBackend({ isAdmin: false }, async (port, calls) => {
    const res = await request(port, path, TOKEN_USER);
    assert.equal(res.status, 403);
    assert.equal(writes(calls).length, 0);
    assert.equal(calls.filter((c) => c.url.includes("recipe_comments")).length, 0);
  });
});

test("ohne Token -> 401", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await request(port, path, null);
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  });
});

test("unbekannte oder ungültige ID -> 404, nichts geschrieben", async () => {
  await withBackend({ exists: false }, async (port, calls) => {
    assert.equal((await request(port, path, TOKEN_ADMIN)).status, 404);
    assert.equal((await request(port, "/admin/recipe-comments/nicht-eine-uuid", TOKEN_ADMIN)).status, 404);
    assert.equal(writes(calls).length, 0);
  });
});

test("Audit-Log nicht schreibbar -> 502, Kommentar bleibt stehen", async () => {
  await withBackend({ auditOk: false }, async (port, calls) => {
    const res = await request(port, path, TOKEN_ADMIN);
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, "NETWORK");
    assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
  });
});

test("DELETE trifft keine Zeile (schon weg) -> 404", async () => {
  await withBackend({ deleteRows: 0 }, async (port) => {
    const res = await request(port, path, TOKEN_ADMIN);
    assert.equal(res.status, 404);
  });
});

test("falsche Methode auf der Route -> 404 (kein POST/GET)", async () => {
  await withBackend({}, async (port, calls) => {
    assert.equal((await request(port, path, TOKEN_ADMIN, "POST")).status, 404);
    assert.equal((await request(port, path, TOKEN_ADMIN, "GET")).status, 404);
    assert.equal(writes(calls).length, 0);
  });
});
