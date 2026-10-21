/* Tests: Demo-Seed + Reset (scripts/demo/lib/seed-run.js, Fahrplan 31 E4).
   Gemocktes fetch gegen ein kleines Fake-Backend im Speicher
   (GoTrue-Admin + PostgREST): Sperre vor dem ersten Request, Reset nur
   für @demo.local-Accounts der Besetzung, Upsert ergänzt nur. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { runReset, runSeed } from "../scripts/demo/lib/seed-run.js";
import { DEMO_COACH, DEMO_ROSTER } from "../scripts/demo/lib/roster.js";

const { Response } = globalThis;
const URL_OK = "http://localhost:8000";
const KEY = "test-service-key-not-real";

const UNIQUE = {
  athlete_sync_config: ["profile_id"],
  ftp_history: ["profile_id", "valid_from"],
  wellbeing: ["athlete_id", "date"],
};
const TABLES = [
  "athlete_sync_config",
  "ftp_history",
  "wellbeing",
  "goals",
  "events",
  "training_plans",
  "plan_cards",
];

/** Fake-Backend: hält Users/Profile/Tabellen, protokolliert jeden Request.
 *  maxRows kappt jede GET-Antwort wie PGRST_DB_MAX_ROWS; withoutGrants
 *  simuliert einen Stack ohne scripts/demo/grants.sql. */
const newProfile = (id) => ({ id, coach_id: null, sports: ["ride"], has_password: false });

function fakeBackend({ users = [], maxRows = Infinity, withoutGrants = false } = {}) {
  let n = 0;
  const uid = () => `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
  const db = {
    users: [...users],
    profiles: new Map(users.map((u) => [u.id, newProfile(u.id)])),
    tables: Object.fromEntries(TABLES.map((t) => [t, []])),
  };
  const calls = [];
  const res = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const eqParam = (u, name) => u.searchParams.get(name)?.replace(/^eq\./, "");
  const owns = (row, id) => row.athlete_id === id || row.profile_id === id;

  function insert(table, rows, prefer) {
    const out = [];
    for (const row of rows) {
      const keys = UNIQUE[table];
      const clash = keys && db.tables[table].some((r) => keys.every((k) => r[k] === row[k]));
      if (clash) {
        if (!prefer?.includes("ignore-duplicates")) return res(409, { code: "23505" });
        continue;
      }
      if (
        table === "training_plans" &&
        row.is_active &&
        db.tables.training_plans.some(
          (p) => p.athlete_id === row.athlete_id && p.sport === row.sport && p.is_active
        )
      ) {
        return res(409, { code: "23505", message: "training_plans_one_active" });
      }
      const stored = { id: uid(), ...row };
      db.tables[table].push(stored);
      out.push(stored);
    }
    return res(201, out);
  }

  async function fetchImpl(url, init) {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({
      method: init.method,
      path: u.pathname,
      search: u.search,
      prefer: init.headers.Prefer,
      auth: init.headers.Authorization,
      body,
    });
    const { method } = init;

    if (u.pathname === "/auth/v1/admin/users") {
      if (method === "GET") return res(200, { users: db.users });
      const user = { id: uid(), email: body.email };
      db.users.push(user);
      db.profiles.set(user.id, newProfile(user.id));
      return res(200, user);
    }
    if (u.pathname === "/auth/v1/token" && method === "POST") {
      const user = db.users.find((x) => x.email === body.email);
      return user ? res(200, { access_token: `user-token:${user.id}` }) : res(400, {});
    }
    if (u.pathname === "/rest/v1/rpc/mark_password_set" && method === "POST") {
      // wie die echte RPC: wirkt nur auf den eingeloggten Account (auth.uid())
      const id = init.headers.Authorization?.replace(/^Bearer user-token:/, "");
      const p = db.profiles.get(id);
      if (!p) return res(401, {});
      p.has_password = true;
      return res(204);
    }
    if (u.pathname.startsWith("/auth/v1/admin/users/") && method === "DELETE") {
      const id = decodeURIComponent(u.pathname.split("/").pop());
      db.users = db.users.filter((x) => x.id !== id);
      db.profiles.delete(id);
      for (const t of TABLES) db.tables[t] = db.tables[t].filter((r) => !owns(r, id));
      return res(200, {});
    }
    const table = u.pathname.replace("/rest/v1/", "");
    if (table === "profiles_own" && method === "GET") {
      // wie die echte View: nur die eigene Zeile (auth.uid())
      const id = init.headers.Authorization?.replace(/^Bearer user-token:/, "");
      const p = db.profiles.get(id);
      return res(200, p ? [p] : []);
    }
    if (table === "profiles") {
      if (withoutGrants && u.searchParams.get("select")?.includes("coach_id")) {
        return res(403, { code: "42501", message: "permission denied for table profiles" });
      }
      const p = db.profiles.get(eqParam(u, "id"));
      if (method === "GET") return res(200, p ? [p] : []);
      Object.assign(p, body);
      return res(204);
    }
    if (method === "GET") {
      const id = eqParam(u, "athlete_id");
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? Infinity), maxRows);
      const rows = db.tables[table].filter((r) => r.athlete_id === id);
      return res(200, rows.slice(offset, offset + limit));
    }
    if (method === "POST") return insert(table, body, init.headers.Prefer);
    if (method === "PATCH") {
      const row = db.tables[table].find(
        (r) => r.id === eqParam(u, "id") && r.athlete_id === eqParam(u, "athlete_id")
      );
      if (row) Object.assign(row, body);
      return res(204);
    }
    return res(404, {});
  }
  return { db, calls, fetchImpl };
}

/** Kleine, feste Zeilen im V4-Format (mit _-Verweisen). */
function rowsFor(athlete) {
  const sport = athlete.sports[0];
  return {
    athlete_sync_config: [{ interval_cadence_target: 88 }],
    ftp_history: [{ ftp_watt: 200, valid_from: "2026-01-05", source: "ramp-test", note: null }],
    wellbeing: [
      { date: "2026-10-18", energy: 3, muscle_feel: 3, mood: 4, note: null },
      { date: "2026-10-19", energy: 4, muscle_feel: 3, mood: 4, note: null },
    ],
    goals: [{ kind: "FTP", target_value: 230, target_date: null, note: null, is_active: true }],
    events: [
      {
        _ref: "race-2026-09-27",
        title: "Rennen A",
        event_date: "2026-09-27",
        type: "race",
        priority: "secondary",
      },
      {
        _ref: "race-2026-12-20",
        title: "Rennen B",
        event_date: "2026-12-20",
        type: "race",
        priority: "main",
      },
    ],
    training_plans: [
      {
        _ref: "p1",
        _goalEventRef: "race-2026-09-27",
        sport,
        start_date: "2026-07-06",
        is_active: false,
      },
      {
        _ref: "p2",
        _goalEventRef: "race-2026-12-20",
        sport,
        start_date: "2026-09-28",
        is_active: true,
      },
    ],
    plan_cards: [
      {
        _planRef: "p2",
        planned_date: "2026-10-21",
        sort_order: 0,
        sport,
        title: "Z2",
        status: "geplant",
      },
      {
        _planRef: "p2",
        planned_date: "2026-10-22",
        sort_order: 0,
        sport,
        title: "VO2",
        status: "geplant",
      },
    ],
  };
}

const demoUserIds = (db) => db.users.map((u) => u.id);

// ── Sperre vor dem ersten Request ────────────────────────────

test("Seed: fremdes Ziel wirft, bevor fetch auch nur einmal läuft", async () => {
  for (const url of ["https://abc.supabase.co", "https://example.com", "", undefined]) {
    const { calls, fetchImpl } = fakeBackend();
    await assert.rejects(runSeed({ url, serviceKey: KEY, fetchImpl, rowsFor }), /Demo-Sperre/);
    assert.equal(calls.length, 0, String(url));
  }
});

test("Reset: fremdes Ziel wirft, bevor fetch auch nur einmal läuft", async () => {
  const { calls, fetchImpl } = fakeBackend();
  await assert.rejects(
    runReset({ url: "https://abc.supabase.co", serviceKey: KEY, fetchImpl }),
    /Demo-Sperre/
  );
  assert.equal(calls.length, 0);
});

test("Seed: fehlender Key wirft vor dem ersten Request", async () => {
  const { calls, fetchImpl } = fakeBackend();
  await assert.rejects(runSeed({ url: URL_OK, serviceKey: "", fetchImpl, rowsFor }), /KEY fehlt/);
  assert.equal(calls.length, 0);
});

test("Fehlermeldungen enthalten nie den service_role-Key", async () => {
  const fetchImpl = async () => new Response('{"code":"42501"}', { status: 403 });
  await assert.rejects(runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor }), (err) => {
    assert.ok(!err.message.includes(KEY));
    assert.match(err.message, /grants\.sql/);
    return true;
  });
});

// ── Seed ─────────────────────────────────────────────────────

test("Seed: legt Accounts mit role authenticated an und verknüpft den Trainer", async () => {
  const { db, calls, fetchImpl } = fakeBackend();
  const summary = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  assert.equal(summary.accountsCreated, 3);
  const created = calls.filter((c) => c.method === "POST" && c.path === "/auth/v1/admin/users");
  for (const c of created) {
    assert.equal(c.body.role, "authenticated");
    assert.equal(c.body.email_confirm, true);
    assert.match(c.body.email, /@demo\.local$/);
  }
  const coachId = db.users.find((u) => u.email === DEMO_COACH.email).id;
  for (const a of DEMO_ROSTER) {
    const id = db.users.find((u) => u.email === a.email).id;
    assert.equal(db.profiles.get(id).coach_id, coachId);
    assert.deepEqual(db.profiles.get(id).sports, a.sports);
  }
});

test("Seed: payloadFor füllt training_*-Tabellen je Demo-Profil — nur Upsert, nie Löschen (Fahrplan 26 E2)", async () => {
  const be = fakeBackend();
  const training = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const m = u.pathname.match(/^\/rest\/v1\/(training_(?:rides|wellness|profile_data))$/);
    if (!m) return be.fetchImpl(url, init);
    training.push({
      method: init.method,
      table: m[1],
      auth: init.headers.Authorization,
      body: JSON.parse(init.body ?? "null"),
    });
    return new Response(null, { status: 201 });
  };
  const payloadFor = () => ({
    ftpPublic: true,
    rides: [{ date: "2026-10-01", activityId: "demo-1" }],
    wellness: [{ date: "2026-10-01", hrv: 60 }],
  });
  const summary = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor, payloadFor });

  const ids = DEMO_ROSTER.map((a) => be.db.users.find((u) => u.email === a.email).id);
  assert.deepEqual([...new Set(training.map((t) => t.body[0].profile_id))].sort(), [...ids].sort());
  assert.deepEqual([...new Set(training.map((t) => t.table))].sort(), [
    "training_profile_data",
    "training_rides",
    "training_wellness",
  ]);
  assert.ok(
    training.every((t) => t.method === "POST"),
    "kein Löschen/Lesen auf training_*"
  );
  assert.ok(training.every((t) => t.auth === `Bearer ${KEY}`));
  assert.equal(summary.tables.training_data.updated, DEMO_ROSTER.length * 3);
});

test("Seed: ohne payloadFor bleiben die training_*-Tabellen unberührt", async () => {
  const be = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl: be.fetchImpl, rowsFor });
  assert.ok(!be.calls.some((c) => /training_(rides|wellness|profile_data)/.test(c.path)));
});

test("Seed: übersetzt _-Verweise in Fremdschlüssel und entfernt sie", async () => {
  const { db, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  for (const t of TABLES) {
    for (const row of db.tables[t]) {
      assert.ok(!Object.keys(row).some((k) => k.startsWith("_")), `${t} trägt _-Schlüssel`);
    }
  }
  for (const id of demoUserIds(db)) {
    const plan = db.tables.training_plans.find(
      (p) => p.athlete_id === id && p.start_date === "2026-09-28"
    );
    if (!plan) continue; // Trainer hat keine Zeilen
    assert.equal(db.tables.events.find((e) => e.id === plan.goal_event_id).title, "Rennen B");
    assert.equal(plan.created_by, id);
    assert.ok(
      db.tables.plan_cards.filter((c) => c.athlete_id === id).every((c) => c.plan_id === plan.id)
    );
    assert.equal(
      db.tables.training_plans.filter((p) => p.athlete_id === id && p.is_active).length,
      1
    );
  }
});

test("Upsert ergänzt nur: zweiter Lauf ändert nichts, lokale Änderungen bleiben", async () => {
  const { db, calls, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  // Lokale Änderungen wie in der App
  const card = db.tables.plan_cards[0];
  card.moved_from_date = card.planned_date;
  card.planned_date = "2026-10-25";
  card.status = "erledigt";
  db.tables.wellbeing[0].note = "lokal";
  const snapshot = JSON.parse(JSON.stringify(db.tables));

  calls.length = 0;
  const second = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  assert.equal(second.accountsCreated, 0);
  assert.equal(second.profiles, 0);
  assert.ok(
    Object.values(second.tables).every((v) => v.added === 0 && v.updated === 0),
    JSON.stringify(second.tables)
  );
  assert.deepEqual(db.tables, snapshot);
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
  for (const c of calls.filter((x) => x.method === "POST" && x.search.includes("on_conflict"))) {
    assert.match(c.prefer, /resolution=ignore-duplicates/);
    assert.doesNotMatch(c.prefer, /merge-duplicates/);
  }
});

test("Rollender Plan: neuer Zyklus wird aktiv, ein lokal aktiver Plan bleibt unberührt", async () => {
  const { db, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  // Zeit vergeht: der Generator setzt nun p3 aktiv
  const later = (athlete) => {
    const rows = rowsFor(athlete);
    const sport = athlete.sports[0];
    rows.training_plans = [
      ...rows.training_plans.map((p) => ({ ...p, is_active: false })),
      {
        _ref: "p3",
        _goalEventRef: "race-2026-12-20",
        sport,
        start_date: "2026-12-21",
        is_active: true,
      },
    ];
    return rows;
  };
  const lena = db.users.find((u) => u.email === DEMO_ROSTER[0].email).id;
  const jonas = db.users.find((u) => u.email === DEMO_ROSTER[1].email).id;
  // jonas hat lokal einen eigenen Plan aktiv gesetzt
  for (const p of db.tables.training_plans.filter((x) => x.athlete_id === jonas))
    p.is_active = false;
  db.tables.training_plans.push({
    id: "eigener-plan",
    athlete_id: jonas,
    sport: "ride",
    start_date: "2026-10-01",
    is_active: true,
  });

  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor: later });

  const activeOf = (id) =>
    db.tables.training_plans.filter(
      (p) => p.athlete_id === id && p.sport === "ride" && p.is_active
    );
  assert.deepEqual(
    activeOf(lena).map((p) => p.start_date),
    ["2026-12-21"]
  );
  assert.deepEqual(
    activeOf(jonas).map((p) => p.id),
    ["eigener-plan"]
  );
});

test("Nachziehen: nur unberührte Zeilen bekommen Status, Ergebnis und Zieldatum", async () => {
  const { db, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  const lena = db.users.find((u) => u.email === DEMO_ROSTER[0].email).id;
  const ofLena = (t) => db.tables[t].filter((r) => r.athlete_id === lena);

  // Lokal: Karte vom 22.10. erledigt, Ergebnis für Rennen B von Hand
  ofLena("plan_cards").find((c) => c.planned_date === "2026-10-22").status = "erledigt";
  ofLena("events").find((e) => e.title === "Rennen B").result_time_s = 4000;

  // Später: beide Karten ausgelassen, beide Rennen vorbei, neues Zieldatum
  const later = (athlete) => {
    const rows = rowsFor(athlete);
    rows.plan_cards = rows.plan_cards.map((c) => ({
      ...c,
      status: "ausgefallen",
      cancel_reason: "Krank",
    }));
    rows.events = rows.events.map((e) => ({ ...e, result_time_s: 3600, result_avg_watts: 210 }));
    rows.goals = rows.goals.map((g) => ({ ...g, target_date: "2027-03-01" }));
    return rows;
  };
  const summary = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor: later });

  const card = (d) => ofLena("plan_cards").find((c) => c.planned_date === d);
  assert.deepEqual(
    [card("2026-10-21").status, card("2026-10-21").cancel_reason],
    ["ausgefallen", "Krank"]
  );
  assert.equal(card("2026-10-22").status, "erledigt");
  const event = (t) => ofLena("events").find((e) => e.title === t);
  assert.equal(event("Rennen A").result_time_s, 3600);
  assert.deepEqual(
    [event("Rennen B").result_time_s, event("Rennen B").result_avg_watts],
    [4000, undefined]
  );
  assert.equal(ofLena("goals")[0].target_date, "2027-03-01");
  assert.equal(summary.tables.plan_cards.added, 0);
});

test("Lokal gelöschter Plan: Plan kommt wieder, Karten nicht doppelt", async () => {
  const { db, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  const before = db.tables.plan_cards.length;
  // Plan löschen wie in Postgres: Karten behalten sich, plan_id → null
  const gone = db.tables.training_plans.find((p) => p.start_date === "2026-09-28");
  db.tables.training_plans = db.tables.training_plans.filter((p) => p !== gone);
  for (const c of db.tables.plan_cards) if (c.plan_id === gone.id) c.plan_id = null;

  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  assert.equal(db.tables.plan_cards.length, before);
});

test("Zeilenlimit: vorhandene Zeilen werden seitenweise gelesen, nichts doppelt", async () => {
  const { db, fetchImpl } = fakeBackend({ maxRows: 1000 });
  const many = (athlete) => {
    const rows = rowsFor(athlete);
    const sport = athlete.sports[0];
    rows.plan_cards = Array.from({ length: 1200 }, (_, i) => ({
      _planRef: "p2",
      planned_date: `2027-01-01#${i}`,
      sort_order: 0,
      sport,
      title: "Z2",
      status: "geplant",
    }));
    return rows;
  };
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor: many });
  const second = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor: many });
  assert.equal(second.tables.plan_cards.added, 0);
  assert.equal(db.tables.plan_cards.length, 2400);
});

test("Sportarten: nur beim Anlegen gesetzt, lokale Änderung bleibt", async () => {
  const { db, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  const jonas = db.users.find((u) => u.email === DEMO_ROSTER[1].email).id;
  assert.deepEqual(db.profiles.get(jonas).sports, ["ride", "run", "swim"]);
  db.profiles.get(jonas).sports = ["ride"];
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  assert.deepEqual(db.profiles.get(jonas).sports, ["ride"]);
});

test("Ohne grants.sql: Abbruch mit Hinweis, bevor ein Account entsteht", async () => {
  const { db, calls, fetchImpl } = fakeBackend({ withoutGrants: true });
  await assert.rejects(
    runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor }),
    /grants\.sql/
  );
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  assert.equal(db.users.length, 0);
});

test("Netzwerkfehler nennen Methode und Pfad, nie den Key", async () => {
  const fetchImpl = async () => {
    throw new Error("connect ECONNREFUSED");
  };
  await assert.rejects(runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor }), (err) => {
    assert.match(err.message, /^GET \/rest\/v1\/profiles: connect ECONNREFUSED$/);
    assert.ok(!err.message.includes(KEY));
    return true;
  });
});

test("Passwort: jeder Demo-Account wird als eingeloggter User markiert, nur einmal", async () => {
  const { db, calls, fetchImpl } = fakeBackend();
  const first = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  assert.equal(first.passwordsMarked, 3);
  assert.ok([...db.profiles.values()].every((p) => p.has_password === true));
  const logins = calls.filter((c) => c.path === "/auth/v1/token");
  assert.equal(logins.length, 3);
  assert.ok(logins.every((c) => c.auth === undefined && c.body.email.endsWith("@demo.local")));
  const rpcs = calls.filter((c) => c.path === "/rest/v1/rpc/mark_password_set");
  assert.ok(rpcs.every((c) => c.auth.startsWith("Bearer user-token:")));

  calls.length = 0;
  const second = await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  assert.equal(second.passwordsMarked, 0);
  assert.equal(calls.filter((c) => c.path === "/rest/v1/rpc/mark_password_set").length, 0);
  // Nur noch der Profil-Check (E7) loggt die Athleten ein — der Trainer nicht.
  assert.deepEqual(
    calls.filter((c) => c.path === "/auth/v1/token").map((c) => c.body.email),
    DEMO_ROSTER.map((a) => a.email)
  );
});

test("Profil-Grunddaten (E7): nur leere Felder, als eingeloggter Athlet", async () => {
  const { db, calls, fetchImpl } = fakeBackend();
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  const byEmail = new Map(db.users.map((u) => [u.email, db.profiles.get(u.id)]));
  for (const a of DEMO_ROSTER) {
    const p = byEmail.get(a.email);
    assert.equal(p.birthdate, a.profile.birthdate);
    assert.equal(p.height_cm, a.profile.heightCm);
    assert.equal(p.sex, a.profile.sex);
    assert.equal(p.hr_max, a.hrMax);
    assert.equal(p.weight_kg, a.weightKg);
  }
  const coach = byEmail.get(DEMO_COACH.email);
  assert.equal(coach.birthdate, undefined, "Trainer bekommt keine Athleten-Grunddaten");
  const patches = calls.filter((c) => c.method === "PATCH" && c.body?.birthdate);
  assert.ok(patches.every((c) => c.auth.startsWith("Bearer user-token:")));

  // Lokal geänderter Wert bleibt, zweiter Lauf patcht nichts mehr.
  byEmail.get(DEMO_ROSTER[0].email).height_cm = 170;
  calls.length = 0;
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });
  assert.equal(byEmail.get(DEMO_ROSTER[0].email).height_cm, 170);
  assert.equal(calls.filter((c) => c.method === "PATCH" && c.body?.birthdate).length, 0);
});

// ── Reset ────────────────────────────────────────────────────

test("Reset: löscht nur die @demo.local-Accounts der Besetzung, Athleten vor Trainer", async () => {
  const foreign = [
    { id: "real-1", email: "someone@example.com" },
    { id: "real-2", email: "lena.rides@demo.local.example.com" },
    { id: "other-demo", email: "fremd@demo.local" },
  ];
  const { db, calls, fetchImpl } = fakeBackend({ users: foreign });
  db.tables.wellbeing.push({ id: "w-real", athlete_id: "real-1", date: "2026-10-01" });
  await runSeed({ url: URL_OK, serviceKey: KEY, fetchImpl, rowsFor });

  calls.length = 0;
  const deleted = await runReset({ url: URL_OK, serviceKey: KEY, fetchImpl });

  assert.deepEqual(deleted, [...DEMO_ROSTER.map((a) => a.email), DEMO_COACH.email]);
  const deletes = calls.filter((c) => c.method === "DELETE");
  assert.equal(deletes.length, 3);
  assert.ok(deletes.every((c) => c.path.startsWith("/auth/v1/admin/users/")));
  assert.deepEqual(
    db.users.map((u) => u.id),
    foreign.map((u) => u.id)
  );
  assert.deepEqual(
    db.tables.wellbeing.map((r) => r.id),
    ["w-real"]
  );
});

test("Reset ohne Demo-Accounts löscht nichts", async () => {
  const { calls, fetchImpl } = fakeBackend({ users: [{ id: "real-1", email: "a@example.com" }] });
  const deleted = await runReset({ url: URL_OK, serviceKey: KEY, fetchImpl });
  assert.deepEqual(deleted, []);
  assert.equal(calls.filter((c) => c.method === "DELETE").length, 0);
});
