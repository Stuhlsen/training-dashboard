const test = require("node:test");
const assert = require("node:assert/strict");
const { listUsers, banUser, unbanUser, deleteUser, resendUserLink } = require("./users.js");

const ENV = {
  GOTRUE_INTERNAL_URL: "http://gotrue",
  POSTGREST_INTERNAL_URL: "http://postgrest",
  SUPABASE_SERVICE_ROLE_KEY: "srv-key",
};

// Verzweigt nach der aufgerufenen URL — listUsers ruft vier Endpunkte
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
  users: [{ id: "u1", email: "u1@example.com", last_sign_in_at: "2026-09-10T08:00:00Z", banned_until: null }],
};

test("listUsers: liefert alle Rollen (kein role=eq.athlete-Filter mehr), inkl. role/isAdmin/bannedUntil", async () => {
  const fetchImpl = routedFetch([
    [
      "/admin/users",
      {
        users: [
          { id: "u1", email: "u1@example.com", last_sign_in_at: "2026-09-10T08:00:00Z", banned_until: null },
          {
            id: "u2",
            email: "coach@example.com",
            last_sign_in_at: "2026-09-11T08:00:00Z",
            banned_until: "2126-01-01T00:00:00Z",
          },
        ],
      },
    ],
    [
      "/profiles?",
      [
        { id: "u1", display_name: "Stuhlsen", has_password: true, role: "athlete", is_admin: false, updated_at: "2026-09-01T00:00:00Z" },
        { id: "u2", display_name: "Coach", has_password: true, role: "coach", is_admin: true, updated_at: "2026-09-02T00:00:00Z" },
      ],
    ],
    ["/plan_cards?", [{ athlete_id: "u1", updated_at: "2026-09-15T00:00:00Z" }]],
    ["/athlete_sync_config?", [{ profile_id: "u1", updated_at: "2026-09-05T00:00:00Z" }]],
  ]);

  const result = await listUsers(ENV, fetchImpl);
  assert.equal(result.ok, true);
  assert.deepEqual(result.users, [
    {
      id: "u1",
      email: "u1@example.com",
      displayName: "Stuhlsen",
      role: "athlete",
      isAdmin: false,
      hasPassword: true,
      bannedUntil: null,
      lastSignInAt: "2026-09-10T08:00:00Z",
      lastChangedAt: "2026-09-15T00:00:00Z",
      lastChangedArea: "Trainingsplan",
    },
    {
      id: "u2",
      email: "coach@example.com",
      displayName: "Coach",
      role: "coach",
      isAdmin: true,
      hasPassword: true,
      bannedUntil: "2126-01-01T00:00:00Z",
      lastSignInAt: "2026-09-11T08:00:00Z",
      lastChangedAt: "2026-09-02T00:00:00Z",
      lastChangedArea: "Profil",
    },
  ]);
});

test("listUsers: Profil ohne GoTrue-Treffer bekommt email/lastSignInAt/bannedUntil null statt zu werfen", async () => {
  const fetchImpl = routedFetch([
    ["/admin/users", { users: [] }],
    [
      "/profiles?",
      [{ id: "u2", display_name: "bentastiic", has_password: true, role: "athlete", is_admin: false, updated_at: "2026-09-01T00:00:00Z" }],
    ],
    ["/plan_cards?", []],
    ["/athlete_sync_config?", []],
  ]);

  const result = await listUsers(ENV, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.users[0].email, null);
  assert.equal(result.users[0].lastSignInAt, null);
  assert.equal(result.users[0].bannedUntil, null);
});

test("listUsers: 502 wenn GoTrue nicht erreichbar ist", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/admin/users")) throw new Error("connection refused");
    return { ok: true, status: 200, json: async () => [] };
  };

  const result = await listUsers(ENV, fetchImpl);
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.error.code, "NETWORK");
});

test("banUser: PUT mit ban_duration setzt die Sperre und schreibt eine Audit-Zeile", async () => {
  const calls = [];
  const recordingFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const result = await banUser("u1", "admin-1", ENV, recordingFetch);
  assert.equal(result.ok, true);

  const banCall = calls.find((c) => c.url === "http://gotrue/admin/users/u1");
  assert.equal(banCall.options.method, "PUT");
  assert.deepEqual(JSON.parse(banCall.options.body), { ban_duration: "876000h" });

  const auditCall = calls.find((c) => c.url === "http://postgrest/admin_audit_log");
  assert.ok(auditCall, "keine Audit-Log-Zeile geschrieben");
  const auditBody = JSON.parse(auditCall.options.body);
  assert.equal(auditBody.actor_id, "admin-1");
  assert.equal(auditBody.target_user_id, "u1");
  assert.equal(auditBody.action, "ban");
});

test("banUser: 502 wenn GoTrue mit Fehlerstatus antwortet, keine Audit-Zeile", async () => {
  const calls = [];
  const recordingFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const result = await banUser("unbekannt", "admin-1", ENV, recordingFetch);
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(calls.some((c) => c.url === "http://postgrest/admin_audit_log"), false);
});

test("unbanUser: PUT mit ban_duration=none hebt die Sperre auf und schreibt eine Audit-Zeile", async () => {
  const calls = [];
  const recordingFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const result = await unbanUser("u1", "admin-1", ENV, recordingFetch);
  assert.equal(result.ok, true);

  const unbanCall = calls.find((c) => c.url === "http://gotrue/admin/users/u1");
  assert.deepEqual(JSON.parse(unbanCall.options.body), { ban_duration: "none" });

  const auditBody = JSON.parse(calls.find((c) => c.url === "http://postgrest/admin_audit_log").options.body);
  assert.equal(auditBody.action, "unban");
});

function deleteFetch(userEmail, { deleteOk = true, deleteStatus = 200, deleteBody = {} } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (url === `http://gotrue/admin/users/u1` && (!options || options.method === undefined)) {
      return { ok: true, status: 200, json: async () => ({ id: "u1", email: userEmail }) };
    }
    if (url.startsWith("http://postgrest/profiles?")) {
      return { ok: true, status: 200, json: async () => [{ display_name: "Stuhlsen", role: "athlete", is_admin: false }] };
    }
    if (url === `http://gotrue/admin/users/u1` && options?.method === "DELETE") {
      return { ok: deleteOk, status: deleteStatus, json: async () => deleteBody };
    }
    if (url === "http://postgrest/admin_audit_log") {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
  return { impl, calls };
}

test("deleteUser: falsche confirmEmail -> 400, kein DELETE-Call", async () => {
  const { impl, calls } = deleteFetch("u1@example.com");
  const result = await deleteUser("u1", "falsch@example.com", "admin-1", ENV, impl);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(
    calls.some((c) => c.options?.method === "DELETE"),
    false
  );
});

test("deleteUser: exakte confirmEmail (case-insensitiv/getrimmt) -> Erfolg + Audit-Zeile", async () => {
  const { impl, calls } = deleteFetch("u1@example.com");
  const result = await deleteUser("u1", "  U1@Example.com  ", "admin-1", ENV, impl);
  assert.equal(result.ok, true);

  const auditCall = calls.find((c) => c.url === "http://postgrest/admin_audit_log");
  const auditBody = JSON.parse(auditCall.options.body);
  assert.equal(auditBody.action, "delete");
  assert.equal(auditBody.target_email, "u1@example.com");
  assert.deepEqual(auditBody.details, { display_name: "Stuhlsen", role: "athlete", is_admin: false });
});

test("deleteUser: GoTrue-DELETE scheitert (z.B. Fremdschluessel-Konflikt) -> 409, keine Audit-Zeile", async () => {
  const { impl, calls } = deleteFetch("u1@example.com", {
    deleteOk: false,
    deleteStatus: 500,
    deleteBody: { msg: "foreign key violation" },
  });
  const result = await deleteUser("u1", "u1@example.com", "admin-1", ENV, impl);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error.message, /foreign key/);
  assert.equal(calls.some((c) => c.url === "http://postgrest/admin_audit_log"), false);
});

function resendFetch(hasPassword, email = "u1@example.com") {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("http://postgrest/profiles?")) {
      return { ok: true, status: 200, json: async () => [{ has_password: hasPassword }] };
    }
    if (url === "http://gotrue/admin/users/u1") {
      return { ok: true, status: 200, json: async () => ({ id: "u1", email }) };
    }
    if (url === "http://gotrue/admin/generate_link") {
      return { ok: true, status: 200, json: async () => ({ id: "u1", hashed_token: "tok123" }) };
    }
    if (url === "http://postgrest/admin_audit_log") {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    throw new Error(`unerwartete URL in Test: ${url}`);
  };
  return { impl, calls };
}

test("resendUserLink: has_password=false -> GoTrue-Aufruf trotzdem type recovery (invite scheitert fuer existierende Nutzer mit 422 email_exists), action resend_invite", async () => {
  const { impl, calls } = resendFetch(false);
  const result = await resendUserLink("u1", "admin-1", ENV, impl);
  assert.equal(result.ok, true);
  assert.equal(result.type, "recovery");
  assert.equal(result.hashedToken, "tok123");

  const genLinkCall = calls.find((c) => c.url === "http://gotrue/admin/generate_link");
  assert.deepEqual(JSON.parse(genLinkCall.options.body), { type: "recovery", email: "u1@example.com" });

  const auditBody = JSON.parse(calls.find((c) => c.url === "http://postgrest/admin_audit_log").options.body);
  assert.equal(auditBody.action, "resend_invite");
});

test("resendUserLink: has_password=true -> type recovery, action resend_recovery", async () => {
  const { impl, calls } = resendFetch(true);
  const result = await resendUserLink("u1", "admin-1", ENV, impl);
  assert.equal(result.ok, true);
  assert.equal(result.type, "recovery");

  const genLinkCall = calls.find((c) => c.url === "http://gotrue/admin/generate_link");
  assert.deepEqual(JSON.parse(genLinkCall.options.body), { type: "recovery", email: "u1@example.com" });

  const auditBody = JSON.parse(calls.find((c) => c.url === "http://postgrest/admin_audit_log").options.body);
  assert.equal(auditBody.action, "resend_recovery");
});
