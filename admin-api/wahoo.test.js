const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const JWT_SECRET = "test-secret";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROFILE_ID = "22222222-2222-4222-8222-222222222222";

// Env fuer den Server-Smoke-Test ganz unten (server.js liest sie beim Laden)
process.env.JWT_SECRET = JWT_SECRET;
process.env.POSTGREST_INTERNAL_URL = "http://postgrest";
process.env.SUPABASE_SERVICE_ROLE_KEY = "srv-key";
process.env.WAHOO_CLIENT_ID = "test-client";
process.env.WAHOO_CLIENT_SECRET = "test-client-secret";
process.env.WAHOO_REDIRECT_URI = "https://example.test/api/wahoo/callback";

const {
  signState,
  verifyState,
  wahooConfig,
  requireWahooAccess,
  handleWahooRequest,
  STATE_TTL_MS,
} = require("./wahoo.js");

const NOW = 1_800_000_000_000;
const ENV = {
  JWT_SECRET,
  POSTGREST_INTERNAL_URL: "http://postgrest",
  SUPABASE_SERVICE_ROLE_KEY: "srv-key",
  WAHOO_CLIENT_ID: "test-client",
  WAHOO_CLIENT_SECRET: "test-client-secret",
  WAHOO_REDIRECT_URI: "https://example.test/api/wahoo/callback",
};

function makeJwt(sub, secret = JWT_SECRET) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const AUTH = { authorization: `Bearer ${makeJwt(PROFILE_ID)}` };

function jsonRes(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Faengt alle Aufrufe ab und antwortet je nach URL
function makeFetch({ isAdmin = true, tokenRow = null, wahooToken, wahooStatus = 200, pgStatus = 201 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    calls.push({ url, method, init });
    if (url.includes("profiles_visible")) return jsonRes(200, [{ is_admin: isAdmin }]);
    if (url === "https://api.wahooligan.com/oauth/token") {
      return jsonRes(
        wahooStatus,
        wahooStatus === 200
          ? (wahooToken ?? { access_token: "test-access", refresh_token: "test-refresh", expires_in: 7200 })
          : { error: "invalid_grant" }
      );
    }
    if (url === "https://api.wahooligan.com/v1/permissions") return jsonRes(wahooStatus, {});
    if (url.includes("athlete_wahoo_tokens")) {
      if (method === "GET") return jsonRes(200, tokenRow ? [tokenRow] : []);
      return jsonRes(pgStatus, null);
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
  return { fetchImpl, calls };
}

function fakeRes() {
  const res = {
    status: null,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      res.status = status;
      res.headers = headers;
    },
    end(body = "") {
      res.body = body;
    },
    json() {
      return JSON.parse(res.body);
    },
  };
  return res;
}

async function call(method, path, { headers = {}, env = ENV, fetchImpl, now = NOW } = {}) {
  const url = new URL(path, "http://localhost");
  const res = fakeRes();
  const handled = await handleWahooRequest({ method, headers }, res, url, env, fetchImpl, { now });
  return { handled, res };
}

const pgCalls = (calls) => calls.filter((c) => c.url.includes("athlete_wahoo_tokens"));

// ---------- state ----------

test("state: Roundtrip liefert dieselbe profile_id", () => {
  const state = signState(PROFILE_ID, "geheim", NOW);
  assert.deepEqual(verifyState(state, "geheim", NOW + 1000), { ok: true, profileId: PROFILE_ID });
});

test("state: nach 10 Minuten abgelaufen", () => {
  const state = signState(PROFILE_ID, "geheim", NOW);
  assert.equal(STATE_TTL_MS, 10 * 60 * 1000);
  assert.equal(verifyState(state, "geheim", NOW + STATE_TTL_MS - 1).ok, true);
  assert.deepEqual(verifyState(state, "geheim", NOW + STATE_TTL_MS), { ok: false, reason: "state_expired" });
});

test("state: manipulierte Nutzdaten (fremde profile_id, alte Signatur) werden abgelehnt", () => {
  const state = signState(PROFILE_ID, "geheim", NOW);
  const [, signature] = state.split(".");
  const forged = Buffer.from(`${OTHER_PROFILE_ID}.${NOW + STATE_TTL_MS}`).toString("base64url");
  assert.deepEqual(verifyState(`${forged}.${signature}`, "geheim", NOW), { ok: false, reason: "state_invalid" });
});

test("state: falsches Secret, Muell und fehlender state werden abgelehnt", () => {
  const state = signState(PROFILE_ID, "geheim", NOW);
  assert.equal(verifyState(state, "anderes", NOW).ok, false);
  assert.equal(verifyState("nur-ein-teil", "geheim", NOW).ok, false);
  assert.equal(verifyState("a.b.c", "geheim", NOW).ok, false);
  assert.equal(verifyState(undefined, "geheim", NOW).ok, false);
  assert.equal(verifyState("", "geheim", NOW).ok, false);
});

test("state: korrekt signierter, aber unlesbarer Inhalt wird abgelehnt", () => {
  const sign = (payload) => crypto.createHmac("sha256", "geheim").update(payload).digest("base64url");
  const noDot = Buffer.from("ohnepunkt").toString("base64url");
  const noExp = Buffer.from(`${PROFILE_ID}.abc`).toString("base64url");
  assert.equal(verifyState(`${noDot}.${sign(noDot)}`, "geheim", NOW).ok, false);
  assert.equal(verifyState(`${noExp}.${sign(noExp)}`, "geheim", NOW).ok, false);
});

// ---------- Konfiguration + Gate ----------

test("wahooConfig: fehlende Variable -> null, Rueckkehr-URL-Standard aus Redirect-Ursprung", () => {
  assert.equal(wahooConfig({ ...ENV, WAHOO_CLIENT_SECRET: "" }), null);
  assert.equal(wahooConfig({ ...ENV, WAHOO_REDIRECT_URI: "kein-url" }), null);
  assert.equal(wahooConfig(ENV).returnUrl, "https://example.test/app/settings");
  assert.equal(
    wahooConfig({ ...ENV, WAHOO_RETURN_URL: "https://example.test/x" }).returnUrl,
    "https://example.test/x"
  );
});

test("requireWahooAccess: Admin ja, Nicht-Admin 403, ohne Login 401", async () => {
  const admin = await requireWahooAccess(AUTH.authorization, ENV, makeFetch().fetchImpl);
  assert.deepEqual(admin, { ok: true, sub: PROFILE_ID });
  const user = await requireWahooAccess(AUTH.authorization, ENV, makeFetch({ isAdmin: false }).fetchImpl);
  assert.equal(user.status, 403);
  const anon = await requireWahooAccess(undefined, ENV, makeFetch().fetchImpl);
  assert.equal(anon.status, 401);
});

// ---------- Routing ----------

test("unbekannter Wahoo-Pfad oder falsche Methode -> nicht behandelt", async () => {
  assert.equal((await call("GET", "/api/wahoo/start")).handled, false);
  assert.equal((await call("POST", "/api/wahoo/unbekannt")).handled, false);
  assert.equal((await call("GET", "/api/recipes")).handled, false);
});

// ---------- start ----------

test("start: ohne Login 401, Nicht-Admin 403", async () => {
  const anon = await call("POST", "/api/wahoo/start", { fetchImpl: makeFetch().fetchImpl });
  assert.equal(anon.res.status, 401);
  const user = await call("POST", "/api/wahoo/start", {
    headers: AUTH,
    fetchImpl: makeFetch({ isAdmin: false }).fetchImpl,
  });
  assert.equal(user.res.status, 403);
});

test("start: fehlende Env -> 503", async () => {
  const { res } = await call("POST", "/api/wahoo/start", {
    headers: AUTH,
    env: { ...ENV, WAHOO_CLIENT_ID: undefined },
    fetchImpl: makeFetch().fetchImpl,
  });
  assert.equal(res.status, 503);
  assert.equal(res.json().ok, false);
});

test("start: liefert Authorize-URL mit state, der an den eingeloggten Nutzer bindet", async () => {
  const { res } = await call("POST", "/api/wahoo/start", { headers: AUTH, fetchImpl: makeFetch().fetchImpl });
  assert.equal(res.status, 200);
  const url = new URL(res.json().url);
  assert.equal(`${url.origin}${url.pathname}`, "https://api.wahooligan.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "test-client");
  assert.equal(url.searchParams.get("redirect_uri"), ENV.WAHOO_REDIRECT_URI);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "user_read workouts_read");
  assert.deepEqual(verifyState(url.searchParams.get("state"), ENV.WAHOO_CLIENT_SECRET, NOW + 1000), {
    ok: true,
    profileId: PROFILE_ID,
  });
  assert.ok(!res.body.includes("test-client-secret"));
});

// ---------- callback ----------

function callbackPath(state, extra = "") {
  return `/api/wahoo/callback?code=test-code&state=${encodeURIComponent(state)}${extra}`;
}

test("callback: Erfolg tauscht Code, schreibt Upsert und leitet mit wahoo=connected zurueck", async () => {
  const { fetchImpl, calls } = makeFetch();
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", callbackPath(state), { fetchImpl });

  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, "https://example.test/app/settings?wahoo=connected");

  const exchange = calls.find((c) => c.url === "https://api.wahooligan.com/oauth/token");
  assert.equal(exchange.method, "POST");
  assert.equal(exchange.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(exchange.init.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "test-code");
  assert.equal(form.get("client_id"), "test-client");
  assert.equal(form.get("client_secret"), "test-client-secret");
  assert.equal(form.get("redirect_uri"), ENV.WAHOO_REDIRECT_URI);

  const [upsert] = pgCalls(calls);
  assert.equal(upsert.method, "POST");
  assert.equal(upsert.url, "http://postgrest/athlete_wahoo_tokens?on_conflict=profile_id");
  assert.equal(upsert.init.headers.Authorization, "Bearer srv-key");
  assert.match(upsert.init.headers.Prefer, /resolution=merge-duplicates/);
  assert.deepEqual(JSON.parse(upsert.init.body), {
    profile_id: PROFILE_ID,
    access_token: "test-access",
    refresh_token: "test-refresh",
    expires_at: new Date(NOW + 7200 * 1000).toISOString(),
    scope: "user_read workouts_read",
  });
  assert.ok(!res.headers.Location.includes("test-access"));
});

test("callback: scope aus der Token-Antwort hat Vorrang; eigene WAHOO_RETURN_URL wird genutzt", async () => {
  const { fetchImpl, calls } = makeFetch({
    wahooToken: { access_token: "test-access", refresh_token: "test-refresh", expires_in: 60, scope: "user_read" },
  });
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", callbackPath(state), {
    fetchImpl,
    env: { ...ENV, WAHOO_RETURN_URL: "https://example.test/zurueck?a=1" },
  });
  assert.equal(res.headers.Location, "https://example.test/zurueck?a=1&wahoo=connected");
  assert.equal(JSON.parse(pgCalls(calls)[0].init.body).scope, "user_read");
});

test("callback: Wahoo-Fehler (400 invalid_grant) -> 302 error, nichts gespeichert", async () => {
  const { fetchImpl, calls } = makeFetch({ wahooStatus: 400 });
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", callbackPath(state), { fetchImpl });
  assert.equal(res.status, 302);
  assert.equal(res.headers.Location, "https://example.test/app/settings?wahoo=error&reason=exchange");
  assert.equal(pgCalls(calls).length, 0);
});

test("callback: unvollstaendige Token-Antwort -> 302 error exchange", async () => {
  const { fetchImpl, calls } = makeFetch({ wahooToken: { access_token: "test-access" } });
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", callbackPath(state), { fetchImpl });
  assert.match(res.headers.Location, /reason=exchange$/);
  assert.equal(pgCalls(calls).length, 0);
});

test("callback: Netzfehler beim Token-Tausch -> 302 error exchange", async () => {
  const fetchImpl = async () => {
    throw new Error("netz");
  };
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", callbackPath(state), { fetchImpl });
  assert.match(res.headers.Location, /reason=exchange$/);
});

test("callback: ungueltiger oder abgelaufener state -> 302 error, Wahoo wird gar nicht gefragt", async () => {
  const { fetchImpl, calls } = makeFetch();
  const forged = await call("GET", callbackPath("a.b"), { fetchImpl });
  assert.match(forged.res.headers.Location, /wahoo=error&reason=state_invalid$/);
  const old = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW - STATE_TTL_MS - 1);
  const expired = await call("GET", callbackPath(old), { fetchImpl });
  assert.match(expired.res.headers.Location, /wahoo=error&reason=state_expired$/);
  assert.equal(calls.length, 0);
});

test("callback: Nutzer lehnt ab (error=access_denied) -> reason=denied", async () => {
  const { fetchImpl, calls } = makeFetch();
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", `/api/wahoo/callback?error=access_denied&state=${encodeURIComponent(state)}`, {
    fetchImpl,
  });
  assert.match(res.headers.Location, /wahoo=error&reason=denied$/);
  assert.equal(calls.length, 0);
});

test("callback: ohne code -> reason=missing_code", async () => {
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", `/api/wahoo/callback?state=${encodeURIComponent(state)}`, {
    fetchImpl: makeFetch().fetchImpl,
  });
  assert.match(res.headers.Location, /reason=missing_code$/);
});

test("callback: Speichern scheitert -> reason=storage", async () => {
  const { fetchImpl } = makeFetch({ pgStatus: 500 });
  const state = signState(PROFILE_ID, ENV.WAHOO_CLIENT_SECRET, NOW);
  const { res } = await call("GET", callbackPath(state), { fetchImpl });
  assert.match(res.headers.Location, /wahoo=error&reason=storage$/);
});

test("callback: fehlende Env -> 503 ohne Weiterleitung", async () => {
  const { res } = await call("GET", callbackPath("x.y"), {
    env: { ...ENV, WAHOO_REDIRECT_URI: undefined },
    fetchImpl: makeFetch().fetchImpl,
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.Location, undefined);
});

// ---------- status ----------

test("status: ohne Login 401, Nicht-Admin 403, fehlende Env 503", async () => {
  assert.equal((await call("GET", "/api/wahoo/status", { fetchImpl: makeFetch().fetchImpl })).res.status, 401);
  const user = await call("GET", "/api/wahoo/status", {
    headers: AUTH,
    fetchImpl: makeFetch({ isAdmin: false }).fetchImpl,
  });
  assert.equal(user.res.status, 403);
  const noEnv = await call("GET", "/api/wahoo/status", {
    headers: AUTH,
    env: { ...ENV, WAHOO_CLIENT_ID: "" },
    fetchImpl: makeFetch().fetchImpl,
  });
  assert.equal(noEnv.res.status, 503);
});

test("status: verbunden liefert scope + expiresAt, nie Tokens", async () => {
  const { fetchImpl, calls } = makeFetch({
    tokenRow: {
      scope: "user_read workouts_read",
      expires_at: "2027-01-01T00:00:00.000Z",
      access_token: "test-access",
      refresh_token: "test-refresh",
    },
  });
  const { res } = await call("GET", "/api/wahoo/status", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), {
    ok: true,
    connected: true,
    scope: "user_read workouts_read",
    expiresAt: "2027-01-01T00:00:00.000Z",
  });
  assert.ok(!res.body.includes("test-access"));
  assert.ok(!res.body.includes("test-refresh"));
  assert.ok(!res.body.includes("access_token"));
  assert.equal(
    pgCalls(calls)[0].url,
    `http://postgrest/athlete_wahoo_tokens?profile_id=eq.${PROFILE_ID}&select=scope,expires_at`
  );
});

test("status: keine Zeile -> connected=false", async () => {
  const { res } = await call("GET", "/api/wahoo/status", { headers: AUTH, fetchImpl: makeFetch().fetchImpl });
  assert.deepEqual(res.json(), { ok: true, connected: false, scope: null, expiresAt: null });
});

test("status: PostgREST-Fehler -> 502", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("profiles_visible")) return jsonRes(200, [{ is_admin: true }]);
    return jsonRes(500, null);
  };
  const { res } = await call("GET", "/api/wahoo/status", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 502);
});

// ---------- disconnect ----------

test("disconnect: ohne Login 401, Nicht-Admin 403, fehlende Env 503", async () => {
  assert.equal((await call("POST", "/api/wahoo/disconnect", { fetchImpl: makeFetch().fetchImpl })).res.status, 401);
  const user = await call("POST", "/api/wahoo/disconnect", {
    headers: AUTH,
    fetchImpl: makeFetch({ isAdmin: false }).fetchImpl,
  });
  assert.equal(user.res.status, 403);
  const noEnv = await call("POST", "/api/wahoo/disconnect", {
    headers: AUTH,
    env: { ...ENV, WAHOO_CLIENT_SECRET: "" },
    fetchImpl: makeFetch().fetchImpl,
  });
  assert.equal(noEnv.res.status, 503);
});

test("disconnect: widerruft bei Wahoo und loescht nur die eigene Zeile", async () => {
  const { fetchImpl, calls } = makeFetch({ tokenRow: { access_token: "test-access" }, wahooStatus: 200 });
  const { res } = await call("POST", "/api/wahoo/disconnect", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true, revoked: true });

  const revoke = calls.find((c) => c.url === "https://api.wahooligan.com/v1/permissions");
  assert.equal(revoke.method, "DELETE");
  assert.equal(revoke.init.headers.Authorization, "Bearer test-access");

  const del = pgCalls(calls).find((c) => c.method === "DELETE");
  assert.equal(del.url, `http://postgrest/athlete_wahoo_tokens?profile_id=eq.${PROFILE_ID}`);
  assert.ok(calls.indexOf(revoke) < calls.indexOf(del));
});

test("disconnect: ohne vorhandene Zeile -> 200, kein Wahoo-Aufruf", async () => {
  const { fetchImpl, calls } = makeFetch();
  const { res } = await call("POST", "/api/wahoo/disconnect", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true, revoked: false });
  assert.ok(!calls.some((c) => c.url.startsWith("https://api.wahooligan.com")));
});

test("disconnect: Widerruf bei Wahoo scheitert -> Zeile wird trotzdem geloescht", async () => {
  const { fetchImpl, calls } = makeFetch({ tokenRow: { access_token: "test-access" }, wahooStatus: 401 });
  const { res } = await call("POST", "/api/wahoo/disconnect", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true, revoked: false });
  assert.ok(pgCalls(calls).some((c) => c.method === "DELETE"));
});

test("disconnect: Netzfehler bei Wahoo wird geschluckt", async () => {
  const inner = makeFetch({ tokenRow: { access_token: "test-access" } });
  const fetchImpl = async (url, init) => {
    if (url.startsWith("https://api.wahooligan.com")) throw new Error("netz");
    return inner.fetchImpl(url, init);
  };
  const { res } = await call("POST", "/api/wahoo/disconnect", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 200);
  assert.equal(res.json().revoked, false);
});

test("disconnect: Loeschen der Zeile scheitert -> 502", async () => {
  const { fetchImpl } = makeFetch({ tokenRow: { access_token: "test-access" }, pgStatus: 500 });
  const { res } = await call("POST", "/api/wahoo/disconnect", { headers: AUTH, fetchImpl });
  assert.equal(res.status, 502);
});

// ---------- Einhaengung in server.js ----------

test("server: /api/wahoo/start ohne Token -> 401, Callback mit kaputtem state leitet um", async () => {
  const http = require("node:http");
  const { server } = require("./server.js");
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("kein Netz in diesem Test erlaubt");
  };
  try {
    await new Promise((resolve, reject) => {
      server.listen(0, "127.0.0.1", async () => {
        const { port } = server.address();
        const request = (method, path) =>
          new Promise((res, rej) => {
            const req = http.request({ hostname: "127.0.0.1", port, path, method }, (r) => {
              r.resume();
              r.on("end", () => res({ status: r.statusCode, location: r.headers.location }));
            });
            req.on("error", rej);
            req.end();
          });
        try {
          assert.equal((await request("POST", "/api/wahoo/start")).status, 401);
          const cb = await request("GET", "/api/wahoo/callback?code=x&state=kaputt");
          assert.equal(cb.status, 302);
          assert.match(cb.location, /wahoo=error&reason=state_invalid$/);
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          server.close();
        }
      });
    });
  } finally {
    globalThis.fetch = origFetch;
  }
});
