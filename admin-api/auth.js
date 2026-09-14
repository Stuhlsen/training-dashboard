const crypto = require("node:crypto");

function base64urlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

// Verifiziert Signatur + Ablauf eines HS256-JWTs (GoTrue-Format), ohne
// externe Bibliothek — dasselbe Muster wie scripts/generate-jwt-keys.js,
// nur die Gegenrichtung (pruefen statt signieren).
function verifyJwt(token, secret) {
  if (typeof token !== "string" || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = base64urlDecode(encodedSignature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  return payload;
}

// V2.2/V2.3 — mit dem Aufrufer-JWT (nicht dem Service-Role-Key) gegen
// PostgREST lesen; profiles_visible (Migration 0022) filtert per RLS
// ohnehin auf die eigene Zeile.
async function fetchIsAdmin(token, sub, postgrestUrl, fetchImpl = fetch) {
  const url = `${postgrestUrl}/profiles_visible?id=eq.${encodeURIComponent(sub)}&select=is_admin`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`PostgREST antwortete mit ${res.status}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 && rows[0].is_admin === true;
}

// V1/V2 komplett: liefert { ok: true, sub } oder { ok: false, status, error }
// mit den Statuscodes aus V1 (401/403/502).
async function requireAdmin(authorizationHeader, env, fetchImpl = fetch) {
  const match =
    typeof authorizationHeader === "string" ? authorizationHeader.match(/^Bearer (.+)$/) : null;
  if (!match) {
    return { ok: false, status: 401, error: { code: "TOKEN_INVALID", message: "kein Bearer-Token" } };
  }

  const token = match[1];
  const payload = verifyJwt(token, env.JWT_SECRET);
  if (!payload) {
    return {
      ok: false,
      status: 401,
      error: { code: "TOKEN_INVALID", message: "ungueltiges oder abgelaufenes Token" },
    };
  }

  let admin;
  try {
    admin = await fetchIsAdmin(token, payload.sub, env.POSTGREST_INTERNAL_URL, fetchImpl);
  } catch {
    return { ok: false, status: 502, error: { code: "NETWORK", message: "PostgREST nicht erreichbar" } };
  }

  if (!admin) {
    return { ok: false, status: 403, error: { code: "UNKNOWN", message: "kein Admin" } };
  }

  return { ok: true, sub: payload.sub };
}

module.exports = { verifyJwt, fetchIsAdmin, requireAdmin };
