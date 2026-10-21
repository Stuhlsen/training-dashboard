/* ============================================================
   DEMO/LIB/SEED-RUN.JS — Seed + Reset der lokalen Demo-DB
   (Fahrplan 31 E4, Verträge V1/V2/V4)

   runSeed:  Rechte-Check → Accounts (GoTrue-Admin) → "Passwort
             gesetzt" (Login + mark_password_set, E6) → Profile →
             Tabellen per PostgREST. Ergänzt (Q15): Tabellen mit
             Unique-Schlüssel per on_conflict + ignore-duplicates, die
             übrigen über einen fachlichen Schlüssel (vorhandene lesen,
             nur fehlende einfügen).
             Nachziehen (Review E4): Felder, die vom Datum "heute"
             abhängen, ändert der Seed an bestehenden Zeilen — aber NUR,
             solange die Zeile noch im Seed-Zustand ist (niemand hat sie
             angefasst): Karten-Status (geplant → ausgefallen),
             Rennergebnis (leer → Ergebnis), Zieldatum des FTP-Ziels,
             aktiver Plan (training_plans.is_active).
   runReset: löscht NUR die Accounts aus DEMO_ROSTER/DEMO_COACH — jede
             E-Mail läuft vorher durch assertDemoAccount. Die Zeilen fallen
             per "on delete cascade" (auth.users → profiles → Tabellen).
             Kein DELETE ohne ID-Filter, kein Tabellen-Leeren.

   Beide prüfen die Ziel-Sperre als erste Anweisung, vor dem Client.
   Voraussetzung im Stack: scripts/demo/grants.sql (Rechte für
   service_role nur auf diese Tabellen — keine Migration, nie apps01).
   ============================================================ */

import { assertDemoAccount, assertDemoTarget } from "./guards.js";
import { createDemoClient } from "./http.js";
import { DEMO_COACH, DEMO_PASSWORD, DEMO_ROSTER } from "./roster.js";
import { saveTrainingData } from "../../lib/training-store.js";

/** Zeilen je POST — PostgREST-Body bleibt klein. */
const CHUNK = 500;
/** Zeilen je GET-Seite — unabhängig von einem PostgREST-Zeilenlimit. */
const PAGE = 1000;
/** GoTrue-Admin-Liste: eine Seite reicht für einen lokalen Stack. */
const USERS_PER_PAGE = 1000;

/** Alle Demo-E-Mails, Athleten vor dem Trainer (Reset-Reihenfolge:
 *  profiles.coach_id hat kein "on delete cascade"). */
export function demoEmails() {
  const emails = [...DEMO_ROSTER.map((a) => a.email), DEMO_COACH.email];
  emails.forEach(assertDemoAccount);
  return emails;
}

/** `_`-Schlüssel (V4-Verweise) vor dem Schreiben entfernen. */
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")));
const eq = (v) => `eq.${encodeURIComponent(v)}`;

/** @returns {Promise<Map<string, string>>} E-Mail (klein) → User-ID */
async function listUsers(client) {
  const res = await client.request("GET", `/auth/v1/admin/users?page=1&per_page=${USERS_PER_PAGE}`);
  const users = Array.isArray(res?.users) ? res.users : [];
  return new Map(users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));
}

/** Bricht vor dem ersten Account ab, wenn grants.sql fehlt (coach_id
 *  ist nur über grants.sql lesbar) — sonst bliebe ein halber Stand. */
async function assertDemoGrants(client) {
  await client.request("GET", "/rest/v1/profiles?select=coach_id&limit=1");
}

/** Account anlegen, falls er fehlt. @returns {Promise<{ id: string, created: boolean }>} */
async function ensureUser(client, users, { email, displayName, role }) {
  assertDemoAccount(email);
  const known = users.get(email.toLowerCase());
  if (known) return { id: known, created: false };
  const user = await client.request("POST", "/auth/v1/admin/users", {
    body: {
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      role: "authenticated",
      user_metadata: { display_name: displayName, role },
    },
  });
  return { id: user.id, created: true };
}

/** Alle Zeilen einer Abfrage, seitenweise. */
async function getAll(client, table, query) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await client.request(
      "GET",
      `/rest/v1/${table}?${query}&order=id&limit=${PAGE}&offset=${offset}`
    );
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** Einfügen in Blöcken; liefert nur die wirklich neuen Zeilen zurück. */
async function insertRows(client, table, rows, { onConflict, select = "id" } = {}) {
  const out = [];
  const query = `?select=${select}${onConflict ? `&on_conflict=${onConflict}` : ""}`;
  const prefer = `${onConflict ? "resolution=ignore-duplicates," : ""}return=representation`;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await client.request("POST", `/rest/v1/${table}${query}`, {
      body: rows.slice(i, i + CHUNK),
      prefer,
    });
    out.push(...(res ?? []));
  }
  return out;
}

/** Eine Zeile eines Athleten ändern — immer mit ID- und Athleten-Filter. */
const patchRow = (client, table, id, profileId, body) =>
  client.request("PATCH", `/rest/v1/${table}?id=${eq(id)}&athlete_id=${eq(profileId)}`, { body });

/**
 * Vorhandene Zeilen lesen, nur die mit neuem fachlichem Schlüssel einfügen.
 * `refresh(dbRow, wanted)` liefert optional ein Patch für unberührte Zeilen.
 * @returns {Promise<{ all: object[], added: number, updated: number }>}
 */
async function addMissing(client, table, { profileId, select, keyOf, rows, refresh }) {
  const existing = await getAll(client, table, `athlete_id=${eq(profileId)}&select=${select}`);
  const have = new Set(existing.map(keyOf));
  const missing = rows.filter((r) => !have.has(keyOf(r)));
  const inserted = missing.length ? await insertRows(client, table, missing, { select }) : [];

  let updated = 0;
  if (refresh) {
    const wantedByKey = new Map(rows.map((r) => [keyOf(r), r]));
    for (const row of existing) {
      const wanted = wantedByKey.get(keyOf(row));
      const patch = wanted ? refresh(row, wanted) : null;
      if (!patch) continue;
      await patchRow(client, table, row.id, profileId, patch);
      Object.assign(row, patch);
      updated++;
    }
  }
  return { all: [...existing, ...inserted], added: inserted.length, updated };
}

/** Karte noch im Seed-Zustand (nicht verschoben, nicht bearbeitet)? */
const refreshCard = (db, want) =>
  db.status === "geplant" &&
  db.cancel_reason == null &&
  db.moved_from_date == null &&
  want.status !== "geplant"
    ? { status: want.status, cancel_reason: want.cancel_reason }
    : null;

/** Ergebnis nur eintragen, solange keines da ist. */
const refreshEvent = (db, want) =>
  db.result_time_s == null &&
  db.result_avg_watts == null &&
  (want.result_time_s != null || want.result_avg_watts != null)
    ? { result_time_s: want.result_time_s, result_avg_watts: want.result_avg_watts }
    : null;

/** Zieldatum nur nach vorn rücken, solange Wert und Notiz unverändert sind. */
const refreshGoal = (db, want) =>
  Number(db.target_value) === Number(want.target_value) &&
  db.note == null &&
  want.target_date != null &&
  (db.target_date == null || db.target_date < want.target_date)
    ? { target_date: want.target_date }
    : null;

/**
 * "Passwort gesetzt" markieren, sonst landet der Login im Onboarding-Schritt
 * "Passwort festlegen" (E6). Über den echten App-Weg statt eines neuen
 * Rechts: als der Demo-Account einloggen und mark_password_set aufrufen
 * (wirkt nur auf auth.uid()). Nur, solange has_password noch false ist.
 * @returns {Promise<number>} 1 = neu markiert, 0 = war schon gesetzt
 */
async function ensurePasswordMarked(client, profileId, email) {
  assertDemoAccount(email);
  const [profile] = await client.request(
    "GET",
    `/rest/v1/profiles?id=${eq(profileId)}&select=has_password`
  );
  if (!profile) throw new Error(`Profil zu ${email} fehlt (Trigger handle_new_user?)`);
  if (profile.has_password) return 0;
  await client.request("POST", "/rest/v1/rpc/mark_password_set", {
    body: {},
    bearer: await loginAs(client, email),
  });
  return 1;
}

/** Tokens je Client (= je Seed-Lauf): höchstens ein Login pro Account. */
const tokenCache = new WeakMap();

/** Als Demo-Account einloggen. @returns {Promise<string>} Access-Token */
async function loginAs(client, email) {
  assertDemoAccount(email);
  const tokens = tokenCache.get(client) ?? new Map();
  tokenCache.set(client, tokens);
  if (tokens.has(email)) return tokens.get(email);
  const session = await client.request("POST", "/auth/v1/token?grant_type=password", {
    body: { email, password: DEMO_PASSWORD },
    bearer: null,
  });
  if (!session?.access_token) throw new Error(`Login als ${email} lieferte kein Token`);
  tokens.set(email, session.access_token);
  return session.access_token;
}

/**
 * Profil-Grunddaten (E7): sonst fehlen Größe/Geburtsdatum für das
 * Ernährungsziel und HFmax gilt als geschätzt. Wie bei mark_password_set
 * über den eingeloggten Account (eigene Zeile, vorhandene Spaltenrechte) —
 * kein neues service_role-Recht. Nur leere Felder werden gefüllt.
 * @returns {Promise<number>} 1 = ergänzt, 0 = nichts zu tun
 */
async function ensureProfileBasics(client, profileId, athlete) {
  const token = await loginAs(client, athlete.email);
  const want = {
    birthdate: athlete.profile.birthdate,
    height_cm: athlete.profile.heightCm,
    sex: athlete.profile.sex,
    gender: athlete.profile.gender,
    weight_kg: athlete.weightKg,
    resting_hr: athlete.hrRest,
    hr_max: athlete.hrMax,
  };
  const [own] = await client.request(
    "GET",
    `/rest/v1/profiles_own?select=${Object.keys(want).join(",")}`,
    { bearer: token }
  );
  if (!own) throw new Error(`Eigenes Profil zu ${athlete.email} nicht lesbar`);
  const patch = Object.fromEntries(Object.entries(want).filter(([k]) => own[k] == null));
  if (Object.keys(patch).length === 0) return 0;
  await client.request("PATCH", `/rest/v1/profiles?id=${eq(profileId)}`, {
    body: patch,
    bearer: token,
  });
  return 1;
}

const sameSet = (a, b) =>
  Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));

/**
 * Profil: Trainer nur, solange keiner gesetzt ist; Sportarten nur direkt
 * nach dem Anlegen (danach gilt, was lokal eingestellt wurde).
 */
async function seedProfile(client, profileId, athlete, { coachId, created }) {
  const [profile] = await client.request(
    "GET",
    `/rest/v1/profiles?id=${eq(profileId)}&select=id,coach_id,sports`
  );
  if (!profile) throw new Error(`Profil zu ${athlete.email} fehlt (Trigger handle_new_user?)`);
  const patch = {};
  if (!profile.coach_id && coachId) patch.coach_id = coachId;
  if (created && !sameSet(profile.sports, athlete.sports)) patch.sports = athlete.sports;
  if (Object.keys(patch).length === 0) return 0;
  await client.request("PATCH", `/rest/v1/profiles?id=${eq(profileId)}`, { body: patch });
  return 1;
}

/**
 * Rollender Plan: je Sportart genau der Plan aktiv, den der Generator
 * aktiv setzt. Ist gerade ein Plan aktiv, der NICHT aus dem Seed stammt
 * (lokal angelegt), bleibt alles, wie es ist.
 * @returns {Promise<number>} Anzahl geänderter Zeilen
 */
async function rollActivePlans(client, profileId, planRows, plans, planKey) {
  const seededKeys = new Set(planRows.map(planKey));
  const idByKey = new Map(plans.map((p) => [planKey(p), p.id]));
  let changed = 0;
  for (const sport of new Set(planRows.map((r) => r.sport))) {
    const wanted = planRows.find((r) => r.sport === sport && r.is_active);
    const wantedId = wanted ? idByKey.get(planKey(wanted)) : null;
    const active = plans.filter((p) => p.sport === sport && p.is_active);
    if (active.some((p) => !seededKeys.has(planKey(p)))) continue;
    if (active.length === 1 && active[0].id === wantedId) continue;
    // Erst abschalten, dann einschalten — Unique-Index "ein aktiver Plan je Sportart".
    for (const p of active) {
      await patchRow(client, "training_plans", p.id, profileId, { is_active: false });
      changed++;
    }
    if (wantedId) {
      await patchRow(client, "training_plans", wantedId, profileId, { is_active: true });
      changed++;
    }
  }
  return changed;
}

/** Zeilen mit Unique-Schlüssel: on_conflict + ignore-duplicates. */
async function seedUniqueTables(client, profileId, rows) {
  const owner = (r) => ({ ...strip(r), athlete_id: profileId });
  const byProfile = (r) => ({ ...strip(r), profile_id: profileId });
  const specs = [
    ["athlete_sync_config", rows.athlete_sync_config.map(byProfile), "profile_id"],
    ["ftp_history", rows.ftp_history.map(byProfile), "profile_id,valid_from"],
    ["wellbeing", rows.wellbeing.map(owner), "athlete_id,date"],
  ];
  const counts = {};
  for (const [table, tableRows, onConflict] of specs) {
    const added = (await insertRows(client, table, tableRows, { onConflict })).length;
    counts[table] = { added, updated: 0 };
  }
  return counts;
}

const eventKey = (e) => `${e.event_date}|${e.title}`;
const planKey = (p) => `${p.sport}|${p.start_date}`;
/** Ohne plan_id: ein lokal gelöschter Plan hinterlässt Karten mit
 *  plan_id = null — die sollen nicht doppelt neu entstehen. Verschobene
 *  Karten behalten ihr Ursprungsdatum in moved_from_date. */
const cardKey = (c) => `${c.sport}|${c.sort_order}|${c.moved_from_date ?? c.planned_date}`;

/** Ziele + Rennen. @returns {Promise<{ counts: object, eventIdByRef: Map<string, string> }>} */
async function seedGoalsAndEvents(client, profileId, rows) {
  const owner = (r) => ({ ...strip(r), athlete_id: profileId });
  const goals = await addMissing(client, "goals", {
    profileId,
    select: "id,kind,target_value,target_date,note",
    keyOf: (g) => g.kind,
    rows: rows.goals.map(owner),
    refresh: refreshGoal,
  });
  const events = await addMissing(client, "events", {
    profileId,
    select: "id,event_date,title,result_time_s,result_avg_watts",
    keyOf: eventKey,
    rows: rows.events.map(owner),
    refresh: refreshEvent,
  });
  const idByKey = new Map(events.all.map((e) => [eventKey(e), e.id]));
  return {
    counts: {
      goals: { added: goals.added, updated: goals.updated },
      events: { added: events.added, updated: events.updated },
    },
    eventIdByRef: new Map(rows.events.map((e) => [e._ref, idByKey.get(eventKey(e))])),
  };
}

/** Pläne (inkl. rollendem aktivem Plan) + Karten. */
async function seedPlansAndCards(client, profileId, rows, eventIdByRef) {
  const owner = (r) => ({ ...strip(r), athlete_id: profileId });
  // Neue Pläne immer inaktiv anlegen, aktiv setzt sie danach rollActivePlans.
  const plans = await addMissing(client, "training_plans", {
    profileId,
    select: "id,sport,start_date,is_active",
    keyOf: planKey,
    rows: rows.training_plans.map((p) => ({
      ...owner(p),
      created_by: profileId,
      goal_event_id: eventIdByRef.get(p._goalEventRef) ?? null,
      is_active: false,
    })),
  });
  const rolled = await rollActivePlans(client, profileId, rows.training_plans, plans.all, planKey);
  const planIdByKey = new Map(plans.all.map((p) => [planKey(p), p.id]));
  const planIdByRef = new Map(
    rows.training_plans.map((p) => [p._ref, planIdByKey.get(planKey(p))])
  );

  const cards = await addMissing(client, "plan_cards", {
    profileId,
    select: "id,sport,sort_order,planned_date,moved_from_date,status,cancel_reason",
    keyOf: cardKey,
    rows: rows.plan_cards.map((c) => ({
      ...owner(c),
      plan_id: planIdByRef.get(c._planRef) ?? null,
    })),
    refresh: refreshCard,
  });
  return {
    training_plans: { added: plans.added, updated: rolled },
    plan_cards: { added: cards.added, updated: cards.updated },
  };
}

/**
 * training_*-Tabellen (Fahrplan 26 E2) mit dem Demo-Payload füllen. Wie der
 * Rest des Seeds ergänzend: Upsert je Fahrt/Tag, aber nie Löschen (kein
 * `window`). Läuft nur gegen das schon geprüfte localhost-Ziel.
 * @returns {Promise<{ added: number, updated: number }>}
 */
async function seedTrainingTables({ url, serviceKey, fetchImpl, profileId, payload }) {
  assertDemoTarget(url);
  const res = await saveTrainingData({ url, serviceKey, profileId, payload, fetchImpl });
  if (!res.ok) throw new Error(`training_*: ${res.error.code} — ${res.error.message}`);
  // Ein Upsert unterscheidet nicht zwischen neu und geändert — als "nachgezogen" melden.
  return { added: 0, updated: res.counts.rides + res.counts.wellness + 1 };
}

/**
 * @param {{ url: string, serviceKey: string, fetchImpl?: typeof fetch,
 *           rowsFor: (athlete: import("./roster.js").DemoAthlete) => Record<string, object[]>,
 *           payloadFor?: (athlete: import("./roster.js").DemoAthlete) => object }} opts
 *   `payloadFor` (optional): füllt zusätzlich training_rides/-wellness/-profile_data.
 * @returns {Promise<{ accountsCreated: number, profiles: number, passwordsMarked: number,
 *                     tables: Record<string, { added: number, updated: number }> }>}
 *   neu angelegte bzw. geänderte Einträge — beim zweiten Lauf am selben Tag überall 0
 */
export async function runSeed({ url, serviceKey, fetchImpl, rowsFor, payloadFor }) {
  assertDemoTarget(url);
  demoEmails();
  const client = createDemoClient({ url, serviceKey, fetchImpl });
  await assertDemoGrants(client);
  const users = await listUsers(client);
  const summary = { accountsCreated: 0, profiles: 0, passwordsMarked: 0, tables: {} };

  const coach = await ensureUser(client, users, {
    email: DEMO_COACH.email,
    displayName: DEMO_COACH.displayName,
    role: "coach",
  });
  summary.accountsCreated += Number(coach.created);
  summary.passwordsMarked += await ensurePasswordMarked(client, coach.id, DEMO_COACH.email);

  for (const athlete of DEMO_ROSTER) {
    const user = await ensureUser(client, users, {
      email: athlete.email,
      displayName: athlete.displayName,
      role: "athlete",
    });
    summary.accountsCreated += Number(user.created);
    summary.passwordsMarked += await ensurePasswordMarked(client, user.id, athlete.email);
    const coachId = DEMO_COACH.coachOf.includes(athlete.id) ? coach.id : null;
    summary.profiles += await seedProfile(client, user.id, athlete, {
      coachId,
      created: user.created,
    });
    summary.profiles += await ensureProfileBasics(client, user.id, athlete);

    const rows = rowsFor(athlete);
    const linked = await seedGoalsAndEvents(client, user.id, rows);
    const counts = {
      ...(await seedUniqueTables(client, user.id, rows)),
      ...linked.counts,
      ...(await seedPlansAndCards(client, user.id, rows, linked.eventIdByRef)),
      ...(payloadFor
        ? {
            training_data: await seedTrainingTables({
              url,
              serviceKey,
              fetchImpl,
              profileId: user.id,
              payload: payloadFor(athlete),
            }),
          }
        : {}),
    };
    for (const [table, { added, updated }] of Object.entries(counts)) {
      const sum = summary.tables[table] ?? { added: 0, updated: 0 };
      summary.tables[table] = { added: sum.added + added, updated: sum.updated + updated };
    }
  }
  return summary;
}

/**
 * @param {{ url: string, serviceKey: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<string[]>} gelöschte Demo-E-Mails
 */
export async function runReset({ url, serviceKey, fetchImpl }) {
  assertDemoTarget(url);
  const emails = demoEmails();
  const client = createDemoClient({ url, serviceKey, fetchImpl });
  const users = await listUsers(client);
  const deleted = [];
  for (const email of emails) {
    assertDemoAccount(email);
    const id = users.get(email.toLowerCase());
    if (!id) continue;
    await client.request("DELETE", `/auth/v1/admin/users/${encodeURIComponent(id)}`);
    deleted.push(email);
  }
  return deleted;
}
