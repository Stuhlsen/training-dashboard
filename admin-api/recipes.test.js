const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");

function makeJwt(sub, secret, { expOffsetSec = 3600, role = "authenticated", aud = "authenticated" } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub, aud, role, exp: Math.floor(Date.now() / 1000) + expOffsetSec })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const JWT_SECRET = "test-secret";
process.env.JWT_SECRET = JWT_SECRET;
process.env.POSTGREST_INTERNAL_URL = "http://postgrest";
process.env.GOTRUE_INTERNAL_URL = "http://gotrue";
process.env.SUPABASE_SERVICE_ROLE_KEY = "srv-key";
delete process.env.SUPER_ADMIN_ID;

const { server } = require("./server.js");

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const TOKEN_ALICE = makeJwt(ALICE, JWT_SECRET);
const TOKEN_BOB = makeJwt(BOB, JWT_SECRET);

const validBody = () => ({
  title: "Haferbrei",
  meal_type: ["breakfast"],
  servings: 2,
  prep_minutes: 25,
  ingredients: [
    { name: "Haferflocken", amount: 80, unit: "g" },
    { name: "Milch", amount: 400, unit: "ml" },
    { name: "Banane", amount: 2, unit: "Stück" },
  ],
  instructions: [{ text: "Aufkochen.", timerSeconds: 300 }, { text: "Servieren." }],
});

// Minimaler PostgREST-Ersatz: genau die Aufrufe, die recipes.js macht. Jede
// andere URL (z. B. profiles_visible = Admin-Check) wirft — so beweist ein
// gruener Test, dass der Dienst keinen Admin voraussetzt.
//
// Fahrplan 29: `verified` (Set von Profil-IDs) spielt profiles.is_verified_author, `plans` (Liste
// von Rezept-IDs) meal_plan_entries. Der Fake spiegelt die Regeln aus 0071/0064: Sofort-Freigabe
// beim Insert und Inhaltsaenderung bei approved nur fuer verifizierte Einreicher, Loeschen eines
// Rezepts in einem Essensplan scheitert mit 409 (FK restrict).
function fakePostgrest(initialRows = [], { votes = [], requests = [], verified = [], plans = [] } = {}) {
  const store = {
    rows: [...initialRows],
    votes: [...votes],
    requests: [...requests],
    verified: new Set(verified),
    plans: [...plans],
    calls: [],
  };
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    store.calls.push({ method, url, headers: options.headers });
    const q = u.searchParams;
    const eq = (name) => (q.get(name) ?? "").replace(/^eq\./, "");
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (u.origin !== "http://postgrest") throw new Error(`unerwartete URL in Test: ${url}`);

    if (u.pathname === "/recipe_votes") {
      if (method !== "DELETE") throw new Error(`unerwartete Methode: ${method}`);
      store.votes = store.votes.filter((v) => v.recipe_id !== eq("recipe_id"));
      return reply(204, null);
    }
    if (u.pathname === "/profiles") {
      if (method !== "GET") throw new Error(`unerwartete Methode: ${method}`);
      return reply(200, [{ is_verified_author: store.verified.has(eq("id")) }]);
    }
    if (u.pathname === "/meal_plan_entries") {
      if (method !== "GET") throw new Error(`unerwartete Methode: ${method}`);
      return reply(200, store.plans.filter((recipeId) => recipeId === eq("recipe_id")).map((recipe_id) => ({ id: "plan", recipe_id })));
    }
    if (u.pathname === "/ingredient_requests") {
      if (method === "GET") {
        const limit = Number(q.get("limit") ?? Infinity);
        return reply(200, store.requests.filter((r) => r.requested_by === eq("requested_by")).slice(0, limit));
      }
      if (method === "POST") {
        const saved = { id: crypto.randomUUID(), ...JSON.parse(options.body) };
        store.requests.push(saved);
        return reply(201, [saved]);
      }
      throw new Error(`unerwartete Methode: ${method}`);
    }
    if (u.pathname !== "/recipes") throw new Error(`unerwartete URL in Test: ${url}`);

    const matches = (row) =>
      (!q.has("id") || row.id === eq("id")) &&
      (!q.has("submitted_by") || row.submitted_by === eq("submitted_by")) &&
      (!q.has("status") || row.status === eq("status"));

    if (method === "PATCH") {
      // Spiegelt Trigger 0071: Inhalt bei approved nur fuer einen verifizierten Einreicher (E18).
      const hit = store.rows.filter(matches);
      if (hit.some((row) => row.status !== "pending" && !store.verified.has(row.submitted_by))) {
        return reply(400, { message: "E18: content fields can only be modified while recipe status = pending" });
      }
      hit.forEach((row) => Object.assign(row, JSON.parse(options.body)));
      return reply(200, hit);
    }
    if (method === "GET") {
      const limit = Number(q.get("limit") ?? Infinity);
      return reply(200, store.rows.filter(matches).slice(0, limit));
    }
    if (method === "POST") {
      const row = JSON.parse(options.body);
      // Spiegelt Constraint/Trigger aus 0060 + 0071: athlete => pending + submitted_by; approved
      // nur fuer einen verifizierten Einreicher.
      const instantApproval = row.status === "approved" && store.verified.has(row.submitted_by);
      if (row.source === "athlete" && ((row.status !== "pending" && !instantApproval) || !row.submitted_by)) {
        return reply(400, { message: "constraint" });
      }
      const saved = { id: crypto.randomUUID(), ...row };
      store.rows.push(saved);
      return reply(201, [saved]);
    }
    if (method === "DELETE") {
      // Spiegelt meal_plan_entries.recipe_id on delete restrict (0064): 409 / 23503.
      if (store.rows.some((r) => matches(r) && store.plans.includes(r.id))) {
        return reply(409, { code: "23503", message: "violates foreign key constraint" });
      }
      store.rows = store.rows.filter((r) => !matches(r));
      return reply(204, null);
    }
    throw new Error(`unerwartete Methode: ${method}`);
  };
  return { store, fetchImpl };
}

function request(port, method, path, { token, body, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody ?? (body === undefined ? null : JSON.stringify(body));
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withService(rows, callback, fetchImpl, seed) {
  const fake = fakePostgrest(rows, seed);
  const origFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl ?? fake.fetchImpl;
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      try {
        await callback(server.address().port, fake.store);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        globalThis.fetch = origFetch;
        server.close();
      }
    });
  });
}

const pendingRow = (id, owner, extra = {}) => ({
  id,
  source: "athlete",
  status: "pending",
  submitted_by: owner,
  ...extra,
});
const RECIPE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------- Auth

test("alle /api-Endpunkte: ohne/ungueltiges/abgelaufenes/falsches Token -> 401", async () => {
  const bad = [
    undefined,
    "kaputt",
    makeJwt(ALICE, "anderes-secret"),
    makeJwt(ALICE, JWT_SECRET, { expOffsetSec: -10 }),
    makeJwt(ALICE, JWT_SECRET, { role: "service_role" }),
  ];
  const calls = [
    ["GET", "/api/ingredients?q=hafer"],
    ["POST", "/api/recipes/preview"],
    ["POST", "/api/recipes"],
    ["DELETE", `/api/recipes/${RECIPE_ID}`],
    ["PUT", `/api/recipes/${RECIPE_ID}`],
    ["POST", "/api/ingredient-requests"],
  ];
  await withService([], async (port, store) => {
    for (const token of bad) {
      for (const [method, path] of calls) {
        const res = await request(port, method, path, { token, body: method === "GET" || method === "DELETE" ? undefined : validBody() });
        assert.equal(res.status, 401, `${method} ${path}`);
        assert.equal(res.body.ok, false);
        assert.equal(res.body.error.code, "TOKEN_INVALID");
      }
    }
    assert.equal(store.calls.length, 0);
  });
});

test("normaler User-Token reicht, kein Admin-Check (fake wirft bei profiles_visible)", async () => {
  await withService([], async (port) => {
    const res = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, body: validBody() });
    assert.equal(res.status, 200);
  });
});


// ---------------------------------------------------------------- Zutaten-Suche

test("GET /api/ingredients: Gross/Klein und Umlaute egal, hoechstens 20", async () => {
  await withService([], async (port) => {
    const names = async (q) => {
      const res = await request(port, "GET", `/api/ingredients?q=${encodeURIComponent(q)}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 200);
      return res.body.ingredients.map((i) => i.name);
    };
    const lower = await names("hafer");
    assert.ok(lower.includes("Haferflocken"));
    assert.deepEqual(await names("HAFER"), lower);
    assert.ok((await names("gruene bohnen")).includes("Grüne Bohnen"));
    assert.ok((await names("Grüne Bohnen")).includes("Grüne Bohnen"));
    assert.ok((await names("grune")).includes("Grüne Bohnen"));
    assert.equal((await names("e")).length, 20);
    assert.deepEqual(await names(""), []);
    assert.deepEqual(await names("gibtesnicht"), []);

    const res = await request(port, "GET", "/api/ingredients?q=haferflocken", { token: TOKEN_ALICE });
    assert.deepEqual(Object.keys(res.body.ingredients[0]).sort(), ["category", "name", "units"]);
    assert.ok(res.body.ingredients[0].units.includes("g"));
  });
});

// ---------------------------------------------------------------- Preview

test("POST /api/recipes/preview: rechnet, speichert nichts", async () => {
  await withService([], async (port, store) => {
    const res = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, body: validBody() });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(typeof res.body.nutrition.kcal, "number");
    assert.ok(res.body.contains_tags.includes("gluten"));
    assert.ok(res.body.contains_tags.includes("milk"));
    assert.ok(res.body.diet_tags.includes("veg"));
    assert.ok(res.body.ingredients.every((i) => typeof i.category === "string"));
    assert.equal(store.calls.length, 0);
    assert.equal(store.rows.length, 0);
  });
});

test("preview: unbekannte Zutat und unbekannte Einheit -> VALIDATION statt Raten", async () => {
  await withService([], async (port) => {
    const unknownIngredient = validBody();
    unknownIngredient.ingredients.push({ name: "Einhornstaub", amount: 5, unit: "g" });
    let res = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, body: unknownIngredient });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, "VALIDATION");
    assert.match(res.body.error.details.ingredients[0], /Einhornstaub/);

    const unknownUnit = validBody();
    unknownUnit.ingredients[0].unit = "Eimer";
    res = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, body: unknownUnit });
    assert.equal(res.status, 422);
    assert.match(res.body.error.details.ingredients[0], /Eimer/);
  });
});

test("preview: ungueltiger Body -> 400 SCHEMA", async () => {
  await withService([], async (port) => {
    const res = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, rawBody: "{kaputt" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "SCHEMA");
  });
});

// ---------------------------------------------------------------- Einreichen

test("POST /api/recipes: speichert als athlete/pending mit abgeleiteten Werten", async () => {
  await withService([], async (port, store) => {
    const body = {
      ...validBody(),
      // Vom Client mitgeschickt, darf nichts bewirken:
      status: "approved",
      source: "own",
      submitted_by: BOB,
      nutrition: { kcal: 1, protein: 1, carbs: 1, fat: 1 },
      contains_tags: [],
    };
    const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);

    assert.equal(store.rows.length, 1);
    const row = store.rows[0];
    assert.equal(row.source, "athlete");
    assert.equal(row.status, "pending");
    assert.equal(row.submitted_by, ALICE);
    assert.match(row.external_id, /^athlete-[0-9a-f-]{36}$/);
    assert.ok(row.nutrition.kcal > 100);
    assert.ok(row.contains_tags.includes("gluten"));
    assert.deepEqual(row.instructions[0], { text: "Aufkochen.", timerSeconds: 300 });
    assert.equal(row.image_url, null);
    assert.equal(res.body.recipe.id, row.id);

    const post = store.calls.find((c) => c.method === "POST");
    assert.equal(post.headers.Authorization, "Bearer srv-key");
  });
});

test("POST /api/recipes: mit Foto im eigenen Ordner", async () => {
  await withService([], async (port, store) => {
    const res = await request(port, "POST", "/api/recipes", {
      token: TOKEN_ALICE,
      body: { ...validBody(), image_url: `${ALICE}/foto-1.webp` },
    });
    assert.equal(res.status, 201);
    assert.equal(store.rows[0].image_url, `${ALICE}/foto-1.webp`);
  });
});

test("image_url: fremder Ordner, Traversal, fremdes Format -> 422", async () => {
  await withService([], async (port, store) => {
    for (const image_url of [
      `${BOB}/foto.webp`,
      `${ALICE}/../${BOB}/foto.webp`,
      `${ALICE}/./x.webp`,
      "foto.webp",
      `recipe-images/${ALICE}/foto.webp`,
      `https://example.com/${ALICE}/foto.webp`,
      `${ALICE}//foto.webp`,
      42,
    ]) {
      const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: { ...validBody(), image_url } });
      assert.equal(res.status, 422, String(image_url));
      assert.ok(res.body.error.details.image_url, String(image_url));
    }
    assert.equal(store.rows.length, 0);
  });
});

test("Grenzen: Titel, Zutaten, Schritte, Schritt-Laenge -> 422 mit details je Feld", async () => {
  await withService([], async (port, store) => {
    const cases = [
      ["title", { title: "x".repeat(101) }],
      ["title", { title: "   " }],
      ["ingredients", { ingredients: Array(31).fill({ name: "Banane", amount: 1, unit: "Stück" }) }],
      ["instructions", { instructions: Array(21).fill({ text: "Schritt" }) }],
      ["instructions", { instructions: [{ text: "x".repeat(501) }] }],
      ["meal_type", { meal_type: ["brunch"] }],
      ["servings", { servings: 0 }],
    ];
    for (const [field, patch] of cases) {
      const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: { ...validBody(), ...patch } });
      assert.equal(res.status, 422, field);
      assert.equal(res.body.error.code, "VALIDATION");
      assert.ok(res.body.error.details[field], field);
    }
    // Genau an der Grenze geht es durch.
    const edge = {
      ...validBody(),
      title: "x".repeat(100),
      ingredients: Array(30).fill({ name: "Banane", amount: 1, unit: "Stück" }),
      instructions: Array(20).fill({ text: "y".repeat(500) }),
    };
    const ok = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: edge });
    assert.equal(ok.status, 201);
    assert.equal(store.rows.length, 1);
  });
});

test("Zubereitungszeit: fehlend oder ausserhalb 1..600 / nicht ganzzahlig -> 422 an prep_minutes (POST und PUT)", async () => {
  const rows = [pendingRow(RECIPE_ID, ALICE)];
  await withService(rows, async (port, store) => {
    const missing = validBody();
    delete missing.prep_minutes;
    const bodies = [missing, { ...validBody(), prep_minutes: null }];
    for (const bad of [0, -5, 601, 12.5, "25", true]) bodies.push({ ...validBody(), prep_minutes: bad });
    for (const [method, path] of [
      ["POST", "/api/recipes"],
      ["PUT", `/api/recipes/${RECIPE_ID}`],
    ]) {
      for (const body of bodies) {
        const res = await request(port, method, path, { token: TOKEN_ALICE, body });
        assert.equal(res.status, 422, `${method} ${String(body.prep_minutes)}`);
        assert.equal(res.body.error.code, "VALIDATION");
        assert.ok(res.body.error.details.prep_minutes, `${method} ${String(body.prep_minutes)}`);
      }
    }
    assert.equal(store.rows.length, 1, "nichts gespeichert");
    assert.equal(store.rows[0].prep_minutes, undefined);

    // Grenzen 1 und 600 gehen durch und landen in der Zeile.
    for (const prep_minutes of [1, 600]) {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: { ...validBody(), prep_minutes } });
      assert.equal(res.status, 200, String(prep_minutes));
      assert.equal(store.rows[0].prep_minutes, prep_minutes);
    }
    const created = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
    assert.equal(created.status, 201);
    assert.equal(store.rows.at(-1).prep_minutes, 25);
  });
});

test("Zubereitungszeit: die Vorschau rechnet ohne Zeit und ignoriert auch den Platzhalter 0 des Formulars", async () => {
  await withService([], async (port) => {
    const body = validBody();
    delete body.prep_minutes;
    const without = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, body });
    assert.equal(without.status, 200);
    const empty = await request(port, "POST", "/api/recipes/preview", { token: TOKEN_ALICE, body: { ...validBody(), prep_minutes: 0 } });
    assert.equal(empty.status, 200);
  });
});

test("zu viele offene Rezepte: das 6. wird abgelehnt, fremde und nicht-pending zaehlen nicht", async () => {
  const rows = [
    ...[1, 2, 3, 4].map((n) => pendingRow(`00000000-0000-4000-8000-00000000000${n}`, ALICE)),
    pendingRow("00000000-0000-4000-8000-000000000009", BOB),
    pendingRow("00000000-0000-4000-8000-000000000008", ALICE, { status: "approved" }),
  ];
  await withService(rows, async (port, store) => {
    const fifth = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
    assert.equal(fifth.status, 201);
    const sixth = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.error.code, "VALIDATION");
    assert.ok(sixth.body.error.details.open_recipes);
    assert.equal(store.rows.filter((r) => r.submitted_by === ALICE && r.status === "pending").length, 5);
  });
});

// ---------------------------------------------------------------- Zurueckziehen

test("DELETE: eigenes pending-Rezept wird geloescht (nur mit Besitzer+Status-Filter)", async () => {
  await withService([pendingRow(RECIPE_ID, ALICE)], async (port, store) => {
    const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal(store.rows.length, 0);
    const del = store.calls.find((c) => c.method === "DELETE");
    const q = new URL(del.url).searchParams;
    assert.equal(q.get("submitted_by"), `eq.${ALICE}`);
    assert.equal(q.get("status"), "eq.pending");
  });
});

test("DELETE: fremdes Rezept -> 404, nichts geloescht", async () => {
  await withService([pendingRow(RECIPE_ID, ALICE)], async (port, store) => {
    const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_BOB });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NO_DATA");
    assert.equal(store.rows.length, 1);
  });
});

test("DELETE: nicht-pending -> 409, nichts geloescht", async () => {
  for (const status of ["approved", "rejected"]) {
    await withService([pendingRow(RECIPE_ID, ALICE, { status })], async (port, store) => {
      const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 409, status);
      assert.equal(res.body.error.code, "VALIDATION");
      assert.equal(store.rows.length, 1);
    });
  }
});

test("DELETE: unbekannte oder ungueltige ID -> 404", async () => {
  await withService([], async (port, store) => {
    for (const id of [RECIPE_ID, "kein-uuid", "1;drop"]) {
      const res = await request(port, "DELETE", `/api/recipes/${encodeURIComponent(id)}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 404, id);
    }
    assert.equal(store.calls.filter((c) => c.method === "DELETE").length, 0);
  });
});

// ---------------------------------------------------------------- Aendern (PUT)

const OTHER_RECIPE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const votesFor = (recipeId) => [
  { id: "v1", recipe_id: recipeId, athlete_id: BOB, vote: "up" },
  { id: "v2", recipe_id: recipeId, athlete_id: ALICE, vote: "down" },
];

test("PUT: eigenes pending-Rezept wird neu abgeleitet und ALLE Stimmen dazu geloescht", async () => {
  const rows = [
    pendingRow(RECIPE_ID, ALICE, { title: "Alt", status: "pending", external_id: "athlete-x" }),
    pendingRow(OTHER_RECIPE_ID, BOB),
  ];
  const votes = [...votesFor(RECIPE_ID), ...votesFor(OTHER_RECIPE_ID)];
  await withService(
    rows,
    async (port, store) => {
      const body = {
        ...validBody(),
        title: "Neu",
        // Vom Client mitgeschickt, darf nichts bewirken:
        status: "approved",
        source: "own",
        submitted_by: BOB,
        external_id: "own-hack",
        nutrition: { kcal: 1, protein: 1, carbs: 1, fat: 1 },
        contains_tags: [],
      };
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      const row = store.rows.find((r) => r.id === RECIPE_ID);
      assert.equal(row.title, "Neu");
      assert.ok(row.nutrition.kcal > 100, "Naehrwerte serverseitig neu abgeleitet");
      assert.ok(row.contains_tags.includes("gluten"));
      assert.equal(row.status, "pending");
      assert.equal(row.source, "athlete");
      assert.equal(row.submitted_by, ALICE);
      assert.equal(row.external_id, "athlete-x");
      assert.equal(res.body.recipe.id, RECIPE_ID);

      assert.deepEqual(
        store.votes.map((v) => v.recipe_id),
        [OTHER_RECIPE_ID, OTHER_RECIPE_ID],
        "nur die Stimmen dieses Rezepts weg"
      );
      const patch = store.calls.find((c) => c.method === "PATCH");
      const q = new URL(patch.url).searchParams;
      assert.equal(q.get("submitted_by"), `eq.${ALICE}`);
      assert.equal(q.get("status"), "eq.pending");
      assert.equal(patch.headers.Authorization, "Bearer srv-key");
    },
    undefined,
    { votes }
  );
});

test("PUT: Foto im eigenen Ordner geht, fehlendes Foto setzt image_url auf null", async () => {
  await withService([pendingRow(RECIPE_ID, ALICE, { image_url: `${ALICE}/alt.webp` })], async (port, store) => {
    let res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, {
      token: TOKEN_ALICE,
      body: { ...validBody(), image_url: `${ALICE}/neu.webp` },
    });
    assert.equal(res.status, 200);
    assert.equal(store.rows[0].image_url, `${ALICE}/neu.webp`);
    res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
    assert.equal(res.status, 200);
    assert.equal(store.rows[0].image_url, null);
  });
});

test("PUT: fremdes oder fehlendes Rezept -> 404, nichts geschrieben, Stimmen bleiben", async () => {
  await withService(
    [pendingRow(RECIPE_ID, ALICE)],
    async (port, store) => {
      for (const [token, id] of [
        [TOKEN_BOB, RECIPE_ID],
        [TOKEN_ALICE, OTHER_RECIPE_ID],
        [TOKEN_ALICE, "kein-uuid"],
      ]) {
        const res = await request(port, "PUT", `/api/recipes/${id}`, { token, body: validBody() });
        assert.equal(res.status, 404, id);
        assert.equal(res.body.error.code, "NO_DATA");
      }
      assert.equal(store.calls.filter((c) => c.method === "PATCH").length, 0);
      assert.equal(store.votes.length, 2);
      assert.notEqual(store.rows[0].title, validBody().title);
    },
    undefined,
    { votes: votesFor(RECIPE_ID) }
  );
});

test("PUT: nicht-pending -> 409, nichts geschrieben, Stimmen bleiben", async () => {
  for (const status of ["approved", "rejected"]) {
    await withService(
      [pendingRow(RECIPE_ID, ALICE, { status, title: "Alt" })],
      async (port, store) => {
        const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
        assert.equal(res.status, 409, status);
        assert.equal(res.body.error.code, "VALIDATION");
        assert.equal(store.rows[0].title, "Alt");
        assert.equal(store.votes.length, 2);
      },
      undefined,
      { votes: votesFor(RECIPE_ID) }
    );
  }
});

test("PUT: ungueltige Eingabe -> 422 mit details, Stimmen bleiben", async () => {
  await withService(
    [pendingRow(RECIPE_ID, ALICE, { title: "Alt" })],
    async (port, store) => {
      const bad = validBody();
      bad.ingredients.push({ name: "Einhornstaub", amount: 5, unit: "g" });
      let res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: bad });
      assert.equal(res.status, 422);
      assert.match(res.body.error.details.ingredients[0], /Einhornstaub/);

      res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, {
        token: TOKEN_ALICE,
        body: { ...validBody(), title: "x".repeat(101) },
      });
      assert.equal(res.status, 422);
      assert.ok(res.body.error.details.title);

      res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, {
        token: TOKEN_ALICE,
        body: { ...validBody(), image_url: `${BOB}/foto.webp` },
      });
      assert.equal(res.status, 422);
      assert.ok(res.body.error.details.image_url);

      assert.equal(store.rows[0].title, "Alt");
      assert.equal(store.calls.filter((c) => c.method === "PATCH").length, 0);
      assert.equal(store.votes.length, 2);
    },
    undefined,
    { votes: votesFor(RECIPE_ID) }
  );
});

test("PUT: Rezept wurde zwischen Pruefen und Schreiben entschieden -> 409, Stimmen bleiben", async () => {
  // PATCH trifft nichts mehr (Filter status=pending), weil der Admin dazwischen entschied.
  const votes = votesFor(RECIPE_ID);
  const fake = fakePostgrest([pendingRow(RECIPE_ID, ALICE)], { votes });
  const racing = async (url, options = {}) => {
    if ((options.method ?? "GET") === "PATCH") fake.store.rows[0].status = "approved";
    return fake.fetchImpl(url, options);
  };
  await withService(
    [],
    async (port) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 409);
      assert.equal(fake.store.votes.length, 2);
    },
    racing
  );
});

test("PUT: ungueltiger Body -> 400 SCHEMA", async () => {
  await withService([pendingRow(RECIPE_ID, ALICE)], async (port) => {
    const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, rawBody: "{kaputt" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "SCHEMA");
  });
});

test("PUT: PostgREST nicht erreichbar -> 502 NETWORK", async () => {
  const down = async () => {
    throw new Error("down");
  };
  await withService(
    [],
    async (port) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 502);
      assert.equal(res.body.error.code, "NETWORK");
    },
    down
  );
});

// ---------------------------------------------------------------- Zutaten-Wuensche

test("POST /api/ingredient-requests: speichert fuer den JWT-User, Admin nicht noetig", async () => {
  await withService([], async (port, store) => {
    const res = await request(port, "POST", "/api/ingredient-requests", {
      token: TOKEN_ALICE,
      body: { name: "  Quinoa  ", note: "gern als Trockenware", requested_by: BOB },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(store.requests.length, 1);
    assert.equal(store.requests[0].requested_by, ALICE, "requested_by kommt aus dem JWT");
    assert.equal(store.requests[0].name, "Quinoa");
    assert.equal(store.requests[0].note, "gern als Trockenware");
    assert.equal(res.body.request.id, store.requests[0].id);
  });
});

test("ingredient-requests: note ist optional, leere note wird null", async () => {
  await withService([], async (port, store) => {
    for (const note of [undefined, null, "   "]) {
      const res = await request(port, "POST", "/api/ingredient-requests", {
        token: TOKEN_ALICE,
        body: { name: "Quinoa", note },
      });
      assert.equal(res.status, 201);
    }
    assert.ok(store.requests.every((r) => r.note === null));
  });
});

test("ingredient-requests: Grenzen -> 422 mit details, nichts gespeichert", async () => {
  await withService([], async (port, store) => {
    const cases = [
      ["name", {}],
      ["name", { name: "   " }],
      ["name", { name: 42 }],
      ["name", { name: "x".repeat(101) }],
      ["note", { name: "Quinoa", note: "y".repeat(301) }],
      ["note", { name: "Quinoa", note: 7 }],
    ];
    for (const [field, body] of cases) {
      const res = await request(port, "POST", "/api/ingredient-requests", { token: TOKEN_ALICE, body });
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.equal(res.body.error.code, "VALIDATION");
      assert.ok(res.body.error.details[field], field);
    }
    assert.equal(store.requests.length, 0);

    const edge = await request(port, "POST", "/api/ingredient-requests", {
      token: TOKEN_ALICE,
      body: { name: "x".repeat(100), note: "y".repeat(300) },
    });
    assert.equal(edge.status, 201);
  });
});

test("ingredient-requests: der 21. Wunsch wird abgelehnt, fremde zaehlen nicht", async () => {
  const mine = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, requested_by: ALICE, name: `Z${i}` }));
  await withService(
    [],
    async (port, store) => {
      const bob = await request(port, "POST", "/api/ingredient-requests", { token: TOKEN_BOB, body: { name: "Quinoa" } });
      assert.equal(bob.status, 201);
      const alice = await request(port, "POST", "/api/ingredient-requests", { token: TOKEN_ALICE, body: { name: "Quinoa" } });
      assert.equal(alice.status, 409);
      assert.equal(alice.body.error.code, "VALIDATION");
      assert.ok(alice.body.error.details.requests);
      assert.equal(store.requests.filter((r) => r.requested_by === ALICE).length, 20);
    },
    undefined,
    { requests: mine }
  );
});

test("ingredient-requests: ungueltiger Body -> 400, PostgREST down -> 502", async () => {
  await withService([], async (port) => {
    const res = await request(port, "POST", "/api/ingredient-requests", { token: TOKEN_ALICE, rawBody: "{kaputt" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "SCHEMA");
  });
  const down = async () => {
    throw new Error("down");
  };
  await withService(
    [],
    async (port) => {
      const res = await request(port, "POST", "/api/ingredient-requests", { token: TOKEN_ALICE, body: { name: "Quinoa" } });
      assert.equal(res.status, 502);
      assert.equal(res.body.error.code, "NETWORK");
    },
    down
  );
});

test("PostgREST nicht erreichbar -> 502 NETWORK", async () => {
  const down = async () => {
    throw new Error("down");
  };
  await withService(
    [],
    async (port) => {
      const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 502);
      assert.equal(res.body.error.code, "NETWORK");
    },
    down
  );
});

// ---------------------------------------------------------------- Fahrplan 29 V2: verifizierte Autoren

const approvedRow = (id, owner, extra = {}) => ({ ...pendingRow(id, owner, extra), status: "approved" });
const profileCalls = (store) => store.calls.filter((c) => c.url.includes("/profiles"));
const planCalls = (store) => store.calls.filter((c) => c.url.includes("/meal_plan_entries"));

test("POST: verifizierter Autor -> sofort approved, ohne Limit offener Rezepte", async () => {
  const pending = Array.from({ length: 5 }, (_, i) => pendingRow(crypto.randomUUID(), ALICE, { title: `offen ${i}` }));
  await withService(
    pending,
    async (port, store) => {
      const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 201);
      assert.equal(res.body.recipe.status, "approved");
      assert.equal(res.body.recipe.submitted_by, ALICE);
      assert.equal(store.rows.at(-1).status, "approved");
      assert.equal(store.rows.length, 6, "kein Limit fuer Verifizierte");
      assert.equal(profileCalls(store).length, 1);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("Verifizierte Autoren brauchen die Zubereitungszeit genauso (POST und PUT -> 422, nichts gespeichert)", async () => {
  await withService(
    [approvedRow(RECIPE_ID, ALICE)],
    async (port, store) => {
      const body = validBody();
      delete body.prep_minutes;
      const post = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body });
      assert.equal(post.status, 422);
      assert.ok(post.body.error.details.prep_minutes);
      const put = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body });
      assert.equal(put.status, 422);
      assert.ok(put.body.error.details.prep_minutes);
      assert.equal(store.rows.length, 1);
      assert.notEqual(store.rows[0].title, validBody().title);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("POST: Nicht-Verifizierter bleibt pending und hat weiter das Limit", async () => {
  await withService([], async (port, store) => {
    const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
    assert.equal(res.status, 201);
    assert.equal(res.body.recipe.status, "pending");
    assert.equal(profileCalls(store).length, 1);
  });
});

test("POST: die Verifizierung wird bei jedem Aufruf neu gelesen (Entzug wirkt sofort)", async () => {
  await withService(
    [],
    async (port, store) => {
      let res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.body.recipe.status, "approved");
      store.verified.delete(ALICE);
      res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.body.recipe.status, "pending");
      assert.equal(store.rows[0].status, "approved", "das schon freigegebene Rezept bleibt freigegeben (V-5)");
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("POST: Verifizierung eines anderen Athleten gilt nicht", async () => {
  await withService(
    [],
    async (port) => {
      const res = await request(port, "POST", "/api/recipes", { token: TOKEN_BOB, body: validBody() });
      assert.equal(res.body.recipe.status, "pending");
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("POST: Profil-Lesefehler -> 502, nichts gespeichert", async () => {
  const fake = fakePostgrest([]);
  const failing = async (url, options) => {
    if (url.includes("/profiles")) return { ok: false, status: 500, json: async () => ({}) };
    return fake.fetchImpl(url, options);
  };
  await withService(
    [],
    async (port) => {
      const res = await request(port, "POST", "/api/recipes", { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 502);
      assert.equal(fake.store.rows.length, 0);
    },
    failing
  );
});

test("PUT: verifizierter Autor aendert sein freigegebenes Rezept; Status bleibt, Stimmen sind weg", async () => {
  await withService(
    [approvedRow(RECIPE_ID, ALICE, { title: "alt" })],
    async (port, store) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 200);
      assert.equal(res.body.recipe.status, "approved");
      assert.equal(res.body.recipe.title, "Haferbrei");
      const patch = store.calls.find((c) => c.method === "PATCH");
      assert.match(patch.url, /status=eq\.approved/, "Filter wiederholt den geprueften Status");
      assert.equal(store.votes.length, 0, "alle Stimmen geloescht (S1-10)");
    },
    undefined,
    { verified: [ALICE], votes: [{ recipe_id: RECIPE_ID, athlete_id: BOB, vote: "up" }] }
  );
});

test("PUT: freigegebenes Rezept eines Nicht-Verifizierten -> 409, nichts geschrieben", async () => {
  await withService(
    [approvedRow(RECIPE_ID, ALICE, { title: "alt" })],
    async (port, store) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "VALIDATION");
      assert.equal(store.rows[0].title, "alt");
      assert.equal(store.calls.some((c) => c.method === "PATCH"), false);
      assert.equal(store.votes.length, 1, "Stimmen bleiben");
    },
    undefined,
    { votes: [{ recipe_id: RECIPE_ID, athlete_id: BOB, vote: "up" }] }
  );
});

test("PUT: freigegebenes Rezept eines anderen -> 404, auch wenn der Aufrufer verifiziert ist", async () => {
  await withService(
    [approvedRow(RECIPE_ID, BOB)],
    async (port, store) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 404);
      assert.equal(store.calls.some((c) => c.method === "PATCH"), false);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("PUT: abgelehntes Rezept bleibt auch fuer Verifizierte gesperrt (409)", async () => {
  await withService(
    [{ ...pendingRow(RECIPE_ID, ALICE), status: "rejected" }],
    async (port) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 409);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("PUT: offenes Rezept eines Verifizierten geht weiter wie bisher (pending, ohne Profil-Aufruf)", async () => {
  await withService(
    [pendingRow(RECIPE_ID, ALICE)],
    async (port, store) => {
      const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
      assert.equal(res.status, 200);
      assert.equal(res.body.recipe.status, "pending");
      assert.match(store.calls.find((c) => c.method === "PATCH").url, /status=eq\.pending/);
      assert.equal(profileCalls(store).length, 0);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("DELETE: verifizierter Autor zieht sein freigegebenes Rezept zurueck, wenn es in keinem Plan liegt", async () => {
  await withService(
    [approvedRow(RECIPE_ID, ALICE)],
    async (port, store) => {
      const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 200);
      assert.equal(store.rows.length, 0);
      assert.equal(planCalls(store).length, 1, "Plan-Pruefung vor dem Loeschen");
      assert.match(store.calls.find((c) => c.method === "DELETE").url, /status=eq\.approved/);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("DELETE: freigegebenes Rezept in einem Essensplan -> 409 mit details.in_meal_plans, nichts geloescht", async () => {
  await withService(
    [approvedRow(RECIPE_ID, ALICE)],
    async (port, store) => {
      const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, "VALIDATION");
      assert.match(res.body.error.message, /Essensplaen/);
      assert.deepEqual(res.body.error.details.in_meal_plans, [res.body.error.message]);
      assert.equal(store.rows.length, 1);
      assert.equal(store.calls.some((c) => c.method === "DELETE"), false, "kein Loesch-Versuch");
    },
    undefined,
    { verified: [ALICE], plans: [RECIPE_ID] }
  );
});

test("DELETE: Plan-Eintrag kommt zwischen Pruefen und Loeschen dazu -> FK-409 wird zur selben Meldung", async () => {
  const inner = fakePostgrest([approvedRow(RECIPE_ID, ALICE)], { verified: [ALICE], plans: [RECIPE_ID] });
  // Die Plan-Pruefung sieht noch nichts, das Loeschen scheitert dann am FK
  const racy = async (url, options) =>
    url.includes("/meal_plan_entries") ? { ok: true, status: 200, json: async () => [] } : inner.fetchImpl(url, options);
  await withService(
    [],
    async (port) => {
      const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 409);
      assert.deepEqual(Object.keys(res.body.error.details), ["in_meal_plans"]);
      assert.equal(inner.store.rows.length, 1);
    },
    racy
  );
});

test("DELETE: freigegebenes Rezept eines Nicht-Verifizierten -> 409, nichts geloescht, kein Plan-Aufruf", async () => {
  await withService([approvedRow(RECIPE_ID, ALICE)], async (port, store) => {
    const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
    assert.equal(res.status, 409);
    assert.equal(store.rows.length, 1);
    assert.equal(planCalls(store).length, 0);
  });
});

test("DELETE: offenes Rezept eines Verifizierten loescht ohne Plan-Pruefung", async () => {
  await withService(
    [pendingRow(RECIPE_ID, ALICE)],
    async (port, store) => {
      const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 200);
      assert.equal(store.rows.length, 0);
      assert.equal(planCalls(store).length, 0);
    },
    undefined,
    { verified: [ALICE] }
  );
});

test("DELETE: fremdes freigegebenes Rezept -> 404, auch fuer Verifizierte", async () => {
  await withService(
    [approvedRow(RECIPE_ID, BOB)],
    async (port, store) => {
      const res = await request(port, "DELETE", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE });
      assert.equal(res.status, 404);
      assert.equal(store.rows.length, 1);
    },
    undefined,
    { verified: [ALICE] }
  );
});
