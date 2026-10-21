/* ============================================================
   SCRIPTS/LIB/JWT.JS — lokale anon/service_role-JWTs (HS256)
   Gemeinsam genutzt von scripts/generate-jwt-keys.js (Selfhost-Stack,
   DKR3) und scripts/demo/init.js (Demo-Stack, Fahrplan 31 E6).
   Node-crypto, kein npm-Paket, kein I/O.
   ============================================================ */

import crypto from "node:crypto";

/** Langes Ablaufdatum (10 Jahre) — reine Dev-/Lokalnutzung, s. Fahrplan DKR3 Punkt 5. */
const TEN_YEARS_S = 10 * 365 * 24 * 3600;

/** @param {string | Buffer} input */
function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * @param {object} payload
 * @param {string} secret
 * @returns {string}
 */
function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * anon- und service_role-JWT, beide mit demselben Secret signiert.
 * @param {string} secret
 * @param {number} [iat] Ausstellungszeit in Sekunden (Tests)
 * @returns {{ anonKey: string, serviceRoleKey: string }}
 */
export function localApiKeys(secret, iat = Math.floor(Date.now() / 1000)) {
  const exp = iat + TEN_YEARS_S;
  return {
    anonKey: signJwt({ role: "anon", iss: "supabase-local", iat, exp }, secret),
    serviceRoleKey: signJwt({ role: "service_role", iss: "supabase-local", iat, exp }, secret),
  };
}
