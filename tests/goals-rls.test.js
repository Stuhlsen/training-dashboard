/* Tests: goals-Katalogfelder (goal_key, role) + RLS (Fahrplan 43 E1, Migration 0084)
   GEGEN EINEN ECHTEN Supabase-Stack (kein Mock) — gedacht für den LOKALEN
   Demo-Stack (npm run demo:up), nie für Produktion.

   Läuft nur gegen localhost und mit Credentials (wie tests/supabase-rls.test.js): SUPABASE_URL,
   SUPABASE_ANON_KEY, SUPABASE_ATHLETE1_EMAIL/_PASSWORD (Athlet) und
   SUPABASE_TRAINER_EMAIL/_PASSWORD (dessen Trainer). Fehlen sie, überspringt
   sich die Datei. Lokal gegen den Demo-Stack die Werte aus .env.demo setzen
   (URL http://localhost:8000, Demo-Logins aus AGENTS.md).

   Bestehende aktive Haupt-/Nebenziele (Demo-Seed, Backfill) zählen für den
   Unique-Index mit; der Frei-werden-Test schaltet sie kurz aus und danach wieder ein.
   Jede Testzeile räumt sich im after()-Hook selbst auf (Athlet löscht). */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ENV } from "../scripts/lib/env.js";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = ENV;
const { SUPABASE_ATHLETE1_EMAIL, SUPABASE_ATHLETE1_PASSWORD } = ENV;
const { SUPABASE_TRAINER_EMAIL, SUPABASE_TRAINER_PASSWORD } = ENV;

// Schreibt Testzeilen — deshalb nur gegen einen lokalen Stack, nie gegen Cloud/Produktion.
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SUPABASE_URL ?? "");

const HAS_CREDS = !!(
  IS_LOCAL &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_ATHLETE1_EMAIL &&
  SUPABASE_ATHLETE1_PASSWORD &&
  SUPABASE_TRAINER_EMAIL &&
  SUPABASE_TRAINER_PASSWORD
);

const GOAL_KEYS = [
  "ausdauer",
  "ftp",
  "fett_verlieren",
  "bergauf",
  "muskeln_kraft",
  "event",
  "laufen_starten",
  "fit_bleiben",
  "wiedereinstieg",
  "sonstiges",
];

if (!HAS_CREDS) {
  test("goals-rls: übersprungen (keine Credentials)", { skip: "SUPABASE_URL ist nicht localhost oder Credentials fehlen — nur gegen den lokalen Demo-Stack" }, () => {});
} else {
  async function signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login fehlgeschlagen (HTTP ${res.status})`);
    const json = await res.json();
    return { token: json.access_token, userId: json.user.id };
  }

  /** PATCH/DELETE, das RLS blockiert, liefert 200 mit data: [] — nie nur .ok prüfen. */
  async function rest(method, tablePath, { token = null, body } = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePath}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  let athlete;
  let trainer;
  let coachLinkOk = false;
  const createdIds = [];

  async function addGoal(fields, token = athlete.token) {
    const res = await rest("POST", "goals", {
      token,
      body: { athlete_id: athlete.userId, kind: "RLS-Test", ...fields },
    });
    if (res.ok && res.data?.[0]?.id) createdIds.push(res.data[0].id);
    return res;
  }

  before(async () => {
    athlete = await signIn(SUPABASE_ATHLETE1_EMAIL, SUPABASE_ATHLETE1_PASSWORD);
    trainer = await signIn(SUPABASE_TRAINER_EMAIL, SUPABASE_TRAINER_PASSWORD);
    const link = await rest("GET", `profiles_visible?id=eq.${athlete.userId}&select=coach_id`, {
      token: athlete.token,
    });
    // coach_id steht seit 0022 nur über die View profiles_visible (eigene Zeile).
    coachLinkOk = link.data?.[0]?.coach_id === trainer.userId;
  });

  after(async () => {
    const leftovers = [];
    for (const id of createdIds) {
      const del = await rest("DELETE", `goals?id=eq.${id}`, { token: athlete.token });
      if (!del.ok) leftovers.push(id);
    }
    if (leftovers.length) throw new Error(`goals-Testzeilen nicht gelöscht: ${leftovers.join(", ")}`);
  });

  test("goals: alle Katalogschlüssel sind als goal_key erlaubt", async () => {
    for (const key of GOAL_KEYS) {
      const res = await addGoal({ goal_key: key, is_active: false });
      assert.ok(res.ok, `goal_key ${key} abgelehnt: ${JSON.stringify(res.data)}`);
    }
  });

  test("goals: unbekannter goal_key scheitert am Check", async () => {
    const res = await addGoal({ goal_key: "mondflug", is_active: false });
    assert.equal(res.ok, false);
  });

  test("goals: unbekannte role scheitert am Check", async () => {
    const res = await addGoal({ goal_key: "ftp", role: "extra", is_active: false });
    assert.equal(res.ok, false);
  });

  test("goals: Altzeilen ohne goal_key/role bleiben erlaubt, auch mehrfach aktiv", async () => {
    const a = await addGoal({ kind: "Altziel A" });
    const b = await addGoal({ kind: "Altziel B" });
    assert.ok(a.ok && b.ok, "Zeilen ohne goal_key/role müssen weiter gehen");
    assert.equal(a.data[0].goal_key, null);
    assert.equal(a.data[0].role, null);
  });

  test("goals: je Athlet höchstens ein aktives main und ein aktives side (Unique-Index)", async () => {
    // Bestand des Athleten (z. B. Demo-Seed) zählt mit: ist der Platz belegt,
    // muss schon der erste Insert scheitern — sonst legen wir die Rolle an.
    for (const [role, key, other] of [
      ["main", "ftp", "ausdauer"],
      ["side", "bergauf", "event"],
    ]) {
      const taken = await rest(
        "GET",
        `goals?athlete_id=eq.${athlete.userId}&is_active=eq.true&role=eq.${role}&select=id`,
        { token: athlete.token }
      );
      if (taken.data.length === 0) {
        const first = await addGoal({ goal_key: key, role });
        assert.ok(first.ok, `${role} abgelehnt: ${JSON.stringify(first.data)}`);
      }
      const second = await addGoal({ goal_key: other, role });
      assert.equal(second.ok, false, `zweites aktives ${role} muss scheitern`);
      assert.equal(second.data?.code, "23505");
    }
  });

  test("goals: main und side dürfen nebeneinander bestehen, Deaktivieren gibt den Platz frei", async () => {
    // Bestand (z. B. Demo-Seed/Backfill) wird kurz deaktiviert und im finally
    // wieder aktiviert — erst NACH dem Löschen der Testzeilen, sonst Index-Konflikt.
    const existing = await rest(
      "GET",
      `goals?athlete_id=eq.${athlete.userId}&is_active=eq.true&role=not.is.null&select=id`,
      { token: athlete.token }
    );
    const existingIds = existing.data.map((g) => g.id);
    const setActive = (ids, value) =>
      Promise.all(
        ids.map((id) =>
          rest("PATCH", `goals?id=eq.${id}`, { token: athlete.token, body: { is_active: value } })
        )
      );
    const ownIds = [];
    try {
      await setActive(existingIds, false);
      const main = await addGoal({ goal_key: "ftp", role: "main" });
      const side = await addGoal({ goal_key: "bergauf", role: "side" });
      assert.ok(main.ok && side.ok, "main und side müssen zusammen gehen");
      ownIds.push(main.data[0].id, side.data[0].id);
      const off = await rest("PATCH", `goals?id=eq.${main.data[0].id}`, {
        token: athlete.token,
        body: { is_active: false },
      });
      assert.equal(off.data.length, 1);
      const replacement = await addGoal({ goal_key: "ausdauer", role: "main" });
      assert.ok(replacement.ok, "nach Deaktivieren ist ein neues main erlaubt");
      ownIds.push(replacement.data[0].id);
    } finally {
      for (const id of ownIds) await rest("DELETE", `goals?id=eq.${id}`, { token: athlete.token });
      const restored = await setActive(existingIds, true);
      assert.ok(restored.every((r) => r.ok && r.data.length === 1), "Bestand nicht wiederhergestellt");
    }
  });

  test("goals: Athlet schreibt nur für sich selbst (WITH CHECK)", async () => {
    const res = await rest("POST", "goals", {
      token: athlete.token,
      body: { athlete_id: trainer.userId, kind: "RLS-Test fremd" },
    });
    assert.equal(res.ok, false);
  });

  test("goals: Trainer darf Ziele des Athleten lesen", async (t) => {
    if (!coachLinkOk) return t.skip("Coach-Verknüpfung fehlt");
    const own = await addGoal({ kind: "RLS-Test lesen", is_active: false });
    const read = await rest("GET", `goals?id=eq.${own.data[0].id}`, { token: trainer.token });
    assert.equal(read.data.length, 1);
  });

  test("goals: Trainer kann kein Ziel für den Athleten anlegen (Z8)", async (t) => {
    if (!coachLinkOk) return t.skip("Coach-Verknüpfung fehlt");
    const res = await addGoal({ kind: "RLS-Test Trainer", is_active: false }, trainer.token);
    assert.equal(res.ok, false, "Trainer-Insert muss scheitern");
  });

  test("goals: Trainer kann Ziel des Athleten weder ändern noch löschen (Z8)", async (t) => {
    if (!coachLinkOk) return t.skip("Coach-Verknüpfung fehlt");
    const own = await addGoal({ kind: "RLS-Test unveränderlich" });
    const id = own.data[0].id;
    const patch = await rest("PATCH", `goals?id=eq.${id}`, {
      token: trainer.token,
      body: { is_active: false },
    });
    assert.equal(patch.data?.length ?? 0, 0, "Trainer-PATCH darf keine Zeile treffen");
    const del = await rest("DELETE", `goals?id=eq.${id}`, { token: trainer.token });
    assert.equal(del.data?.length ?? 0, 0, "Trainer-DELETE darf keine Zeile treffen");
    const still = await rest("GET", `goals?id=eq.${id}&select=is_active`, { token: athlete.token });
    assert.equal(still.data[0]?.is_active, true);
  });

  test("goals: anon darf nicht schreiben", async () => {
    const write = await rest("POST", "goals", {
      token: null,
      body: { athlete_id: athlete.userId, kind: "RLS-Test anon" },
    });
    assert.equal(write.ok, false);
  });
}
