const test = require("node:test");
const assert = require("node:assert/strict");
const { listAthletes } = require("./athletes.js");

const ENV = {
  GOTRUE_INTERNAL_URL: "http://gotrue",
  POSTGREST_INTERNAL_URL: "http://postgrest",
  SUPABASE_SERVICE_ROLE_KEY: "srv-key",
};

// Verzweigt nach der aufgerufenen URL — listAthletes ruft vier Endpunkte
// parallel auf (Promise.all), ein einzelner fakeFetch kann daher nicht auf
// Aufrufreihenfolge setzen.
function routedFetch(routes) {
  return async (url) => {
    for (const [pattern, body] of routes) {
      if (url.includes(pattern)) {
        return { ok: true, status: 200, json: async () => body };
      }
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
}

const GOTRUE_USERS = {
  users: [
    { id: "u1", email: "u1@example.com", last_sign_in_at: "2026-09-10T08:00:00Z" },
  ],
};

test("listAthletes: lastChanged faellt auf die juengste Tabelle zurueck (hier plan_cards)", async () => {
  const fetchImpl = routedFetch([
    ["/admin/users", GOTRUE_USERS],
    [
      "/profiles?",
      [{ id: "u1", display_name: "Stuhlsen", has_password: true, updated_at: "2026-09-01T00:00:00Z" }],
    ],
    ["/plan_cards?", [{ athlete_id: "u1", updated_at: "2026-09-15T00:00:00Z" }]],
    ["/athlete_sync_config?", [{ profile_id: "u1", updated_at: "2026-09-05T00:00:00Z" }]],
  ]);

  const result = await listAthletes(ENV, fetchImpl);
  assert.equal(result.ok, true);
  assert.deepEqual(result.athletes, [
    {
      id: "u1",
      email: "u1@example.com",
      displayName: "Stuhlsen",
      hasPassword: true,
      lastSignInAt: "2026-09-10T08:00:00Z",
      lastChangedAt: "2026-09-15T00:00:00Z",
      lastChangedArea: "Trainingsplan",
    },
  ]);
});

test("listAthletes: ohne plan_cards/athlete_sync_config faellt lastChanged auf profiles.updated_at zurueck", async () => {
  const fetchImpl = routedFetch([
    ["/admin/users", GOTRUE_USERS],
    [
      "/profiles?",
      [{ id: "u1", display_name: "Stuhlsen", has_password: false, updated_at: "2026-09-01T00:00:00Z" }],
    ],
    ["/plan_cards?", []],
    ["/athlete_sync_config?", []],
  ]);

  const result = await listAthletes(ENV, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.athletes[0].lastChangedAt, "2026-09-01T00:00:00Z");
  assert.equal(result.athletes[0].lastChangedArea, "Profil");
  assert.equal(result.athletes[0].hasPassword, false);
});

test("listAthletes: Profil ohne GoTrue-Treffer bekommt email/lastSignInAt null statt zu werfen", async () => {
  const fetchImpl = routedFetch([
    ["/admin/users", { users: [] }],
    [
      "/profiles?",
      [{ id: "u2", display_name: "bentastiic", has_password: true, updated_at: "2026-09-01T00:00:00Z" }],
    ],
    ["/plan_cards?", []],
    ["/athlete_sync_config?", []],
  ]);

  const result = await listAthletes(ENV, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.athletes[0].email, null);
  assert.equal(result.athletes[0].lastSignInAt, null);
});

test("listAthletes: 502 wenn GoTrue nicht erreichbar ist", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/admin/users")) throw new Error("connection refused");
    return { ok: true, status: 200, json: async () => [] };
  };

  const result = await listAthletes(ENV, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error.code, "NETWORK");
});

test("listAthletes: 502 wenn PostgREST einen Fehlerstatus liefert", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/admin/users")) return { ok: true, status: 200, json: async () => GOTRUE_USERS };
    return { ok: false, status: 500, json: async () => ({}) };
  };

  const result = await listAthletes(ENV, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error.code, "NETWORK");
});
