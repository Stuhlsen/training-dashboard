/* Tests: ganzer Sync-Lauf je Account (Fahrplan 26 E2)
   scripts/generate-data.js läuft als Kindprozess gegen einen lokalen
   Fake-Supabase. Ausgabe nur in ein Temp-Verzeichnis (SYNC_DATA_DIR) — das
   echte data/ wird nie berührt. Kein intervals.icu-Key in der Fake-Config,
   also kein Netzwerkzugriff nach außen.
   - alle Accounts (Bestand + neu) landen in den Tabellen
   - Dateien nur für die Bestandsathleten, keine für neue Accounts
   - Fehler/Zeitlimit eines Accounts stoppt die anderen nicht */

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROFILES = [
  { id: "00000000-0000-0000-0000-000000000001", display_name: "Stuhlsen" },
  { id: "00000000-0000-0000-0000-000000000004", display_name: "bentastiic" },
  { id: "00000000-0000-0000-0000-000000000009", display_name: "neuer_account" },
];
// Nur der Account ohne festen Platz hat Zugangsdaten (Fake) — seine Aktivitäten
// kommen vom lokalen Fake-Server (INTERVALS_BASE_URL), nie von intervals.icu.
const NEW_ID = PROFILES[2].id;
const SYNC_ROWS = PROFILES.map((p) => ({
  profile_id: p.id,
  intervals_api_key: p.id === NEW_ID ? "fake-key" : null,
  intervals_athlete_id: p.id === NEW_ID ? "i-new" : null,
}));
const FAKE_ACTIVITIES = [
  {
    id: "i101",
    type: "Ride",
    name: "Test",
    start_date_local: "2026-10-01T08:00:00",
    distance: 40000,
    moving_time: 3600,
    icu_weighted_avg_watts: 200,
    icu_average_watts: 180,
  },
  {
    id: "i102",
    type: "Ride",
    name: "Test",
    start_date_local: "2026-10-03T08:00:00",
    distance: 30000,
    moving_time: 2700,
    icu_weighted_avg_watts: 190,
    icu_average_watts: 170,
  },
];

/** Fake-Supabase: Config-Tabellen aus PROFILES, POSTs auf training_* werden notiert. */
function startFake({ failFor = null, hangFor = null } = {}) {
  const writes = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url, "http://x");
      const table = u.pathname.split("/").pop();
      const send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      if (req.method === "POST" && table.startsWith("training_")) {
        const rows = JSON.parse(Buffer.concat(chunks).toString() || "[]");
        const pid = rows[0]?.profile_id;
        if (pid === hangFor) return; // antwortet nie
        if (pid === failFor) return send(500, { message: "boom" });
        writes.push({ table, rows });
        return send(201);
      }
      if (req.method === "GET") {
        if (u.pathname.endsWith("/activities")) return send(200, FAKE_ACTIVITIES);
        if (u.pathname.endsWith("/wellness"))
          return send(200, [{ id: "2026-10-01", restingHR: 50 }]);
        if (u.pathname.endsWith("/power-curves")) return send(200, null);
        if (table === "athlete_sync_config") return send(200, SYNC_ROWS);
        if (table === "profiles") return send(200, PROFILES);
        return send(200, []);
      }
      return send(204);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        writes,
        close: () => {
          server.closeAllConnections?.();
          server.close();
        },
      })
    );
  });
}

function runSync(url, dataDir, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/generate-data.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: "svc",
        SUPABASE_ANON_KEY: "anon",
        SYNC_DATA_DIR: dataDir,
        INTERVALS_BASE_URL: url,
        ...extraEnv,
      },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const profilesWritten = (writes, table) =>
  new Set(writes.filter((w) => w.table === table).map((w) => w.rows[0].profile_id));

test("Sync: alle Accounts in die Tabellen, Dateien nur für die Bestandsathleten", async () => {
  const fake = await startFake();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-accounts-"));
  try {
    const { code, out } = await runSync(fake.url, dir);
    assert.equal(code, 0, out);

    // Profil-Zeile für jeden Account, auch für den ohne festen Platz.
    const profileData = profilesWritten(fake.writes, "training_profile_data");
    assert.deepEqual([...profileData].sort(), PROFILES.map((p) => p.id).sort());

    // Der neue Account bekommt seine Fahrten (Fake-Aktivitäten) mit Activity-ID als Schlüssel.
    const newRides = fake.writes
      .filter((w) => w.table === "training_rides" && w.rows[0].profile_id === NEW_ID)
      .flatMap((w) => w.rows);
    assert.deepEqual(newRides.map((r) => r.ride_key).sort(), ["i101", "i102"]);

    // Dateien: athlete1 (rides.json) und athlete4 (rides-4.json, plan-only) — sonst nichts.
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("rides"));
    assert.deepEqual(files.sort(), ["rides-4.json", "rides.json"]);

    // Nichts im Log verrät Namen oder Schlüssel des neuen Accounts.
    assert.doesNotMatch(out, /neuer_account/);
    assert.match(out, /Laufzeit je Account/);
  } finally {
    fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Sync: Dateiinhalt der Bestandsathleten entspricht dem Payload, der in die Tabellen geht", async () => {
  const fake = await startFake();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-accounts-"));
  try {
    const { code, out } = await runSync(fake.url, dir);
    assert.equal(code, 0, out);
    const file = JSON.parse(fs.readFileSync(path.join(dir, "rides.json"), "utf-8"));
    const row = fake.writes.find(
      (w) => w.table === "training_profile_data" && w.rows[0].profile_id === PROFILES[0].id
    ).rows[0];
    assert.equal(row.meta.count, file.count);
    assert.equal(row.meta.source, file.source);
    assert.equal(row.meta.updated, file.updated);
    const rideRows = fake.writes
      .filter((w) => w.table === "training_rides" && w.rows[0].profile_id === PROFILES[0].id)
      .flatMap((w) => w.rows);
    assert.equal(rideRows.length, file.rides.length);
    assert.ok(file.rides.length > 0, "Plan-1-Historie muss Fahrten liefern");
    assert.equal(new Set(rideRows.map((r) => r.ride_key)).size, rideRows.length);
  } finally {
    fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Sync: Schreibfehler eines Accounts stoppt die anderen nicht (Exit-Code 1, Dateien trotzdem da)", async () => {
  const fake = await startFake({ failFor: PROFILES[1].id });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-accounts-"));
  try {
    const { code, out } = await runSync(fake.url, dir);
    assert.equal(code, 1, out);
    assert.match(out, /Tabellen schreiben fehlgeschlagen/);
    const written = profilesWritten(fake.writes, "training_profile_data");
    assert.equal(written.has(PROFILES[1].id), false);
    assert.equal(written.has(PROFILES[0].id), true);
    assert.equal(written.has(PROFILES[2].id), true);
    assert.ok(fs.existsSync(path.join(dir, "rides-4.json")));
  } finally {
    fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Sync: hängender Account läuft ins Zeitlimit, die übrigen werden trotzdem geschrieben", async () => {
  const fake = await startFake({ hangFor: PROFILES[1].id });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-accounts-"));
  try {
    const { code, out } = await runSync(fake.url, dir, { SYNC_ACCOUNT_TIMEOUT_MS: "1500" });
    assert.equal(code, 1, out);
    assert.match(out, /TIMEOUT/);
    const written = profilesWritten(fake.writes, "training_profile_data");
    assert.equal(written.has(PROFILES[0].id), true);
    assert.equal(written.has(PROFILES[2].id), true);
    assert.equal(written.has(PROFILES[1].id), false);
  } finally {
    fake.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
