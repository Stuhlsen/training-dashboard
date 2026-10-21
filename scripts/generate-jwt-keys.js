/* ============================================================
   SCRIPTS/GENERATE-JWT-KEYS.JS — anon/service_role-JWTs für DKR3
   Signiert zwei HS256-JWTs mit dem lokalen JWT_SECRET aus .env
   (Node-crypto, kein npm-Paket, s. lib/jwt.js) — GoTrue/PostgREST
   akzeptieren diese als apikey/Authorization für den lokalen
   Self-Host-Stack. Ausgabe nur zum Kopieren, wird nie in eine Datei
   geschrieben. Für den Demo-Stack: `npm run demo:init` (Fahrplan 31).
   ============================================================ */

import "./lib/env.js"; // Seiteneffekt: laedt .env in process.env
import { localApiKeys } from "./lib/jwt.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET fehlt in .env — s. docs/docker-lokal-einrichten.md Abschnitt 3.");
  process.exit(1);
}

const { anonKey, serviceRoleKey } = localApiKeys(JWT_SECRET);

console.log("ANON_KEY (SUPABASE_ANON_KEY):");
console.log(anonKey);
console.log("");
console.log("SERVICE_ROLE_KEY (nur fuer die GoTrue-Admin-API, nie ins Frontend):");
console.log(serviceRoleKey);
