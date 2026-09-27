const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");
const path = require("node:path");

// Erzeugt einen gueltigen HS256-JWT (selbe Signatur wie auth.js::verifyJwt)
function makeJwt(sub, secret, expOffsetSec = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + expOffsetSec })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const JWT_SECRET = "test-secret";
const SUPER_ADMIN_ID = "super-1";
const TOKEN_MATCHING = makeJwt(SUPER_ADMIN_ID, JWT_SECRET);
const TOKEN_OTHER = makeJwt("other-admin", JWT_SECRET);

// Setze ENV *bevor* server.js importiert wird
process.env.JWT_SECRET = JWT_SECRET;
process.env.SUPER_ADMIN_ID = SUPER_ADMIN_ID;
process.env.POSTGREST_INTERNAL_URL = "http://postgrest";
process.env.GOTRUE_INTERNAL_URL = "http://gotrue";
process.env.SUPABASE_SERVICE_ROLE_KEY = "srv-key";

const { server } = require("./server.js");

// Mock-Fetch, die PostgREST-/GoTrue-interne Calls abdeckt
function mockFetch() {
  return async (url, options) => {
    if (url.includes("profiles_visible")) {
      return { ok: true, status: 200, json: async () => [{ is_admin: true }] };
    }
    if (url.includes("generate_link")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "new-u1", hashed_token: "abc123" }),
      };
    }
    if (url.includes("gotrue/admin/users")) {
      if (options?.method === "PUT" || options?.method === "PATCH") {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ id: "new-u1", email: "neu@example.com" }) };
    }
    if (url.includes("profiles?id=")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
}

async function postInvite(port, body, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/admin/invite",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: null });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function withServer(callback) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const addr = server.address();
      try {
        await callback(addr.port);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test("invite: isAdmin=true + SUPER_ADMIN_ID + passender Admin.sub -> 200", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = mockFetch();

  try {
    await withServer(async (port) => {
      const result = await postInvite(port, { email: "admin@example.com", isAdmin: true }, TOKEN_MATCHING);
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert.ok(result.body.hashedToken);
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("invite: isAdmin=true + SUPER_ADMIN_ID + nicht-passender Admin.sub -> 403", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = mockFetch();

  try {
    await withServer(async (port) => {
      const result = await postInvite(port, { email: "admin@example.com", isAdmin: true }, TOKEN_OTHER);
      assert.equal(result.status, 403);
      assert.equal(result.body.ok, false);
      assert.match(result.body.error.message, /Super-Admin/);
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("invite: isAdmin=false immer 200, unabhaengig von Admin.sub", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = mockFetch();

  try {
    await withServer(async (port) => {
      const result = await postInvite(port, { email: "neu@example.com", isAdmin: false }, TOKEN_OTHER);
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});

// Fallback-Test: ohne SUPER_ADMIN_ID darf jeder Admin Admins anlegen.
// Wir testen das in einem eigenen Subprozess, weil server.js ENV beim
// Modul-Load einmalig auswertet (CommonJS-Cache).
test("invite: isAdmin=true ohne SUPER_ADMIN_ID -> 200 (Fallback, jeder Admin)", async () => {
  const script = path.join(__dirname, "__fallback_test.js");
  const fs = require("node:fs");
  const src = `
const http = require("node:http");
// server.js importieren — ENV wird jetzt ohne SUPER_ADMIN_ID gelesen
const { server } = require("./server.js");
const token = "${TOKEN_OTHER}";
globalThis.fetch = async (url, options) => {
  if (url.includes("profiles_visible")) return { ok: true, status: 200, json: async () => [{ is_admin: true }] };
  if (url.includes("generate_link")) return { ok: true, status: 200, json: async () => ({ id: "u1", hashed_token: "tok" }) };
  if (url.includes("gotrue") || url.includes("postgrest")) return { ok: true, status: 200, json: async () => ({}) };
  throw new Error("unexpected: " + url);
};
server.listen(0, "127.0.0.1", () => {
  const addr = server.address();
  const postData = JSON.stringify({ email: "x@y.com", isAdmin: true });
  const req = http.request({ hostname: "127.0.0.1", port: addr.port, path: "/admin/invite", method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData),
      Authorization: "Bearer " + token } }, (res) => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => { console.log(JSON.stringify({ status: res.statusCode, body: JSON.parse(data) })); server.close(); });
  });
  req.write(postData);
  req.end();
});
`;
  fs.writeFileSync(script, src, "utf8");
  const stdout = execSync('"' + process.execPath + '" "' + script + '"', {
    cwd: __dirname,
    env: {
      ...process.env,
      SUPER_ADMIN_ID: "", // leer -> null in server.js
      JWT_SECRET: JWT_SECRET,
      POSTGREST_INTERNAL_URL: "http://postgrest",
      GOTRUE_INTERNAL_URL: "http://gotrue",
      SUPABASE_SERVICE_ROLE_KEY: "srv-key",
    },
    timeout: 5000,
  }).toString().trim();
  const result = JSON.parse(stdout);
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  fs.unlinkSync(script);
});