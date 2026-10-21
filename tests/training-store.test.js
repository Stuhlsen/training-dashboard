/* Tests: scripts/lib/training-store.js (Fahrplan 26 E2)
   - splitPayload(): Aufteilung des rides*.json-Payloads (rein)
   - saveTrainingData(): Upsert, Löschen nur im geladenen Zeitraum,
     Schutz vor leerem Abruf, Fehler im Result-Format
   Gemocktes fetch gegen ein kleines Fake-Backend im Speicher. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { splitPayload, staleKeys, saveTrainingData } from "../scripts/lib/training-store.js";

const PID = "11111111-1111-1111-1111-111111111111";

const ride = (date, activityId, extra = {}) => ({
  date,
  activityId,
  sport: "ride",
  startTime: `${date}T08:00:00`,
  ...extra,
});

const payload = (over = {}) => ({
  athleteName: "x",
  ftpPublic: true,
  ftp: 250,
  ftpHistory: [
    { id: "ramp-2026-01-01", ftpWatt: 250, validFrom: "2026-01-01", source: "ramp-test" },
  ],
  rides: [ride("2026-05-01", "a1"), ride("2026-05-02", "a2")],
  wellness: [
    { date: "2026-05-01", hrv: 60 },
    { date: "2026-05-02", hrv: 62 },
  ],
  wellnessMeta: { lastUpdated: {} },
  powerCurves: { list: [] },
  powerCurveBlocks: [],
  athleteWeight: 72.5,
  plannedSessions: [{ date: "2026-05-03" }],
  adjustments: {},
  forecast: {},
  updated: "2026-05-02T00:00:00Z",
  source: "intervals.icu",
  count: 2,
  ...over,
});

// ── splitPayload ─────────────────────────────────────────────

test("splitPayload: Fahrten, Tage, Spalten, extra und meta getrennt", () => {
  const s = splitPayload(payload());
  assert.equal(s.rides.length, 2);
  assert.deepEqual(
    { key: s.rides[0].ride_key, date: s.rides[0].ride_date, sport: s.rides[0].sport },
    { key: "a1", date: "2026-05-01", sport: "ride" }
  );
  assert.equal(s.rides[0].data.activityId, "a1");
  assert.deepEqual(
    s.wellness.map((w) => w.day),
    ["2026-05-01", "2026-05-02"]
  );
  assert.equal(s.profileData.athlete_weight, 72.5);
  assert.deepEqual(s.profileData.power_curves, { list: [] });
  assert.deepEqual(Object.keys(s.profileData.extra).sort(), [
    "adjustments",
    "ftpHistory",
    "plannedSessions",
    "powerCurveBlocks",
  ]);
  assert.deepEqual(s.profileData.meta, {
    ftpPublic: true,
    ftp: 250,
    updated: "2026-05-02T00:00:00Z",
    source: "intervals.icu",
    count: 2,
  });
});

test("splitPayload: ohne ftp_public bleibt ftpHistory aus extra heraus (Gating des Payloads)", () => {
  const p = payload({ ftpPublic: false });
  delete p.ftpHistory;
  delete p.ftp;
  const s = splitPayload(p);
  assert.equal("ftpHistory" in s.profileData.extra, false);
  assert.equal(s.profileData.meta.ftpPublic, false);
});

test("splitPayload: Fahrt ohne Activity-ID bekommt stabilen Ersatzschlüssel, Doppelte werden eindeutig", () => {
  const s = splitPayload({
    rides: [
      { date: "2026-03-24", dataSource: "notion" },
      { date: "2026-03-24", dataSource: "notion" },
      ride("2026-03-25", "dup"),
      ride("2026-03-25", "dup"),
    ],
  });
  assert.deepEqual(
    s.rides.map((r) => r.ride_key),
    ["notion-2026-03-24-1", "notion-2026-03-24-2", "dup", "dup~2"]
  );
});

test("splitPayload: Zeilen ohne gültiges Datum werden gezählt statt geschrieben; unbekannter Sport → other", () => {
  const s = splitPayload({
    rides: [{ activityId: "x" }, ride("2026-05-01", "ok", { sport: "kayak" })],
    wellness: [{ hrv: 1 }, { date: "2026-05-01" }],
  });
  assert.equal(s.rides.length, 1);
  assert.equal(s.rides[0].sport, "other");
  assert.deepEqual(s.skipped, { rides: 1, wellness: 1 });
  assert.equal(s.wellness.length, 1);
});

test("staleKeys: nur was nicht mehr zum geladenen Stand gehört", () => {
  assert.deepEqual(staleKeys(["a", "b", "c"], ["b"]), ["a", "c"]);
  assert.deepEqual(staleKeys([], ["b"]), []);
});

// ── saveTrainingData ─────────────────────────────────────────

/** Fake PostgREST: speichert Zeilen je Tabelle, kennt on_conflict/Filter/in-Listen. */
function fakeBackend(seed = {}) {
  const db = {
    training_rides: seed.rides ?? [],
    training_wellness: seed.wellness ?? [],
    training_profile_data: seed.profileData ?? [],
  };
  const calls = [];
  const res = (status, body) => ({
    ok: status < 400,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const table = u.pathname.split("/").pop();
    const method = init.method ?? "GET";
    calls.push({
      method,
      table,
      search: u.search,
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: init.headers,
    });
    const rows = db[table];
    if (!rows) return res(404, {});
    const keyCol =
      table === "training_rides" ? "ride_key" : table === "training_wellness" ? "day" : null;
    const dateCol = table === "training_rides" ? "ride_date" : "day";
    if (method === "POST") {
      const conflict = u.searchParams.get("on_conflict").split(",");
      for (const row of JSON.parse(init.body)) {
        const hit = rows.find((r) => conflict.every((c) => r[c] === row[c]));
        if (hit) Object.assign(hit, row);
        else rows.push({ ...row });
      }
      return res(201);
    }
    const bound = (prefix) =>
      u.searchParams
        .getAll(dateCol)
        .find((v) => v.startsWith(prefix))
        .slice(prefix.length);
    const inRange = (r) =>
      r.profile_id === u.searchParams.get("profile_id").replace("eq.", "") &&
      r[dateCol] >= bound("gte.") &&
      r[dateCol] <= bound("lte.");
    if (method === "GET") {
      return res(
        200,
        rows.filter(inRange).map((r) => ({ [keyCol]: r[keyCol] }))
      );
    }
    if (method === "DELETE") {
      const list = u.searchParams
        .getAll(keyCol)
        .find((v) => v.startsWith("in."))
        .replace(/^in\.\(|\)$/g, "")
        .split(",")
        .map((k) => k.replace(/^"|"$/g, ""));
      db[table] = rows.filter((r) => !(inRange(r) && list.includes(r[keyCol])));
      return res(204);
    }
    return res(405, {});
  };
  return { db, calls, fetchImpl };
}

const base = (fetchImpl, over = {}) => ({
  url: "http://localhost:8000",
  serviceKey: "svc",
  profileId: PID,
  payload: payload(),
  fetchImpl,
  ...over,
});

test("saveTrainingData: erster Lauf schreibt Fahrten, Tage und genau eine Profil-Zeile", async () => {
  const be = fakeBackend();
  const r = await saveTrainingData(base(be.fetchImpl));
  assert.equal(r.ok, true);
  assert.equal(be.db.training_rides.length, 2);
  assert.equal(be.db.training_wellness.length, 2);
  assert.equal(be.db.training_profile_data.length, 1);
  assert.equal(be.db.training_profile_data[0].profile_id, PID);
  assert.equal(be.db.training_rides[0].profile_id, PID);
});

test("saveTrainingData: zweiter Lauf ist ein Upsert — keine Duplikate, geänderte Fahrt wird überschrieben", async () => {
  const be = fakeBackend();
  await saveTrainingData(base(be.fetchImpl));
  const changed = payload({
    rides: [ride("2026-05-01", "a1", { min: 99 }), ride("2026-05-02", "a2")],
  });
  const r = await saveTrainingData(base(be.fetchImpl, { payload: changed }));
  assert.equal(r.ok, true);
  assert.equal(be.db.training_rides.length, 2);
  assert.equal(be.db.training_rides.find((x) => x.ride_key === "a1").data.min, 99);
  assert.equal(be.db.training_profile_data.length, 1);
});

test("saveTrainingData: löscht im geladenen Zeitraum, was bei intervals.icu fehlt — außerhalb nichts", async () => {
  const be = fakeBackend({
    rides: [
      { profile_id: PID, ride_key: "gone", ride_date: "2026-05-02", data: {} },
      { profile_id: PID, ride_key: "old", ride_date: "2025-01-01", data: {} },
      { profile_id: "other", ride_key: "gone", ride_date: "2026-05-02", data: {} },
    ],
    wellness: [{ profile_id: PID, day: "2026-05-02", data: {} }],
  });
  const p = payload({
    rides: [ride("2026-05-01", "a1")],
    wellness: [{ date: "2026-05-01", hrv: 1 }],
  });
  const win = { from: "2026-04-01", to: "2026-05-31" };
  const r = await saveTrainingData(
    base(be.fetchImpl, { payload: p, window: { rides: win, wellness: win } })
  );
  assert.equal(r.ok, true);
  assert.equal(r.counts.deletedRides, 1);
  assert.equal(r.counts.deletedWellness, 1);
  assert.deepEqual(
    be.db.training_rides.map((x) => `${x.profile_id}:${x.ride_key}`).sort(),
    [`${PID}:a1`, `${PID}:old`, "other:gone"].sort()
  );
  assert.deepEqual(
    be.db.training_wellness.map((x) => x.day),
    ["2026-05-01"]
  );
});

test("saveTrainingData: upsert kommt vor dem Löschen (kein Leerstand)", async () => {
  const be = fakeBackend({
    rides: [{ profile_id: PID, ride_key: "gone", ride_date: "2026-05-02", data: {} }],
  });
  const win = { from: "2026-04-01", to: "2026-05-31" };
  await saveTrainingData(base(be.fetchImpl, { window: { rides: win } }));
  const methods = be.calls.filter((c) => c.table === "training_rides").map((c) => c.method);
  assert.ok(methods.indexOf("POST") < methods.indexOf("DELETE"));
});

test("saveTrainingData: leerer Abruf löscht nie (kann ein fehlgeschlagener Abruf sein)", async () => {
  const be = fakeBackend({
    rides: [{ profile_id: PID, ride_key: "keep", ride_date: "2026-05-02", data: {} }],
  });
  const win = { from: "2026-04-01", to: "2026-05-31" };
  const r = await saveTrainingData(
    base(be.fetchImpl, {
      payload: payload({ rides: [], wellness: [] }),
      window: { rides: win, wellness: win },
    })
  );
  assert.equal(r.ok, true);
  assert.equal(be.db.training_rides.length, 1);
  assert.equal(
    be.calls.some((c) => c.method === "DELETE"),
    false
  );
});

test("saveTrainingData: ohne window wird nichts gelöscht (Demo-Seed ergänzt nur)", async () => {
  const be = fakeBackend({
    rides: [{ profile_id: PID, ride_key: "keep", ride_date: "2026-05-09", data: {} }],
  });
  await saveTrainingData(base(be.fetchImpl));
  assert.equal(
    be.calls.some((c) => c.method === "DELETE" || c.method === "GET"),
    false
  );
});

test("saveTrainingData: Schlüssel mit Anführungszeichen und Komma landen korrekt in der in-Liste", async () => {
  const odd = 'a,"b"';
  const be = fakeBackend({
    rides: [{ profile_id: PID, ride_key: odd, ride_date: "2026-05-02", data: {} }],
  });
  const win = { from: "2026-04-01", to: "2026-05-31" };
  await saveTrainingData(base(be.fetchImpl, { window: { rides: win } }));
  const del = be.calls.find((c) => c.method === "DELETE");
  assert.match(decodeURIComponent(del.search), /ride_key=in\.\("a,\\"b\\""\)/);
});

test("saveTrainingData: nutzt den Service-Key, nie ein anderes Token", async () => {
  const be = fakeBackend();
  await saveTrainingData(base(be.fetchImpl));
  for (const c of be.calls) {
    assert.equal(c.headers.apikey, "svc");
    assert.equal(c.headers.Authorization, "Bearer svc");
  }
});

test("saveTrainingData: HTTP-Fehler → Result mit Code HTTP, ohne Key in der Meldung", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    text: async () => '{"message":"permission denied"}',
  });
  const r = await saveTrainingData(base(fetchImpl, { serviceKey: "geheim-123" }));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "HTTP");
  assert.match(r.error.message, /HTTP 403/);
  assert.doesNotMatch(r.error.message, /geheim-123/);
});

test("saveTrainingData: Netzwerkfehler → Code NETWORK, kein Wurf", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNREFUSED");
  };
  const r = await saveTrainingData(base(fetchImpl));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "NETWORK");
});

test("saveTrainingData: fehlende Angaben und kaputter Zeitraum → Result statt Wurf", async () => {
  const be = fakeBackend();
  assert.equal(
    (await saveTrainingData(base(be.fetchImpl, { profileId: "" }))).error.code,
    "NO_DATA"
  );
  assert.equal(
    (await saveTrainingData(base(be.fetchImpl, { serviceKey: "" }))).error.code,
    "TOKEN_INVALID"
  );
  const bad = await saveTrainingData(
    base(be.fetchImpl, { window: { rides: { from: "x", to: "y" } } })
  );
  assert.equal(bad.error.code, "SCHEMA");
  assert.equal(be.calls.length, 0);
});

test("saveTrainingData: abgebrochenes Signal stoppt vor der ersten Anfrage", async () => {
  const be = fakeBackend();
  const controller = new AbortController();
  controller.abort();
  const r = await saveTrainingData(base(be.fetchImpl, { signal: controller.signal }));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /Zeitlimit/);
  assert.equal(be.calls.length, 0);
});
