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
function fakePostgrest(initialRows = []) {
  const store = { rows: [...initialRows], calls: [] };
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method ?? "GET";
    store.calls.push({ method, url, headers: options.headers });
    if (u.origin !== "http://postgrest" || u.pathname !== "/recipes") {
      throw new Error(`unerwartete URL in Test: ${url}`);
    }
    const q = u.searchParams;
    const eq = (name) => (q.get(name) ?? "").replace(/^eq\./, "");
    const matches = (row) =>
      (!q.has("id") || row.id === eq("id")) &&
      (!q.has("submitted_by") || row.submitted_by === eq("submitted_by")) &&
      (!q.has("status") || row.status === eq("status"));
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

    if (method === "GET") {
      const limit = Number(q.get("limit") ?? Infinity);
      return reply(200, store.rows.filter(matches).slice(0, limit));
    }
    if (method === "POST") {
      const row = JSON.parse(options.body);
      // Spiegelt Constraint/Trigger aus 0060: athlete => pending + submitted_by.
      if (row.source === "athlete" && (row.status !== "pending" || !row.submitted_by)) {
        return reply(400, { message: "constraint" });
      }
      const saved = { id: crypto.randomUUID(), ...row };
      store.rows.push(saved);
      return reply(201, [saved]);
    }
    if (method === "DELETE") {
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

async function withService(rows, callback, fetchImpl) {
  const fake = fakePostgrest(rows);
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
  ];
  await withService([], async (port, store) => {
    for (const token of bad) {
      for (const [method, path] of calls) {
        const res = await request(port, method, path, { token, body: method === "POST" ? validBody() : undefined });
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

test("PUT /api/recipes/:id gibt es in S1a nicht -> 404", async () => {
  await withService([pendingRow(RECIPE_ID, ALICE)], async (port) => {
    const res = await request(port, "PUT", `/api/recipes/${RECIPE_ID}`, { token: TOKEN_ALICE, body: validBody() });
    assert.equal(res.status, 404);
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
