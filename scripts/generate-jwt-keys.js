/* ============================================================
   SCRIPTS/GENERATE-JWT-KEYS.JS — anon/service_role-JWTs für DKR3
   Signiert zwei HS256-JWTs mit dem lokalen JWT_SECRET aus .env
   (Node-crypto, kein npm-Paket) — GoTrue/PostgREST akzeptieren
   diese als apikey/Authorization für den lokalen Self-Host-Stack.
   Ausgabe nur zum Kopieren, wird nie in eine Datei geschrieben.
   ============================================================ */

import crypto from "node:crypto";
import "./lib/env.js"; // Seiteneffekt: laedt .env in process.env

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET fehlt in .env — s. docs/docker-lokal-einrichten.md Abschnitt 3.");
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(signingInput).digest();
  return `${signingInput}.${base64url(signature)}`;
}

const iat = Math.floor(Date.now() / 1000);
// Langes Ablaufdatum (10 Jahre) — reine Dev-/Lokalnutzung, s. Fahrplan DKR3 Punkt 5.
const exp = iat + 10 * 365 * 24 * 3600;

const anonJwt = signJwt({ role: "anon", iss: "supabase-local", iat, exp });
const serviceRoleJwt = signJwt({ role: "service_role", iss: "supabase-local", iat, exp });

console.log("ANON_KEY (SUPABASE_ANON_KEY):");
console.log(anonJwt);
console.log("");
console.log("SERVICE_ROLE_KEY (nur fuer die GoTrue-Admin-API, nie ins Frontend):");
console.log(serviceRoleJwt);
