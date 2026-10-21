/* Tests: `npm run demo:init` (scripts/demo/init.js, Fahrplan 31 E6) und
   scripts/lib/jwt.js. Inhalt der .env.demo, Signatur der Schlüssel und:
   eine vorhandene Datei wird nie überschrieben. */

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDemoEnv, DEMO_ENV_FILE, writeIfMissing } from "../scripts/demo/init.js";
import { localApiKeys } from "../scripts/lib/jwt.js";

const parse = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );

const payloadOf = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

test("buildDemoEnv: alle Schlüssel, die der Demo-Stack und der Dev-Server lesen", () => {
  const env = parse(buildDemoEnv());
  assert.deepEqual(Object.keys(env).sort(), [
    "DEMO_ANON_KEY",
    "DEMO_AUTHENTICATOR_PASSWORD",
    "DEMO_AUTH_ADMIN_PASSWORD",
    "DEMO_JWT_SECRET",
    "DEMO_POSTGRES_PASSWORD",
    "DEMO_SERVICE_ROLE_KEY",
    "DEMO_SUPABASE_URL",
  ]);
  assert.equal(env.DEMO_SUPABASE_URL, "http://localhost:8000");
  for (const k of [
    "DEMO_POSTGRES_PASSWORD",
    "DEMO_AUTHENTICATOR_PASSWORD",
    "DEMO_AUTH_ADMIN_PASSWORD",
  ]) {
    assert.match(env[k], /^[0-9a-f]{48}$/, k);
  }
  assert.match(env.DEMO_JWT_SECRET, /^[0-9a-f]{64}$/);
});

test("Jeder Name trägt DEMO_ — nichts kollidiert mit Namen der echten .env", () => {
  const env = parse(buildDemoEnv());
  assert.ok(Object.keys(env).every((k) => k.startsWith("DEMO_")));
});

test("docker-compose.demo.yml nutzt nur DEMO_-Variablen, jede als Pflichtwert", () => {
  const compose = fs.readFileSync(
    path.resolve(import.meta.dirname, "../docker-compose.demo.yml"),
    "utf-8"
  );
  const lines = compose.split("\n").filter((l) => !l.trimStart().startsWith("#"));
  const code = lines.join("\n");
  const refs = code.match(/\$\{[^}]+\}/g) ?? [];
  const env = parse(buildDemoEnv());
  for (const ref of refs) {
    if (ref.startsWith("${VITE_APP_VERSION")) continue; // reine Versionsanzeige, kein Geheimnis
    assert.match(ref, /^\$\{DEMO_[A-Z_]+:\?/, ref);
    assert.ok(ref.slice(2).split(":")[0] in env, `${ref} fehlt in .env.demo`);
  }
  assert.match(compose, /^name: training-dashboard-demo$/m);
  // Ports nur lokal: das Demo-Passwort ist dokumentiert
  const ports = code.match(/^\s+- "[^"]*:\d+"$/gm) ?? [];
  assert.ok(ports.length > 0);
  assert.ok(
    ports.every((p) => p.includes('"127.0.0.1:')),
    ports.join(", ")
  );
  // Regel Nr. 1: keine fremden Volumes, keine env_file (die echte .env bliebe sonst ein Kandidat)
  assert.doesNotMatch(code, /training-dashboard_data|(?<!demo_)pgdata|env_file|\.env\b(?!\.demo)/);
  const volumes = code.slice(code.lastIndexOf("\nvolumes:")).match(/^ {2}(\w+):/gm);
  assert.deepEqual(volumes, ["  demo_pgdata:", "  demo_data:", "  demo_storage:"]);
});

test("buildDemoEnv: jeder Lauf erzeugt neue Geheimnisse", () => {
  const a = parse(buildDemoEnv());
  const b = parse(buildDemoEnv());
  assert.notEqual(a.DEMO_JWT_SECRET, b.DEMO_JWT_SECRET);
  assert.notEqual(a.DEMO_POSTGRES_PASSWORD, b.DEMO_POSTGRES_PASSWORD);
});

test("Schlüssel sind mit dem JWT_SECRET der Datei signiert und haben die richtige Rolle", () => {
  const env = parse(buildDemoEnv());
  for (const [key, role] of [
    ["DEMO_ANON_KEY", "anon"],
    ["DEMO_SERVICE_ROLE_KEY", "service_role"],
  ]) {
    const [h, p, sig] = env[key].split(".");
    const expected = crypto
      .createHmac("sha256", env.DEMO_JWT_SECRET)
      .update(`${h}.${p}`)
      .digest("base64url");
    assert.equal(sig, expected.replace(/=+$/, ""), key);
    assert.equal(payloadOf(env[key]).role, role);
  }
});

test("localApiKeys: fester Zeitpunkt → gleiche Schlüssel, 10 Jahre gültig", () => {
  const a = localApiKeys("secret", 1000);
  assert.deepEqual(a, localApiKeys("secret", 1000));
  assert.equal(payloadOf(a.anonKey).exp - 1000, 10 * 365 * 24 * 3600);
});

test("writeIfMissing: legt an, überschreibt eine vorhandene Datei nie", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-init-"));
  const file = path.join(dir, ".env.demo");
  try {
    assert.equal(writeIfMissing(file, "A=1\n"), true);
    assert.equal(writeIfMissing(file, "A=2\n"), false);
    assert.equal(fs.readFileSync(file, "utf-8"), "A=1\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Zieldatei ist genau <repo>/.env.demo, nie die echte .env", () => {
  assert.equal(path.basename(DEMO_ENV_FILE), ".env.demo");
  assert.equal(path.dirname(DEMO_ENV_FILE), path.resolve(import.meta.dirname, ".."));
});
