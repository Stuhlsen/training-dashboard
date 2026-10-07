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

/** Fake fetch: GET liefert `existing` (wird nicht in calls erfasst, sondern in reads),
 *  alle Schreibzugriffe landen in calls. failOn(call) -> true lässt diesen Schreibzugriff scheitern. */
function createFakeFetch(existing = [], { failOn } = {}) {
  const calls = [];
  const reads = [];
  const fake = async (url, opts) => {
    if (opts.method === "GET") {
      reads.push({ url, headers: opts.headers });
      return { ok: true, status: 200, json: async () => existing, text: async () => "" };
    }
    const body = typeof opts.body === "string" ? JSON.parse(opts.body) : opts.body;
    const call = { url, method: opts.method, headers: opts.headers, body };
    calls.push(call);
    if (failOn && failOn(call)) {
      return { ok: false, status: 400, text: async () => "E18: content fields can only be modified while recipe status = pending" };
    }
    return { ok: true, status: 201, text: async () => "Created" };
  };
  fake.calls = calls;
  fake.reads = reads;
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

/* ── Slug-Kollision (verschiedene Titel → gleicher Slug) ────── */

test("slug collision → buildRows gibt einen Fehler zurück", async () => {
  // "Haferflocken-Porridge!" und "Haferflocken Porridge" → slug "haferflocken-porridge"
  const recipesWithSlugCollision = [
    {
      title: "Haferflocken-Porridge!",
      meal_type: ["breakfast"],
      servings: 2,
      ingredients: [{ name: "Haferflocken", amount: 100, unit: "g", category: "Getreide" }],
      instructions: [{ text: "Kochen" }],
    },
    {
      title: "Haferflocken Porridge",
      meal_type: ["breakfast"],
      servings: 2,
      ingredients: [{ name: "Haferflocken", amount: 100, unit: "g", category: "Getreide" }],
      instructions: [{ text: "Kochen" }],
    },
  ];

  const fakeFetch = createFakeFetch();
  const result = await seedOwnRecipes({
    recipes: recipesWithSlugCollision,
    apply: true,
    supabaseUrl: FAKE_URL,
    serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch,
    log: SILENT_LOGGER,
  });

  assert.equal(result.ok, false, "slug collision should fail");
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.some((e) => e.includes("Slug-Kollision") || e.includes("external_id")),
    "error message should mention slug collision");
  assert.equal(fakeFetch.calls.length, 0, "slug collision darf kein fetch auslösen");
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

/* ── Vorhandene Rezepte: unverändert / geändert (E18-Weg) ─────── */

/** Baut "Datenbankzeilen" so, wie PostgREST sie für VALID_INPUT liefern würde. */
async function existingRowsFor(recipes, over = () => ({})) {
  const dry = await seedOwnRecipes({
    recipes, apply: false, supabaseUrl: FAKE_URL, serviceRoleKey: FAKE_KEY,
    fetch: createFakeFetch(), log: SILENT_LOGGER,
  });
  return dry.rows.map(({ externalId, row }, i) => ({
    external_id: externalId, source: "own", status: "approved", ...row, ...over(i),
  }));
}

async function run(recipes, fakeFetch) {
  return seedOwnRecipes({
    recipes, apply: true, supabaseUrl: FAKE_URL, serviceRoleKey: FAKE_KEY,
    fetch: fakeFetch, log: SILENT_LOGGER,
  });
}

test("vorhanden und unverändert → keine Schreibzugriffe (auch bei anderer jsonb-Schlüsselreihenfolge)", async () => {
  const existing = await existingRowsFor(VALID_INPUT);
  // jsonb liefert Schlüssel in anderer Reihenfolge
  existing[0].ingredients = existing[0].ingredients.map((g) => ({ unit: g.unit, category: g.category, name: g.name, amount: g.amount }));
  const fakeFetch = createFakeFetch(existing);
  const result = await run(VALID_INPUT, fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(fakeFetch.calls.length, 0, "unveränderte Rezepte dürfen nichts schreiben");
  assert.equal(result.unchangedCount, 2);
  assert.equal(result.insertedCount, 0);
  assert.equal(result.updatedCount, 0);
});

test("vorhanden und geändert → pending, Inhalt ändern, approved (E18-Weg), unverändertes Rezept bleibt unberührt", async () => {
  const existing = await existingRowsFor(VALID_INPUT, (i) => (i === 0 ? { contains_tags: [] } : {}));
  const fakeFetch = createFakeFetch(existing);
  const result = await run(VALID_INPUT, fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.unchangedCount, 1);

  const patches = fakeFetch.calls.filter((c) => c.method === "PATCH");
  assert.equal(fakeFetch.calls.length, 3, "genau drei Schreibzugriffe für das geänderte Rezept");
  assert.ok(patches.every((c) => c.url.includes("external_id=eq.own-haferflocken-porridge")));
  assert.deepEqual(patches[0].body, { status: "pending" });
  assert.deepEqual(patches[1].body.contains_tags, ["gluten"], "neuer Inhalt wird geschrieben");
  assert.equal(patches[1].body.status, undefined, "Inhalts-PATCH ändert den Status nicht");
  assert.deepEqual(patches[2].body, { status: "approved" });
});

test("Rest-pending von einem abgebrochenen Lauf → Inhalt schreiben und wieder freigeben (kein zweites pending)", async () => {
  const existing = await existingRowsFor(VALID_INPUT, (i) => (i === 0 ? { status: "pending" } : {}));
  const fakeFetch = createFakeFetch(existing);
  const result = await run(VALID_INPUT, fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.updatedCount, 1);
  const bodies = fakeFetch.calls.map((c) => c.body);
  assert.equal(bodies.filter((b) => b.status === "pending").length, 0, "bereits pending: nicht noch einmal setzen");
  assert.deepEqual(bodies[bodies.length - 1], { status: "approved" });
});

test("Inhalts-PATCH scheitert → Status wird zurückgesetzt, Fehler gezählt", async () => {
  const existing = await existingRowsFor(VALID_INPUT, (i) => (i === 0 ? { contains_tags: [] } : {}));
  const fakeFetch = createFakeFetch(existing, {
    failOn: (c) => c.method === "PATCH" && c.body.title !== undefined,
  });
  const result = await run(VALID_INPUT, fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.errorCount, 1);
  assert.equal(result.updatedCount, 0);
  const statuses = fakeFetch.calls.filter((c) => c.body.status).map((c) => c.body.status);
  assert.deepEqual(statuses, ["pending", "approved"], "nach dem Fehler wird wieder freigegeben");
});

test("neu und geändert gemischt: neues Rezept per Upsert, geändertes per PATCH", async () => {
  const [, second] = await existingRowsFor(VALID_INPUT, (i) => (i === 1 ? { servings: 9 } : {}));
  const fakeFetch = createFakeFetch([second]); // nur das zweite Rezept existiert (mit anderem Inhalt)
  const result = await run(VALID_INPUT, fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.insertedCount, 1);
  assert.equal(result.updatedCount, 1);
  const posts = fakeFetch.calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.length, 1);
  assert.ok(posts[0].url.includes("on_conflict=external_id"));
});

test("external_id gehört zu anderer Quelle → Fehler, kein Schreibzugriff darauf", async () => {
  const existing = await existingRowsFor(VALID_INPUT, (i) => (i === 0 ? { source: "spoonacular" } : {}));
  const fakeFetch = createFakeFetch(existing);
  const result = await run(VALID_INPUT, fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.errorCount, 1);
  assert.equal(fakeFetch.calls.filter((c) => c.url.includes("haferflocken-porridge")).length, 0);
});

test("Lesen der vorhandenen Rezepte scheitert → nichts wird geschrieben", async () => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push(opts.method);
    return { ok: false, status: 500, text: async () => "Internal Server Error" };
  };
  const result = await run(VALID_INPUT, fetchFn);
  assert.equal(result.ok, false);
  assert.equal(result.errorCount, 2);
  assert.deepEqual(calls, ["GET"], "nach dem fehlgeschlagenen Lesen darf nichts geschrieben werden");
});
