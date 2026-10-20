// Fahrplan 30 B4 — POST /admin/recipes/:id/(approve|reject): nur Admin, Grund bei Ablehnung,
// Audit-Log VOR der Aenderung, nur Rezepte in Pruefung, Fehlerpfade.
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
const AUTHOR = "22222222-2222-4222-8222-222222222222";
const RECIPE = "33333333-3333-4333-8333-333333333333";
const TOKEN_ADMIN = makeJwt(ADMIN, JWT_SECRET);

/**
 * isAdmin steuert profiles_visible (Admin-Check); status ist der aktuelle Rezept-Status
 * (null = Rezept unbekannt); patchRows steuert, wie viele Zeilen der PATCH trifft;
 * auditOk = false laesst das Audit-Log scheitern.
 */
function fakeBackend({ isAdmin = true, status = "pending", patchRows = 1, auditOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    calls.push({ method, url, body: options.body });
    const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
    if (url.includes("profiles_visible")) return reply(200, [{ is_admin: isAdmin }]);
    if (url === "http://postgrest/admin_audit_log") return auditOk ? reply(201, {}) : reply(500, {});
    if (url.startsWith("http://postgrest/recipes?id=") && method === "GET") {
      return reply(200, status ? [{ id: RECIPE, status, submitted_by: AUTHOR }] : []);
    }
    if (url.startsWith("http://postgrest/recipes?id=") && method === "PATCH") {
      return reply(200, Array.from({ length: patchRows }, () => ({ id: RECIPE })));
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
  return { calls, fetchImpl };
}

function post(port, path, token, body) {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const req = http.request({ hostname: "127.0.0.1", port, path, method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
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
const approvePath = `/admin/recipes/${RECIPE}/approve`;
const rejectPath = `/admin/recipes/${RECIPE}/reject`;

test("approve: Admin gibt frei -> 200 approved, Audit VOR dem PATCH, rejection_reason leer", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, approvePath, TOKEN_ADMIN, {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, status: "approved" });

    const w = writes(calls);
    assert.equal(w.length, 2);
    assert.ok(w[0].url.endsWith("/admin_audit_log"), "Audit muss vor der Aenderung kommen");
    const audit = JSON.parse(w[0].body);
    assert.equal(audit.actor_id, ADMIN);
    assert.equal(audit.target_user_id, AUTHOR);
    assert.equal(audit.action, "approve_recipe");
    assert.deepEqual(audit.details, { recipeId: RECIPE });

    assert.equal(w[1].method, "PATCH");
    assert.match(w[1].url, /\?id=eq\.[^&]+&status=eq\.pending$/, "PATCH nur auf Rezepte in Pruefung");
    assert.deepEqual(JSON.parse(w[1].body), { status: "approved", rejection_reason: null });
  });
});

test("reject: Admin lehnt mit Grund ab -> 200 rejected, Grund getrimmt in Audit und Rezept", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, rejectPath, TOKEN_ADMIN, { reason: "  Zutaten unklar  " });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, status: "rejected" });
    const w = writes(calls);
    const audit = JSON.parse(w[0].body);
    assert.equal(audit.action, "reject_recipe");
    assert.deepEqual(audit.details, { recipeId: RECIPE, reason: "Zutaten unklar" });
    assert.deepEqual(JSON.parse(w[1].body), { status: "rejected", rejection_reason: "Zutaten unklar" });
  });
});

test("reject: ohne Grund, nur Leerzeichen oder zu lang -> 400 SCHEMA, nichts geschrieben", async () => {
  await withBackend({}, async (port, calls) => {
    for (const body of [{}, { reason: "" }, { reason: "   " }, { reason: 42 }, { reason: "x".repeat(501) }]) {
      const res = await post(port, rejectPath, TOKEN_ADMIN, body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
      assert.equal(res.body.error.code, "SCHEMA");
    }
    assert.equal(writes(calls).length, 0);
    const ok = await post(port, rejectPath, TOKEN_ADMIN, { reason: "x".repeat(500) });
    assert.equal(ok.status, 200, "genau 500 Zeichen sind erlaubt");
  });
});

test("approve: ein Grund im Body wird ignoriert", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, approvePath, TOKEN_ADMIN, { reason: "egal" });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(writes(calls)[1].body), { status: "approved", rejection_reason: null });
  });
});

test("ein Nicht-Admin bekommt 403 und es wird nichts geschrieben", async () => {
  await withBackend({ isAdmin: false }, async (port, calls) => {
    for (const path of [approvePath, rejectPath]) {
      const res = await post(port, path, TOKEN_ADMIN, { reason: "x" });
      assert.equal(res.status, 403, path);
      assert.equal(res.body.ok, false);
    }
    assert.equal(writes(calls).length, 0);
    assert.equal(calls.filter((c) => c.url.includes("/recipes")).length, 0, "kein Rezept-Zugriff ohne Admin");
  });
});

test("ohne Token 401, ohne einen einzigen Backend-Aufruf", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, approvePath);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "TOKEN_INVALID");
    assert.equal(calls.length, 0);
  });
});

test("unbekanntes Rezept -> 404 NO_DATA, nichts geschrieben", async () => {
  await withBackend({ status: null }, async (port, calls) => {
    const res = await post(port, approvePath, TOKEN_ADMIN, {});
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NO_DATA");
    assert.equal(writes(calls).length, 0);
  });
});

test("keine UUID in der URL -> 404, kein Rezept-Zugriff", async () => {
  await withBackend({}, async (port, calls) => {
    const res = await post(port, "/admin/recipes/nicht-gueltig/approve", TOKEN_ADMIN, {});
    assert.equal(res.status, 404);
    assert.equal(calls.filter((c) => c.url.includes("/recipes")).length, 0);
  });
});

test("Rezept nicht mehr in Pruefung (approved oder rejected) -> 409, nichts geschrieben", async () => {
  for (const status of ["approved", "rejected"]) {
    await withBackend({ status }, async (port, calls) => {
      const res = await post(port, approvePath, TOKEN_ADMIN, {});
      assert.equal(res.status, 409, status);
      assert.equal(writes(calls).length, 0);
    });
  }
});

test("Audit-Log nicht schreibbar -> 502 und das Rezept bleibt unveraendert", async () => {
  await withBackend({ auditOk: false }, async (port, calls) => {
    const res = await post(port, approvePath, TOKEN_ADMIN, {});
    assert.equal(res.status, 502);
    assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
  });
});

test("gleichzeitige Entscheidung (PATCH trifft keine Zeile) -> 409", async () => {
  await withBackend({ patchRows: 0 }, async (port) => {
    const res = await post(port, approvePath, TOKEN_ADMIN, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.ok, false);
  });
});
