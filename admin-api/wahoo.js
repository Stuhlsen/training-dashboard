// Fahrplan 19 B2 — Wahoo-OAuth2 (Authorization Code) fuer die admin-api.
// Die admin-api macht nur das ERSTE Verbinden, das Trennen und die Statusabfrage;
// Token-Refresh gehoert allein dem Sync (Wahoo rotiert Access- UND Refresh-Token,
// es darf nur eine schreibende Stelle geben). Client-Secret und Tokens verlassen
// diesen Dienst nie: nicht in URLs, Antworten oder Logs.
// Tabelle: athlete_wahoo_tokens (Migration 0080, nur service_role).

const crypto = require("node:crypto");
const { requireAdmin } = require("./auth.js");

const AUTHORIZE_URL = "https://api.wahooligan.com/oauth/authorize";
const TOKEN_URL = "https://api.wahooligan.com/oauth/token";
const PERMISSIONS_URL = "https://api.wahooligan.com/v1/permissions";
const SCOPE = "user_read workouts_read";
const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RETURN_PATH = "/app/settings";

const NOT_CONFIGURED = {
  code: "UNKNOWN",
  message: "Wahoo-Anbindung nicht konfiguriert (WAHOO_CLIENT_ID, WAHOO_CLIENT_SECRET, WAHOO_REDIRECT_URI)",
};

// ---------- Zugriffs-Gate ----------

// DAS Gate fuer alle Wahoo-Routen. Vorerst nur Admins; fuer "jeder Athlet fuer
// sich" genuegt es, hier requireAdmin durch requireUser (auth.js) zu ersetzen.
// Verbunden/getrennt wird in jedem Fall nur die profile_id aus dem JWT.
function requireWahooAccess(authorizationHeader, env, fetchImpl = fetch) {
  return requireAdmin(authorizationHeader, env, fetchImpl);
}

// ---------- Konfiguration ----------

function wahooConfig(env) {
  const clientId = env.WAHOO_CLIENT_ID;
  const clientSecret = env.WAHOO_CLIENT_SECRET;
  const redirectUri = env.WAHOO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;

  let returnUrl;
  try {
    returnUrl = env.WAHOO_RETURN_URL || new URL(DEFAULT_RETURN_PATH, redirectUri).toString();
    new URL(returnUrl);
  } catch {
    return null;
  }
  return { clientId, clientSecret, redirectUri, returnUrl };
}

// ---------- signierter state ----------

function hmac(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/** state = base64url("<profileId>.<ablaufMs>") + "." + HMAC-SHA256 (Schluessel: Client-Secret). */
function signState(profileId, secret, now = Date.now()) {
  const payload = Buffer.from(`${profileId}.${now + STATE_TTL_MS}`).toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
}

/** → { ok: true, profileId } oder { ok: false, reason: "state_invalid" | "state_expired" } */
function verifyState(state, secret, now = Date.now()) {
  const invalid = { ok: false, reason: "state_invalid" };
  if (typeof state !== "string") return invalid;
  const parts = state.split(".");
  if (parts.length !== 2) return invalid;

  const [payload, signature] = parts;
  const expected = Buffer.from(hmac(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return invalid;

  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const dot = decoded.lastIndexOf(".");
  const profileId = decoded.slice(0, dot);
  const expiresAt = Number(decoded.slice(dot + 1));
  if (dot <= 0 || !profileId || !Number.isFinite(expiresAt)) return invalid;
  if (expiresAt <= now) return { ok: false, reason: "state_expired" };
  return { ok: true, profileId };
}

// ---------- Hilfen ----------

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function sendError(res, status, error) {
  sendJson(res, status, { ok: false, error });
}

function redirectBack(res, config, params) {
  const target = new URL(config.returnUrl);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  res.writeHead(302, { Location: target.toString() });
  res.end();
}

function serviceHeaders(env, extra = {}) {
  return { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}

function tokenRowUrl(env, profileId, select) {
  const base = `${env.POSTGREST_INTERNAL_URL}/athlete_wahoo_tokens?profile_id=eq.${encodeURIComponent(profileId)}`;
  return select ? `${base}&select=${select}` : base;
}

/** Eine Zeile (oder null). Wirft bei Netz-/HTTP-Fehler. */
async function readTokenRow(env, profileId, select, fetchImpl) {
  const res = await fetchImpl(tokenRowUrl(env, profileId, select), { headers: serviceHeaders(env) });
  if (!res.ok) throw new Error(`PostgREST antwortete mit ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// ---------- start ----------

function buildAuthorizeUrl(config, state) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

// ---------- callback ----------

/** Code → Tokens. Liefert null bei jedem Fehler (Details gehoeren nicht in Logs/URLs). */
async function exchangeCode(code, config, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const expiresIn = Number(body?.expires_in);
    if (
      typeof body?.access_token !== "string" ||
      !body.access_token ||
      typeof body.refresh_token !== "string" ||
      !body.refresh_token ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      return null;
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn,
      scope: typeof body.scope === "string" && body.scope ? body.scope : SCOPE,
    };
  } catch {
    return null;
  }
}

async function saveTokens(env, profileId, tokens, now, fetchImpl) {
  try {
    const res = await fetchImpl(`${env.POSTGREST_INTERNAL_URL}/athlete_wahoo_tokens?on_conflict=profile_id`, {
      method: "POST",
      headers: serviceHeaders(env, {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify({
        profile_id: profileId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: new Date(now + tokens.expiresIn * 1000).toISOString(),
        scope: tokens.scope,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function handleCallback(res, url, env, config, fetchImpl, now) {
  const fail = (reason) => redirectBack(res, config, { wahoo: "error", reason });

  const checked = verifyState(url.searchParams.get("state"), config.clientSecret, now);
  if (!checked.ok) return fail(checked.reason);
  if (url.searchParams.get("error")) return fail("denied");

  const code = url.searchParams.get("code");
  if (!code) return fail("missing_code");

  const tokens = await exchangeCode(code, config, fetchImpl);
  if (!tokens) return fail("exchange");
  if (!(await saveTokens(env, checked.profileId, tokens, now, fetchImpl))) return fail("storage");

  return redirectBack(res, config, { wahoo: "connected" });
}

// ---------- status / disconnect ----------

async function handleStatus(res, env, profileId, fetchImpl) {
  let row;
  try {
    row = await readTokenRow(env, profileId, "scope,expires_at", fetchImpl);
  } catch {
    return sendError(res, 502, { code: "NETWORK", message: "PostgREST nicht erreichbar" });
  }
  // Nur diese zwei Felder weitergeben — nie die ganze Zeile.
  sendJson(res, 200, {
    ok: true,
    connected: row !== null,
    scope: row ? row.scope : null,
    expiresAt: row ? row.expires_at : null,
  });
}

/** Best effort: jeder Fehler bei Wahoo heisst nur "nicht widerrufen". */
async function revokeAtWahoo(accessToken, fetchImpl) {
  try {
    const res = await fetchImpl(PERMISSIONS_URL, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function handleDisconnect(res, env, profileId, fetchImpl) {
  let row;
  try {
    row = await readTokenRow(env, profileId, "access_token", fetchImpl);
  } catch {
    return sendError(res, 502, { code: "NETWORK", message: "PostgREST nicht erreichbar" });
  }

  const revoked = row?.access_token ? await revokeAtWahoo(row.access_token, fetchImpl) : false;

  try {
    const del = await fetchImpl(tokenRowUrl(env, profileId), {
      method: "DELETE",
      headers: serviceHeaders(env, { Prefer: "return=minimal" }),
    });
    if (!del.ok) throw new Error(`PostgREST antwortete mit ${del.status}`);
  } catch {
    return sendError(res, 502, { code: "NETWORK", message: "Token-Zeile konnte nicht geloescht werden" });
  }
  sendJson(res, 200, { ok: true, revoked });
}

// ---------- Einstieg fuer server.js ----------

function matchWahooRoute(method, pathname) {
  if (method === "POST" && pathname === "/api/wahoo/start") return "start";
  if (method === "GET" && pathname === "/api/wahoo/callback") return "callback";
  if (method === "POST" && pathname === "/api/wahoo/disconnect") return "disconnect";
  if (method === "GET" && pathname === "/api/wahoo/status") return "status";
  return null;
}

/** → true, wenn die Anfrage zu /api/wahoo/* gehoert und beantwortet wurde. */
async function handleWahooRequest(req, res, url, env, fetchImpl = fetch, { now = Date.now() } = {}) {
  const route = matchWahooRoute(req.method, url.pathname);
  if (!route) return false;

  const config = wahooConfig(env);

  // Kommt per Browser-Redirect von Wahoo: kein Bearer, der signierte state ersetzt ihn.
  if (route === "callback") {
    if (!config) sendError(res, 503, NOT_CONFIGURED);
    else await handleCallback(res, url, env, config, fetchImpl, now);
    return true;
  }

  const user = await requireWahooAccess(req.headers.authorization, env, fetchImpl);
  if (!user.ok) {
    sendError(res, user.status, user.error);
    return true;
  }
  if (!config) {
    sendError(res, 503, NOT_CONFIGURED);
    return true;
  }

  if (route === "start") {
    // Der Browser kann bei einer Weiterleitung keinen Authorization-Header senden:
    // die Route liefert die URL, das Frontend leitet selbst weiter.
    const state = signState(user.sub, config.clientSecret, now);
    sendJson(res, 200, { ok: true, url: buildAuthorizeUrl(config, state) });
  } else if (route === "status") {
    await handleStatus(res, env, user.sub, fetchImpl);
  } else {
    await handleDisconnect(res, env, user.sub, fetchImpl);
  }
  return true;
}

module.exports = {
  STATE_TTL_MS,
  signState,
  verifyState,
  wahooConfig,
  requireWahooAccess,
  handleWahooRequest,
};
