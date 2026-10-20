/* ============================================================
   DEMO/INIT.JS — `npm run demo:init` (Fahrplan 31 E6)
   Erzeugt EINMALIG die gitignorierte <repo>/.env.demo mit den lokalen
   Schlüsseln des Demo-Stacks (Postgres-Passwörter, JWT-Secret, anon-/
   service_role-JWT). docker-compose.demo.yml liest nur diese Datei.

   - Liest die echte .env NIE (kein Import von ../lib/env.js).
   - Überschreibt eine vorhandene .env.demo NIE (Schreiben mit "wx").
     Neu anfangen: erst den Demo-Stack mit `npm run demo:down -- -v`
     leeren (braucht die alte .env.demo noch), dann .env.demo selbst
     löschen — die Demo-Postgres behielte sonst ihre alten Passwörter.
   - Gibt keine Schlüssel aus.
   ============================================================ */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localApiKeys } from "../lib/jwt.js";
import { log } from "../lib/log.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEMO_ENV_FILE = path.join(REPO_ROOT, ".env.demo");

/** Proxy des Demo-Stacks vom Rechner aus (Port 8000, s. V6). */
export const DEMO_SUPABASE_URL = "http://localhost:8000";

/** Hex statt Base64: landet ungequotet in postgres://-URIs. */
const randomHex = (bytes) => crypto.randomBytes(bytes).toString("hex");

/**
 * Inhalt der .env.demo. Rein bis auf den Zufall (per Parameter tauschbar).
 * @param {{ random?: (bytes: number) => string, iat?: number }} [opts]
 * @returns {string}
 */
export function buildDemoEnv({ random = randomHex, iat } = {}) {
  const jwtSecret = random(32);
  const { anonKey, serviceRoleKey } = localApiKeys(jwtSecret, iat);
  const lines = [
    "# Fahrplan 31 E6 — lokale Schlüssel des Demo-Stacks, nur dieser Rechner.",
    "# Erzeugt von `npm run demo:init`. Nie committen (gitignored).",
    // Alle Namen mit DEMO_-Präfix: docker-compose.demo.yml kennt nur diese,
    // ein Start ohne --env-file .env.demo bricht so laut ab.
    `DEMO_POSTGRES_PASSWORD=${random(24)}`,
    `DEMO_AUTHENTICATOR_PASSWORD=${random(24)}`,
    `DEMO_AUTH_ADMIN_PASSWORD=${random(24)}`,
    `DEMO_JWT_SECRET=${jwtSecret}`,
    `DEMO_SUPABASE_URL=${DEMO_SUPABASE_URL}`,
    `DEMO_ANON_KEY=${anonKey}`,
    `DEMO_SERVICE_ROLE_KEY=${serviceRoleKey}`,
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Schreibt die Datei nur, wenn es sie noch nicht gibt.
 * @param {string} file
 * @param {string} content
 * @returns {boolean} true = neu geschrieben, false = war schon da
 */
export function writeIfMissing(file, content) {
  try {
    fs.writeFileSync(file, content, { encoding: "utf-8", flag: "wx", mode: 0o600 });
    return true;
  } catch (err) {
    if (err?.code === "EEXIST") return false;
    throw err;
  }
}

function main() {
  if (writeIfMissing(DEMO_ENV_FILE, buildDemoEnv())) {
    log.info("✓ .env.demo angelegt. Weiter: npm run demo:up");
    return;
  }
  log.info(
    ".env.demo gibt es schon — nichts geändert. Neu anfangen: erst " +
      "`npm run demo:down -- -v`, dann die Datei selbst löschen."
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
