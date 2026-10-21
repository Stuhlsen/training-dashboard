/* Tests: Demo-Sicherungen (scripts/demo/lib/guards.js, Fahrplan 31 E3, V1)
   und Epoche aus dem Startwert (scripts/demo/lib/epoch.js). */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDemoTarget,
  assertDemoOutputPath,
  assertDemoAccount,
  DEMO_DATA_DIR,
} from "../scripts/demo/lib/guards.js";
import { epochForSeed, EPOCH_BASE } from "../scripts/demo/lib/epoch.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── assertDemoTarget ─────────────────────────────────────────

test("Ziel: localhost und 127.0.0.1 mit beliebigem Port sind erlaubt", () => {
  for (const url of [
    "http://localhost:8000",
    "http://localhost",
    "https://localhost:443/rest/v1",
    "http://127.0.0.1:54321",
  ]) {
    assert.doesNotThrow(() => assertDemoTarget(url), url);
  }
});

test("Ziel: supabase.co, apps01-Domain, andere Domains werden abgelehnt", () => {
  for (const url of [
    "https://abcdefgh.supabase.co",
    "https://training-dashboard.clear-solutions-it.com",
    "https://example.com",
    "http://localhost.evil.com",
    "http://127.0.0.1.nip.io",
    "http://evil.com/?localhost",
    "http://localhost@evil.com",
    "http://192.168.1.10:8000",
    "http://[::1]:8000",
  ]) {
    assert.throws(() => assertDemoTarget(url), /Demo-Sperre/, url);
  }
});

test("Ziel: leere, fehlende oder kaputte URL wird abgelehnt", () => {
  for (const url of ["", "   ", undefined, null, 42, "localhost:8000", "nicht eine url", "ftp://localhost"]) {
    assert.throws(() => assertDemoTarget(url), /Demo-Sperre/, String(url));
  }
});

// ── assertDemoOutputPath ─────────────────────────────────────

test("Pfad: Dateien in data-demo/ und /demo/data sind erlaubt", () => {
  for (const p of [
    path.join(DEMO_DATA_DIR, "rides-demo1.json"),
    path.join(ROOT, "data-demo", "unter", "x.json"),
    "/demo/data/rides-demo2.json",
  ]) {
    assert.doesNotThrow(() => assertDemoOutputPath(p), p);
  }
});

test("Pfad: data/, ../data/, data-demo/../data/ werden abgelehnt", () => {
  for (const p of [
    path.join(ROOT, "data", "rides.json"),
    path.join(ROOT, "data", "rides-demo1.json"),
    path.join(ROOT, "..", "data", "rides.json"),
    path.join(DEMO_DATA_DIR, "..", "data", "rides.json"),
    `${DEMO_DATA_DIR}/../data/rides.json`,
    path.join(ROOT, "data-demo-evil", "x.json"),
    "/demo/data-evil/x.json",
    "/demo/data/../x.json",
  ]) {
    assert.throws(() => assertDemoOutputPath(p), /Demo-Sperre/, p);
  }
});

test("Pfad: Ordner selbst, leer oder kein String wird abgelehnt", () => {
  for (const p of [DEMO_DATA_DIR, "/demo/data", "", undefined, null, 1]) {
    assert.throws(() => assertDemoOutputPath(p), /Demo-Sperre/, String(p));
  }
});

test("Pfad: Symlink aus data-demo/ heraus wird abgelehnt", (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "demo-guard-data-"));
  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true });
  const link = path.join(DEMO_DATA_DIR, `.guard-test-link-${process.pid}`);
  try {
    try {
      // "junction" geht unter Windows ohne Admin-Rechte; andere Systeme ignorieren den Typ.
      fs.symlinkSync(outside, link, "junction");
    } catch (err) {
      t.skip(`Symlink nicht anlegbar: ${err.code}`);
      return;
    }
    assert.throws(() => assertDemoOutputPath(path.join(link, "rides.json")), /Link/);
    assert.throws(() => assertDemoOutputPath(path.join(link, "neu", "rides.json")), /Link/);
  } finally {
    fs.rmSync(link, { force: true });
    fs.rmSync(outside, { force: true, recursive: true });
  }
});

// ── assertDemoAccount ────────────────────────────────────────

test("Account: @demo.local ist erlaubt", () => {
  for (const email of ["lena.rides@demo.local", "tri_jonas@demo.local", "Coach.Mara@DEMO.LOCAL"]) {
    assert.doesNotThrow(() => assertDemoAccount(email), email);
  }
});

test("Account: alles ohne @demo.local wird abgelehnt", () => {
  for (const email of [
    "someone@example.com",
    "x@demo.local.evil.com",
    "x@notdemo.local",
    "x@evil.com@demo.local",
    "@demo.local",
    "demo.local",
    "",
    undefined,
    null,
  ]) {
    assert.throws(() => assertDemoAccount(email), /Demo-Sperre/, String(email));
  }
});

// ── epochForSeed ─────────────────────────────────────────────

test("Epoche: Montag, 0–11 Wochen nach der Basis, stabil je Startwert", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const epoch = epochForSeed(`s${i}`);
    assert.equal(new Date(`${epoch}T00:00:00Z`).getUTCDay(), 1, epoch);
    const weeks = (Date.parse(epoch) - Date.parse(EPOCH_BASE)) / (7 * 86_400_000);
    assert.ok(Number.isInteger(weeks) && weeks >= 0 && weeks < 12, epoch);
    seen.add(epoch);
  }
  assert.equal(epochForSeed("demo"), epochForSeed("demo"));
  assert.ok(seen.size > 6, "verschiedene Startwerte verschieben die Epoche");
});
