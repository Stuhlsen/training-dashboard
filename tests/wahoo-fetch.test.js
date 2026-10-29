/* Tests: scripts/lib/wahoo-fetch.js (Fahrplan 19 B4)
   Alles mit gemocktem fetch — kein echter Aufruf an Wahoo oder Supabase.
   Ausgabe nur in ein Temp-Verzeichnis. Nur Dummy-Werte als Tokens. */

import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { URLSearchParams } from "node:url";
import { syncWahoo, toRideMeta } from "../scripts/lib/wahoo-fetch.js";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const PROFILE = "00000000-0000-0000-0000-000000000001";
const SUPA = "http://supa.test";
const API = "https://api.wahooligan.com";

let dir;
let file;
let out; // alle Log-Zeilen dieses Tests

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wahoo-"));
  file = path.join(dir, "wahoo-1.json");
  out = [];
  for (const level of ["log", "warn", "error"]) {
    mock.method(console, level, (...a) => out.push(a.join(" ")));
  }
});
afterEach(() => {
  mock.restoreAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body ?? ""),
});

const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const DAY = 86400000;

const summary = (over = {}) => ({
  id: 9,
  distance_accum: "42000.5",
  duration_active_accum: "3600",
  duration_total_accum: "3900",
  power_avg: "180.4",
  heart_rate_avg: "140",
  cadence_avg: "88",
  speed_avg: "11.7",
  file: { url: "https://cdn.test/secret.fit" },
  latitude: 1,
  ...over,
});
const workout = (id, daysAgo, over = {}) => ({
  id,
  starts: iso(-daysAgo * DAY),
  minutes: 65,
  name: "Test",
  workout_type_id: 0,
  workout_summary: { id: id * 10 },
  ...over,
});

const expiredRow = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  expires_at: iso(-1000),
};

/** Fake für Supabase + Wahoo; `calls` hält die Reihenfolge fest. */
function makeFetch(opts = {}) {
  const {
    tokenRow = {
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_at: iso(3600_000),
    },
    rowStatus = 200,
    refresh = res(200, {
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 7200,
    }),
    save = res(201),
    list = res(200, { workouts: [workout(1, 2)], total: 1, page: 1, per_page: 30 }),
    detail = (id) => res(200, { id, workout_summary: summary() }),
  } = opts;
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? "GET";
    calls.push({ method, url: u, body: init.body, auth: init.headers?.Authorization });
    if (u.startsWith(`${SUPA}/rest/v1/athlete_wahoo_tokens`)) {
      if (method === "GET") return res(rowStatus, tokenRow ? [tokenRow] : []);
      return save;
    }
    if (u === `${API}/oauth/token`) return refresh;
    if (u.startsWith(`${API}/v1/workouts?`)) return typeof list === "function" ? list(u) : list;
    const m = u.match(/\/v1\/workouts\/(\d+)$/);
    if (m) return typeof detail === "function" ? detail(Number(m[1])) : detail;
    throw new Error(`unerwarteter Aufruf ${u}`);
  };
  return { fn, calls };
}

const base = (fetchImpl, over = {}) => ({
  profileId: PROFILE,
  supabaseUrl: SUPA,
  serviceKey: "test-service",
  clientId: "test-client",
  clientSecret: "test-secret",
  fetchImpl,
  now: NOW,
  file,
  ...over,
});

const readFile = () => JSON.parse(fs.readFileSync(file, "utf-8"));
const wahooCalls = (calls) => calls.filter((c) => c.url.startsWith(API));
const detailCalls = (calls) => calls.filter((c) => /\/v1\/workouts\/\d+$/.test(c.url));
const listCalls = (calls) => calls.filter((c) => c.url.includes("/v1/workouts?"));

test("Token gültig: kein Refresh, Datei mit Metadaten", async () => {
  const { fn, calls } = makeFetch();
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "ok");
  assert.ok(!calls.some((c) => c.url.endsWith("/oauth/token")));
  assert.equal(listCalls(calls)[0].auth, "Bearer test-access");
  const data = readFile();
  assert.equal(data.rides.length, 1);
  assert.deepEqual(data.rides[0], {
    id: 1,
    startTime: iso(-2 * DAY),
    date: iso(-2 * DAY).slice(0, 10),
    workoutTypeId: 0,
    distanceKm: 42.0005,
    movingTimeSec: 3600,
    totalTimeSec: 3900,
    avgPower: 180.4,
    avgHeartRate: 140,
    avgCadence: 88,
  });
});

test("Token abgelaufen: erst Refresh, dann SPEICHERN, erst danach Abruf", async () => {
  const { fn, calls } = makeFetch({ tokenRow: expiredRow });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "ok");
  const order = calls.map((c) => {
    if (c.url.endsWith("/oauth/token")) return "refresh";
    if (c.method !== "GET" && c.url.includes("athlete_wahoo_tokens")) return "save";
    if (c.url.startsWith(API)) return "wahoo-get";
    return "read";
  });
  assert.deepEqual(order.slice(0, 3), ["read", "refresh", "save"]);
  assert.ok(order.indexOf("save") < order.indexOf("wahoo-get"));

  const form = new URLSearchParams(calls.find((c) => c.url.endsWith("/oauth/token")).body);
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), "test-refresh");
  assert.equal(form.get("client_id"), "test-client");
  assert.equal(form.get("client_secret"), "test-secret");

  const saved = JSON.parse(
    calls.find((c) => c.method === "POST" && c.url.includes("athlete_wahoo_tokens")).body
  );
  assert.equal(saved.access_token, "new-access");
  assert.equal(saved.refresh_token, "new-refresh");
  assert.equal(saved.expires_at, iso(7200_000));
  assert.equal(saved.profile_id, PROFILE);
  assert.equal(listCalls(calls)[0].auth, "Bearer new-access");
});

test("Token läuft innerhalb des Puffers ab: wird erneuert", async () => {
  const { fn, calls } = makeFetch({
    tokenRow: { access_token: "a", refresh_token: "r", expires_at: iso(60_000) },
  });
  await syncWahoo(base(fn));
  assert.ok(calls.some((c) => c.url.endsWith("/oauth/token")));
});

test("Speichern scheitert: kein Abruf bei Wahoo, Datei bleibt", async () => {
  fs.writeFileSync(file, '{"rides":[{"id":5}]}');
  const { fn, calls } = makeFetch({ tokenRow: expiredRow, save: res(500) });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "error");
  assert.equal(listCalls(calls).length + detailCalls(calls).length, 0);
  assert.deepEqual(readFile(), { rides: [{ id: 5 }] });
});

test("Refresh scheitert: nicht fatal, kein Abruf, Datei bleibt", async () => {
  fs.writeFileSync(file, '{"rides":[]}');
  const { fn, calls } = makeFetch({
    tokenRow: expiredRow,
    refresh: res(400, { error: "invalid_grant" }),
  });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "error");
  assert.ok(!calls.some((c) => c.url.startsWith(`${API}/v1/`)));
  assert.ok(fs.existsSync(file));
});

test("kein Token-Eintrag: Datei wird entfernt, kein Wahoo-Aufruf", async () => {
  fs.writeFileSync(file, '{"rides":[{"id":5}]}');
  const { fn, calls } = makeFetch({ tokenRow: null });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "disconnected");
  assert.equal(fs.existsSync(file), false);
  assert.equal(wahooCalls(calls).length, 0);
});

test("kein Token-Eintrag und keine Datei: still in Ordnung", async () => {
  const { fn } = makeFetch({ tokenRow: null });
  assert.equal((await syncWahoo(base(fn))).status, "disconnected");
});

test("Token lesen scheitert: Datei bleibt (nicht mit 'getrennt' verwechseln)", async () => {
  fs.writeFileSync(file, '{"rides":[]}');
  const { fn } = makeFetch({ rowStatus: 500 });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "error");
  assert.ok(fs.existsSync(file));
});

test("fehlende Client-Env: übersprungen, nichts angefasst, kein Aufruf", async () => {
  fs.writeFileSync(file, '{"rides":[]}');
  const { fn, calls } = makeFetch();
  for (const over of [{ clientId: "" }, { clientSecret: "" }]) {
    assert.equal((await syncWahoo(base(fn, over))).status, "skipped");
  }
  assert.equal(calls.length, 0);
  assert.ok(fs.existsSync(file));
});

test("fehlende Supabase-Env oder profileId: übersprungen", async () => {
  const { fn, calls } = makeFetch();
  assert.equal((await syncWahoo(base(fn, { serviceKey: "" }))).status, "skipped");
  assert.equal((await syncWahoo(base(fn, { supabaseUrl: "" }))).status, "skipped");
  assert.equal((await syncWahoo(base(fn, { profileId: null }))).status, "skipped");
  assert.equal(calls.length, 0);
});

for (const status of [401, 429, 500, 503]) {
  test(`Wahoo-Liste antwortet ${status}: nicht fatal, bestehende Datei bleibt`, async () => {
    fs.writeFileSync(file, '{"rides":[{"id":5}]}');
    const { fn } = makeFetch({ list: res(status, { message: "kaputt" }) });
    const r = await syncWahoo(base(fn));
    assert.equal(r.status, "error");
    assert.deepEqual(readFile(), { rides: [{ id: 5 }] });
    assert.ok(!out.some((l) => l.startsWith("❌")), "darf keinen Fehler (Exit 1) zählen");
  });
}

test("Netzwerkfehler beim Abruf: nicht fatal, Datei bleibt", async () => {
  fs.writeFileSync(file, '{"rides":[{"id":5}]}');
  const inner = makeFetch();
  const fn = async (url, init) => {
    if (String(url).includes("/v1/workouts?")) throw new TypeError("fetch failed");
    return inner.fn(url, init);
  };
  assert.equal((await syncWahoo(base(fn))).status, "error");
  assert.deepEqual(readFile(), { rides: [{ id: 5 }] });
});

test("Ausgabe enthält keine GPS-/Datei-Felder (Whitelist)", async () => {
  const { fn } = makeFetch();
  await syncWahoo(base(fn));
  const text = fs.readFileSync(file, "utf-8");
  assert.ok(!/latitude|longitude|secret\.fit|"file"|url/i.test(text));
  assert.deepEqual(Object.keys(readFile()).sort(), [
    "generatedAt",
    "rides",
    "source",
    "windowDays",
  ]);
});

test("bereits bekannte Fahrten werden nicht erneut abgerufen", async () => {
  const known = toRideMeta(workout(1, 2), summary());
  fs.writeFileSync(file, JSON.stringify({ rides: [known] }));
  const { fn, calls } = makeFetch({
    list: res(200, { workouts: [workout(2, 1), workout(1, 2)], total: 2, page: 1, per_page: 30 }),
  });
  await syncWahoo(base(fn));
  assert.deepEqual(
    detailCalls(calls).map((c) => c.url.split("/").pop()),
    ["2"]
  );
  assert.deepEqual(
    readFile().rides.map((r) => r.id),
    [1, 2]
  );
});

test("nur Fahrten der letzten 30 Tage; Paging stoppt bei älteren", async () => {
  const { fn, calls } = makeFetch({
    list: res(200, { workouts: [workout(1, 3), workout(2, 40)], total: 99, page: 1, per_page: 30 }),
  });
  await syncWahoo(base(fn));
  assert.deepEqual(
    readFile().rides.map((r) => r.id),
    [1]
  );
  assert.equal(listCalls(calls).length, 1);
});

test("Paging holt Folgeseite, solange Fahrten im Fenster liegen", async () => {
  const pages = {
    1: res(200, { workouts: [workout(1, 1)], total: 2, page: 1, per_page: 1 }),
    2: res(200, { workouts: [workout(2, 2)], total: 2, page: 2, per_page: 1 }),
  };
  const { fn, calls } = makeFetch({ list: (u) => pages[new URL(u).searchParams.get("page")] });
  await syncWahoo(base(fn));
  assert.equal(listCalls(calls).length, 2);
  assert.equal(readFile().rides.length, 2);
});

test("Budget: höchstens 10 Detailabrufe je Lauf, Rest kommt beim nächsten", async () => {
  const workouts = Array.from({ length: 15 }, (_, i) => workout(i + 1, 1 + i * 0.1));
  const { fn, calls } = makeFetch({
    list: res(200, { workouts, total: 15, page: 1, per_page: 30 }),
  });
  await syncWahoo(base(fn));
  assert.equal(detailCalls(calls).length, 10);
  assert.equal(readFile().rides.length, 10);
});

test("429 beim Detailabruf: Abruf stoppt, bisher Geholtes wird geschrieben", async () => {
  const workouts = [workout(1, 1), workout(2, 2), workout(3, 3)];
  const { fn, calls } = makeFetch({
    list: res(200, { workouts, total: 3, page: 1, per_page: 30 }),
    detail: (id) => (id === 2 ? res(429) : res(200, { id, workout_summary: summary() })),
  });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "partial");
  assert.equal(detailCalls(calls).length, 2);
  assert.deepEqual(
    readFile().rides.map((x) => x.id),
    [1]
  );
});

test("Detail ohne workout_summary: Fahrt wird übersprungen", async () => {
  const { fn } = makeFetch({ detail: (id) => res(200, { id, workout_summary: null }) });
  await syncWahoo(base(fn));
  assert.deepEqual(readFile().rides, []);
});

test("toRideMeta: 0 und Müll werden zu null, Strings zu Zahlen", () => {
  const r = toRideMeta(
    workout(1, 1),
    summary({ power_avg: "0.0", heart_rate_avg: null, cadence_avg: "abc" })
  );
  assert.equal(r.avgPower, null);
  assert.equal(r.avgHeartRate, null);
  assert.equal(r.avgCadence, null);
  assert.equal(r.distanceKm, 42.0005);
});

test("kein Token, kein Secret und keine Rohantwort in Log-Ausgaben", async () => {
  const cases = [
    makeFetch({ tokenRow: expiredRow }),
    makeFetch({ tokenRow: expiredRow, save: res(500) }),
    makeFetch({ tokenRow: expiredRow, refresh: res(400, { error: "leak-body" }) }),
    makeFetch({ list: res(401, { message: "leak-body test-access" }) }),
    makeFetch({ list: res(429, { message: "leak-body" }) }),
  ];
  for (const { fn } of cases) await syncWahoo(base(fn));
  const all = out.join("\n");
  for (const secret of [
    "test-access",
    "test-refresh",
    "new-access",
    "new-refresh",
    "test-secret",
    "test-service",
    "leak-body",
  ]) {
    assert.ok(!all.includes(secret), `Log enthält ${secret}`);
  }
  assert.ok(out.length > 0);
});

test("wirft nie, auch bei kaputter Antwort", async () => {
  const fn = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("kein JSON");
    },
  });
  assert.equal((await syncWahoo(base(fn))).status, "error");
});

test("Liste aufsteigend sortiert: übersprungen, bestehende Datei bleibt unverändert", async () => {
  const before = { source: "wahoo", rides: [{ id: 1 }] };
  fs.writeFileSync(file, JSON.stringify(before));
  const { fn } = makeFetch({
    list: res(200, { workouts: [workout(1, 40), workout(2, 2)], total: 2, page: 1, per_page: 30 }),
  });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "error");
  assert.deepEqual(readFile(), before);
  assert.ok(out.some((l) => l.includes("nicht absteigend")));
});

test("Liste absteigend sortiert (neueste zuerst): normal verarbeitet", async () => {
  const { fn } = makeFetch({
    list: res(200, { workouts: [workout(2, 2), workout(1, 20)], total: 2, page: 1, per_page: 30 }),
  });
  const r = await syncWahoo(base(fn));
  assert.equal(r.status, "ok");
  assert.equal(readFile().rides.length, 2);
});
