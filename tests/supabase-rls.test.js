/* Tests: RLS-Policies aus supabase/migrations/*.sql GEGEN DAS ECHTE
   dashboard-dev-Projekt (kein Mock) — Accounts "Stuhlsen" (Athlet 1) +
   "Trainer-ST" (dessen Coach), die einzige in dashboard-dev bereits real
   verknüpfte Coach-Athlet-Beziehung (per Live-Check ermittelt — die
   ursprünglich angenommenen generischen "athlet-test"/"trainer-test"-
   Accounts aus dem Phase-0-Konzept existieren so nicht; dashboard-dev
   spiegelt stattdessen zwei echte Paare: Trainer-ST↔Stuhlsen,
   Trainer-DZ↔hc_diZee).

   Läuft NUR mit Live-Credentials in .env (s. AGENTS.md "Test-Sicherheit"):
     SUPABASE_URL, SUPABASE_ANON_KEY,
     SUPABASE_ATHLETE1_EMAIL/_PASSWORD   (Account "Stuhlsen")
     SUPABASE_TRAINER_EMAIL/_PASSWORD    (Account "Trainer-ST")
   Fehlen sie (z. B. in CI), überspringt die Datei sich selbst komplett —
   kein Fehlschlag, nur ein einzelner "skipped"-Eintrag in der npm-test-
   Ausgabe. Kein npm-Package nötig: reine fetch-Aufrufe gegen Auth-REST
   (grant_type=password) und PostgREST, analog zu
   scripts/migrate-plan-to-supabase.js.

   VORAUSSETZUNG in dashboard-dev: Trainer-ST ist als Coach von Stuhlsen
   eingetragen (profiles.coach_id) — wird im before()-Hook geprüft; ist
   die Verknüpfung nicht (mehr) gesetzt, überspringen die coach-abhängigen
   Tests einzeln mit klarer Meldung statt falsch grün oder falsch rot zu
   laufen.

   EINSCHRÄNKUNG (bewusst, s. docs/offene-punkte.md-Eintrag zu diesem
   Punkt): nur EIN Coach-Athlet-Paar wird hier verwendet. Für "Trainer B
   darf Athlet A nicht sehen" bräuchte es eigentlich Trainer-DZ als
   zweite Identität — bewusst nicht einbezogen, um dessen reale
   Coach-Beziehung zu hc_diZee nicht anzufassen. Als Ersatz-Nachweis, dass
   is_coach_of()/athlete_id-Vergleich wirklich greifen (nicht nur zufällig
   durchlaufen), nutzen die "fremd"-Tests unten die jeweils ANDERE eigene
   Test-Identität als nicht-zugehörige athlete_id (z. B. athlete_id =
   Trainer-STs eigene profile-id beim Insert-Versuch durch Stuhlsen) bzw.
   eine nicht existierende UUID — das ist ein echter, existierender
   profiles-Datensatz (bzw. bewusst gar keiner), nur eben keiner, den die
   handelnde Person besitzt oder coacht. Eine echte Cross-Tenant-Isolation
   zwischen zwei ATHLETEN ist damit nicht abgedeckt.

   Aufräumen: jede Testzeile wird über `cleanupTasks` nachverfolgt und im
   after()-Hook wieder entfernt bzw. der Originalzustand (wellbeing_public,
   trainer_view_prefs) wiederhergestellt — s. Kopfkommentar-Anforderung
   "keine Test-Daten hinterlassen". Schlägt ein Cleanup-Schritt fehl, wirft
   after() am Ende trotzdem (nach Versuch ALLER Schritte) mit einer Liste
   der hängengebliebenen Reste, statt das stillschweigend zu verschlucken. */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ENV } from "../scripts/lib/env.js";

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ATHLETE1_EMAIL, SUPABASE_ATHLETE1_PASSWORD } = ENV;
const { SUPABASE_TRAINER_EMAIL, SUPABASE_TRAINER_PASSWORD } = ENV;

const HAS_CREDS = !!(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_ATHLETE1_EMAIL &&
  SUPABASE_ATHLETE1_PASSWORD &&
  SUPABASE_TRAINER_EMAIL &&
  SUPABASE_TRAINER_PASSWORD
);

if (!HAS_CREDS) {
  test(
    "supabase-rls: übersprungen (keine Live-Credentials in .env)",
    { skip: "SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_ATHLETE1_*/SUPABASE_TRAINER_* fehlen — s. AGENTS.md \"Test-Sicherheit\"" },
    () => {}
  );
} else {
  // --- REST-Helfer (analog scripts/migrate-plan-to-supabase.js) ---------

  async function signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new Error(`Supabase-Login fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
    }
    const json = await res.json();
    return { token: json.access_token, userId: json.user.id };
  }

  /** `token: null` => anon (apikey UND Authorization tragen den anon-Key,
   *  genau wie supabase-js es ohne Session tut).
   *
   *  ACHTUNG bei PATCH/DELETE-Negativtests (Nacharbeiten-Auftrag, Schritt 1):
   *  PostgREST/Postgres-RLS blenden bei UPDATE/DELETE nicht sichtbare Zeilen
   *  einfach aus der WHERE-Trefferliste aus — ein RLS-blockierter PATCH/DELETE
   *  liefert HTTP 200 mit `data: []`, KEINEN Fehlerstatus. `result.ok` bleibt
   *  also `true`, selbst wenn die RLS-Policy die Änderung verhindert hat. Ein
   *  "sollte scheitern"-Test MUSS deshalb `result.data?.length` prüfen, nicht
   *  `result.ok` — genau der Fehler, der in den ersten Fassungen der
   *  session_formats/athlete_formats-Blöcke steckte (s. Commit-Historie).
   *  Für POST (INSERT) gilt das NICHT: eine verletzte WITH-CHECK-Policy wirft
   *  dort einen echten Fehler (42501), `.ok` ist hier ein verlässlicher Test.
   *  Vollständige Durchsicht (Nacharbeiten-Auftrag Schritt 1): alle
   *  PATCH/DELETE-Aufrufe in dieser Datei durchgesehen — außerhalb der beiden
   *  bereits gefixten Stellen prüft keine weitere Negativ-Assertion `.ok`
   *  nach PATCH/DELETE (die übrigen sind Cleanup/Setup auf eigenen Zeilen,
   *  wo `.ok===true` das korrekte, positive Ergebnis ist). */
  async function rest(method, tablePath, { token = null, body, prefer = "return=representation" } = {}) {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePath}`, {
      method,
      headers,
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

  let athlete; // { token, userId }
  let trainer; // { token, userId }
  let coachLinkOk = false;
  let originalWellbeingPublic = null;
  let originalViewPrefs; // undefined = noch nicht geprüft, null = existierte nicht
  let originalIntervalsCredentials; // undefined = noch nicht geprüft, null = existierte nicht
  let originalSyncConfig; // undefined = noch nicht geprüft, null = existierte nicht (athlete_sync_config, 0023)

  /** Aufräum-Funktionen, LIFO im after()-Hook ausgeführt. Jede fängt ihre
   *  eigenen Fehler NICHT selbst — after() sammelt sie, damit ein einzelner
   *  fehlgeschlagener Schritt nicht die restliche Aufräumung verhindert. */
  const cleanupTasks = [];

  before(async () => {
    athlete = await signIn(SUPABASE_ATHLETE1_EMAIL, SUPABASE_ATHLETE1_PASSWORD);
    trainer = await signIn(SUPABASE_TRAINER_EMAIL, SUPABASE_TRAINER_PASSWORD);

    // coach_id/is_admin sind seit Migration 0022 (#32) NICHT mehr auf der
    // Basistabelle gegrantet — die eigene Zeile inkl. dieser Spalten kommt
    // über die View profiles_visible (id = auth.uid()).
    const profileCheck = await rest(
      "GET",
      `profiles_visible?id=eq.${athlete.userId}&select=id,role,coach_id,wellbeing_public`,
      { token: athlete.token }
    );
    const row = profileCheck.data?.[0];
    originalWellbeingPublic = row?.wellbeing_public ?? null;
    coachLinkOk = !!row && row.role === "athlete" && row.coach_id === trainer.userId;

    const prefsCheck = await rest(
      "GET",
      `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}&select=categories`,
      { token: trainer.token }
    );
    originalViewPrefs = prefsCheck.data?.[0]?.categories ?? null;

    const credsCheck = await rest(
      "GET",
      `intervals_credentials?profile_id=eq.${athlete.userId}&select=api_key,intervals_athlete_id`,
      { token: athlete.token }
    );
    originalIntervalsCredentials = credsCheck.data?.[0] ?? null;

    // athlete_sync_config kann nach Migration 0023 bereits eine echte Zeile
    // für Athlet 1 tragen (Bestandsübernahme aus intervals_credentials) —
    // wie oben sichern und im Cleanup wiederherstellen statt zu löschen.
    const syncConfigCheck = await rest(
      "GET",
      `athlete_sync_config?profile_id=eq.${athlete.userId}&select=intervals_api_key,intervals_athlete_id,weather_lat,weather_lon`,
      { token: athlete.token }
    );
    originalSyncConfig = syncConfigCheck.data?.[0] ?? null;
  });

  after(async () => {
    const failures = [];
    for (const task of cleanupTasks.reverse()) {
      try {
        await task();
      } catch (e) {
        failures.push(e.message);
      }
    }
    if (failures.length) {
      throw new Error(
        `RLS-Test-Aufräumung unvollständig — bitte in dashboard-dev manuell prüfen:\n` +
          failures.map((f) => ` - ${f}`).join("\n")
      );
    }
  });

  // --- 1. Grundvoraussetzung: Coach-Verknüpfung -------------------------

  test("Testaccounts: Trainer-ST ist als Coach von Stuhlsen eingetragen", () => {
    assert.equal(
      coachLinkOk,
      true,
      "profiles.coach_id von Stuhlsen zeigt nicht auf Trainer-ST — Coach-abhängige RLS-Tests unten werden übersprungen. " +
        "In dashboard-dev per SQL-Editor setzen: update profiles set coach_id = '<trainer-uid>' where id = '<athlete-uid>'"
    );
  });

  const coachSkip = () => (coachLinkOk ? false : "Coach-Verknüpfung Stuhlsen↔Trainer-ST fehlt (s. Test oben)");

  // --- 1b. profiles: Spalten-Härtung (GitHub Issue #32, Migration 0022) -
  // Vor 0022 lieferte ein unauth. GET /profiles die kompletten Zeilen inkl.
  // coach_id/is_admin. 0022: Basistabelle nur noch id/display_name/role/
  // wellbeing_public öffentlich; sensible Spalten der eigenen bzw. selbst
  // gecoachten Zeile ausschließlich über die View profiles_visible.

  test("profiles: anon liest die 4 öffentlichen Spalten, aber select=* / coach_id / is_admin scheitern", async () => {
    // Nur die 4 explizit gegranteten Spalten -> ok.
    const anonSafe = await rest("GET", "profiles?select=id,display_name,role,wellbeing_public", { token: null });
    assert.equal(anonSafe.ok, true, `anon-Read der öffentlichen Spalten fehlgeschlagen: ${JSON.stringify(anonSafe.data)}`);
    assert.ok(Array.isArray(anonSafe.data) && anonSafe.data.length > 0, "profiles liefert anon keine Zeilen");

    // Column-Grant statt Table-Grant: select=* deckt ungegrantete Spalten mit ab -> 42501.
    const anonAll = await rest("GET", "profiles?select=*", { token: null });
    assert.equal(anonAll.ok, false, "select=* auf profiles darf für anon nicht durchgehen (#32)");

    // Explizit angeforderte, nicht gegrantete Spalte -> harter Fehler.
    const anonCol = await rest("GET", "profiles?select=id,coach_id,is_admin", { token: null });
    assert.equal(anonCol.ok, false, "anon darf coach_id/is_admin nicht einmal explizit anfordern können (#32)");
  });

  test("profiles: auch eingeloggt kein coach_id/is_admin über die Basistabelle", async () => {
    const authCol = await rest("GET", `profiles?id=eq.${athlete.userId}&select=coach_id,is_admin`, {
      token: athlete.token,
    });
    assert.equal(authCol.ok, false, "authenticated darf coach_id/is_admin nicht über die Basistabelle lesen (#32)");
  });

  test("profiles_visible: Athlet sieht GENAU die eigene Zeile, mit coach_id/is_admin", async () => {
    const own = await rest("GET", "profiles_visible?select=id,coach_id,is_admin", { token: athlete.token });
    assert.equal(own.ok, true, `profiles_visible-Read fehlgeschlagen: ${JSON.stringify(own.data)}`);
    assert.equal(own.data.length, 1, "profiles_visible zeigt dem Athleten mehr/weniger als die eigene Zeile");
    assert.equal(own.data[0].id, athlete.userId);
    assert.equal("coach_id" in own.data[0], true, "profiles_visible muss coach_id der eigenen Zeile führen");
    assert.equal("is_admin" in own.data[0], true, "profiles_visible muss is_admin der eigenen Zeile führen");
  });

  test("profiles_visible: anon bekommt nichts (kein GRANT)", async () => {
    const anonView = await rest("GET", "profiles_visible?select=id", { token: null });
    assert.equal(anonView.ok, false, "anon darf profiles_visible nicht lesen (#32)");
  });

  test("profiles_visible: Trainer sieht eigene Zeile UND die des gecoachten Athleten", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerView = await rest("GET", "profiles_visible?select=id,coach_id", { token: trainer.token });
    assert.equal(trainerView.ok, true);
    const ids = trainerView.data.map((r) => r.id);
    assert.ok(ids.includes(trainer.userId), "profiles_visible führt die eigene Trainer-Zeile nicht");
    assert.ok(ids.includes(athlete.userId), "profiles_visible führt die Zeile des gecoachten Athleten nicht");
    const athleteRow = trainerView.data.find((r) => r.id === athlete.userId);
    assert.equal(athleteRow.coach_id, trainer.userId);
  });

  // --- 2. wellbeing_shared: anon sieht nur bei aktivem Toggle -----------
  // Regressionstest für den Bug, den Block B Teil 1 gefixt hat.

  const WB_DATE = "1999-12-31"; // Sentinel-Datum, real unbenutzt

  test("wellbeing_shared: anon sieht NICHTS, solange wellbeing_public=false ist", async () => {
    // Baseline erzwingen: Toggle aus. return=minimal, weil profiles seit
    // Migration 0022 (#32) nur noch Column-Grants hat — ein PATCH mit
    // return=representation würde beim RETURNING über alle Spalten an
    // is_admin/coach_id scheitern (genau wie supabase-js' .update() ohne
    // .select(), das die App nutzt).
    const off = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { wellbeing_public: false },
      prefer: "return=minimal",
    });
    assert.equal(off.ok, true, `Toggle-aus fehlgeschlagen: ${JSON.stringify(off.data)}`);
    cleanupTasks.push(async () => {
      const restore = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
        token: athlete.token,
        body: { wellbeing_public: originalWellbeingPublic ?? false },
        prefer: "return=minimal",
      });
      if (!restore.ok) throw new Error(`profiles.wellbeing_public nicht zurückgesetzt (Original: ${originalWellbeingPublic})`);
    });

    // Testzeile anlegen (note darf laut Schema nie öffentlich werden).
    const insert = await rest("POST", "wellbeing", {
      token: athlete.token,
      body: { athlete_id: athlete.userId, date: WB_DATE, energy: 3, muscle_feel: 2, mood: 4, note: "rls-test" },
    });
    assert.equal(insert.ok, true, `wellbeing-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `wellbeing?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}`, {
        token: athlete.token,
      });
      if (!del.ok) throw new Error(`wellbeing-Testzeile (${WB_DATE}) nicht gelöscht: ${JSON.stringify(del.data)}`);
    });

    const anonShared = await rest(
      "GET",
      `wellbeing_shared?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}`,
      { token: null }
    );
    assert.equal(anonShared.ok, true);
    assert.deepEqual(anonShared.data, [], "wellbeing_shared zeigt Daten trotz deaktiviertem Toggle");
  });

  test("wellbeing_shared: anon sieht energy/muscle_feel/mood NACH Toggle-an, aber nie note", async () => {
    const on = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { wellbeing_public: true },
      prefer: "return=minimal",
    });
    assert.equal(on.ok, true);

    const anonShared = await rest(
      "GET",
      `wellbeing_shared?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}`,
      { token: null }
    );
    assert.equal(anonShared.ok, true);
    assert.equal(anonShared.data.length, 1, "wellbeing_shared liefert die Testzeile nicht nach Toggle-an");
    const row = anonShared.data[0];
    assert.equal(row.energy, 3);
    assert.equal(row.muscle_feel, 2);
    assert.equal(row.mood, 4);
    assert.equal("note" in row, false, "wellbeing_shared darf note NIE ausliefern");

    // Basistabelle bleibt für anon zu, auch bei aktivem Toggle.
    const anonBase = await rest(
      "GET",
      `wellbeing?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}`,
      { token: null }
    );
    assert.equal(anonBase.ok, false, "anon darf die wellbeing-Basistabelle nicht direkt lesen (kein GRANT)");
  });

  test("wellbeing: Trainer sieht note, anon nie — Basistabelle", async (t) => {
    // { skip: coachSkip() } wäre hier zu früh ausgewertet — die test()-Aufrufe
    // laufen synchron beim Modul-Laden, VOR dem async before()-Hook, der
    // coachLinkOk erst setzt. Deshalb dynamisch innerhalb der Testfunktion
    // prüfen (TestContext.skip()) statt über die statische skip-Option.
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest(
      "GET",
      `wellbeing?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}&select=note,energy`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.ok, true);
    assert.equal(trainerRead.data.length, 1);
    assert.equal(trainerRead.data[0].note, "rls-test");
  });

  // --- 3. proposals -------------------------------------------------------

  test("proposals: Athlet legt eigenen Vorschlag an (Claude-Import-Pfad), anon sieht ihn (S1, seit Migration 0010)", async () => {
    const insert = await rest("POST", "proposals", {
      token: athlete.token,
      body: { athlete_id: athlete.userId, created_by: athlete.userId, source: "claude", op: "cancel", payload: {} },
    });
    assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `proposals?id=eq.${id}`, { token: athlete.token });
      if (!del.ok || del.data.length !== 1) throw new Error(`proposals-Testzeile ${id} nicht gelöscht`);
    });

    // S1 (docs/phase-6-konzept-sichtbarkeit.md): proposals sind öffentlich
    // lesbar, "Portfolio-Kern" — Migration 0010 (Security-Review Etappe B,
    // Fund 1, 31.07.2026) hat die dafür fehlende anon-Policy nachgezogen.
    // Vorher lief dieser Test genau umgekehrt (anon durfte NICHT lesen) —
    // das war ein Bug (S1 unimplementiert), keine gewollte Sperre.
    const anonRead = await rest("GET", `proposals?id=eq.${id}`, { token: null });
    assert.equal(anonRead.ok, true, `anon soll proposals lesen dürfen (S1): ${JSON.stringify(anonRead.data)}`);
    assert.equal(anonRead.data.length, 1);
  });

  test(
    "proposals: Athlet kann KEINEN Vorschlag für eine fremde athlete_id anlegen (RLS, nicht nur App-Gate)",
    async () => {
      const insert = await rest("POST", "proposals", {
        token: athlete.token,
        // athlete-test ist weder athlete_id noch Coach von trainer-tests eigener profile-id.
        body: { athlete_id: trainer.userId, created_by: athlete.userId, source: "claude", op: "cancel", payload: {} },
      });
      assert.equal(insert.ok, false, "Insert für fremde athlete_id hätte an der RLS-Policy scheitern müssen");
    }
  );

  test(
    "proposals: Trainer erstellt für seinen Athleten, Athlet entscheidet, Trainer kann Entscheidung NICHT überschreiben",
    async (t) => {
      if (!coachLinkOk) return t.skip(coachSkip());
      const insert = await rest("POST", "proposals", {
        token: trainer.token,
        body: {
          athlete_id: athlete.userId,
          created_by: trainer.userId,
          source: "trainer",
          op: "cancel",
          payload: { reason: "rls-test" },
        },
      });
      assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
      const id = insert.data[0].id;
      cleanupTasks.push(async () => {
        // Ersteller darf nur löschen, solange status='open' — vor dem Löschen
        // sicherheitshalber zurücksetzen (der Test setzt es weiter unten auf
        // 'accepted'), sonst greift die Delete-Policy nicht mehr.
        const reset = await rest("PATCH", `proposals?id=eq.${id}`, {
          token: athlete.token,
          body: { status: "open" },
        });
        if (!reset.ok) throw new Error(`proposals-Testzeile ${id}: Status-Reset auf 'open' fehlgeschlagen`);
        const del = await rest("DELETE", `proposals?id=eq.${id}`, { token: trainer.token });
        if (!del.ok || del.data.length !== 1) throw new Error(`proposals-Testzeile ${id} nicht gelöscht`);
      });

      // Athlet sieht ihn (Beteiligte lesen).
      const athleteRead = await rest("GET", `proposals?id=eq.${id}`, { token: athlete.token });
      assert.equal(athleteRead.data?.length, 1, "Athlet sieht den vom Trainer erstellten Vorschlag nicht");

      // Athlet entscheidet — erlaubt (Spalten-Härtung: status/decided_at).
      const decide = await rest("PATCH", `proposals?id=eq.${id}`, {
        token: athlete.token,
        body: { status: "accepted", decided_at: new Date().toISOString() },
      });
      assert.equal(decide.ok, true);
      assert.equal(decide.data?.[0]?.status, "accepted");

      // Trainer versucht, die Athleten-Entscheidung zu überschreiben — RLS
      // ("proposals: Athlet entscheidet", athlete_id = auth.uid()) blockt,
      // erkennbar an 0 betroffenen Zeilen (kein harter Fehler, nur kein Match).
      const override = await rest("PATCH", `proposals?id=eq.${id}`, {
        token: trainer.token,
        body: { status: "rejected" },
      });
      assert.equal(
        override.data?.length ?? 0,
        0,
        "Trainer konnte die Athleten-Entscheidung überschreiben — RLS-Policy 'proposals: Athlet entscheidet' greift nicht"
      );
    }
  );

  test(
    "proposals: Trainer kann für eine nicht existierende/nicht gecoachte athlete_id keinen Vorschlag anlegen",
    async () => {
      // WICHTIG: hier NICHT trainer.userId als "fremde" athlete_id verwenden —
      // die proposals-INSERT-Policy hat (anders als trainer_view_prefs) das
      // ODER "athlete_id = auth.uid()", das beim eigenen Trainer-Uid trivial
      // durchgeht (genau dieser Fehler ist beim ersten Lauf dieser Testdatei
      // passiert und hat kurzzeitig eine echte Zeile angelegt, s. Cleanup-
      // Historie). Stattdessen eine syntaktisch gültige, aber nicht
      // existierende UUID — sowohl is_coach_of() als auch der FK schlagen
      // dann fehl, das mit-check kommt so oder so nie durch.
      const insert = await rest("POST", "proposals", {
        token: trainer.token,
        body: {
          athlete_id: "00000000-0000-0000-0000-000000000000",
          created_by: trainer.userId,
          source: "trainer",
          op: "cancel",
          payload: {},
        },
      });
      assert.equal(insert.ok, false, "Insert für nicht-gecoachte athlete_id hätte scheitern müssen");
    }
  );

  // --- 4. trainer_view_prefs ----------------------------------------------

  test("trainer_view_prefs: nur der zugehörige Trainer liest/schreibt seine Zeile", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const TEST_CATEGORIES = ["rls-test-kategorie"];
    const upsert = await rest("POST", "trainer_view_prefs", {
      token: trainer.token,
      prefer: "return=representation,resolution=merge-duplicates",
      body: { trainer_id: trainer.userId, athlete_id: athlete.userId, categories: TEST_CATEGORIES },
    });
    assert.equal(upsert.ok, true, `Upsert fehlgeschlagen: ${JSON.stringify(upsert.data)}`);
    cleanupTasks.push(async () => {
      if (originalViewPrefs !== null) {
        const restore = await rest("PATCH", `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`, {
          token: trainer.token,
          body: { categories: originalViewPrefs },
        });
        if (!restore.ok) throw new Error("trainer_view_prefs: Originalwert nicht wiederhergestellt");
      } else {
        const del = await rest("DELETE", `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`, {
          token: trainer.token,
        });
        if (!del.ok) throw new Error("trainer_view_prefs-Testzeile nicht gelöscht");
      }
    });

    const trainerRead = await rest(
      "GET",
      `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.data?.[0]?.categories?.[0], "rls-test-kategorie");

    // Athlet (keine Trainer-Rolle) darf weder lesen noch schreiben.
    const athleteRead = await rest(
      "GET",
      `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`,
      { token: athlete.token }
    );
    assert.deepEqual(athleteRead.data, [], "Athlet darf trainer_view_prefs nicht lesen (RLS: trainer_id = auth.uid())");

    const athleteWrite = await rest("POST", "trainer_view_prefs", {
      token: athlete.token,
      prefer: "return=representation,resolution=merge-duplicates",
      body: { trainer_id: trainer.userId, athlete_id: athlete.userId, categories: ["hack"] },
    });
    assert.equal(athleteWrite.ok, false, "Athlet konnte trainer_view_prefs schreiben — RLS greift nicht");

    // anon: kein GRANT auf der Tabelle überhaupt.
    const anonRead = await rest(
      "GET",
      `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`,
      { token: null }
    );
    assert.equal(anonRead.ok, false, "anon darf trainer_view_prefs nicht lesen (kein GRANT)");
  });

  test("trainer_view_prefs: Trainer kann keine Zeile für eine nicht gecoachte athlete_id anlegen", async () => {
    const upsert = await rest("POST", "trainer_view_prefs", {
      token: trainer.token,
      prefer: "return=representation,resolution=merge-duplicates",
      // trainer-tests eigene profile-id ist keine von ihm gecoachte athlete_id.
      body: { trainer_id: trainer.userId, athlete_id: trainer.userId, categories: ["rls-test"] },
    });
    assert.equal(upsert.ok, false, "Upsert für nicht-gecoachte athlete_id hätte scheitern müssen");
  });

  // --- 5. ftp_history (0009) ----------------------------------------------
  // Verifikation/Dry-Run der neuen Migration 0009_ftp_history.sql — kein
  // eigener Bericht nötig, dieser Testlauf IST die Verifikation.

  const FTP_SENTINEL_DATE = "1901-01-01"; // real unbenutztes Datum, kollisionsfrei

  test("ftp_history: Athlet legt eigenen Eintrag an, anon sieht ihn nicht (kein GRANT)", async () => {
    const insert = await rest("POST", "ftp_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, ftp_watt: 199, valid_from: FTP_SENTINEL_DATE },
    });
    assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    assert.equal(insert.data[0].source, "ramp-test", "Default für source sollte 'ramp-test' sein");
    cleanupTasks.push(async () => {
      const del = await rest(
        "DELETE",
        `ftp_history?profile_id=eq.${athlete.userId}&valid_from=eq.${FTP_SENTINEL_DATE}`,
        { token: athlete.token }
      );
      if (!del.ok) throw new Error(`ftp_history-Testzeile (${FTP_SENTINEL_DATE}) nicht gelöscht: ${JSON.stringify(del.data)}`);
    });

    const anonRead = await rest(
      "GET",
      `ftp_history?profile_id=eq.${athlete.userId}&valid_from=eq.${FTP_SENTINEL_DATE}`,
      { token: null }
    );
    assert.equal(anonRead.ok, false, "anon darf ftp_history nicht lesen (kein GRANT)");
  });

  test("ftp_history: zweiter Eintrag für denselben Tag scheitert am unique-Constraint", async () => {
    const dup = await rest("POST", "ftp_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, ftp_watt: 200, valid_from: FTP_SENTINEL_DATE },
    });
    assert.equal(dup.ok, false, "Doppelter valid_from-Eintrag hätte am unique-Constraint scheitern müssen");
  });

  test("ftp_history: ftp_watt <= 0 scheitert am Check-Constraint", async () => {
    const bad = await rest("POST", "ftp_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, ftp_watt: 0, valid_from: "1901-01-02" },
    });
    assert.equal(bad.ok, false, "ftp_watt=0 hätte am Check-Constraint scheitern müssen");
  });

  test("ftp_history: unbekannter source-Wert scheitert am Check-Constraint", async () => {
    const bad = await rest("POST", "ftp_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, ftp_watt: 199, valid_from: "1901-01-03", source: "geschaetzt" },
    });
    assert.equal(bad.ok, false, "source='geschaetzt' (falscher Wert) hätte scheitern müssen — erlaubt ist nur 'schaetzung'");
  });

  test("ftp_history: Trainer liest mit, kann aber nicht für den Athleten schreiben", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest(
      "GET",
      `ftp_history?profile_id=eq.${athlete.userId}&valid_from=eq.${FTP_SENTINEL_DATE}`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.ok, true);
    assert.equal(trainerRead.data.length, 1, "Trainer sollte den Eintrag seines Athleten lesen können (is_coach_of)");
    assert.equal(trainerRead.data[0].ftp_watt, 199);

    const trainerWrite = await rest("POST", "ftp_history", {
      token: trainer.token,
      body: { profile_id: athlete.userId, ftp_watt: 250, valid_from: "1901-01-04" },
    });
    assert.equal(trainerWrite.ok, false, "Trainer konnte für den Athleten schreiben — es gibt bewusst keine Insert-Policy dafür");
  });

  test("ftp_history: Athlet kann keinen Eintrag für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "ftp_history", {
      token: athlete.token,
      body: { profile_id: trainer.userId, ftp_watt: 199, valid_from: "1901-01-05" },
    });
    assert.equal(insert.ok, false, "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen");
  });

  // --- 6. session_formats + athlete_formats (0014, D1/D2) -----------------
  // Verifikation/Dry-Run der neuen Migration 0014_session_formats.sql.
  // athlete_formats hat KEIN date-artiges Feld für einen kollisionssicheren
  // Sentinel-Wert wie FTP_SENTINEL_DATE (unique ist nur (profile_id,
  // format_id)) — die destruktiven Insert/Delete-Tests prüfen deshalb
  // zuerst, ob für (athlete, 'sprint-accessory') bereits eine echte Zeile
  // existiert (z. B. weil die L7-Startbelegung inzwischen über die
  // Familienauswahl gesetzt wurde), und überspringen sich einzeln statt
  // eine echte Athleten-Entscheidung zu überschreiben/zu löschen.

  test("session_formats: von allen Rollen lesbar (öffentlicher Katalog, E1)", async () => {
    for (const [label, token] of [["anon", null], ["Athlet", athlete.token], ["Trainer", trainer.token]]) {
      const read = await rest("GET", "session_formats?select=id,label,target_system,currency,evidence_grade,block_targets", { token });
      assert.equal(read.ok, true, `${label} sollte session_formats lesen können`);
      assert.ok(read.data.length >= 6, `${label}: erwartet mind. 6 Startformate (L2-L6), erhalten ${read.data.length}`);
    }
  });

  test("session_formats: weder Athlet noch Trainer dürfen schreiben (nur Admin)", async () => {
    const athleteWrite = await rest("POST", "session_formats", {
      token: athlete.token,
      body: { id: "rls-test-format", label: "RLS-Test", target_system: "schwelle", currency: "zone-time", evidence_grade: "coaching-konsens", axes: {} },
    });
    assert.equal(athleteWrite.ok, false, "Athlet konnte session_formats schreiben — sollte nur Admin dürfen");

    // PATCH ohne RLS-Match liefert HTTP 200 mit 0 Zeilen, keinen harten
    // Fehler (s. proposals-Block oben) — deshalb data.length prüfen, nicht .ok.
    const trainerWrite = await rest("PATCH", "session_formats?id=eq.sweetspot-long", {
      token: trainer.token,
      body: { label: "Manipuliert" },
    });
    assert.equal(trainerWrite.data?.length ?? 0, 0, "Trainer konnte session_formats ändern — sollte nur Admin dürfen");
  });

  test("athlete_formats: unbekannte format_id scheitert am FK-Constraint (kollisionsfrei, keine echten Daten betroffen)", async () => {
    const bad = await rest("POST", "athlete_formats", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "nicht-vorhanden-rls-test" },
    });
    assert.equal(bad.ok, false, "format_id ohne Katalogeintrag hätte am FK-Constraint scheitern müssen");
  });

  test("athlete_formats: anon sieht nichts (kein GRANT), Athlet+Trainer je nach RLS", async (t) => {
    const existing = await rest(
      "GET",
      `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`,
      { token: athlete.token }
    );
    if (!existing.ok) return t.skip("athlete_formats nicht lesbar — Migration 0014 vermutlich noch nicht eingespielt");
    if (existing.data.length) {
      return t.skip("bereits eine echte athlete_formats-Zeile für sprint-accessory vorhanden — destruktiver Test übersprungen, um echte Athletenentscheidung nicht anzufassen");
    }

    const insert = await rest("POST", "athlete_formats", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "sprint-accessory", active: true },
    });
    assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`, { token: athlete.token });
      if (!del.ok) throw new Error(`athlete_formats-Testzeile (sprint-accessory) nicht gelöscht: ${JSON.stringify(del.data)}`);
    });

    const anonRead = await rest("GET", `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf athlete_formats nicht lesen (kein GRANT)");

    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest("GET", `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`, { token: trainer.token });
    assert.equal(trainerRead.ok, true);
    assert.equal(trainerRead.data.length, 1, "Trainer sollte die Formatzuordnung seines Athleten lesen können (is_coach_of)");

    // PATCH ohne RLS-Match liefert HTTP 200 mit 0 Zeilen (s. Kommentar beim
    // session_formats-Admin-Test oben) — data.length prüfen, nicht .ok.
    const trainerWrite = await rest("PATCH", `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`, {
      token: trainer.token,
      body: { active: false },
    });
    assert.equal(
      trainerWrite.data?.length ?? 0,
      0,
      "Trainer konnte athlete_formats für den Athleten ändern — es gibt bewusst keine Update-Policy dafür"
    );
  });

  test("athlete_formats: Athlet kann keine Zeile für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "athlete_formats", {
      token: athlete.token,
      body: { profile_id: trainer.userId, format_id: "sprint-accessory" },
    });
    assert.equal(insert.ok, false, "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen");
  });

  // --- 7. ladder_history (0015, D2) ----------------------------------------
  // Verifikation/Dry-Run der neuen Migration 0015_ladder_history.sql —
  // wie ftp_history: valid_from als kollisionsfreier Sentinel, hier
  // zusätzlich mit format_id in den unique-Constraint einbezogen.

  const LADDER_SENTINEL_DATE = "1901-02-01";

  test("ladder_history: Athlet legt eigenen Eintrag an, anon sieht ihn nicht (kein GRANT)", async () => {
    const insert = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: {
        profile_id: athlete.userId,
        format_id: "sweetspot-long",
        step: 1,
        valid_from: LADDER_SENTINEL_DATE,
        reason: "manual",
      },
    });
    assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    cleanupTasks.push(async () => {
      const del = await rest(
        "DELETE",
        `ladder_history?profile_id=eq.${athlete.userId}&format_id=eq.sweetspot-long&valid_from=eq.${LADDER_SENTINEL_DATE}`,
        { token: athlete.token }
      );
      if (!del.ok) throw new Error(`ladder_history-Testzeile (${LADDER_SENTINEL_DATE}) nicht gelöscht: ${JSON.stringify(del.data)}`);
    });

    const anonRead = await rest(
      "GET",
      `ladder_history?profile_id=eq.${athlete.userId}&format_id=eq.sweetspot-long&valid_from=eq.${LADDER_SENTINEL_DATE}`,
      { token: null }
    );
    assert.equal(anonRead.ok, false, "anon darf ladder_history nicht lesen (kein GRANT)");
  });

  test("ladder_history: zweiter Eintrag für dasselbe Format+Datum scheitert am unique-Constraint", async () => {
    const dup = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "sweetspot-long", step: 2, valid_from: LADDER_SENTINEL_DATE, reason: "manual" },
    });
    assert.equal(dup.ok, false, "Doppelter (format_id,valid_from)-Eintrag hätte am unique-Constraint scheitern müssen");
  });

  test("ladder_history: step <= 0 scheitert am Check-Constraint", async () => {
    const bad = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "sweetspot-long", step: 0, valid_from: "1901-02-02", reason: "manual" },
    });
    assert.equal(bad.ok, false, "step=0 hätte am Check-Constraint scheitern müssen");
  });

  test("ladder_history: unbekannter reason-Wert scheitert am Check-Constraint", async () => {
    const bad = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "sweetspot-long", step: 1, valid_from: "1901-02-03", reason: "sonstwas" },
    });
    assert.equal(bad.ok, false, "reason='sonstwas' (falscher Wert) hätte scheitern müssen");
  });

  test("ladder_history: unbekannte format_id scheitert am FK-Constraint", async () => {
    const bad = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "nicht-vorhanden-rls-test", step: 1, valid_from: "1901-02-04", reason: "manual" },
    });
    assert.equal(bad.ok, false, "format_id ohne Katalogeintrag hätte am FK-Constraint scheitern müssen");
  });

  test("ladder_history: Trainer liest mit, kann aber nicht für den Athleten schreiben", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest(
      "GET",
      `ladder_history?profile_id=eq.${athlete.userId}&format_id=eq.sweetspot-long&valid_from=eq.${LADDER_SENTINEL_DATE}`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.ok, true);
    assert.equal(trainerRead.data.length, 1, "Trainer sollte den Eintrag seines Athleten lesen können (is_coach_of)");

    const trainerWrite = await rest("POST", "ladder_history", {
      token: trainer.token,
      body: { profile_id: athlete.userId, format_id: "sweetspot-long", step: 3, valid_from: "1901-02-05", reason: "manual" },
    });
    assert.equal(trainerWrite.ok, false, "Trainer konnte für den Athleten schreiben — es gibt bewusst keine Insert-Policy dafür");
  });

  test("ladder_history: Athlet kann keinen Eintrag für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: { profile_id: trainer.userId, format_id: "sweetspot-long", step: 1, valid_from: "1901-02-06", reason: "manual" },
    });
    assert.equal(insert.ok, false, "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen");
  });

  // --- 8. intervals_credentials (0019) -------------------------------------
  // Verifikation der neuen Migration 0019_intervals_credentials.sql. Anders
  // als ftp_history/ladder_history KEIN Coach-Lesezugriff (der Key gehört
  // niemandem außer dem Athleten selbst) — genau das ist hier der wichtige
  // Negativtest, nicht nur "Trainer schreibt nicht". profile_id ist
  // Primärschlüssel (eine Zeile je Athlet, kein Sentinel-Datum möglich) —
  // Original wird deshalb wie bei trainer_view_prefs gesichert/wiederhergestellt,
  // um eine ggf. bereits real hinterlegte Zeile nicht zu zerstören.

  test("intervals_credentials: Athlet legt eigene Zeile an, anon sieht sie nicht (kein GRANT)", async () => {
    const upsert = await rest("POST", "intervals_credentials", {
      token: athlete.token,
      prefer: "return=representation,resolution=merge-duplicates",
      body: { profile_id: athlete.userId, api_key: "rls-test-key", intervals_athlete_id: "i-rls-test" },
    });
    assert.equal(upsert.ok, true, `Upsert fehlgeschlagen: ${JSON.stringify(upsert.data)}`);
    cleanupTasks.push(async () => {
      if (originalIntervalsCredentials) {
        const restore = await rest("PATCH", `intervals_credentials?profile_id=eq.${athlete.userId}`, {
          token: athlete.token,
          body: {
            api_key: originalIntervalsCredentials.api_key,
            intervals_athlete_id: originalIntervalsCredentials.intervals_athlete_id,
          },
        });
        if (!restore.ok) throw new Error("intervals_credentials: Originalwert nicht wiederhergestellt");
      } else {
        const del = await rest("DELETE", `intervals_credentials?profile_id=eq.${athlete.userId}`, {
          token: athlete.token,
        });
        if (!del.ok) throw new Error("intervals_credentials-Testzeile nicht gelöscht");
      }
    });

    const anonRead = await rest("GET", `intervals_credentials?profile_id=eq.${athlete.userId}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf intervals_credentials nicht lesen (kein GRANT)");
  });

  test("intervals_credentials: Trainer darf die Zeile seines Athleten NICHT lesen (kein Coach-Zugriff, anders als ftp_history)", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest("GET", `intervals_credentials?profile_id=eq.${athlete.userId}`, {
      token: trainer.token,
    });
    assert.deepEqual(trainerRead.data, [], "Trainer sieht die intervals_credentials-Zeile seines Athleten — RLS zu weit gefasst");
  });

  test("intervals_credentials: Athlet kann keine Zeile für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "intervals_credentials", {
      token: athlete.token,
      body: { profile_id: trainer.userId, api_key: "rls-test-key", intervals_athlete_id: "i-rls-test" },
    });
    assert.equal(insert.ok, false, "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen");
  });

  // --- 9. athlete_sync_config (0023, Fahrplan 7 CRED1) -------------------
  // Verifikation der neuen Migration 0023_athlete_sync_config.sql. Gleiche
  // Sensibilität wie intervals_credentials (Abschnitt 8): KEIN Coach-
  // Lesezugriff, kein anon-GRANT. Zusätzlich hier geprüft: die
  // numeric(5,2)/(6,2)-Rundung des Standorts serverseitig (Datenschutz-
  // Schranke aus CRED1), und dass eine eingeloggte Person keine admin-Zeile
  // (athlete_key statt profile_id) anlegen kann. profile_id ist unique
  // (eine Zeile je Athlet) — Original wie bei intervals_credentials
  // sichern/wiederherstellen, um eine aus der Bestandsübernahme entstandene
  // echte Zeile nicht zu zerstören.

  test("athlete_sync_config: Athlet schreibt eigene Zeile, Standort wird auf 2 Nachkommastellen gerundet, anon sieht nichts", async () => {
    const upsert = await rest("POST", "athlete_sync_config?on_conflict=profile_id", {
      token: athlete.token,
      prefer: "return=representation,resolution=merge-duplicates",
      body: { profile_id: athlete.userId, weather_lat: 52.51234, weather_lon: 13.40891 },
    });
    assert.equal(upsert.ok, true, `Upsert fehlgeschlagen: ${JSON.stringify(upsert.data)}`);
    cleanupTasks.push(async () => {
      if (originalSyncConfig) {
        const restore = await rest("PATCH", `athlete_sync_config?profile_id=eq.${athlete.userId}`, {
          token: athlete.token,
          body: {
            intervals_api_key: originalSyncConfig.intervals_api_key,
            intervals_athlete_id: originalSyncConfig.intervals_athlete_id,
            weather_lat: originalSyncConfig.weather_lat,
            weather_lon: originalSyncConfig.weather_lon,
          },
        });
        if (!restore.ok) throw new Error("athlete_sync_config: Originalwert nicht wiederhergestellt");
      } else {
        const del = await rest("DELETE", `athlete_sync_config?profile_id=eq.${athlete.userId}`, {
          token: athlete.token,
        });
        if (!del.ok) throw new Error("athlete_sync_config-Testzeile nicht gelöscht");
      }
    });

    const readBack = await rest(
      "GET",
      `athlete_sync_config?profile_id=eq.${athlete.userId}&select=weather_lat,weather_lon`,
      { token: athlete.token }
    );
    assert.equal(readBack.ok, true);
    assert.equal(
      Number(readBack.data[0].weather_lat),
      52.51,
      "weather_lat serverseitig nicht auf 2 Nachkommastellen gerundet (numeric(5,2))"
    );
    assert.equal(
      Number(readBack.data[0].weather_lon),
      13.41,
      "weather_lon serverseitig nicht auf 2 Nachkommastellen gerundet (numeric(6,2))"
    );

    const anonRead = await rest("GET", `athlete_sync_config?profile_id=eq.${athlete.userId}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf athlete_sync_config nicht lesen (kein GRANT)");
  });

  test("athlete_sync_config: Athlet kann keine Zeile für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "athlete_sync_config", {
      token: athlete.token,
      body: { profile_id: trainer.userId, intervals_api_key: "rls-test", intervals_athlete_id: "i-rls-test" },
    });
    assert.equal(insert.ok, false, "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen");
  });

  test("athlete_sync_config: eingeloggte Person kann keine admin-Zeile (athlete_key statt profile_id) anlegen", async () => {
    const insert = await rest("POST", "athlete_sync_config", {
      token: athlete.token,
      body: { athlete_key: "athlete999", intervals_api_key: "rls-test", intervals_athlete_id: "i-rls-test" },
    });
    assert.equal(
      insert.ok,
      false,
      "athlete_key-Zeile hätte an der RLS with-check-Policy (profile_id = auth.uid()) scheitern müssen"
    );
  });

  test("athlete_sync_config: Trainer darf die Zeile seines Athleten NICHT lesen (kein Coach-Zugriff, wie intervals_credentials)", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest("GET", `athlete_sync_config?profile_id=eq.${athlete.userId}`, {
      token: trainer.token,
    });
    assert.deepEqual(trainerRead.data, [], "Trainer sieht die athlete_sync_config-Zeile seines Athleten — RLS zu weit gefasst");
  });
}
