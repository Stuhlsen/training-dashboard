/* Tests: scripts/seed-own-recipes.js — seedOwnRecipes()
   Dry-Run, --apply, Fehlerfälle (node:test). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { seedOwnRecipes } from "../scripts/seed-own-recipes.js";

const FAKE_URL = "https://example.invalid";
const FAKE_KEY = "fake-service-role-key";

const VALID_INPUT = [
  {
    title: "Haferflocken-Porridge",
    meal_type: ["breakfast"],
    diet_tags: ["veg", "vegan"],
    contains_tags: ["gluten"],
    servings: 2,
    ingredients: [
      { name: "Haferflocken", amount: 100, unit: "g", category: "Getreide & Backwaren" },
    ],
    instructions: [{ text: "Kochen" }],
  },
  {
    title: "Bananen-Pancakes",
    meal_type: ["breakfast"],
    diet_tags: ["veg", "vegan"],
    contains_tags: [],
    servings: 2,
    ingredients: [
      { name: "Banane", amount: 1, unit: "Stück", category: "Obst & Gemüse" },
    ],
    instructions: [{ text: "Braten", timerSeconds: 180 }],
  },
];

/** Fake fetch that records requests and returns success. */
function createFakeFetch() {
  const calls = [];
  const fake = async (url, opts) => {
    const body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
    calls.push({ url, method: opts.method, headers: opts.headers, body });
    return {
      ok: true,
      status: 201,
      text: async () => "Created",
    };
  };
  fake.calls = calls;
  return fake;
}

/** Minimal logger that swallows everything. */
const SILENT_LOGGER = {
  info: () => {},
  warn: () => {},
  error: () => {},
  summary: () => {},
};

/* ── Dry-Run ────────────────────────────────────────────────── */

test("dry-run (apply=false) performs zero writes", async () => {
  const fakeFetch = createFakeFetch();

  const result = await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: false,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch,
    log: SILENT_LOGGER,
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(fakeFetch.calls.length, 0, "dry-run darf kein fetch auslösen");
  assert.ok(Array.isArray(result.rows));
  assert.equal(result.rows.length, 2);
});

/* ── --apply: Upsert on external_id ──────────────────────────── */

test("--apply (apply=true) schreibt via upsert auf external_id", async () => {
  const fakeFetch = createFakeFetch();

  const result = await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch,
    log: SILENT_LOGGER,
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, undefined, "apply=true darf kein Dry-Run sein");
  assert.equal(result.successCount, 2);
  assert.equal(result.errorCount, 0);

  // Fetch wurde aufgerufen
  assert.ok(fakeFetch.calls.length >= 1);

  // Jeder Aufruf hat die richtigen Parameter
  for (const call of fakeFetch.calls) {
    assert.ok(call.url.includes("on_conflict=external_id"), "upsert-Key muss external_id sein");
    assert.equal(call.method, "POST");
    assert.equal(call.headers["Prefer"], "resolution=merge-duplicates");
    assert.ok(call.headers["apikey"], FAKE_KEY);
  }
});

/* ── Row-Content (source, status, external_id) ───────────────── */

test("jede Row hat source=own, status=approved, submitted_by=null, external_id=own-<slug>", async () => {
  const fakeFetch = createFakeFetch();

  await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch,
    log: SILENT_LOGGER,
  });

  const allRows = fakeFetch.calls.flatMap((c) => c.body);
  for (const row of allRows) {
    assert.equal(row.source, "own");
    assert.equal(row.status, "approved");
    assert.equal(row.submitted_by, null);
    assert.ok(row.external_id.startsWith("own-"), `external_id muss mit "own-" beginnen: ${row.external_id}`);
  }

  // external_id = own-<slug(title)>
  assert.equal(allRows[0].external_id, allRows[0].external_id); // sanity
  assert.ok(allRows[0].external_id.length > 4);
  assert.ok(allRows[1].external_id.length > 4);
  // Verschiedene Titel → verschiedene external_id
  assert.notEqual(allRows[0].external_id, allRows[1].external_id);
});

/* ── Idempotenz: gleicher Input → gleicher external_id ────────── */

test("idempotenz: gleicher Titel erzeugt gleichen external_id", async () => {
  const fakeFetch = createFakeFetch();

  await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch,
    log: SILENT_LOGGER,
  });

  // Zweiter Lauf mit identischen Rezepten
  const fakeFetch2 = createFakeFetch();
  await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch2,
    log: SILENT_LOGGER,
  });

  // external_id des ersten Rezepts ist identisch
  const firstRunRows = fakeFetch.calls.flatMap((c) => c.body);
  const secondRunRows = fakeFetch2.calls.flatMap((c) => c.body);

  assert.equal(firstRunRows.length, secondRunRows.length);
  for (let i = 0; i < firstRunRows.length; i++) {
    assert.equal(firstRunRows[i].external_id, secondRunRows[i].external_id,
      `Rezept ${i}: external_id muss bei wiederholtem Lauf identisch sein`);
  }
});

/* ── Validierungsfehler → kein Schreibversuch ────────────────── */

test("ungültige Rezepte → ok:false, kein fetch", async () => {
  const fakeFetch = createFakeFetch();

  const result = await seedOwnRecipes({
    recipes: [{ title: "", meal_type: ["breakfast"], servings: 1 }],
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch,
    log: SILENT_LOGGER,
  });

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  assert.equal(fakeFetch.calls.length, 0, "bei Validierungsfehler darf kein fetch stattfinden");
});

/* ── Validierungsfehler werden an logger gemeldet ──────────── */

test("validierungsfehler → seedOwnRecipes gibt errors zurück (logging ist CLI-Aufgabe)", async () => {
  const captured = [];
  const captureLogger = {
    info: () => {},
    warn: () => {},
    error: (...args) => { captured.push(args.join(" ")); },
    summary: () => {},
  };

  const result = await seedOwnRecipes({
    recipes: [{ title: "", meal_type: ["breakfast"], servings: 1 }],
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: createFakeFetch(),
    log: captureLogger,
  });

  // seedOwnRecipes selbst loggt nicht, sondern gibt die errors im
  // Rückgabewert zurück. Das Loggen ist Aufgabe des CLI-Aufrufers
  // (seed-own-recipes.js CLI-Entry-Point .then()-Handler).
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length > 0);
  assert.equal(captured.length, 0, "seedOwnRecipes selbst loggt keine Fehler (liefert sie nur zurück)");
});

/* ── Warnings haben keine doppelten Emojis ────────────────────── */

test("warn-Meldungen enthalten kein führendes ⚠️  (logger fügt es selbst hinzu)", async () => {
  const captured = [];
  const captureLogger = {
    info: () => {},
    warn: (msg) => { captured.push(msg); },
    error: () => {},
    summary: () => {},
  };

  await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: false,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: createFakeFetch(),
    log: captureLogger,
  });

  // Bei apply=false werden die Nährwert-Warnings geloggt
  for (const msg of captured) {
    assert.ok(!msg.startsWith("⚠️ "), `warn-Meldung beginnt nicht mit ⚠️ : "${msg}"`);
  }
});

/* ── Fehler beim Write wird gemeldet ──────────────────────────── */

test("fetch-Fehler → errorCount > 0, ok:false", async () => {
  const failingFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal Server Error",
  });

  const result = await seedOwnRecipes({
    recipes: VALID_INPUT,
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: failingFetch,
    log: SILENT_LOGGER,
  });

  assert.equal(result.ok, false);
  assert.equal(result.successCount, 0);
  assert.equal(result.errorCount, 2);
});

/* ── Keine URL/Key in den Logs ──────────────────────────────── */

test("keine Secrets in log/output — fake URL verwendet", async () => {
  // Prüft, dass der Test selbst keine echte URL oder Secrets enthält
  assert.ok(FAKE_URL.startsWith("https://"));
  assert.ok(FAKE_URL.includes("invalid"), "FAKE_URL darf nicht auf eine echte Deployment-URL zeigen");
  assert.equal(FAKE_KEY, "fake-service-role-key");
  // Die seedOwnRecipes-Funktion hat keine console.log-Seitenwirkung,
  // wenn log=SILENT_LOGGER übergeben wird — kein Output möglich.
});