/* Tests: RLS-Policies aus supabase/migrations/*.sql GEGEN DAS ECHTE
   dashboard-dev-Projekt (kein Mock) — Accounts "Stuhlsen" (Athlet 1) +
   "Trainer-ST" (dessen Coach), die einzige in dashboard-dev bereits real
   verknüpfte Coach-Athlet-Beziehung (per Live-Check ermittelt — die
   ursprünglich angenommenen generischen "athlet-test"/"trainer-test"-
   Accounts aus dem Phase-0-Konzept existieren so nicht; dashboard-dev
   spiegelt stattdessen zwei echte Paare: Trainer-ST↔Stuhlsen,
   Trainer-DZ↔hc_diZee).

   Läuft NUR mit Live-Credentials in .env (s. .claude/skills/sync-pipeline "RLS-Testsuite"):
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

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ATHLETE1_EMAIL, SUPABASE_ATHLETE1_PASSWORD } =
  ENV;
const { SUPABASE_TRAINER_EMAIL, SUPABASE_TRAINER_PASSWORD } = ENV;
const { SUPABASE_ATHLETE2_EMAIL, SUPABASE_ATHLETE2_PASSWORD } = ENV;

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
    {
      skip: 'SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_ATHLETE1_*/SUPABASE_TRAINER_* fehlen — s. .claude/skills/sync-pipeline "RLS-Testsuite"',
    },
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
  async function rest(
    method,
    tablePath,
    { token = null, body, prefer = "return=representation" } = {}
  ) {
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
  let stranger = null; // { token, userId } — Athlet 2: weder Besitzer noch Coach noch Admin (optional, s. before())
  let strangerUsable = false;
  let coachLinkOk = false;
  let testAthleteIsAdmin = false; // ob der test-Account is_admin=true hat → skip der Nicht-Admin-Tests
  let testTrainerIsAdmin = false; // ob der Trainer-Test-Account is_admin=true hat (er ist die Nicht-Admin-Identität der recipes-Verbotstests)
  let originalWellbeingPublic = null;
  let originalViewPrefs; // undefined = noch nicht geprüft, null = existierte nicht
  let originalIntervalsCredentials; // undefined = noch nicht geprüft, null = existierte nicht
  let originalSyncConfig; // undefined = noch nicht geprüft, null = existierte nicht (athlete_sync_config, 0023)
  let planTableReady = false; // training_plans (0028) lesbar? (Migration eingespielt)
  let planActiveAlready = false; // Athlet 1 hat bereits eine echte aktive training_plans-Zeile
  let cxTableReady = false; // coach_exchanges (0034) lesbar? (Migration eingespielt)
  let nutritionGoalsTableReady = false; // nutrition_goals (0058) lesbar? (Migration eingespielt)
  let recipeVotesTableReady = false; // recipe_votes (0063) lesbar? (Migration eingespielt)

  let mealPlanEntriesTableReady = false; // meal_plan_entries (0064) lesbar? (Migration eingespielt)

  /** Aufräum-Funktionen, LIFO im after()-Hook ausgeführt. Jede fängt ihre
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
      `profiles_visible?id=eq.${athlete.userId}&select=id,role,coach_id,is_admin,wellbeing_public`,
      { token: athlete.token }
    );
    const row = profileCheck.data?.[0];
    originalWellbeingPublic = row?.wellbeing_public ?? null;
    testAthleteIsAdmin = row?.is_admin ?? false;
    const trainerProfile = await rest(
      "GET",
      `profiles_visible?id=eq.${trainer.userId}&select=id,is_admin`,
      { token: trainer.token }
    );
    testTrainerIsAdmin = trainerProfile.data?.[0]?.is_admin ?? false;

    // Dritte Identität „Fremder": Athlet 2, nur wenn Credentials da sind und der
    // Account weder Admin noch Coach von Athlet 1 ist. Fehlt sie, überspringen
    // sich die Fremden-Tests einzeln (kein Fehlschlag der Suite).
    if (SUPABASE_ATHLETE2_EMAIL && SUPABASE_ATHLETE2_PASSWORD) {
      try {
        stranger = await signIn(SUPABASE_ATHLETE2_EMAIL, SUPABASE_ATHLETE2_PASSWORD);
        const strangerProfile = await rest(
          "GET",
          `profiles_visible?id=eq.${stranger.userId}&select=id,is_admin`,
          { token: stranger.token }
        );
        strangerUsable =
          strangerProfile.data?.[0]?.is_admin === false && row?.coach_id !== stranger.userId;
      } catch {
        stranger = null;
      }
    }
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

    // training_plans (0028): Tabelle lesbar? Trägt Athlet 1 schon eine echte
    // aktive Zeile (ab E6 möglich)? — steuert unten die destruktiven Tests.
    const planProbe = await rest(
      "GET",
      `training_plans?athlete_id=eq.${athlete.userId}&select=id,is_active`,
      { token: athlete.token }
    );
    planTableReady = planProbe.ok;
    planActiveAlready = planTableReady && (planProbe.data ?? []).some((r) => r.is_active);

    // coach_exchanges (0034): Tabelle lesbar? (Migration eingespielt) —
    // steuert unten den Skip des gesamten Blocks, solange 0034 nach einem
    // frischen Merge noch nicht in dashboard-dev ist.
    const cxProbe = await rest(
      "GET",
      `coach_exchanges?athlete_id=eq.${athlete.userId}&select=id&limit=1`,
      { token: athlete.token }
    );
    cxTableReady = cxProbe.ok;

    // nutrition_goals (0058): Tabelle lesbar? (Migration eingespielt) —
    // steuert unten den Skip des gesamten Blocks, solange 0058 nach einem
    // frischen Merge noch nicht in dashboard-dev ist.
    const ngProbe = await rest(
      "GET",
      `nutrition_goals?profile_id=eq.${athlete.userId}&select=id&limit=1`,
      { token: athlete.token }
    );
    nutritionGoalsTableReady = ngProbe.ok;

    // recipe_votes (0063): Tabelle lesbar? (Migration eingespielt) — steuert unten den Skip.
    const rvProbe = await rest(
      "GET",
      `recipe_votes?select=id&limit=1`,
      { token: athlete.token }
    );
    recipeVotesTableReady = rvProbe.ok;

    // meal_plan_entries (0064): Tabelle lesbar? (Migration eingespielt)
    const mpeProbe = await rest(
      "GET",
      `meal_plan_entries?select=id&limit=1`,
      { token: athlete.token }
    );
    mealPlanEntriesTableReady = mpeProbe.ok;
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

  const coachSkip = () =>
    coachLinkOk ? false : "Coach-Verknüpfung Stuhlsen↔Trainer-ST fehlt (s. Test oben)";

  // --- 1b. profiles: Spalten-Härtung (GitHub Issue #32, Migration 0022) -
  // Vor 0022 lieferte ein unauth. GET /profiles die kompletten Zeilen inkl.
  // coach_id/is_admin. 0022: Basistabelle nur noch id/display_name/role/
  // wellbeing_public öffentlich; sensible Spalten der eigenen bzw. selbst
  // gecoachten Zeile ausschließlich über die View profiles_visible.

  test("profiles: anon liest die 4 öffentlichen Spalten, aber select=* / coach_id / is_admin scheitern", async () => {
    // Nur die 4 explizit gegranteten Spalten -> ok.
    const anonSafe = await rest("GET", "profiles?select=id,display_name,role,wellbeing_public", {
      token: null,
    });
    assert.equal(
      anonSafe.ok,
      true,
      `anon-Read der öffentlichen Spalten fehlgeschlagen: ${JSON.stringify(anonSafe.data)}`
    );
    assert.ok(
      Array.isArray(anonSafe.data) && anonSafe.data.length > 0,
      "profiles liefert anon keine Zeilen"
    );

    // Column-Grant statt Table-Grant: select=* deckt ungegrantete Spalten mit ab -> 42501.
    const anonAll = await rest("GET", "profiles?select=*", { token: null });
    assert.equal(anonAll.ok, false, "select=* auf profiles darf für anon nicht durchgehen (#32)");

    // Explizit angeforderte, nicht gegrantete Spalte -> harter Fehler.
    const anonCol = await rest("GET", "profiles?select=id,coach_id,is_admin", { token: null });
    assert.equal(
      anonCol.ok,
      false,
      "anon darf coach_id/is_admin nicht einmal explizit anfordern können (#32)"
    );
  });

  test("profiles: auch eingeloggt kein coach_id/is_admin über die Basistabelle", async () => {
    const authCol = await rest("GET", `profiles?id=eq.${athlete.userId}&select=coach_id,is_admin`, {
      token: athlete.token,
    });
    assert.equal(
      authCol.ok,
      false,
      "authenticated darf coach_id/is_admin nicht über die Basistabelle lesen (#32)"
    );
  });

  test("profiles_visible: Athlet sieht GENAU die eigene Zeile, mit coach_id/is_admin", async () => {
    const own = await rest("GET", "profiles_visible?select=id,coach_id,is_admin", {
      token: athlete.token,
    });
    assert.equal(own.ok, true, `profiles_visible-Read fehlgeschlagen: ${JSON.stringify(own.data)}`);
    assert.equal(
      own.data.length,
      1,
      "profiles_visible zeigt dem Athleten mehr/weniger als die eigene Zeile"
    );
    assert.equal(own.data[0].id, athlete.userId);
    assert.equal(
      "coach_id" in own.data[0],
      true,
      "profiles_visible muss coach_id der eigenen Zeile führen"
    );
    assert.equal(
      "is_admin" in own.data[0],
      true,
      "profiles_visible muss is_admin der eigenen Zeile führen"
    );
  });

  test("profiles_visible: anon bekommt nichts (kein GRANT)", async () => {
    const anonView = await rest("GET", "profiles_visible?select=id", { token: null });
    assert.equal(anonView.ok, false, "anon darf profiles_visible nicht lesen (#32)");
  });

  test("profiles_visible: Trainer sieht eigene Zeile UND die des gecoachten Athleten", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerView = await rest("GET", "profiles_visible?select=id,coach_id", {
      token: trainer.token,
    });
    assert.equal(trainerView.ok, true);
    const ids = trainerView.data.map((r) => r.id);
    assert.ok(
      ids.includes(trainer.userId),
      "profiles_visible führt die eigene Trainer-Zeile nicht"
    );
    assert.ok(
      ids.includes(athlete.userId),
      "profiles_visible führt die Zeile des gecoachten Athleten nicht"
    );
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
      if (!restore.ok)
        throw new Error(
          `profiles.wellbeing_public nicht zurückgesetzt (Original: ${originalWellbeingPublic})`
        );
    });

    // Testzeile anlegen (note darf laut Schema nie öffentlich werden).
    const insert = await rest("POST", "wellbeing", {
      token: athlete.token,
      body: {
        athlete_id: athlete.userId,
        date: WB_DATE,
        energy: 3,
        muscle_feel: 2,
        mood: 4,
        note: "rls-test",
      },
    });
    assert.equal(
      insert.ok,
      true,
      `wellbeing-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    cleanupTasks.push(async () => {
      const del = await rest(
        "DELETE",
        `wellbeing?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}`,
        {
          token: athlete.token,
        }
      );
      if (!del.ok)
        throw new Error(
          `wellbeing-Testzeile (${WB_DATE}) nicht gelöscht: ${JSON.stringify(del.data)}`
        );
    });

    const anonShared = await rest(
      "GET",
      `wellbeing_shared?athlete_id=eq.${athlete.userId}&date=eq.${WB_DATE}`,
      { token: null }
    );
    assert.equal(anonShared.ok, true);
    assert.deepEqual(
      anonShared.data,
      [],
      "wellbeing_shared zeigt Daten trotz deaktiviertem Toggle"
    );
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
    assert.equal(
      anonShared.data.length,
      1,
      "wellbeing_shared liefert die Testzeile nicht nach Toggle-an"
    );
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
    assert.equal(
      anonBase.ok,
      false,
      "anon darf die wellbeing-Basistabelle nicht direkt lesen (kein GRANT)"
    );
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
      body: {
        athlete_id: athlete.userId,
        created_by: athlete.userId,
        source: "claude",
        op: "cancel",
        payload: {},
      },
    });
    assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `proposals?id=eq.${id}`, { token: athlete.token });
      if (!del.ok || del.data.length !== 1)
        throw new Error(`proposals-Testzeile ${id} nicht gelöscht`);
    });

    // S1 (docs/phase-6-konzept-sichtbarkeit.md): proposals sind öffentlich
    // lesbar, "Portfolio-Kern" — Migration 0010 (Security-Review Etappe B,
    // Fund 1, 31.07.2026) hat die dafür fehlende anon-Policy nachgezogen.
    // Vorher lief dieser Test genau umgekehrt (anon durfte NICHT lesen) —
    // das war ein Bug (S1 unimplementiert), keine gewollte Sperre.
    const anonRead = await rest("GET", `proposals?id=eq.${id}`, { token: null });
    assert.equal(
      anonRead.ok,
      true,
      `anon soll proposals lesen dürfen (S1): ${JSON.stringify(anonRead.data)}`
    );
    assert.equal(anonRead.data.length, 1);
  });

  test("proposals: Athlet kann KEINEN Vorschlag für eine fremde athlete_id anlegen (RLS, nicht nur App-Gate)", async () => {
    const insert = await rest("POST", "proposals", {
      token: athlete.token,
      // athlete-test ist weder athlete_id noch Coach von trainer-tests eigener profile-id.
      body: {
        athlete_id: trainer.userId,
        created_by: athlete.userId,
        source: "claude",
        op: "cancel",
        payload: {},
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde athlete_id hätte an der RLS-Policy scheitern müssen"
    );
  });

  test("proposals: Trainer erstellt für seinen Athleten, Athlet entscheidet, Trainer kann Entscheidung NICHT überschreiben", async (t) => {
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
      if (!reset.ok)
        throw new Error(`proposals-Testzeile ${id}: Status-Reset auf 'open' fehlgeschlagen`);
      const del = await rest("DELETE", `proposals?id=eq.${id}`, { token: trainer.token });
      if (!del.ok || del.data.length !== 1)
        throw new Error(`proposals-Testzeile ${id} nicht gelöscht`);
    });

    // Athlet sieht ihn (Beteiligte lesen).
    const athleteRead = await rest("GET", `proposals?id=eq.${id}`, { token: athlete.token });
    assert.equal(
      athleteRead.data?.length,
      1,
      "Athlet sieht den vom Trainer erstellten Vorschlag nicht"
    );

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
  });

  test("proposals: Trainer kann für eine nicht existierende/nicht gecoachte athlete_id keinen Vorschlag anlegen", async () => {
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
  });

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
        const restore = await rest(
          "PATCH",
          `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`,
          {
            token: trainer.token,
            body: { categories: originalViewPrefs },
          }
        );
        if (!restore.ok)
          throw new Error("trainer_view_prefs: Originalwert nicht wiederhergestellt");
      } else {
        const del = await rest(
          "DELETE",
          `trainer_view_prefs?trainer_id=eq.${trainer.userId}&athlete_id=eq.${athlete.userId}`,
          {
            token: trainer.token,
          }
        );
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
    assert.deepEqual(
      athleteRead.data,
      [],
      "Athlet darf trainer_view_prefs nicht lesen (RLS: trainer_id = auth.uid())"
    );

    const athleteWrite = await rest("POST", "trainer_view_prefs", {
      token: athlete.token,
      prefer: "return=representation,resolution=merge-duplicates",
      body: { trainer_id: trainer.userId, athlete_id: athlete.userId, categories: ["hack"] },
    });
    assert.equal(
      athleteWrite.ok,
      false,
      "Athlet konnte trainer_view_prefs schreiben — RLS greift nicht"
    );

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
      if (!del.ok)
        throw new Error(
          `ftp_history-Testzeile (${FTP_SENTINEL_DATE}) nicht gelöscht: ${JSON.stringify(del.data)}`
        );
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
    assert.equal(
      dup.ok,
      false,
      "Doppelter valid_from-Eintrag hätte am unique-Constraint scheitern müssen"
    );
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
      body: {
        profile_id: athlete.userId,
        ftp_watt: 199,
        valid_from: "1901-01-03",
        source: "geschaetzt",
      },
    });
    assert.equal(
      bad.ok,
      false,
      "source='geschaetzt' (falscher Wert) hätte scheitern müssen — erlaubt ist nur 'schaetzung'"
    );
  });

  test("ftp_history: Trainer liest mit, kann aber nicht für den Athleten schreiben", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest(
      "GET",
      `ftp_history?profile_id=eq.${athlete.userId}&valid_from=eq.${FTP_SENTINEL_DATE}`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data.length,
      1,
      "Trainer sollte den Eintrag seines Athleten lesen können (is_coach_of)"
    );
    assert.equal(trainerRead.data[0].ftp_watt, 199);

    const trainerWrite = await rest("POST", "ftp_history", {
      token: trainer.token,
      body: { profile_id: athlete.userId, ftp_watt: 250, valid_from: "1901-01-04" },
    });
    assert.equal(
      trainerWrite.ok,
      false,
      "Trainer konnte für den Athleten schreiben — es gibt bewusst keine Insert-Policy dafür"
    );
  });

  test("ftp_history: Athlet kann keinen Eintrag für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "ftp_history", {
      token: athlete.token,
      body: { profile_id: trainer.userId, ftp_watt: 199, valid_from: "1901-01-05" },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen"
    );
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
    for (const [label, token] of [
      ["anon", null],
      ["Athlet", athlete.token],
      ["Trainer", trainer.token],
    ]) {
      const read = await rest(
        "GET",
        "session_formats?select=id,label,target_system,currency,evidence_grade,block_targets",
        { token }
      );
      assert.equal(read.ok, true, `${label} sollte session_formats lesen können`);
      assert.ok(
        read.data.length >= 6,
        `${label}: erwartet mind. 6 Startformate (L2-L6), erhalten ${read.data.length}`
      );
    }
  });

  test("session_formats: weder Athlet noch Trainer dürfen schreiben (nur Admin)", async () => {
    const athleteWrite = await rest("POST", "session_formats", {
      token: athlete.token,
      body: {
        id: "rls-test-format",
        label: "RLS-Test",
        target_system: "schwelle",
        currency: "zone-time",
        evidence_grade: "coaching-konsens",
        axes: {},
      },
    });
    assert.equal(
      athleteWrite.ok,
      false,
      "Athlet konnte session_formats schreiben — sollte nur Admin dürfen"
    );

    // PATCH ohne RLS-Match liefert HTTP 200 mit 0 Zeilen, keinen harten
    // Fehler (s. proposals-Block oben) — deshalb data.length prüfen, nicht .ok.
    const trainerWrite = await rest("PATCH", "session_formats?id=eq.sweetspot-long", {
      token: trainer.token,
      body: { label: "Manipuliert" },
    });
    assert.equal(
      trainerWrite.data?.length ?? 0,
      0,
      "Trainer konnte session_formats ändern — sollte nur Admin dürfen"
    );
  });

  test("athlete_formats: unbekannte format_id scheitert am FK-Constraint (kollisionsfrei, keine echten Daten betroffen)", async () => {
    const bad = await rest("POST", "athlete_formats", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "nicht-vorhanden-rls-test" },
    });
    assert.equal(
      bad.ok,
      false,
      "format_id ohne Katalogeintrag hätte am FK-Constraint scheitern müssen"
    );
  });

  test("athlete_formats: anon sieht nichts (kein GRANT), Athlet+Trainer je nach RLS", async (t) => {
    const existing = await rest(
      "GET",
      `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`,
      { token: athlete.token }
    );
    if (!existing.ok)
      return t.skip(
        "athlete_formats nicht lesbar — Migration 0014 vermutlich noch nicht eingespielt"
      );
    if (existing.data.length) {
      return t.skip(
        "bereits eine echte athlete_formats-Zeile für sprint-accessory vorhanden — destruktiver Test übersprungen, um echte Athletenentscheidung nicht anzufassen"
      );
    }

    const insert = await rest("POST", "athlete_formats", {
      token: athlete.token,
      body: { profile_id: athlete.userId, format_id: "sprint-accessory", active: true },
    });
    assert.equal(insert.ok, true, `Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    cleanupTasks.push(async () => {
      const del = await rest(
        "DELETE",
        `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`,
        { token: athlete.token }
      );
      if (!del.ok)
        throw new Error(
          `athlete_formats-Testzeile (sprint-accessory) nicht gelöscht: ${JSON.stringify(del.data)}`
        );
    });

    const anonRead = await rest(
      "GET",
      `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`,
      { token: null }
    );
    assert.equal(anonRead.ok, false, "anon darf athlete_formats nicht lesen (kein GRANT)");

    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest(
      "GET",
      `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data.length,
      1,
      "Trainer sollte die Formatzuordnung seines Athleten lesen können (is_coach_of)"
    );

    // PATCH ohne RLS-Match liefert HTTP 200 mit 0 Zeilen (s. Kommentar beim
    // session_formats-Admin-Test oben) — data.length prüfen, nicht .ok.
    const trainerWrite = await rest(
      "PATCH",
      `athlete_formats?profile_id=eq.${athlete.userId}&format_id=eq.sprint-accessory`,
      {
        token: trainer.token,
        body: { active: false },
      }
    );
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
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen"
    );
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
      if (!del.ok)
        throw new Error(
          `ladder_history-Testzeile (${LADDER_SENTINEL_DATE}) nicht gelöscht: ${JSON.stringify(del.data)}`
        );
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
      body: {
        profile_id: athlete.userId,
        format_id: "sweetspot-long",
        step: 2,
        valid_from: LADDER_SENTINEL_DATE,
        reason: "manual",
      },
    });
    assert.equal(
      dup.ok,
      false,
      "Doppelter (format_id,valid_from)-Eintrag hätte am unique-Constraint scheitern müssen"
    );
  });

  test("ladder_history: step <= 0 scheitert am Check-Constraint", async () => {
    const bad = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: {
        profile_id: athlete.userId,
        format_id: "sweetspot-long",
        step: 0,
        valid_from: "1901-02-02",
        reason: "manual",
      },
    });
    assert.equal(bad.ok, false, "step=0 hätte am Check-Constraint scheitern müssen");
  });

  test("ladder_history: unbekannter reason-Wert scheitert am Check-Constraint", async () => {
    const bad = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: {
        profile_id: athlete.userId,
        format_id: "sweetspot-long",
        step: 1,
        valid_from: "1901-02-03",
        reason: "sonstwas",
      },
    });
    assert.equal(bad.ok, false, "reason='sonstwas' (falscher Wert) hätte scheitern müssen");
  });

  test("ladder_history: unbekannte format_id scheitert am FK-Constraint", async () => {
    const bad = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: {
        profile_id: athlete.userId,
        format_id: "nicht-vorhanden-rls-test",
        step: 1,
        valid_from: "1901-02-04",
        reason: "manual",
      },
    });
    assert.equal(
      bad.ok,
      false,
      "format_id ohne Katalogeintrag hätte am FK-Constraint scheitern müssen"
    );
  });

  test("ladder_history: Trainer liest mit, kann aber nicht für den Athleten schreiben", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest(
      "GET",
      `ladder_history?profile_id=eq.${athlete.userId}&format_id=eq.sweetspot-long&valid_from=eq.${LADDER_SENTINEL_DATE}`,
      { token: trainer.token }
    );
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data.length,
      1,
      "Trainer sollte den Eintrag seines Athleten lesen können (is_coach_of)"
    );

    const trainerWrite = await rest("POST", "ladder_history", {
      token: trainer.token,
      body: {
        profile_id: athlete.userId,
        format_id: "sweetspot-long",
        step: 3,
        valid_from: "1901-02-05",
        reason: "manual",
      },
    });
    assert.equal(
      trainerWrite.ok,
      false,
      "Trainer konnte für den Athleten schreiben — es gibt bewusst keine Insert-Policy dafür"
    );
  });

  test("ladder_history: Athlet kann keinen Eintrag für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "ladder_history", {
      token: athlete.token,
      body: {
        profile_id: trainer.userId,
        format_id: "sweetspot-long",
        step: 1,
        valid_from: "1901-02-06",
        reason: "manual",
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen"
    );
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
      body: {
        profile_id: athlete.userId,
        api_key: "rls-test-key",
        intervals_athlete_id: "i-rls-test",
      },
    });
    assert.equal(upsert.ok, true, `Upsert fehlgeschlagen: ${JSON.stringify(upsert.data)}`);
    cleanupTasks.push(async () => {
      if (originalIntervalsCredentials) {
        const restore = await rest(
          "PATCH",
          `intervals_credentials?profile_id=eq.${athlete.userId}`,
          {
            token: athlete.token,
            body: {
              api_key: originalIntervalsCredentials.api_key,
              intervals_athlete_id: originalIntervalsCredentials.intervals_athlete_id,
            },
          }
        );
        if (!restore.ok)
          throw new Error("intervals_credentials: Originalwert nicht wiederhergestellt");
      } else {
        const del = await rest("DELETE", `intervals_credentials?profile_id=eq.${athlete.userId}`, {
          token: athlete.token,
        });
        if (!del.ok) throw new Error("intervals_credentials-Testzeile nicht gelöscht");
      }
    });

    const anonRead = await rest("GET", `intervals_credentials?profile_id=eq.${athlete.userId}`, {
      token: null,
    });
    assert.equal(anonRead.ok, false, "anon darf intervals_credentials nicht lesen (kein GRANT)");
  });

  test("intervals_credentials: Trainer darf die Zeile seines Athleten NICHT lesen (kein Coach-Zugriff, anders als ftp_history)", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerRead = await rest("GET", `intervals_credentials?profile_id=eq.${athlete.userId}`, {
      token: trainer.token,
    });
    assert.deepEqual(
      trainerRead.data,
      [],
      "Trainer sieht die intervals_credentials-Zeile seines Athleten — RLS zu weit gefasst"
    );
  });

  test("intervals_credentials: Athlet kann keine Zeile für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "intervals_credentials", {
      token: athlete.token,
      body: {
        profile_id: trainer.userId,
        api_key: "rls-test-key",
        intervals_athlete_id: "i-rls-test",
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen"
    );
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
        if (!restore.ok)
          throw new Error("athlete_sync_config: Originalwert nicht wiederhergestellt");
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

    const anonRead = await rest("GET", `athlete_sync_config?profile_id=eq.${athlete.userId}`, {
      token: null,
    });
    assert.equal(anonRead.ok, false, "anon darf athlete_sync_config nicht lesen (kein GRANT)");
  });

  test("athlete_sync_config: Athlet kann keine Zeile für eine fremde profile_id anlegen", async () => {
    const insert = await rest("POST", "athlete_sync_config", {
      token: athlete.token,
      body: {
        profile_id: trainer.userId,
        intervals_api_key: "rls-test",
        intervals_athlete_id: "i-rls-test",
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde profile_id hätte an der RLS-Policy scheitern müssen"
    );
  });

  test("athlete_sync_config: eingeloggte Person kann keine admin-Zeile (athlete_key statt profile_id) anlegen", async () => {
    const insert = await rest("POST", "athlete_sync_config", {
      token: athlete.token,
      body: {
        athlete_key: "athlete999",
        intervals_api_key: "rls-test",
        intervals_athlete_id: "i-rls-test",
      },
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
    assert.deepEqual(
      trainerRead.data,
      [],
      "Trainer sieht die athlete_sync_config-Zeile seines Athleten — RLS zu weit gefasst"
    );
  });

  // --- 10. training_plans (0028, Fahrplan 8 E1) -------------------------
  // Verifikation der neuen Migration 0028_training_plans.sql. training_plans
  // hat KEINEN kollisionssicheren Sentinel-Schlüssel (id = gen_random_uuid,
  // der partielle Unique-Index greift auf athlete_id WHERE is_active) —
  // deshalb: (a) planTableReady prüft, ob die Migration überhaupt
  // eingespielt ist, (b) planActiveAlready überspringt die Tests, die eine
  // AKTIVE Zeile anlegen, falls Athlet 1 ab E6 schon einen echten aktiven
  // Plan trägt. Jede Testzeile wird über ihre id im Cleanup gelöscht;
  // aktiv angelegte Zeilen werden noch IM Test auf is_active=false gesetzt,
  // damit spätere Tests im selben Lauf nicht am Unique-Index scheitern.
  //
  // Wichtig hier (anders als plan_cards, 0011): der Trainer darf für seinen
  // Athleten NICHT nur updaten, sondern eine Plan-Zeile ANLEGEN
  // (Entscheidung 19 — canWriteForAthlete deckt das ab). Das ist der
  // zentrale Positiv-Test unten.
  //
  // Seit Migration 0038 (Fahrplan 14 E4) trägt jede Zeile zusätzlich
  // `sport` ('ride'/'run'/'swim', Default 'ride') und der partielle
  // Unique-Index sitzt auf (athlete_id, sport) statt (athlete_id) allein —
  // ein Athlet kann also einen aktiven Rad- UND Laufplan gleichzeitig
  // tragen. `planBody()` setzt kein `sport` (nutzt den DB-Default), Tests
  // die das prüfen, setzen es explizit.

  const planSkip = () =>
    !planTableReady
      ? "training_plans nicht lesbar — Migration 0028 vermutlich noch nicht eingespielt"
      : false;
  const planActiveSkip = () =>
    planActiveAlready
      ? "Athlet 1 trägt bereits eine echte aktive training_plans-Zeile — Test, der eine aktive Zeile anlegt, übersprungen"
      : false;

  const planBody = (over = {}) => ({
    athlete_id: athlete.userId,
    created_by: athlete.userId,
    is_active: true,
    mode: "open",
    start_date: "1901-03-04", // real unbenutzte Sentinel-Daten (Montag)
    end_date: "1901-04-28",
    weeks: 8,
    model: "linear",
    focus: "allgemein",
    level: "einsteiger",
    training_weekdays: [2, 4, 6],
    weekly_hours: 6,
    indoor_share: 0.5,
    week_model: [],
    ...over,
  });

  /** Legt eine training_plans-Zeile an, registriert das Löschen im Cleanup
   *  und setzt sie sofort auf is_active=false zurück, wenn sie aktiv war —
   *  hält den partiellen Unique-Index für Folgetests frei. */
  async function insertPlanRow(token, over) {
    const insert = await rest("POST", "training_plans", { token, body: planBody(over) });
    assert.equal(
      insert.ok,
      true,
      `training_plans-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `training_plans?id=eq.${id}`, { token: athlete.token });
      if (!del.ok)
        throw new Error(
          `training_plans-Testzeile ${id} nicht gelöscht: ${JSON.stringify(del.data)}`
        );
    });
    if ((over?.is_active ?? true) === true) {
      const off = await rest("PATCH", `training_plans?id=eq.${id}`, {
        token,
        body: { is_active: false },
      });
      assert.equal(
        off.ok,
        true,
        `training_plans: is_active=false-Rücksetzung fehlgeschlagen (${id})`
      );
    }
    return id;
  }

  test("training_plans: Athlet legt eigene aktive Zeile an, liest sie, anon sieht nichts (kein GRANT)", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    if (planActiveSkip()) return t.skip(planActiveSkip());

    const id = await insertPlanRow(athlete.token, {});

    const own = await rest("GET", `training_plans?id=eq.${id}&select=id,mode,model,week_model`, {
      token: athlete.token,
    });
    assert.equal(own.ok, true);
    assert.equal(own.data.length, 1, "Athlet liest die eigene training_plans-Zeile nicht");
    assert.deepEqual(own.data[0].week_model, [], "week_model sollte als leeres Array zurückkommen");

    const anonRead = await rest("GET", `training_plans?id=eq.${id}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf training_plans nicht lesen (kein GRANT)");
  });

  test("training_plans: Trainer legt eine Plan-Zeile für seinen Athleten an (Entscheidung 19 — anders als plan_cards/0011)", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    if (!coachLinkOk) return t.skip(coachSkip());
    if (planActiveSkip()) return t.skip(planActiveSkip());

    // created_by = Trainer, athlete_id = sein Athlet. Muss durchgehen —
    // die for-all-Policy erlaubt is_coach_of() auch beim INSERT.
    const id = await insertPlanRow(trainer.token, { created_by: trainer.userId });

    const trainerRead = await rest("GET", `training_plans?id=eq.${id}&select=id,athlete_id`, {
      token: trainer.token,
    });
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data.length,
      1,
      "Trainer liest die von ihm angelegte Plan-Zeile seines Athleten nicht (is_coach_of)"
    );
  });

  test("training_plans: zweite aktive Zeile für denselben Athleten scheitert am partiellen Unique-Index", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    if (planActiveSkip()) return t.skip(planActiveSkip());

    // Zeile 1 aktiv anlegen und AKTIV lassen (nicht über insertPlanRow, das
    // würde sofort inaktiv setzen). Cleanup löscht sie.
    const first = await rest("POST", "training_plans", { token: athlete.token, body: planBody() });
    assert.equal(first.ok, true, `Insert Zeile 1 fehlgeschlagen: ${JSON.stringify(first.data)}`);
    const firstId = first.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `training_plans?id=eq.${firstId}`, { token: athlete.token });
      if (!del.ok) throw new Error(`training_plans-Testzeile ${firstId} nicht gelöscht`);
    });

    // Zeile 2 aktiv -> Unique-Verletzung ist bei INSERT ein echter Fehler.
    const second = await rest("POST", "training_plans", { token: athlete.token, body: planBody() });
    assert.equal(
      second.ok,
      false,
      "Zweite aktive training_plans-Zeile hätte am partiellen Unique-Index scheitern müssen"
    );
    if (second.ok && Array.isArray(second.data) && second.data[0]?.id) {
      const strayId = second.data[0].id;
      cleanupTasks.push(async () => {
        await rest("DELETE", `training_plans?id=eq.${strayId}`, { token: athlete.token });
      });
    }

    // Zeile 1 inaktiv setzen -> jetzt ist eine neue aktive Zeile wieder ok
    // (beweist: partieller Index, keine harte "eine Zeile je Athlet"-Grenze).
    const off = await rest("PATCH", `training_plans?id=eq.${firstId}`, {
      token: athlete.token,
      body: { is_active: false },
    });
    assert.equal(off.ok, true);
    const third = await insertPlanRow(athlete.token, {});
    assert.ok(third, "Nach is_active=false auf Zeile 1 sollte eine neue aktive Zeile durchgehen");
  });

  test("training_plans: zwei aktive Zeilen desselben Athleten mit verschiedenem sport gehen durch, gleicher sport scheitert weiter (Migration 0038, Fahrplan 14 E4)", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    if (planActiveSkip()) return t.skip(planActiveSkip());

    // Radplan (sport default 'ride') aktiv anlegen und aktiv lassen.
    const ride = await rest("POST", "training_plans", { token: athlete.token, body: planBody() });
    assert.equal(ride.ok, true, `Insert Radplan fehlgeschlagen: ${JSON.stringify(ride.data)}`);
    const rideId = ride.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `training_plans?id=eq.${rideId}`, { token: athlete.token });
      if (!del.ok) throw new Error(`training_plans-Testzeile ${rideId} nicht gelöscht`);
    });

    // Laufplan (sport='run') GLEICHZEITIG aktiv -> muss jetzt durchgehen —
    // der neue Index sitzt auf (athlete_id, sport), nicht mehr (athlete_id)
    // allein.
    const run = await rest("POST", "training_plans", {
      token: athlete.token,
      body: planBody({ sport: "run" }),
    });
    assert.equal(
      run.ok,
      true,
      `Zwei aktive Pläne mit verschiedenem sport hätten durchgehen müssen: ${JSON.stringify(run.data)}`
    );
    const runId = run.data[0]?.id;
    if (runId) {
      cleanupTasks.push(async () => {
        const del = await rest("DELETE", `training_plans?id=eq.${runId}`, { token: athlete.token });
        if (!del.ok) throw new Error(`training_plans-Testzeile ${runId} nicht gelöscht`);
      });
    }

    // Ein ZWEITER aktiver Laufplan (gleicher sport wie oben) scheitert
    // weiter am Unique-Index — jetzt (athlete_id, sport) statt (athlete_id).
    const secondRun = await rest("POST", "training_plans", {
      token: athlete.token,
      body: planBody({ sport: "run" }),
    });
    assert.equal(
      secondRun.ok,
      false,
      "Zweite aktive Zeile mit gleichem sport hätte am Unique-Index scheitern müssen"
    );
    if (secondRun.ok && Array.isArray(secondRun.data) && secondRun.data[0]?.id) {
      const strayId = secondRun.data[0].id;
      cleanupTasks.push(async () => {
        await rest("DELETE", `training_plans?id=eq.${strayId}`, { token: athlete.token });
      });
    }

    // Beide aktiven Zeilen wieder inaktiv setzen, damit Folgetests im
    // selben Lauf nicht am Index scheitern.
    const offRide = await rest("PATCH", `training_plans?id=eq.${rideId}`, {
      token: athlete.token,
      body: { is_active: false },
    });
    assert.equal(offRide.ok, true);
    if (runId) {
      const offRun = await rest("PATCH", `training_plans?id=eq.${runId}`, {
        token: athlete.token,
        body: { is_active: false },
      });
      assert.equal(offRun.ok, true);
    }
  });

  test("training_plans: unbekannte Enum-Werte (mode/model/focus/level/sport) scheitern am CHECK", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    for (const bad of [
      { mode: "foo" },
      { model: "foo" },
      { focus: "foo" },
      { level: "foo" },
      { sport: "foo" },
    ]) {
      const res = await rest("POST", "training_plans", {
        token: athlete.token,
        body: planBody({ is_active: false, ...bad }),
      });
      assert.equal(
        res.ok,
        false,
        `training_plans: ${JSON.stringify(bad)} hätte am CHECK scheitern müssen`
      );
      if (res.ok && Array.isArray(res.data) && res.data[0]?.id) {
        const strayId = res.data[0].id;
        cleanupTasks.push(async () => {
          await rest("DELETE", `training_plans?id=eq.${strayId}`, { token: athlete.token });
        });
      }
    }
  });

  test("training_plans: Athlet kann keine Zeile für eine fremde athlete_id anlegen (RLS with check)", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    // NICHT trainer.userId als "fremde" athlete_id — die Policy hat den
    // OR-Zweig public.is_coach_of(athlete_id), und in dashboard-dev zeigt
    // Trainer-STs coach_id zurück auf Stuhlsen, sodass is_coach_of(trainer)
    // für den Athleten wahr ist und der Insert per Policy erlaubt wäre
    // (derselbe Trap wie im proposals-Block oben). Stattdessen eine gültige,
    // aber nicht existierende UUID: athlete_id = auth.uid() falsch,
    // is_coach_of() falsch, is_admin() falsch UND der profiles-FK schlägt fehl.
    const insert = await rest("POST", "training_plans", {
      token: athlete.token,
      body: planBody({ is_active: false, athlete_id: "00000000-0000-0000-0000-000000000000" }),
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde athlete_id hätte an der RLS with-check-Policy / am FK scheitern müssen"
    );
  });

  test("training_plans: anon darf gar nicht lesen (kein GRANT)", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    const anonRead = await rest("GET", "training_plans?select=id&limit=1", { token: null });
    assert.equal(anonRead.ok, false, "anon darf training_plans nicht lesen (kein GRANT)");
  });

  test("plan_cards: neue Spalte plan_id ist vorhanden und für Bestandskarten null (0028)", async (t) => {
    if (planSkip()) return t.skip(planSkip());
    const read = await rest(
      "GET",
      `plan_cards?athlete_id=eq.${athlete.userId}&select=id,plan_id&limit=5`,
      {
        token: athlete.token,
      }
    );
    assert.equal(
      read.ok,
      true,
      `plan_cards?select=plan_id fehlgeschlagen (Spalte fehlt?): ${JSON.stringify(read.data)}`
    );
    for (const row of read.data) {
      assert.equal("plan_id" in row, true, "plan_cards-Zeile führt die neue Spalte plan_id nicht");
      assert.equal(row.plan_id, null, "Bestandskarte sollte plan_id = null tragen");
    }
  });

  // --- 11. coach_exchanges (0034, Fahrplan 9 Etappe A) ------------------
  // Verifikation der neuen Migration 0034_coach_exchanges.sql. Sichtbarkeit
  // wie proposals/ftp_history (Athlet + Trainer lesen, is_coach_of), aber
  // bewusst KEIN öffentlicher Lesepfad (anders als proposals/0010 — die rohe
  // Claude-Antwort bleibt privat) und KEINE update-Policy. Anlegen darf nur
  // der Athlet für sich selbst (created_by = athlete_id = auth.uid()).
  // Kollisionsfreier Schlüssel: die id aus der Insert-Antwort, im Cleanup
  // per id gelöscht (kein Sentinel-Feld wie bei ftp_history nötig).

  const CX_PRESET = "general";
  const cxSkip = () =>
    !cxTableReady
      ? "coach_exchanges nicht lesbar — Migration 0034 vermutlich noch nicht eingespielt"
      : false;

  async function insertCoachExchangeRow(over = {}) {
    const insert = await rest("POST", "coach_exchanges", {
      token: athlete.token,
      body: {
        athlete_id: athlete.userId,
        created_by: athlete.userId,
        preset: CX_PRESET,
        raw_response: "rls-test — Text + JSON-Block",
        proposal_group_id: null,
        ...over,
      },
    });
    assert.equal(
      insert.ok,
      true,
      `coach_exchanges-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `coach_exchanges?id=eq.${id}`, { token: athlete.token });
      // Athlet hat die Zeile im Test evtl. schon selbst gelöscht -> 0 Treffer
      // ist hier ok, nur ein harter Fehler zählt als Rest.
      if (!del.ok)
        throw new Error(
          `coach_exchanges-Testzeile ${id} nicht gelöscht: ${JSON.stringify(del.data)}`
        );
    });
    return id;
  }

  test("coach_exchanges: Athlet legt eigene Zeile an und liest sie, anon sieht nichts (kein GRANT)", async (t) => {
    if (cxSkip()) return t.skip(cxSkip());
    const id = await insertCoachExchangeRow();

    const ownRead = await rest("GET", `coach_exchanges?id=eq.${id}`, { token: athlete.token });
    assert.equal(ownRead.ok, true);
    assert.equal(ownRead.data.length, 1, "Athlet liest die eigene coach_exchanges-Zeile nicht");

    const anonRead = await rest("GET", `coach_exchanges?id=eq.${id}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf coach_exchanges nicht lesen (kein GRANT)");
  });

  test("coach_exchanges: Athlet kann keine Zeile für eine fremde athlete_id anlegen (WITH CHECK)", async (t) => {
    if (cxSkip()) return t.skip(cxSkip());
    // Die INSERT-Policy hat KEINEN is_coach_of()-OR-Zweig (anders als
    // proposals) — trainer.userId als fremde athlete_id ist deshalb ein
    // sauberer WITH-CHECK-Fehlschlag (athlete_id = auth.uid() falsch); den
    // proposals-Trap ("athlete_id = auth.uid()"-ODER greift trivial) gibt es
    // hier nicht. INSERT wirft bei verletzter WITH-CHECK-Policy einen echten
    // 42501 -> .ok ist verlässlich.
    const insert = await rest("POST", "coach_exchanges", {
      token: athlete.token,
      body: {
        athlete_id: trainer.userId,
        created_by: athlete.userId,
        preset: CX_PRESET,
        raw_response: "rls-test fremd",
        proposal_group_id: null,
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde athlete_id hätte an der WITH-CHECK-Policy scheitern müssen"
    );
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      const strayId = insert.data[0].id;
      cleanupTasks.push(async () => {
        await rest("DELETE", `coach_exchanges?id=eq.${strayId}`, { token: athlete.token });
      });
    }
  });

  test("coach_exchanges: unbekannter preset-Wert scheitert am Check-Constraint", async (t) => {
    if (cxSkip()) return t.skip(cxSkip());
    const bad = await rest("POST", "coach_exchanges", {
      token: athlete.token,
      body: {
        athlete_id: athlete.userId,
        created_by: athlete.userId,
        preset: "sonstwas",
        raw_response: "rls-test",
        proposal_group_id: null,
      },
    });
    assert.equal(bad.ok, false, "preset='sonstwas' hätte am Check-Constraint scheitern müssen");
  });

  test("coach_exchanges: Trainer liest die Zeile seines Athleten, kann aber keine anlegen", async (t) => {
    if (cxSkip()) return t.skip(cxSkip());
    if (!coachLinkOk) return t.skip(coachSkip());
    const id = await insertCoachExchangeRow({ raw_response: "rls-test trainer-read" });

    const trainerRead = await rest("GET", `coach_exchanges?id=eq.${id}`, { token: trainer.token });
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data.length,
      1,
      "Trainer sollte die coach_exchanges-Zeile seines Athleten lesen können (is_coach_of)"
    );

    // Trainer legt für seinen Athleten an -> WITH CHECK verlangt
    // athlete_id = auth.uid() UND created_by = auth.uid(), beim Trainer
    // nicht erfüllbar (es gibt bewusst keine Insert-Policy für ihn).
    const trainerInsert = await rest("POST", "coach_exchanges", {
      token: trainer.token,
      body: {
        athlete_id: athlete.userId,
        created_by: trainer.userId,
        preset: CX_PRESET,
        raw_response: "rls-test trainer-insert",
        proposal_group_id: null,
      },
    });
    assert.equal(
      trainerInsert.ok,
      false,
      "Trainer konnte eine coach_exchanges-Zeile anlegen — es gibt bewusst keine Insert-Policy dafür"
    );
    if (trainerInsert.ok && Array.isArray(trainerInsert.data) && trainerInsert.data[0]?.id) {
      const strayId = trainerInsert.data[0].id;
      cleanupTasks.push(async () => {
        await rest("DELETE", `coach_exchanges?id=eq.${strayId}`, { token: athlete.token });
      });
    }
  });

  test("coach_exchanges: Trainer kann die Zeile seines Athleten NICHT löschen, der Athlet schon", async (t) => {
    if (cxSkip()) return t.skip(cxSkip());
    if (!coachLinkOk) return t.skip(coachSkip());
    const id = await insertCoachExchangeRow({ raw_response: "rls-test delete" });

    // Trainer-DELETE: RLS blendet die nicht "besessene" Zeile aus der
    // Trefferliste aus -> HTTP 200 mit data: [], KEIN Fehlerstatus (s.
    // Kopfkommentar der Datei). Deshalb data.length prüfen, nicht .ok.
    const trainerDel = await rest("DELETE", `coach_exchanges?id=eq.${id}`, {
      token: trainer.token,
    });
    assert.equal(
      trainerDel.data?.length ?? 0,
      0,
      "Trainer konnte die coach_exchanges-Zeile seines Athleten löschen — Delete-Policy (athlete_id = auth.uid()) greift nicht"
    );

    // Zeile ist noch da.
    const stillThere = await rest("GET", `coach_exchanges?id=eq.${id}`, { token: athlete.token });
    assert.equal(
      stillThere.data.length,
      1,
      "coach_exchanges-Zeile wurde vom Trainer-DELETE tatsächlich entfernt"
    );

    // Athlet löscht die eigene Zeile -> genau 1 Treffer.
    const athleteDel = await rest("DELETE", `coach_exchanges?id=eq.${id}`, {
      token: athlete.token,
    });
    assert.equal(athleteDel.ok, true);
    assert.equal(
      athleteDel.data.length,
      1,
      "Athlet konnte die eigene coach_exchanges-Zeile nicht löschen"
    );
  });

  test("coach_exchanges: anon darf gar nicht lesen (kein GRANT)", async (t) => {
    if (cxSkip()) return t.skip(cxSkip());
    const anonRead = await rest("GET", "coach_exchanges?select=id&limit=1", { token: null });
    assert.equal(anonRead.ok, false, "anon darf coach_exchanges nicht lesen (kein GRANT)");
  });

  // --- 12. profiles_own + has_password (0039, Fahrplan 17 E1) ------------
  // Verifikation der neuen Migration 0039_profile_basics.sql. Zentrale
  // Datenschutz-Nuance (V1): profiles' SELECT-Policy ist "using (true)" —
  // die neuen Spalten (gender/height_cm/weight_kg/hr_max/has_password/
  // updated_at) dürfen deshalb NICHT über die Basistabelle oder
  // profiles_visible lesbar sein, nur über die neue self-only View
  // profiles_own. has_password ist nirgends user-schreibbar, nur die
  // security-definer-RPC mark_password_set() darf es setzen (V2, seit
  // Migration 0042 statt eines Triggers auf auth.users — s. dort).

  test("profiles: die neuen Basisdaten-Spalten sind auch für den Eigentümer nicht über die Basistabelle lesbar (nur profiles_own)", async () => {
    const own = await rest(
      "GET",
      `profiles?id=eq.${athlete.userId}&select=id,gender,height_cm,weight_kg,hr_max,has_password`,
      { token: athlete.token }
    );
    assert.equal(
      own.ok,
      false,
      "profiles-Basistabelle darf die neuen Spalten nicht ausliefern, selbst für die eigene Zeile (kein Spalten-Grant, s. V1)"
    );
  });

  test("profiles_visible: führt keine der neuen Basisdaten-Spalten", async () => {
    const own = await rest("GET", "profiles_visible?select=*", { token: athlete.token });
    assert.equal(own.ok, true, `profiles_visible-Read fehlgeschlagen: ${JSON.stringify(own.data)}`);
    const row = own.data.find((r) => r.id === athlete.userId);
    assert.ok(row, "profiles_visible führt die eigene Zeile nicht");
    for (const col of [
      "gender",
      "height_cm",
      "weight_kg",
      "hr_max",
      "has_password",
      "birthdate",
      "resting_hr",
    ]) {
      assert.equal(
        col in row,
        false,
        `profiles_visible darf ${col} nicht führen (das wäre für ALLE Nutzer lesbar)`
      );
    }
  });

  test("profiles_own: Athlet sieht genau die eigene Zeile mit allen neuen Feldern", async () => {
    const own = await rest("GET", "profiles_own", { token: athlete.token });
    assert.equal(own.ok, true, `profiles_own-Read fehlgeschlagen: ${JSON.stringify(own.data)}`);
    assert.equal(
      own.data.length,
      1,
      "profiles_own zeigt dem Athleten mehr/weniger als die eigene Zeile"
    );
    const row = own.data[0];
    assert.equal(row.id, athlete.userId);
    for (const col of [
      "has_password",
      "birthdate",
      "resting_hr",
      "gender",
      "height_cm",
      "weight_kg",
      "hr_max",
      "updated_at",
    ]) {
      assert.equal(col in row, true, `profiles_own muss ${col} führen`);
    }
  });

  test("profiles_own: anon bekommt nichts (kein GRANT)", async () => {
    const anonView = await rest("GET", "profiles_own?select=id", { token: null });
    assert.equal(anonView.ok, false, "anon darf profiles_own nicht lesen (kein GRANT)");
  });

  test("profiles_own: Trainer sieht dort NICHT die Zeile seines Athleten (self-only, keine Coach-Ausnahme)", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerView = await rest("GET", `profiles_own?id=eq.${athlete.userId}`, {
      token: trainer.token,
    });
    assert.equal(trainerView.ok, true);
    assert.deepEqual(
      trainerView.data,
      [],
      "profiles_own darf dem Trainer nicht die Zeile seines Athleten zeigen (id = auth.uid())"
    );
  });

  test("profiles: fremder PATCH auf die neuen Spalten scheitert (RLS 'eigenes Profil ändern', id = auth.uid())", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    // PATCH ohne RLS-Match liefert HTTP 200 mit 0 Zeilen, keinen harten
    // Fehler (s. Kopfkommentar der Datei) — data.length prüfen, nicht .ok.
    const foreignPatch = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: trainer.token,
      body: { gender: "divers", height_cm: 180 },
      prefer: "return=representation",
    });
    assert.equal(
      foreignPatch.data?.length ?? 0,
      0,
      "Trainer konnte die neuen Basisdaten-Spalten des Athleten schreiben — RLS 'eigenes Profil ändern' greift nicht"
    );
  });

  test("profiles_own: has_password ist nicht direkt schreibbar (kein Grant, nur mark_password_set() darf setzen)", async () => {
    const patch = await rest("PATCH", `profiles_own?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { has_password: true },
    });
    assert.equal(
      patch.ok,
      false,
      "PATCH auf profiles_own mit has_password hätte an fehlendem UPDATE-Grant scheitern müssen"
    );
  });

  const HAS_SERVICE_ROLE = !!ENV.SUPABASE_SERVICE_ROLE_KEY;

  test("profiles: RPC mark_password_set() setzt has_password nur für die eigene Zeile (Migration 0042, ersetzt den auth.users-Trigger aus 0039)", async (t) => {
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — RPC-Test übersprungen");

    const authHeaders = {
      apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    // Wirft KEINE echte Mail (generate_link liefert den Link nur im
    // Response-Body zurück, verschickt nichts — s. admin-api/invite.js
    // Kopfkommentar). GoTrue haengt selbst schon beim Einladen ein
    // zufaelliges Passwort an (Migration-0042-Befund) — für diesen Test
    // wird direkt danach EIN BEKANNTES Passwort per Admin-API gesetzt,
    // rein als Testsetup, nicht der zu prüfende Pfad.
    const testEmail = `rls-test-mark-password-${Date.now()}@example.com`;
    const testPassword = "rls-test-Passw0rd-9x!";
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ type: "invite", email: testEmail }),
    });
    const createdText = await created.text();
    let createdBody = null;
    try {
      createdBody = createdText ? JSON.parse(createdText) : null;
    } catch {
      createdBody = createdText;
    }
    assert.equal(
      created.ok,
      true,
      `admin/generate_link fehlgeschlagen: ${JSON.stringify(createdBody)}`
    );
    const testUserId = createdBody?.id;
    assert.ok(testUserId, `admin/generate_link lieferte keine id: ${JSON.stringify(createdBody)}`);

    cleanupTasks.push(async () => {
      // Cascade (profiles.id references auth.users(id) on delete cascade,
      // 0001) räumt die zugehörige profiles-Zeile mit auf.
      const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUserId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!del.ok)
        throw new Error(
          `Test-Account ${testUserId} (mark_password_set) nicht gelöscht: ${await del.text()}`
        );
    });

    // email_confirm: true noetig, damit der anschliessende Login klappt —
    // anders als der lokale Self-Host-Stack (GOTRUE_MAILER_AUTOCONFIRM)
    // bestaetigt dashboard-dev E-Mails nicht automatisch.
    const setPassword = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUserId}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ password: testPassword, role: "authenticated", email_confirm: true }),
    });
    assert.equal(
      setPassword.ok,
      true,
      `admin-Passwort-Setup fehlgeschlagen: ${await setPassword.text()}`
    );

    const before = await rest("GET", `profiles?id=eq.${testUserId}&select=has_password`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(
      before.ok,
      true,
      `profiles-Read (service_role) fehlgeschlagen: ${JSON.stringify(before.data)}`
    );
    assert.equal(
      before.data?.[0]?.has_password,
      false,
      "has_password sollte vor dem RPC-Aufruf false sein (Default)"
    );

    const testUser = await signIn(testEmail, testPassword);
    const rpcRes = await rest("POST", "rpc/mark_password_set", { token: testUser.token, body: {} });
    assert.equal(
      rpcRes.ok,
      true,
      `mark_password_set() fehlgeschlagen: ${JSON.stringify(rpcRes.data)}`
    );

    const after = await rest("GET", `profiles?id=eq.${testUserId}&select=has_password`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(after.ok, true);
    assert.equal(
      after.data?.[0]?.has_password,
      true,
      "mark_password_set() hat has_password nicht auf true gesetzt"
    );

    // Gegenprobe: die Funktion darf NUR die eigene Zeile treffen (id =
    // auth.uid() in der security-definer-Funktion) — der eingeloggte
    // Athlet darf über denselben Aufruf nicht fremde Zeilen verändern.
    const athleteBefore = await rest(
      "GET",
      `profiles?id=eq.${athlete.userId}&select=has_password`,
      {
        token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      }
    );
    const athleteRpc = await rest("POST", "rpc/mark_password_set", {
      token: testUser.token,
      body: {},
    });
    assert.equal(athleteRpc.ok, true);
    const athleteAfter = await rest("GET", `profiles?id=eq.${athlete.userId}&select=has_password`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(
      athleteAfter.data?.[0]?.has_password,
      athleteBefore.data?.[0]?.has_password,
      "mark_password_set() hat eine fremde Zeile (Stuhlsen) verändert — security-definer-Grenze verletzt"
    );
  });

  test(
    "bikes (0047/0051): Basistabelle nur für Eigentümer/Coach/Admin lesbar, bikes_public (ohne notes) für alle authenticated",
    { skip: !HAS_CREDS },
    async () => {
      // 1. Anon darf weder Basistabelle noch die öffentliche Sicht lesen
      const anonRead = await rest("GET", "bikes");
      assert.notEqual(
        anonRead.status,
        200,
        "anon sollte bikes nicht ohne Authentifizierung lesen können"
      );
      const anonPublicRead = await rest("GET", "bikes_public");
      assert.notEqual(
        anonPublicRead.status,
        200,
        "anon sollte bikes_public nicht ohne Authentifizierung lesen können"
      );

      // 2. Athlet 1 darf eigenes Rad anlegen
      const insertRes = await rest("POST", "bikes", {
        token: athlete.token,
        body: {
          profile_id: athlete.userId,
          name: "Test Gravel Bike",
          bike_type: "gravel",
          crank_length_mm: 172,
          notes: "GEHEIME TESTNOTIZ",
        },
      });

      // Falls Migration 0047 in dashboard-dev noch nicht ausgeführt wurde (404/relation does not exist),
      // Test sauber überspringen / melden
      if (insertRes.status === 404 || insertRes.data?.message?.includes("does not exist")) {
        console.warn(
          "Migration 0047_bikes.sql noch nicht in dashboard-dev eingespielt — Test übersprungen"
        );
        return;
      }

      assert.equal(
        insertRes.ok,
        true,
        `Insert durch Athlet fehlgeschlagen: ${JSON.stringify(insertRes.data)}`
      );
      const bikeId = insertRes.data?.[0]?.id;
      assert.ok(bikeId, "Keine bikeId zurückgegeben");

      cleanupTasks.push(async () => {
        await rest("DELETE", `bikes?id=eq.${bikeId}`, { token: athlete.token });
      });

      // 3. Trainer darf das Rad des betreuten Athleten über die Basistabelle lesen (inkl. notes)
      const trainerRead = await rest("GET", `bikes?id=eq.${bikeId}`, { token: trainer.token });
      assert.equal(trainerRead.ok, true);
      assert.equal(trainerRead.data?.length, 1, "Trainer sollte das Rad des Athleten lesen können");

      // 3b. Migration 0051 (Security-Review-Fund): bikes_public. Falls in
      // dashboard-dev noch nicht eingespielt, hier sauber überspringen statt
      // den ganzen Test scheitern zu lassen (Muster wie oben bei 0047).
      const publicProbe = await rest("GET", `bikes_public?id=eq.${bikeId}&select=name`, {
        token: trainer.token,
      });
      if (publicProbe.status === 404 || publicProbe.data?.message?.includes("does not exist")) {
        console.warn(
          "Migration 0051_bikes_notes_private.sql noch nicht in dashboard-dev eingespielt — Rest des Tests übersprungen"
        );
        return;
      }

      // 3c. notes ist NICHT über die öffentliche Sicht bikes_public erreichbar —
      // die Spalte existiert dort strukturell nicht, unabhängig davon wer fragt
      // (kein Zeilenfilter, sondern eine fehlende Spalte).
      const publicNotesQuery = await rest("GET", `bikes_public?id=eq.${bikeId}&select=name,notes`, {
        token: trainer.token,
      });
      assert.notEqual(
        publicNotesQuery.status,
        200,
        "notes sollte in bikes_public gar nicht existieren"
      );

      // 3d. Aber Name/Typ/Kurbellänge bleiben über bikes_public für jeden authenticated
      // Nutzer sichtbar (OF-6 — unverändert durch 0051).
      const publicRead = await rest(
        "GET",
        `bikes_public?id=eq.${bikeId}&select=name,bike_type,crank_length_mm`,
        {
          token: trainer.token,
        }
      );
      assert.equal(publicRead.ok, true);
      assert.equal(publicRead.data?.[0]?.name, "Test Gravel Bike");

      // 4. Trainer darf das Rad des betreuten Athleten aktualisieren
      const trainerUpdate = await rest("PATCH", `bikes?id=eq.${bikeId}`, {
        token: trainer.token,
        body: { notes: "Vom Coach geprüft" },
      });
      assert.equal(
        trainerUpdate.ok,
        true,
        `Update durch Coach fehlgeschlagen: ${JSON.stringify(trainerUpdate.data)}`
      );

      // 5. Athlet darf sein Rad löschen
      const deleteRes = await rest("DELETE", `bikes?id=eq.${bikeId}`, { token: athlete.token });
      assert.equal(
        deleteRes.ok,
        true,
        `Delete durch Athlet fehlgeschlagen: ${JSON.stringify(deleteRes.data)}`
      );
    }
  );

  test(
    "bikefit_fittings & bikefit_iterations (0048): nur eigener Athlet/Trainer/Admin lesen+schreiben, kein anon",
    { skip: !HAS_CREDS },
    async () => {
      // 1. Anon darf weder fittings noch iterations lesen
      const anonFittings = await rest("GET", "bikefit_fittings");
      assert.notEqual(anonFittings.status, 200, "anon sollte bikefit_fittings nicht lesen können");

      const anonIterations = await rest("GET", "bikefit_iterations");
      assert.notEqual(
        anonIterations.status,
        200,
        "anon sollte bikefit_iterations nicht lesen können"
      );

      // 2. Rad anlegen für den Fitting-Test
      const bikeRes = await rest("POST", "bikes", {
        token: athlete.token,
        body: {
          profile_id: athlete.userId,
          name: "Fit Test Bike",
          bike_type: "road",
        },
      });

      if (bikeRes.status === 404 || bikeRes.data?.message?.includes("does not exist")) {
        console.warn(
          "Migration 0047/0048 noch nicht in dashboard-dev eingespielt — Test übersprungen"
        );
        return;
      }
      const testBikeId = bikeRes.data?.[0]?.id;
      assert.ok(testBikeId, "Test-Bike konnte nicht angelegt werden");
      cleanupTasks.push(async () => {
        await rest("DELETE", `bikes?id=eq.${testBikeId}`, { token: athlete.token });
      });

      // 3. Fitting anlegen durch Athleten
      const fitRes = await rest("POST", "bikefit_fittings", {
        token: athlete.token,
        body: {
          profile_id: athlete.userId,
          bike_id: testBikeId,
          status: "active",
          target_goal: "balanced",
        },
      });

      if (fitRes.status === 404 || fitRes.data?.message?.includes("does not exist")) {
        console.warn("Migration 0048 noch nicht in dashboard-dev eingespielt — Test übersprungen");
        return;
      }
      assert.equal(
        fitRes.ok,
        true,
        `Fitting-Insert fehlgeschlagen: ${JSON.stringify(fitRes.data)}`
      );
      const fittingId = fitRes.data?.[0]?.id;
      assert.ok(fittingId, "Keine fittingId erhalten");
      cleanupTasks.push(async () => {
        await rest("DELETE", `bikefit_fittings?id=eq.${fittingId}`, { token: athlete.token });
      });

      // 4. Zweites aktives Fitting auf demselben Rad muss am partiellen Unique-Index scheitern (B4)
      const dupFitRes = await rest("POST", "bikefit_fittings", {
        token: athlete.token,
        body: {
          profile_id: athlete.userId,
          bike_id: testBikeId,
          status: "active",
        },
      });
      assert.equal(
        dupFitRes.ok,
        false,
        "Zweites aktives Fitting auf demselben Rad hätte scheitern müssen"
      );

      // 5. Iteration anlegen durch Athleten
      const iterRes = await rest("POST", "bikefit_iterations", {
        token: athlete.token,
        body: {
          fitting_id: fittingId,
          sequence: 1,
          points: { legs: { hip: { x: 10, y: 20 } } },
          angles: { kneeAngle: 145 },
          recommendation: { kneeAngle: { direction: "ok" } },
        },
      });
      assert.equal(
        iterRes.ok,
        true,
        `Iteration-Insert fehlgeschlagen: ${JSON.stringify(iterRes.data)}`
      );
      const iterationId = iterRes.data?.[0]?.id;
      assert.ok(iterationId, "Keine iterationId erhalten");

      // 6. Trainer darf Fitting & Iteration seines Athleten lesen
      const trainerFitRead = await rest("GET", `bikefit_fittings?id=eq.${fittingId}`, {
        token: trainer.token,
      });
      assert.equal(trainerFitRead.ok, true);
      assert.equal(
        trainerFitRead.data?.length,
        1,
        "Trainer sollte das Fitting seines Athleten lesen können"
      );

      const trainerIterRead = await rest("GET", `bikefit_iterations?fitting_id=eq.${fittingId}`, {
        token: trainer.token,
      });
      assert.equal(trainerIterRead.ok, true);
      assert.equal(
        trainerIterRead.data?.length,
        1,
        "Trainer sollte die Iteration seines Athleten lesen können"
      );
    }
  );

  // --- 11. profiles.sports (0052, Fahrplan 21 E1) -------------------------
  // Verifikation der neuen Migration 0052_athlete_sports.sql: Sportarten als
  // self-service Spalte auf profiles, sichtbar für Athlet + Trainer über
  // profiles_visible (Q5). PATCH ohne RLS-Match liefert HTTP 200 mit 0
  // Zeilen (s. Kommentar beim session_formats-Admin-Test oben) — Negativ-
  // asserts deshalb data.length prüfen, nicht .ok. Der Originalwert von
  // Athlet 1 wird gesichert und nach dem Test wiederhergestellt, damit kein
  // echter Athlet seinen konfigurierten Wert verliert.

  let originalSports; // undefined = noch nicht geprüft, null = Spalte/Zeile fehlte

  test("profiles.sports: Athlet 1 trägt heute einen gültigen Wert (Golden-Master-Basis)", async () => {
    const read = await rest("GET", `profiles_visible?id=eq.${athlete.userId}&select=id,sports`, {
      token: athlete.token,
    });
    assert.equal(
      read.ok,
      true,
      `profiles_visible-Read fehlgeschlagen: ${JSON.stringify(read.data)}`
    );
    originalSports = read.data?.[0]?.sports ?? null;
    assert.ok(
      Array.isArray(originalSports) && originalSports.length >= 1,
      "Athlet 1 sollte mindestens eine Sportart tragen"
    );
    assert.ok(
      originalSports.every((s) => ["ride", "run", "swim"].includes(s)),
      `Unerwartete Sportart in ${JSON.stringify(originalSports)}`
    );
  });

  test("profiles.sports: Athlet kann eigene Sportarten ändern (self-service)", async () => {
    const patch = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { sports: ["ride", "run"] },
      prefer: "return=minimal",
    });
    assert.equal(patch.ok, true, `sports-Update fehlgeschlagen: ${JSON.stringify(patch.data)}`);
    cleanupTasks.push(async () => {
      const restore = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
        token: athlete.token,
        body: { sports: originalSports ?? ["ride"] },
        prefer: "return=minimal",
      });
      if (!restore.ok) {
        throw new Error(
          `profiles.sports nicht zurückgesetzt (Original: ${JSON.stringify(originalSports)})`
        );
      }
    });

    const readBack = await rest("GET", `profiles_visible?id=eq.${athlete.userId}&select=sports`, {
      token: athlete.token,
    });
    assert.equal(readBack.ok, true);
    assert.deepEqual(
      readBack.data?.[0]?.sports,
      ["ride", "run"],
      "sports-Update wurde nicht übernommen"
    );
  });

  test("profiles.sports: leeres Array scheitert am Check-Constraint", async () => {
    const bad = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { sports: [] },
      prefer: "return=minimal",
    });
    // PATCH mit Constraint-Verletzung wirft einen echten Fehler (kein
    // stilles 0-Rows), .ok ist hier verlässlich.
    assert.equal(bad.ok, false, "Leere sports-Liste hätte am Check-Constraint scheitern müssen");
  });

  test("profiles.sports: ungültige Sportart scheitert am Check-Constraint", async () => {
    const bad = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { sports: ["strength"] },
      prefer: "return=minimal",
    });
    assert.equal(bad.ok, false, "sports=['strength'] hätte am Check-Constraint scheitern müssen");
  });

  test("profiles.sports: Athlet darf fremde Sportarten nicht ändern (RLS)", async () => {
    const patch = await rest("PATCH", `profiles?id=eq.${trainer.userId}`, {
      token: athlete.token,
      body: { sports: ["ride", "swim"] },
      prefer: "return=minimal",
    });
    // RLS blendet die fremde Zeile aus -> 0 betroffene Zeilen (HTTP 200).
    assert.equal(
      patch.data?.length ?? 0,
      0,
      "Athlet konnte fremde sports ändern — RLS greift nicht"
    );
  });

  test("profiles.sports: Trainer sieht die Sportarten seines gecoachten Athleten (profiles_visible)", async (t) => {
    if (!coachLinkOk) return t.skip(coachSkip());
    const trainerView = await rest(
      "GET",
      `profiles_visible?id=eq.${athlete.userId}&select=id,sports`,
      { token: trainer.token }
    );
    assert.equal(trainerView.ok, true);
    assert.equal(
      trainerView.data.length,
      1,
      "profiles_visible führt die Zeile des gecoachten Athleten nicht"
    );
    assert.ok(
      Array.isArray(trainerView.data[0].sports) && trainerView.data[0].sports.length >= 1,
      "Trainer sieht keine gültigen Sportarten des gecoachten Athleten"
    );
  });

  // --- 9. waitlist (0054): anon/authenticated dürfen NUR einfügen --------
  // Öffentliche Landing-Warteliste, anon/authenticated haben nur INSERT.
  // Insert mit `return=minimal`: der rest()-Default `return=representation`
  // liest die neue Zeile zurück und bräuchte dafür SELECT — genau das hat
  // anon absichtlich nicht (die App nutzt supabase-js ohne .select(), also
  // ebenfalls minimal). Aufräumen geht nur per Service-Role, weil anon kein
  // DELETE hat; ohne Service-Role-Key wird der Insert-Test übersprungen,
  // statt eine Zeile in dashboard-dev liegen zu lassen.

  const WAITLIST_SENTINEL = `rls-test-${Date.now()}@example.com`;

  test("waitlist: anon darf eine E-Mail eintragen", async (t) => {
    if (!ENV.SUPABASE_SERVICE_ROLE_KEY) {
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufräumen kein Insert-Test");
    }
    const insert = await rest("POST", "waitlist", {
      token: null,
      body: { email: WAITLIST_SENTINEL },
      prefer: "return=minimal",
    });
    assert.equal(
      insert.ok,
      true,
      `waitlist-Insert für anon fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    cleanupTasks.push(async () => {
      const del = await rest(
        "DELETE",
        `waitlist?email=eq.${encodeURIComponent(WAITLIST_SENTINEL)}`,
        {
          token: ENV.SUPABASE_SERVICE_ROLE_KEY,
          prefer: "return=minimal",
        }
      );
      if (!del.ok) throw new Error(`waitlist-Sentinel nicht gelöscht: ${JSON.stringify(del.data)}`);
    });
  });

  // 0055: anon darf nur die Spalte `email` setzen, `source` & Co. nicht.
  // Aufräumen trotzdem registrieren: fehlt 0055 in dashboard-dev, geht der
  // Insert durch und die Zeile soll nicht liegen bleiben.
  const WAITLIST_SOURCE_SENTINEL = `rls-test-source-${Date.now()}@example.com`;

  test("waitlist: anon darf source NICHT selbst setzen (nur email-Spaltenrecht, 0055)", async (t) => {
    if (!ENV.SUPABASE_SERVICE_ROLE_KEY) {
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufräumen kein Insert-Test");
    }
    cleanupTasks.push(async () => {
      const del = await rest(
        "DELETE",
        `waitlist?email=eq.${encodeURIComponent(WAITLIST_SOURCE_SENTINEL)}`,
        {
          token: ENV.SUPABASE_SERVICE_ROLE_KEY,
          prefer: "return=minimal",
        }
      );
      if (!del.ok)
        throw new Error(`waitlist-Source-Sentinel nicht gelöscht: ${JSON.stringify(del.data)}`);
    });
    const insert = await rest("POST", "waitlist", {
      token: null,
      body: { email: WAITLIST_SOURCE_SENTINEL, source: "manipuliert" },
      prefer: "return=minimal",
    });
    assert.equal(
      insert.ok,
      false,
      "anon darf source nicht setzen — nur INSERT (email) ist gegrantet"
    );
  });

  test("waitlist: anon kann die Warteliste NICHT lesen (kein select-Grant)", async () => {
    const read = await rest("GET", "waitlist?select=email&limit=1", { token: null });
    assert.equal(read.ok, false, "anon darf die waitlist nicht lesen — kein select-Grant");
  });

  // --- 10. nutrition_goals (0058): owner-only, kein Coach-Zugriff ----------
  // Strikte Owner-only-RLS (kein is_coach_of/is_admin, anders als bikes/0047).
  // INSERT mit return=representation gibt die Zeile zurück (SELECT läuft dann
  // über die owner-only Policy). Aufräumen über id im cleanupTasks.

  const NG_GOAL_TYPE = "maintain";
  const ngSkip = () =>
    !nutritionGoalsTableReady
      ? "nutrition_goals nicht lesbar — Migration 0058 vermutlich noch nicht eingespielt"
      : false;

  async function insertNutritionGoalRow(over = {}) {
    const insert = await rest("POST", "nutrition_goals", {
      token: athlete.token,
      body: {
        profile_id: athlete.userId,
        goal_type: NG_GOAL_TYPE,
        ...over,
      },
    });
    assert.equal(
      insert.ok,
      true,
      `nutrition_goals-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `nutrition_goals?id=eq.${id}`, { token: athlete.token });
      if (!del.ok)
        throw new Error(
          `nutrition_goals-Testzeile ${id} nicht gelöscht: ${JSON.stringify(del.data)}`
        );
    });
    return id;
  }

  test("nutrition_goals: Athlet legt eigene Zeile an und liest sie, anon sieht nichts (kein GRANT)", async (t) => {
    if (ngSkip()) return t.skip(ngSkip());
    const id = await insertNutritionGoalRow();

    const ownRead = await rest("GET", `nutrition_goals?id=eq.${id}`, { token: athlete.token });
    assert.equal(ownRead.ok, true);
    assert.equal(ownRead.data.length, 1, "Athlet liest die eigene nutrition_goals-Zeile nicht");

    const anonRead = await rest("GET", `nutrition_goals?id=eq.${id}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf nutrition_goals nicht lesen (kein GRANT)");
  });

  test("nutrition_goals: Athlet kann keine Zeile für eine fremde profile_id anlegen (WITH CHECK)", async (t) => {
    if (ngSkip()) return t.skip(ngSkip());
    // Owner-only: trainer.userId als fremde profile_id -> WITH CHECK (profile_id = auth.uid()) scheitert
    const insert = await rest("POST", "nutrition_goals", {
      token: athlete.token,
      body: {
        profile_id: trainer.userId,
        goal_type: NG_GOAL_TYPE,
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert für fremde profile_id hätte an der WITH-CHECK-Policy scheitern müssen"
    );
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      const strayId = insert.data[0].id;
      cleanupTasks.push(async () => {
        await rest("DELETE", `nutrition_goals?id=eq.${strayId}`, { token: athlete.token });
      });
    }
  });

  test("nutrition_goals: unbekannter goal_type scheitert am Check-Constraint", async (t) => {
    if (ngSkip()) return t.skip(ngSkip());
    const bad = await rest("POST", "nutrition_goals", {
      token: athlete.token,
      body: {
        profile_id: athlete.userId,
        goal_type: "sonstwas",
      },
    });
    assert.equal(bad.ok, false, "goal_type='sonstwas' hätte am Check-Constraint scheitern müssen");
  });

  test("nutrition_goals: Trainer sieht die Zeile seines Athleten NICHT (owner-only, kein is_coach_of)", async (t) => {
    if (ngSkip()) return t.skip(ngSkip());
    if (!coachLinkOk) return t.skip("Trainer-ST ist nicht als Coach verknüpft");
    const id = await insertNutritionGoalRow({ goal_type: "gain", pace_per_week_kg: 0.3 });

    // Trainer-SELECT: RLS blendet die nicht "besessene" Zeile aus -> HTTP 200 mit data: [], kein Fehlerstatus
    const trainerRead = await rest("GET", `nutrition_goals?id=eq.${id}`, { token: trainer.token });
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data?.length ?? 0,
      0,
      "Trainer sollte die nutrition_goals-Zeile des Athleten nicht sehen (owner-only)"
    );

    // Trainer-DELETE ebenfalls unsichtbar
    const trainerDel = await rest("DELETE", `nutrition_goals?id=eq.${id}`, {
      token: trainer.token,
    });
    assert.equal(
      trainerDel.data?.length ?? 0,
      0,
      "Trainer konnte die nutrition_goals-Zeile des Athleten löschen — RLS hätte sie ausblenden müssen"
    );

    // Zeile ist noch da
    const stillThere = await rest("GET", `nutrition_goals?id=eq.${id}`, { token: athlete.token });
    assert.equal(stillThere.data.length, 1, "nutrition_goals-Zeile wurde durch Trainer-Operation entfernt");
  });

  test("nutrition_goals: Athlet kann NICHT aktualisieren (Append-Only, kein update-GRANT), aber löschen", async (t) => {
    if (ngSkip()) return t.skip(ngSkip());
    const id = await insertNutritionGoalRow({ goal_type: "lose", pace_per_week_kg: -0.5 });

    // Athlet darf NICHT aktualisieren — kein update-GRANT für authenticated.
    // PostgREST antwortet mit 405 (Method Not Allowed) oder 400.
    const update = await rest("PATCH", `nutrition_goals?id=eq.${id}`, {
      token: athlete.token,
      body: { pace_per_week_kg: -0.3 },
    });
    assert.equal(
      update.ok,
      false,
      "PATCH an nutrition_goals hätte ohne update-GRANT scheitern müssen"
    );

    // Athlet löscht die eigene Zeile (weiterhin erlaubt)
    const del = await rest("DELETE", `nutrition_goals?id=eq.${id}`, {
      token: athlete.token,
    });
    assert.equal(del.ok, true);
    assert.equal(
      del.data.length,
      1,
      "Athlet konnte die eigene nutrition_goals-Zeile nicht löschen"
    );
  });

  test("nutrition_goals: anon darf gar nicht einfuegen (kein GRANT)", async (t) => {
    if (ngSkip()) return t.skip(ngSkip());
    const insert = await rest("POST", "nutrition_goals", {
      token: null,
      body: {
        profile_id: athlete.userId,
        goal_type: "maintain",
      },
    });
    assert.equal(insert.ok, false, "anon darf nutrition_goals nicht einfuegen (kein GRANT)");
  });

  // --- 11. recipe_votes (0063): community-voting, authenticated-read-all,
  //     self-insert/update, kein DELETE --------------------------------
  // Strikte RLS (V3): SELECT for all authenticated, INSERT/UPDATE nur eigener
  // Vote (athlete_id = auth.uid()), DELETE gar nicht (nur per service_role).
  // Referenziert recipes(id) on delete cascade – fuer den Test wird zuerst
  // ein Rezept per service_role angelegt (RLS-Bypass), damit die FK-Referenz
  // existiert. Ohne service_role-Key wird der ganze Block uebersprungen, um
  // keine Waisen liegen zu lassen.
  //
  // Da recipe_votes absichtlich kein DELETE-Grant fuer authenticated hat,
  // wird das Aufraeumen per service_role gemacht. Der Test registriert daher
  // zwei Cleanup-Schritte: (1) Vote loeschen, (2) Recipe loeschen (cascaded).
  // Fehlt service_role in .env, muessen die Tests ausgelassen werden.

  const rvSkip = () =>
    !recipeVotesTableReady
      ? "recipe_votes nicht lesbar — Migration 0063 vermutlich noch nicht eingespielt"
      : false;

  /** Legt ein Test-Rezept an (service_role, RLS-Bypass). */
  async function ensureTestRecipe() {
    const insert = await rest("POST", "recipes", {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: {
        source: "own",
        title: "RLS-Test-Rezept",
        meal_type: ["dinner"],
      },
    });
    assert.equal(
      insert.ok,
      true,
      `Test-Rezept-Insert (service_role) fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    const recipeId = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `recipes?id=eq.${recipeId}`, {
        token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      });
      if (!del.ok)
        throw new Error(`recipe_votes-Test-Rezept ${recipeId} nicht geloescht: ${JSON.stringify(del.data)}`);
    });
    return recipeId;
  }

  async function insertVoteRow(recipeId, over = {}) {
    const insert = await rest("POST", "recipe_votes", {
      token: athlete.token,
      body: {
        recipe_id: recipeId,
        athlete_id: athlete.userId,
        vote: "up",
        ...over,
      },
    });
    assert.equal(
      insert.ok,
      true,
      `recipe_votes-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    const id = insert.data[0].id;
    // Cleanup per service_role (kein DELETE-Grant fuer authenticated)
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `recipe_votes?id=eq.${id}`, {
        token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      });
      if (!del.ok)
        throw new Error(
          `recipe_votes-Testzeile ${id} nicht geloescht (service_role): ${JSON.stringify(del.data)}`
        );
    });
    return id;
  }

  test("recipe_votes: Athlet legt eigenen Vote an und liest ihn, anon liest nichts (kein GRANT)", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");
    const recipeId = await ensureTestRecipe();
    const id = await insertVoteRow(recipeId);

    const ownRead = await rest("GET", `recipe_votes?id=eq.${id}&select=vote,comment`, {
      token: athlete.token,
    });
    assert.equal(ownRead.ok, true);
    assert.equal(ownRead.data.length, 1, "Athlet liest den eigenen Vote nicht");
    assert.equal(ownRead.data[0].vote, "up");

    const anonRead = await rest("GET", `recipe_votes?id=eq.${id}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf recipe_votes nicht lesen (kein GRANT)");
  });

  test("recipe_votes: alle authenticated lesen alle Votes (SELECT using(true))", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");
    if (!coachLinkOk) return t.skip("Coach-Verknuepfung fehlt — Trainer-Login nicht verfuegbar");

    const recipeId = await ensureTestRecipe();
    const id = await insertVoteRow(recipeId);

    // Trainer (authenticated, nicht der Athlet) muss den Vote ebenfalls sehen
    const trainerRead = await rest("GET", `recipe_votes?id=eq.${id}&select=vote,athlete_id`, {
      token: trainer.token,
    });
    assert.equal(trainerRead.ok, true);
    assert.equal(
      trainerRead.data.length,
      1,
      "Trainer sollte den Vote des Athleten lesen koennen (SELECT all auth)"
    );
    assert.equal(trainerRead.data[0].athlete_id, athlete.userId);
  });

  test("recipe_votes: UPDATE des eigenen Votes aendert vote-Wert (up->down)", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");

    const recipeId = await ensureTestRecipe();
    const id = await insertVoteRow(recipeId, { vote: "up" });

    // UPDATE auf 'down'
    const update = await rest("PATCH", `recipe_votes?id=eq.${id}`, {
      token: athlete.token,
      body: { vote: "down" },
    });
    assert.equal(update.ok, true);
    assert.equal(
      update.data?.[0]?.vote,
      "down",
      "UPDATE des eigenen Votes hat vote-Wert nicht geaendert"
    );

    // Zuruecklesen: 'down'
    const readBack = await rest("GET", `recipe_votes?id=eq.${id}&select=vote`, {
      token: athlete.token,
    });
    assert.equal(readBack.data[0].vote, "down");
  });

  test("recipe_votes: UPDATE auf fremden Vote schlaegt still (0 rows)", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");
    if (!coachLinkOk) return t.skip("Coach-Verknuepfung fehlt — Trainer-Login nicht verfuegbar");

    const recipeId = await ensureTestRecipe();
    const id = await insertVoteRow(recipeId, { vote: "up" });

    // Trainer versucht, Athlet 1's Vote zu aendern (RLS: trainer.auth.uid() != athlete_id)
    const foreignUpdate = await rest("PATCH", `recipe_votes?id=eq.${id}`, {
      token: trainer.token,
      body: { vote: "down" },
    });
    assert.equal(
      foreignUpdate.data?.length ?? 0,
      0,
      "Fremder UPDATE auf recipe_votes haette still 0 Zeilen treffen muessen"
    );
  });

  test("recipe_votes: Athlet kann keinen Vote fuer fremde athlete_id anlegen (WITH CHECK)", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");

    const recipeId = await ensureTestRecipe();
    const insert = await rest("POST", "recipe_votes", {
      token: athlete.token,
      body: {
        recipe_id: recipeId,
        athlete_id: trainer.userId, // fremde athlete_id
        vote: "up",
      },
    });
    assert.equal(
      insert.ok,
      false,
      "Insert mit fremder athlete_id haette an WITH-CHECK-Policy scheitern muessen"
    );
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      const strayId = insert.data[0].id;
      cleanupTasks.push(async () => {
        await rest("DELETE", `recipe_votes?id=eq.${strayId}`, {
          token: ENV.SUPABASE_SERVICE_ROLE_KEY,
        });
      });
    }
  });

  test("recipe_votes: DELETE des eigenen Votes schlaegt still (keine DELETE-Policy)", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");

    const recipeId = await ensureTestRecipe();
    const id = await insertVoteRow(recipeId, { vote: "up" });

    // Athlet versucht eigenen Vote zu loeschen -> keine DELETE-Policy -> 0 rows
    const ownDel = await rest("DELETE", `recipe_votes?id=eq.${id}`, {
      token: athlete.token,
    });
    assert.equal(
      ownDel.data?.length ?? 0,
      0,
      "DELETE des eigenen Votes haette ohne Policy 0 Zeilen treffen muessen"
    );

    // Vote existiert noch
    const stillThere = await rest("GET", `recipe_votes?id=eq.${id}`, { token: athlete.token });
    assert.equal(stillThere.data.length, 1, "Vote wurde trotz fehlender DELETE-Policy entfernt");
  });

  test("recipe_votes: unbekannter vote-Wert scheitert am Check-Constraint", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");

    const recipeId = await ensureTestRecipe();
    const bad = await rest("POST", "recipe_votes", {
      token: athlete.token,
      body: {
        recipe_id: recipeId,
        athlete_id: athlete.userId,
        vote: "neutral",
      },
    });
    assert.equal(bad.ok, false, "vote='neutral' haette am CHECK-Constraint scheitern muessen");
  });

  test("recipe_votes: zweiter Insert fuer selbes (recipe_id, athlete_id) scheitert am unique-Constraint", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");

    const recipeId = await ensureTestRecipe();
    const first = await rest("POST", "recipe_votes", {
      token: athlete.token,
      body: { recipe_id: recipeId, athlete_id: athlete.userId, vote: "up" },
    });
    assert.equal(first.ok, true, `Erster Insert fehlgeschlagen: ${JSON.stringify(first.data)}`);
    const firstId = first.data[0].id;
    // Cleanup: erste Zeile per service_role (falls der zweite Insert NICHT scheitert und
    // wir zwei Zeilen haben) — zweiten Cleanup ggf. im catch-Block.
    const cleanupId = firstId;
    cleanupTasks.push(async () => {
      await rest("DELETE", `recipe_votes?id=eq.${cleanupId}`, {
        token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      });
    });

    const dup = await rest("POST", "recipe_votes", {
      token: athlete.token,
      body: { recipe_id: recipeId, athlete_id: athlete.userId, vote: "down" },
    });
    assert.equal(
      dup.ok,
      false,
      "Doppelter (recipe_id, athlete_id)-Insert haette am unique-Constraint scheitern muessen"
    );
  });

  test("recipe_votes: anon darf gar kein Recipe-Voting machen (kein GRANT)", async (t) => {
    if (rvSkip()) return t.skip(rvSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Aufraeumen kein Insert-Test");

    const recipeId = await ensureTestRecipe();
    const anonInsert = await rest("POST", "recipe_votes", {
      token: null,
      body: {
        recipe_id: recipeId,
        athlete_id: athlete.userId,
        vote: "up",
      },
    });
    assert.equal(anonInsert.ok, false, "anon darf recipe_votes nicht einfuegen (kein GRANT)");
  });

  // --- 11. recipes (0062): shared library RLS policies --------------------
  // Verifikation der neuen Migration 0062_recipes_rls.sql. Getestet:
  //   SELECT: approved/pending fuer alle, rejected nur fuer submitter/admin
  //   INSERT: source='athlete' + status='pending' + submitted_by=auth.uid()
  //           (andere source/status/submitted_by scheitern)
  //   UPDATE: submitter auf eigenes pending, NICHT status/rejection_reason
  //           (E16/Review Finding 1 — Trigger guard)
  //   E18:   content nach approved/rejected blockt (auch fuer admin)
  //   DELETE: admin only (Athlet bekommt 0 Zeilen)
  //
  // Admin-spezifische Tests (status-Update, delete) nutzen service_role
  // zum temporaeren Setzen von profiles.is_admin (einziger Schreibpfad
  // fuer diese Spalte). Voraussetzung: SUPABASE_SERVICE_ROLE_KEY in .env.
  //
  // Rezepte: kollisionsfreier Schluessel ueber externe id (uuid) —
  // die id aus dem INSERT-Rueckgabewert wird im Cleanup geloescht.

  let recipesTableReady = false;

  const RECIPE_SENTINEL_TITLE = "RLS-Test-Rezept";
  const RECIPE_UPDATED_TITLE = "RLS-Test-Rezept-Updated";

  async function insertRecipeRow(token, over = {}) {
    const insert = await rest("POST", "recipes", {
      token,
      body: {
        source: "athlete",
        status: "pending",
        submitted_by: athlete.userId,
        title: RECIPE_SENTINEL_TITLE,
        meal_type: ["lunch", "dinner"],
        servings: 2,
        ...over,
      },
    });
    // Kein assert hier — der Aufrufer will ggf. einen Fehlschlag testen
    return insert;
  }

  test("recipes: Tabelle ist lesbar (0062 eingespielt?)", async () => {
    const probe = await rest(
      "GET",
      "recipes?select=id,title&limit=1",
      { token: athlete.token }
    );
    // Status 404/Relation does not exist = Migration fehlt in dashboard-dev
    if (probe.status === 404 || (probe.data && typeof probe.data === "object" && probe.data.message?.includes?.("does not exist"))) {
      console.warn("Migration 0062_recipes_rls.sql noch nicht in dashboard-dev eingespielt — alle recipes-Tests uebersprungen");
      recipesTableReady = false;
      return;
    }
    recipesTableReady = true;
    assert.equal(probe.ok, true, `recipes-Read lesbar: ${JSON.stringify(probe.data)}`);
  });

  const recipesSkip = () =>
    !recipesTableReady
      ? "recipes-Tabelle nicht lesbar — Migration 0062 vermutlich noch nicht eingespielt"
      : false;

  // Nicht-Admin-Verbotstests: der Trainer-Account ist die Nicht-Admin-Identität
  // (der Athlet-Account ist auf dashboard-dev Admin, s. Issue #23).
  const nonAdminActorSkip = () => {
    const base = recipesSkip();
    if (base) return base;
    if (testTrainerIsAdmin) return "Trainer-Test-Account hat is_admin=true — Verbotstests brauchen einen Nicht-Admin";
    return false;
  };

  test("recipes: anon kann NICHT lesen (kein GRANT)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const read = await rest("GET", "recipes?select=id,title&limit=1", { token: null });
    assert.equal(read.ok, false, "anon darf recipes nicht lesen (kein GRANT)");
  });

  test("recipes: Nicht-Admin kann approved+pending lesen, fremdes rejected nicht", async (t) => {
    if (nonAdminActorSkip()) return t.skip(nonAdminActorSkip());

    // Drei Rezepte anlegen: pending (eigenes), approved (via service_role),
    // rejected (via service_role)
    const pending = await insertRecipeRow(trainer.token, { submitted_by: trainer.userId });
    assert.equal(pending.ok, true, `pending-Rezept anlegen: ${JSON.stringify(pending.data)}`);
    const pendingId = pending.data[0].id;
    cleanupTasks.push(async () => {
      // Loeschen nur via service_role (Athlet darf nicht loeschen)
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${pendingId}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Approved-Rezept via service_role (RLS-Bypass) anlegen
    const approved = await rest("POST", "recipes", {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: {
        source: "spoonacular",
        status: "approved",
        title: RECIPE_SENTINEL_TITLE + "-approved",
        meal_type: ["lunch", "dinner"],
        servings: 2,
      },
    });
    assert.equal(approved.ok || (approved.status >= 200 && approved.status < 300), true,
      `approved-Rezept anlegen (service_role): ${JSON.stringify(approved.data)}`);
    const approvedId = Array.isArray(approved.data) ? approved.data[0]?.id : approved.data?.id;
    assert.ok(approvedId, "approved-Rezept hat keine id");
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${approvedId}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Rejected-Rezept via service_role mit rejection_reason
    const rejected = await rest("POST", "recipes", {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: {
        source: "spoonacular",
        status: "rejected",
        rejection_reason: "Test-Ablehnung",
        title: RECIPE_SENTINEL_TITLE + "-rejected",
        meal_type: ["dinner"],
        servings: 2,
      },
    });
    assert.equal(rejected.ok || (rejected.status >= 200 && rejected.status < 300), true,
      `rejected-Rezept anlegen (service_role): ${JSON.stringify(rejected.data)}`);
    const rejectedId = Array.isArray(rejected.data) ? rejected.data[0]?.id : rejected.data?.id;
    assert.ok(rejectedId, "rejected-Rezept hat keine id");
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${rejectedId}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Athlet sieht pending (eigenes)
    const ownPending = await rest("GET", `recipes?id=eq.${pendingId}&select=id,title,status`, {
      token: trainer.token,
    });
    assert.equal(ownPending.ok, true);
    assert.equal(ownPending.data.length, 1, "Athlet sieht eigenes pending-Rezept nicht");

    // Athlet sieht approved (anderes)
    const athleteApproved = await rest("GET", `recipes?id=eq.${approvedId}&select=id,title,status`, {
      token: trainer.token,
    });
    assert.equal(athleteApproved.ok, true);
    assert.equal(athleteApproved.data.length, 1, "Athlet sieht approved-Rezept eines anderen nicht (sollte approved+pending fuer alle sein)");
    assert.equal(athleteApproved.data[0].status, "approved");

    // Nicht-Admin sieht fremdes rejected nicht (submitted_by != auth.uid())
    const athleteRejected = await rest("GET", `recipes?id=eq.${rejectedId}&select=id,title,status`, {
      token: trainer.token,
    });
    assert.equal(athleteRejected.ok, true);
    assert.equal(
      athleteRejected.data.length,
      0,
      "Athlet sollte rejected-Rezept eines anderen NICHT sehen (nur submitter/admin)"
    );
  });

  test("recipes: Athlet kann rejected mit eigenem submitted_by sehen", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    // Dafuer muss ein rejected-Rezept angelegt sein, bei dem athlete.userId
    // der submitted_by ist — das geht nicht per service_role (dann waere
    // submitted_by=null). Stattdessen per Direkt-Insert... aber authenticated
    // kann nur status='pending' setzen. Den Status aendern geht nur ueber
    // service_role.
    //
    // Loesung: eigenes pending-Rezept, dann status per service_role auf
    // rejected setzen + rejection_reason hinzufuegen.
    const ownPending = await insertRecipeRow(athlete.token, { title: "RLS-Test-Rejected-By-Me" });
    if (!ownPending.ok) return t.skip("Eigenes pending-Rezept anlegen fehlgeschlagen — Test uebersprungen");
    const ownId = ownPending.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${ownId}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Service-Role setzt auf rejected (simuliert Admin-Entscheidung)
    const adminReject = await rest("PATCH", `recipes?id=eq.${ownId}`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: { status: "rejected", rejection_reason: "RLS-Test: Ablehnungsgrund sichtbar?" },
      prefer: "return=representation",
    });
    assert.equal(adminReject.ok, true, `Admin-Reject fehlgeschlagen: ${JSON.stringify(adminReject.data)}`);

    // Athlet sieht sein eigenes rejected + reason
    const ownRejected = await rest("GET", `recipes?id=eq.${ownId}&select=id,title,status,rejection_reason`, {
      token: athlete.token,
    });
    assert.equal(ownRejected.ok, true);
    assert.equal(ownRejected.data.length, 1, "Athlet sieht eigenes rejected-Rezept nicht (E16/E17)");
    assert.equal(ownRejected.data[0].status, "rejected");
    assert.equal(ownRejected.data[0].rejection_reason, "RLS-Test: Ablehnungsgrund sichtbar?");
  });

  test("recipes: Athlet INSERT valid (source=athlete, status=pending, submitted_by=self)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const insert = await insertRecipeRow(athlete.token, { title: "RLS-Test-Insert-Valid" });
    assert.equal(insert.ok, true, `Gültiger Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });
  });

  test("recipes: Athlet INSERT fails — status=approved (WITH CHECK)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const insert = await insertRecipeRow(athlete.token, {
      title: "RLS-Test-Insert-Approved",
      status: "approved",
    });
    assert.equal(insert.ok, false, "Insert mit status=approved haette scheitern muessen (WITH CHECK)");
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      cleanupTasks.push(async () => {
        if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
          await rest("DELETE", `recipes?id=eq.${insert.data[0].id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
        }
      });
    }
  });

  test("recipes: Athlet INSERT fails — source=own (WITH CHECK)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const insert = await insertRecipeRow(athlete.token, {
      title: "RLS-Test-Insert-Own",
      source: "own",
      submitted_by: null, // Constraint (source<>'athlete' or submitted_by is not null) erlaubt source='own' mit null
    });
    assert.equal(insert.ok, false, "Insert mit source=own haette scheitern muessen (WITH CHECK)");
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      cleanupTasks.push(async () => {
        if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
          await rest("DELETE", `recipes?id=eq.${insert.data[0].id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
        }
      });
    }
  });

  test("recipes: Athlet INSERT fails — submitted_by=B (WITH CHECK)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const insert = await insertRecipeRow(athlete.token, {
      title: "RLS-Test-Insert-Foreign",
      submitted_by: trainer.userId,
    });
    assert.equal(insert.ok, false, "Insert mit fremdem submitted_by haette scheitern muessen (WITH CHECK)");
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      cleanupTasks.push(async () => {
        if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
          await rest("DELETE", `recipes?id=eq.${insert.data[0].id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
        }
      });
    }
  });

  test("recipes: Athlet UPDATE content on own pending — OK", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const own = await insertRecipeRow(athlete.token, { title: "RLS-Test-Update-Content" });
    assert.equal(own.ok, true);
    const id = own.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Submitter aendert title
    const update = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: athlete.token,
      body: { title: RECIPE_UPDATED_TITLE },
    });
    assert.equal(update.ok, true);
    assert.equal(
      update.data?.[0]?.title,
      RECIPE_UPDATED_TITLE,
      "Submitter konnte title des eigenen pending nicht aendern"
    );
  });

  test("recipes: Athlet UPDATE content on foreign pending — 0 rows (RLS)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());

    // Zweites pending-Rezept durch service_role (submitted_by=null)
    // geht nicht — submitted_by=null verletzt Constraint bei source='athlete'.
    // Stattdessen ein pending-Rezept von trainer.userId via service_role.
    // Geht nicht, weil source='athlete' submitted_by erfordert.
    //
    // Stattdessen: eigenes Rezept von Athlet A, Versuch von Athlet B (hier:
    // es gibt nur den einen athlete-Account, also ein Rezept via service_role
    // mit submitted_by=athlete.userId und testen, dass der Trainer (der nicht
    // submitter ist) es nicht updaten kann).
    const other = await rest("POST", "recipes", {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: {
        source: "athlete",
        status: "pending",
        submitted_by: athlete.userId,
        title: "RLS-Test-Foreign-Update",
        meal_type: ["breakfast"],
        servings: 1,
      },
    });
    assert.equal(other.ok || (other.status >= 200 && other.status < 300), true,
      `Fremdes pending-Rezept anlegen: ${JSON.stringify(other.data)}`);
    const otherId = Array.isArray(other.data) ? other.data[0]?.id : other.data?.id;
    assert.ok(otherId, "Fremdes Rezept hat keine id");
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${otherId}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Trainer (nicht submitter) versucht Update
    const trainerUpdate = await rest("PATCH", `recipes?id=eq.${otherId}`, {
      token: trainer.token,
      body: { title: "Foreign-Update-Versuch" },
    });
    // RLS blendet nicht-eigene pending-Zeilen aus: HTTP 200 mit data: []
    assert.equal(
      trainerUpdate.data?.length ?? 0,
      0,
      "Nicht-Submitter konnte title fremden pending-Rezepts aendern — RLS greift nicht"
    );
  });

  test("recipes: Nicht-Admin UPDATE status — 0 rows (WITH CHECK / Trigger E16)", async (t) => {
    if (nonAdminActorSkip()) return t.skip(nonAdminActorSkip());
    const own = await insertRecipeRow(trainer.token, { submitted_by: trainer.userId, title: "RLS-Test-Update-Status" });
    if (!own.ok) return t.skip("Eigenes pending-Rezept anlegen fehlgeschlagen");
    const id = own.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Athlet versucht status auf approved zu setzen
    // E16-Trigger blockt — da der Trigger VOR dem RLS-Using-Check feuert,
    // ist das ein harter Fehler (42501), kein stilles 0-Rows.
    const updateStatus = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: trainer.token,
      body: { status: "approved" },
    });
    assert.equal(
      updateStatus.ok,
      false,
      "Athlet konnte status am eigenen pending setzen — E16-Trigger greift nicht"
    );
  });

  test("recipes: Nicht-Admin UPDATE rejection_reason — 0 rows (Trigger E16, Review Finding 1)", async (t) => {
    if (nonAdminActorSkip()) return t.skip(nonAdminActorSkip());
    const own = await insertRecipeRow(trainer.token, { submitted_by: trainer.userId, title: "RLS-Test-Update-Rejection" });
    if (!own.ok) return t.skip("Eigenes pending-Rezept anlegen fehlgeschlagen");
    const id = own.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Athlet versucht rejection_reason zu setzen
    // E16-Trigger blockt mit Exception (42501) — rejection_reason darf
    // nicht durch Athlet gesetzt werden, auch nicht am eigenen pending.
    const updateReason = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: trainer.token,
      body: { rejection_reason: "Eigenmaechtig" },
    });
    assert.equal(
      updateReason.ok,
      false,
      "Athlet konnte rejection_reason am eigenen pending setzen — E16-Trigger greift nicht"
    );
  });

  test("recipes: Athlet UPDATE content after approval blocked (E18 Trigger, race condition edge case #16)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());

    // Edge Case (Issue #16): "Simultaneous submitter content-edit and admin
    // status-change in the same window → admin approves while submitter edit
    // is in flight → edit fails."
    // Hier sequentiell simuliert: admin approved zuerst, dann submitter
    // content-Edit — durch PostgreSQL MVCC garantiert, dass der zweite
    // UPDATE den kommittierten Status des ersten sieht (old.status='approved'),
    // sodass der E18-Trigger den content-Edit blockt.

    // Approved-Rezept (RLS-Bypass, submitted_by=null) — Athlet A darf
    // content nicht aendern, auch wenn es sein eigenes waere (nach approval
    // blockt E18). Deshalb Rezept ueber service_role auf pending setzen,
    // dann service_role approved, dann Athlet versucht content-Edit.
    const own = await insertRecipeRow(athlete.token, { title: "RLS-Test-E18" });
    if (!own.ok) return t.skip("Eigenes pending-Rezept anlegen fehlgeschlagen");
    const id = own.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // Service-Role approved (Admin-Entscheidung)
    const approve = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: { status: "approved" },
      prefer: "return=representation",
    });
    assert.equal(approve.ok, true, `Admin-Approve fehlgeschlagen: ${JSON.stringify(approve.data)}`);

    // Athlet versucht content-Edit -> E18-Trigger blockt
    const edit = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: athlete.token,
      body: { title: "Nach-Approval-Edit" },
    });
    assert.equal(
      edit.data?.length ?? 0,
      0,
      "Athlet konnte content nach Approval aendern (E18-Trigger)"
    );

    // Selber Versuch mit trainer-Token (nicht admin, nicht submitter)
    const trainerEdit = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: trainer.token,
      body: { title: "Trainer-Edit-Versuch" },
    });
    assert.equal(
      trainerEdit.data?.length ?? 0,
      0,
      "Trainer konnte content nach Approval aendern (E18-Trigger)"
    );
  });

  test("recipes: Admin UPDATE status — via service_role (kein athlete-is_admin-Account)", async (t) => {
    // Dieser Test prüft, dass das Status-Update ueber die admin-Policy
    // moeglich ist. Da kein Athlet-Admin-Account in den Test-Credentials
    // existiert, wird service_role als Stellvertreter genutzt (RLS-Bypass).
    if (recipesSkip()) return t.skip(recipesSkip());
    const own = await insertRecipeRow(athlete.token, { title: "RLS-Test-Admin-Status" });
    if (!own.ok) return t.skip("Eigenes pending-Rezept anlegen fehlgeschlagen");
    const id = own.data[0].id;
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    // service_role=RLS-Bypass -> kein Test der RLS-Policy.
    // Der echte Admin-Pfad mit is_admin() kann nur mit einem echten
    // Admin-Account getestet werden (oder durch temporaeres Setzen von
    // profiles.is_admin ueber service_role). Letzteres ist moeglich,
    // aber aufwaendig und riskiert das Test-Env. Stattdessen dokumentiert:
    // die admin-Policy (using is_admin()) ist identisch zum Pattern aller
    // anderen Admin-Policies (feedback, proposals, session_formats) und
    // wird dort bereits in dieser Datei validiert.
    //
    // Hier nur: der technische Pfad (service_role approved) funktioniert.
    const approve = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: { status: "approved" },
      prefer: "return=representation",
    });
    assert.equal(approve.ok, true, `service_role Approve fehlgeschlagen: ${JSON.stringify(approve.data)}`);
    assert.equal(approve.data?.[0]?.status, "approved", "Status wurde nicht auf approved gesetzt");

    // Service-Role setzt rejection_reason und rejected (beides admin-only)
    const reject = await rest("PATCH", `recipes?id=eq.${id}`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: { status: "rejected", rejection_reason: "Test via service_role" },
      prefer: "return=representation",
    });
    assert.equal(reject.ok, true, `service_role Reject fehlgeschlagen: ${JSON.stringify(reject.data)}`);
    assert.equal(reject.data?.[0]?.status, "rejected", "Status wurde nicht auf rejected gesetzt");
    assert.equal(reject.data?.[0]?.rejection_reason, "Test via service_role", "rejection_reason wurde nicht gesetzt");
  });

  test("recipes: Nicht-Admin DELETE — 0 rows (admin-only)", async (t) => {
    if (nonAdminActorSkip()) return t.skip(nonAdminActorSkip());
    const own = await insertRecipeRow(trainer.token, { submitted_by: trainer.userId, title: "RLS-Test-Delete" });
    if (!own.ok) return t.skip("Eigenes pending-Rezept anlegen fehlgeschlagen");
    const id = own.data[0].id;
    // Cleanup ueber service_role, falls der Athlet-DELETE nicht loescht
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await rest("DELETE", `recipes?id=eq.${id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });

    const del = await rest("DELETE", `recipes?id=eq.${id}`, { token: trainer.token });
    assert.equal(del.ok, true);
    assert.equal(
      del.data?.length ?? 0,
      0,
      "Athlet konnte ein Rezept loeschen — Delete-Policy (admin only) greift nicht"
    );

    // Zeile ist noch da (service_role liest)
    const stillThere = await rest("GET", `recipes?id=eq.${id}&select=id`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(
      stillThere.data?.length ?? 0,
      1,
      "Rezept wurde trotz RLS-blockierten Athlet-DELETE entfernt"
    );
  });

  test("recipes: anon kann NICHT einfuegen (kein GRANT)", async (t) => {
    if (recipesSkip()) return t.skip(recipesSkip());
    const insert = await rest("POST", "recipes", {
      token: null,
      body: {
        source: "athlete",
        status: "pending",
        submitted_by: athlete.userId,
        title: "RLS-Test-Anon-Insert",
        meal_type: ["lunch"],
        servings: 2,
      },
    });
    assert.equal(insert.ok, false, "anon darf recipes nicht einfuegen (kein GRANT)");
    if (insert.ok && Array.isArray(insert.data) && insert.data[0]?.id) {
      cleanupTasks.push(async () => {
        if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
          await rest("DELETE", `recipes?id=eq.${insert.data[0].id}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
        }
      });
    }
  });

  // --- 11. meal_plan_entries (0064): plan_cards RLS pattern ---------------
  // Folgt dem gehärteten plan_cards-Pattern (Migration 0011):
  //   - Athlet: FOR ALL (insert/update/delete) auf eigene Zeilen
  //   - Coach: NUR UPDATE (0011 parity — kein INSERT/DELETE)
  //   - Viewer read: alle authenticated lesen alle Einträge
  //   - Anon: kein GRANT
  // Referenz-Recipe wird per service_role angelegt (RLS-Bypass), da
  // meal_plan_entries einen existierenden recipe_id-FK braucht.
  // Die getestete Zeile wird ueber den eigenen DELETE (Athlet) bereinigt;
  // das Referenz-Recipe ueber service_role (Athleten duerfen nicht loeschen).
  //
  // Service-Role vorausgesetzt: ohne sie kann kein Referenz-Recipe
  // angelegt werden. Der gesamte Block skipt dann.
  //
  // Wichtig (PostgREST-Verhalten): PATCH/DELETE auf fremde/unsichtbare Zeilen
  // liefern HTTP 200 mit data: [], keinen Fehler. `.ok` ist hier nur bei
  // INSERT und PATCH/DELETE auf EIGENE Zeilen verlaesslich (s. Kommentar beim
  // rest-Helfer im Dateikopf). Tests fuer fremde Updates prüfen
  // `data?.length` statt `.ok`.

  const mealPlanEntriesSkip = () =>
    !mealPlanEntriesTableReady
      ? "meal_plan_entries nicht lesbar — Migration 0064 vermutlich noch nicht eingespielt"
      : false;

  /** Legt ein Test-Rezept an (service_role, RLS-Bypass). */
  async function ensureMealPlanTestRecipe() {
    const insert = await rest("POST", "recipes", {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      body: {
        source: "own",
        title: "RLS-Test-MPE-Rezept",
        meal_type: ["dinner"],
      },
    });
    assert.equal(
      insert.ok,
      true,
      `Test-Rezept-Insert (service_role) fehlgeschlagen: ${JSON.stringify(insert.data)}`
    );
    const recipeId = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `recipes?id=eq.${recipeId}`, {
        token: ENV.SUPABASE_SERVICE_ROLE_KEY,
      });
      if (!del.ok)
        throw new Error(`meal_plan_entries-Test-Rezept ${recipeId} nicht geloescht: ${JSON.stringify(del.data)}`);
    });
    return recipeId;
  }

  const strangerSkip = () =>
    strangerUsable
      ? false
      : "Fremden-Identität (SUPABASE_ATHLETE2_*) fehlt, ist Admin oder Coach von Athlet 1 — Test übersprungen";

  // Jeder Body bekommt ein eigenes Datum: Testzeilen werden erst im after()-Hook
  // aufgeraeumt, ein gemeinsames (athlete_id, date, meal_slot) wuerde sich sonst
  // am unique-Constraint stossen. Tests, die genau diese Kollision brauchen,
  // setzen date explizit.
  let mealPlanDateCounter = 0;
  function nextMealPlanDate() {
    return new Date(Date.UTC(2027, 0, 4 + mealPlanDateCounter++)).toISOString().slice(0, 10);
  }

  /** Standard-Body fuer einen meal_plan_entry (ohne id/created_at/updated_at).
   *  over ueberschreibt einzelne Felder (z. B. meal_slot, servings, date). */
  function mealPlanEntryBody(recipeId, over = {}) {
    return {
      athlete_id: athlete.userId,
      date: nextMealPlanDate(),
      meal_slot: "breakfast",
      recipe_id: recipeId,
      servings: 1,
      ...over,
    };
  }

  /** Legt einen meal_plan_entry an, registriert das Loeschen im Cleanup. */
  async function insertMealPlanEntryRow(token, recipeId, over = {}) {
    const insert = await rest("POST", "meal_plan_entries", {
      token,
      body: mealPlanEntryBody(recipeId, over),
    });
    assert.equal(insert.ok, true, `meal_plan_entries-Insert fehlgeschlagen: ${JSON.stringify(insert.data)}`);
    const id = insert.data[0].id;
    cleanupTasks.push(async () => {
      const del = await rest("DELETE", `meal_plan_entries?id=eq.${id}`, { token: athlete.token });
      if (!del.ok)
        throw new Error(`meal_plan_entries-Testzeile ${id} nicht geloescht: ${JSON.stringify(del.data)}`);
    });
    return id;
  }

  test("meal_plan_entries: Athlet legt eigenen Eintrag an, liest ihn, aktualisiert ihn, loescht ihn", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    const id = await insertMealPlanEntryRow(athlete.token, recipeId);

    // Lesen
    const ownRead = await rest("GET", `meal_plan_entries?id=eq.${id}&select=id,meal_slot,servings`, {
      token: athlete.token,
    });
    assert.equal(ownRead.ok, true);
    assert.equal(ownRead.data.length, 1, "Athlet liest den eigenen meal_plan_entry nicht");
    assert.equal(ownRead.data[0].meal_slot, "breakfast");
    assert.equal(ownRead.data[0].servings, 1);

    // Aktualisieren (servings aendern)
    const update = await rest("PATCH", `meal_plan_entries?id=eq.${id}`, {
      token: athlete.token,
      body: { servings: 2 },
    });
    assert.equal(update.ok, true);
    assert.equal(update.data?.[0]?.servings, 2, "Athlet konnte servings nicht updaten");

    // Loeschen
    const del = await rest("DELETE", `meal_plan_entries?id=eq.${id}`, {
      token: athlete.token,
    });
    assert.equal(del.ok, true);
    assert.equal(del.data?.length ?? 0, 1, "Athlet konnte den eigenen Eintrag nicht loeschen");
  });

  test("meal_plan_entries: Coach UPDATE bestaetigt (0011 parity), INSERT verweigert, DELETE verweigert", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");
    if (!coachLinkOk) return t.skip(coachSkip());

    const recipeId = await ensureMealPlanTestRecipe();

    // INSERT als Coach (soll scheitern — 0011 parity, kein coach INSERT)
    const coachInsert = await rest("POST", "meal_plan_entries", {
      token: trainer.token,
      body: mealPlanEntryBody(recipeId),
    });
    assert.equal(
      coachInsert.ok,
      false,
      "Coach konnte einen meal_plan_entry fuer seinen Athleten anlegen — 0011 Parity verletzt"
    );

    // Als Athlet einen Eintrag anlegen, den der Coach updaten kann
    const id = await insertMealPlanEntryRow(athlete.token, recipeId);

    // UPDATE als Coach (muss gehen — 0011 parity)
    const coachUpdate = await rest("PATCH", `meal_plan_entries?id=eq.${id}`, {
      token: trainer.token,
      body: { servings: 3 },
    });
    assert.equal(coachUpdate.data?.length ?? 0, 1, "Coach konnte den Eintrag seines Athleten nicht updaten (sollte 1 Zeile treffen)");

    // DELETE als Coach (soll 0 rows — 0011 parity, kein coach DELETE)
    const coachDelete = await rest("DELETE", `meal_plan_entries?id=eq.${id}`, {
      token: trainer.token,
    });
    assert.equal(
      coachDelete.data?.length ?? 0,
      0,
      "Coach konnte den Eintrag seines Athleten loeschen — 0011 Parity verletzt"
    );

    // Eintrag noch da? (Athlet liest)
    const stillThere = await rest("GET", `meal_plan_entries?id=eq.${id}&select=id`, {
      token: athlete.token,
    });
    assert.equal(stillThere.data?.length ?? 0, 1, "Eintrag wurde trotz blockiertem Coach-DELETE entfernt");
  });

  test("meal_plan_entries: Athlet B kann A's Eintraege lesen (viewer) aber nicht schreiben", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (strangerSkip()) return t.skip(strangerSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    // Eintrag als Athlet A (der Test-Account) anlegen
    const id = await insertMealPlanEntryRow(athlete.token, recipeId);

    // Fremder (Athlet 2, kein Coach) liest den Eintrag von Athlet A
    const viewerRead = await rest("GET", `meal_plan_entries?id=eq.${id}&select=id,athlete_id`, {
      token: stranger.token,
    });
    assert.equal(viewerRead.ok, true);
    assert.equal(viewerRead.data.length, 1, "Athlet B (viewer) kann A's Eintrag nicht lesen");

    // Athlet B versucht A's Eintrag zu aendern (soll 0 rows)
    const viewerUpdate = await rest("PATCH", `meal_plan_entries?id=eq.${id}`, {
      token: stranger.token,
      body: { servings: 5 },
    });
    assert.equal(
      viewerUpdate.data?.length ?? 0,
      0,
      "Athlet B konnte A's Eintrag aendern — RLS (athlete_id = auth.uid()) greift nicht"
    );

    // Athlet B versucht A's Eintrag zu loeschen (soll 0 rows)
    const viewerDelete = await rest("DELETE", `meal_plan_entries?id=eq.${id}`, {
      token: stranger.token,
    });
    assert.equal(
      viewerDelete.data?.length ?? 0,
      0,
      "Athlet B konnte A's Eintrag loeschen — RLS greift nicht"
    );
  });

  test("meal_plan_entries: anon kann weder lesen noch schreiben (kein GRANT)", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein anon-INSERT-Test");

    const recipeId = await ensureMealPlanTestRecipe();

    const anonRead = await rest("GET", "meal_plan_entries?select=id&limit=1", { token: null });
    assert.equal(anonRead.ok, false, "anon darf meal_plan_entries nicht lesen (kein GRANT)");

    const anonInsert = await rest("POST", "meal_plan_entries", {
      token: null,
      body: mealPlanEntryBody(recipeId),
    });
    assert.equal(anonInsert.ok, false, "anon darf meal_plan_entries nicht einfuegen (kein GRANT)");
  });

  test("meal_plan_entries: meal_slot-Check weist ungueltige Werte ab", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    const bad = await rest("POST", "meal_plan_entries", {
      token: athlete.token,
      body: mealPlanEntryBody(recipeId, { meal_slot: "fruehstueck" }),
    });
    assert.equal(
      bad.ok,
      false,
      "meal_slot='fruehstueck' haette am CHECK-Constraint scheitern muessen"
    );
    if (bad.ok && Array.isArray(bad.data) && bad.data[0]?.id) {
      cleanupTasks.push(async () => {
        await rest("DELETE", `meal_plan_entries?id=eq.${bad.data[0].id}`, { token: athlete.token });
      });
    }
  });

  test("meal_plan_entries: servings <= 0 wird vom CHECK-Constraint abgewiesen", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    const bad = await rest("POST", "meal_plan_entries", {
      token: athlete.token,
      body: mealPlanEntryBody(recipeId, { servings: 0 }),
    });
    assert.equal(
      bad.ok,
      false,
      "servings=0 haette am CHECK-Constraint (servings > 0) scheitern muessen"
    );
    if (bad.ok && Array.isArray(bad.data) && bad.data[0]?.id) {
      cleanupTasks.push(async () => {
        await rest("DELETE", `meal_plan_entries?id=eq.${bad.data[0].id}`, { token: athlete.token });
      });
    }
  });

  test("meal_plan_entries: unique (athlete_id, date, meal_slot) verhindert doppelten Eintrag", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    // Selbes recipe fuer zwei unterschiedliche Slots (soll gehen)
    const date = nextMealPlanDate();
    await insertMealPlanEntryRow(athlete.token, recipeId, { meal_slot: "breakfast", date });

    // Zweiter Eintrag mit gleichem athlete_id, date, meal_slot (soll scheitern)
    const dup = await rest("POST", "meal_plan_entries", {
      token: athlete.token,
      body: mealPlanEntryBody(recipeId, { meal_slot: "breakfast", date }),
    });
    assert.equal(
      dup.ok,
      false,
      "Zweiter meal_plan_entry mit gleichem (athlete_id, date, meal_slot) haette am unique-Constraint scheitern muessen"
    );
    assert.equal(dup.data?.code, "23505", "Ablehnung muss vom unique-Constraint kommen (23505)");
    if (dup.ok && Array.isArray(dup.data) && dup.data[0]?.id) {
      cleanupTasks.push(async () => {
        await rest("DELETE", `meal_plan_entries?id=eq.${dup.data[0].id}`, { token: athlete.token });
      });
    }
  });

  test("meal_plan_entries: selbes recipe in zwei verschiedenen Slots ist erlaubt", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    const date = nextMealPlanDate();
    const id1 = await insertMealPlanEntryRow(athlete.token, recipeId, { meal_slot: "breakfast", date });
    const id2 = await insertMealPlanEntryRow(athlete.token, recipeId, { meal_slot: "lunch", date });

    const both = await rest(
      "GET",
      `meal_plan_entries?id=in.(${id1},${id2})&select=id,meal_slot&order=meal_slot`,
      { token: athlete.token }
    );
    assert.equal(both.ok, true);
    assert.equal(both.data.length, 2, "Beide Eintraege mit selbem recipe in verschiedenen Slots sollten sichtbar sein");
  });

  test("meal_plan_entries: FK restrict auf recipes verhindert Loeschen eines referenzierten Rezepts", async (t) => {
    if (mealPlanEntriesSkip()) return t.skip(mealPlanEntriesSkip());
    if (!HAS_SERVICE_ROLE)
      return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt in .env — ohne Referenz-Recipe kein Insert-Test");

    const recipeId = await ensureMealPlanTestRecipe();
    await insertMealPlanEntryRow(athlete.token, recipeId);

    // Versuch, das referenzierte Rezept zu loeschen -> FK restrict
    const delRecipe = await rest("DELETE", `recipes?id=eq.${recipeId}`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(
      delRecipe.ok,
      false,
      "Referenziertes Rezept wurde geloescht — FK on delete RESTRICT greift nicht"
    );
  });
  // --- 12. profiles.sex / intolerances (0059): für niemanden lesbar --------
  // Migration 0059: height_cm/sex sind Gesundheitsdaten, weder Basistabelle
  // noch profiles_visible/profiles_own führen die neuen Spalten, kein
  // UPDATE-Grant (Lese-/Schreibpfad kommt erst in E5). Der Schreibtest nutzt
  // bewusst einen UNGÜLTIGEN Wert ('x' verletzt den check): so landet auch bei
  // einem fehlerhaften Grant nie ein Wert im echten Profil — erwartet wird
  // ein Berechtigungsfehler (42501), kein Check-Fehler (23514).

  test("profiles: sex/intolerances sind weder für den Eigentümer noch für anon über die Basistabelle lesbar", async () => {
    const own = await rest("GET", `profiles?id=eq.${athlete.userId}&select=id,sex,intolerances`, {
      token: athlete.token,
    });
    assert.equal(own.ok, false, "Eigentümer darf sex/intolerances nicht aus der Basistabelle lesen (kein Spalten-Grant)");
    const anon = await rest("GET", `profiles?id=eq.${athlete.userId}&select=id,sex,intolerances`, {
      token: null,
    });
    assert.equal(anon.ok, false, "anon darf sex/intolerances nicht lesen");
  });

  test("profiles: ein Fremder kann sex/intolerances eines anderen Athleten nicht lesen", async (t) => {
    if (strangerSkip()) return t.skip(strangerSkip());
    const read = await rest("GET", `profiles?id=eq.${athlete.userId}&select=id,sex,intolerances`, {
      token: stranger.token,
    });
    assert.equal(read.ok, false, "Fremder darf sex/intolerances von Athlet 1 nicht lesen");
  });

  test("profiles_visible und profiles_own führen sex/intolerances nicht", async () => {
    for (const view of ["profiles_visible", "profiles_own"]) {
      const res = await rest("GET", `${view}?id=eq.${athlete.userId}&select=*`, { token: athlete.token });
      assert.equal(res.ok, true, `${view}-Read fehlgeschlagen: ${JSON.stringify(res.data)}`);
      const row = res.data?.[0];
      assert.ok(row, `${view} führt die eigene Zeile nicht`);
      for (const col of ["sex", "intolerances"]) {
        assert.equal(col in row, false, `${view} darf ${col} nicht ausliefern`);
      }
    }
  });

  test("profiles: sex/intolerances sind nicht schreibbar (kein UPDATE-Grant, 42501)", async () => {
    const upd = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { sex: "x" },
    });
    assert.equal(upd.ok, false, "UPDATE auf profiles.sex muss scheitern");
    assert.equal(upd.data?.code, "42501", `Ablehnung muss am fehlenden Grant liegen (42501), nicht am Check: ${JSON.stringify(upd.data)}`);
    const upd2 = await rest("PATCH", `profiles?id=eq.${athlete.userId}`, {
      token: athlete.token,
      body: { intolerances: ["gluten"] },
    });
    assert.equal(upd2.ok, false, "UPDATE auf profiles.intolerances muss scheitern");
    assert.equal(upd2.data?.code, "42501", `Ablehnung muss am fehlenden Grant liegen (42501): ${JSON.stringify(upd2.data)}`);
  });

  // --- 13. recipe-images Bucket (0065) -------------------------------------
  // Privater Bucket. INSERT: nur unter eigenem Prefix (auth.uid()) oder als
  // Admin. SELECT: alle authenticated, anon nichts. DELETE: nur Admin, kein
  // UPDATE (kein Überschreiben). Cleanup der Testobjekte über service_role.

  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1`;
  // 1x1-PNG, reicht für die erlaubten mime types
  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  );
  let recipeImagesBucketReady = false;

  async function storage(method, path, { token = null, body, contentType } = {}) {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    };
    if (contentType) headers["Content-Type"] = contentType;
    const res = await fetch(`${STORAGE_BASE}/${path}`, { method, headers, body });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, ok: res.ok, data };
  }

  /** Lädt TINY_PNG unter recipe-images/<path> hoch und merkt das Aufräumen vor. */
  async function uploadRecipeImage(token, path) {
    const res = await storage("POST", `object/recipe-images/${path}`, {
      token,
      body: TINY_PNG,
      contentType: "image/png",
    });
    cleanupTasks.push(async () => {
      if (ENV.SUPABASE_SERVICE_ROLE_KEY) {
        await storage("DELETE", `object/recipe-images/${path}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
      }
    });
    return res;
  }

  const recipeImagesSkip = () => {
    if (!HAS_SERVICE_ROLE) return "SUPABASE_SERVICE_ROLE_KEY fehlt — ohne Aufräumpfad keine Storage-Tests";
    if (!recipeImagesBucketReady) return "Bucket recipe-images nicht vorhanden — Migration 0065 vermutlich noch nicht eingespielt";
    return false;
  };

  const imgPath = (userId, label) => `${userId}/rls-test-${label}-${Date.now()}.png`;

  test("recipe-images: Bucket existiert und ist privat (0065 eingespielt?)", async (t) => {
    if (!HAS_SERVICE_ROLE) return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt");
    const bucket = await storage("GET", "bucket/recipe-images", { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
    if (!bucket.ok) {
      console.warn("Bucket recipe-images fehlt auf dashboard-dev — Migration 0065 noch nicht eingespielt, Bucket-Tests übersprungen");
      recipeImagesBucketReady = false;
      return;
    }
    recipeImagesBucketReady = true;
    assert.equal(bucket.data?.public, false, "recipe-images muss privat sein");
  });

  test("recipe-images: Nicht-Admin darf unter dem eigenen Prefix hochladen", async (t) => {
    if (recipeImagesSkip()) return t.skip(recipeImagesSkip());
    if (testTrainerIsAdmin) return t.skip("Trainer-Account ist Admin");
    const up = await uploadRecipeImage(trainer.token, imgPath(trainer.userId, "own"));
    assert.equal(up.ok, true, `Upload unter eigenem Prefix: ${JSON.stringify(up.data)}`);
  });

  test("recipe-images: Nicht-Admin darf NICHT unter fremdem Prefix hochladen", async (t) => {
    if (recipeImagesSkip()) return t.skip(recipeImagesSkip());
    if (testTrainerIsAdmin) return t.skip("Trainer-Account ist Admin");
    const up = await uploadRecipeImage(trainer.token, imgPath(athlete.userId, "foreign"));
    assert.equal(up.ok, false, "Upload unter dem Prefix eines anderen Athleten muss scheitern (WITH CHECK)");
  });

  test("recipe-images: anon darf weder hochladen noch lesen", async (t) => {
    if (recipeImagesSkip()) return t.skip(recipeImagesSkip());
    if (testTrainerIsAdmin) return t.skip("Trainer-Account ist Admin");
    const up = await uploadRecipeImage(null, imgPath(trainer.userId, "anon"));
    assert.equal(up.ok, false, "anon darf nicht hochladen");

    const path = imgPath(trainer.userId, "anon-read");
    const seeded = await uploadRecipeImage(trainer.token, path);
    assert.equal(seeded.ok, true, `Testobjekt anlegen: ${JSON.stringify(seeded.data)}`);
    const anonRead = await storage("GET", `object/authenticated/recipe-images/${path}`, { token: null });
    assert.equal(anonRead.ok, false, "anon darf nicht lesen");
    const publicRead = await storage("GET", `object/public/recipe-images/${path}`, { token: null });
    assert.equal(publicRead.ok, false, "Bucket ist privat — der public-Pfad darf kein Bild liefern");
  });

  test("recipe-images: jeder eingeloggte Athlet darf Bilder lesen (SELECT using bucket_id)", async (t) => {
    if (recipeImagesSkip()) return t.skip(recipeImagesSkip());
    if (strangerSkip()) return t.skip(strangerSkip());
    if (testTrainerIsAdmin) return t.skip("Trainer-Account ist Admin");
    const path = imgPath(trainer.userId, "read-all");
    const seeded = await uploadRecipeImage(trainer.token, path);
    assert.equal(seeded.ok, true, `Testobjekt anlegen: ${JSON.stringify(seeded.data)}`);
    const read = await storage("GET", `object/authenticated/recipe-images/${path}`, { token: stranger.token });
    assert.equal(read.ok, true, `Fremder muss das Bild lesen können: ${read.status}`);
  });

  test("recipe-images: Nicht-Admin darf eigene Bilder NICHT löschen oder überschreiben", async (t) => {
    if (recipeImagesSkip()) return t.skip(recipeImagesSkip());
    if (testTrainerIsAdmin) return t.skip("Trainer-Account ist Admin");
    const path = imgPath(trainer.userId, "nodelete");
    const seeded = await uploadRecipeImage(trainer.token, path);
    assert.equal(seeded.ok, true, `Testobjekt anlegen: ${JSON.stringify(seeded.data)}`);

    await storage("DELETE", `object/recipe-images/${path}`, { token: trainer.token });
    const still = await storage("GET", `object/authenticated/recipe-images/${path}`, {
      token: ENV.SUPABASE_SERVICE_ROLE_KEY,
    });
    assert.equal(still.ok, true, "Objekt wurde trotz fehlender DELETE-Policy entfernt");

    // Überschreiben (upsert) braucht eine UPDATE-Policy — es gibt keine
    const overwrite = await storage("PUT", `object/recipe-images/${path}`, {
      token: trainer.token,
      body: TINY_PNG,
      contentType: "image/png",
    });
    assert.equal(overwrite.ok, false, "Überschreiben darf nicht gehen (keine UPDATE-Policy)");
  });

  test("recipe-images: Admin darf unter fremdem Prefix hochladen", async (t) => {
    if (recipeImagesSkip()) return t.skip(recipeImagesSkip());
    if (!testAthleteIsAdmin) return t.skip("Test-Athlet ist kein Admin — Admin-Pfad nicht prüfbar");
    const up = await uploadRecipeImage(athlete.token, imgPath(trainer.userId, "admin"));
    assert.equal(up.ok, true, `Admin-Upload unter fremdem Prefix: ${JSON.stringify(up.data)}`);
  });

  // --- 14. recipe_votes: Self-Vote (Edge Case aus Issue #21) ----------------
  // Entscheidung: Ein Athlet DARF auf sein eigenes pending-Rezept stimmen. Die
  // Policy prüft nur athlete_id = auth.uid(), keine Beziehung zum Rezept
  // (E15: „alle Athleten", Votes sind reine Meinungsäußerung ohne Approval-
  // Effekt). Dieser Test hält das Verhalten fest, damit eine spätere
  // Verschärfung bewusst geschieht.

  test("recipe_votes: Self-Vote auf eigenes pending-Rezept ist erlaubt", async (t) => {
    if (!recipeVotesTableReady || !recipesTableReady) return t.skip("recipes/recipe_votes nicht lesbar — Migration fehlt");
    if (!HAS_SERVICE_ROLE) return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt — kein Aufräumpfad");
    const recipe = await insertRecipeRow(athlete.token, { title: "RLS-Test-Self-Vote" });
    assert.equal(recipe.ok, true, `Rezept anlegen: ${JSON.stringify(recipe.data)}`);
    const recipeId = recipe.data[0].id;
    // Rezept-Löschung räumt die Votes per ON DELETE CASCADE mit auf
    cleanupTasks.push(async () => {
      await rest("DELETE", `recipes?id=eq.${recipeId}`, { token: ENV.SUPABASE_SERVICE_ROLE_KEY });
    });
    const vote = await rest("POST", "recipe_votes", {
      token: athlete.token,
      body: { recipe_id: recipeId, athlete_id: athlete.userId, vote: "up" },
    });
    assert.equal(vote.ok, true, `Self-Vote muss erlaubt sein: ${JSON.stringify(vote.data)}`);
  });

  // --- 15. recipes.external_id eindeutig (0066) ----------------------------
  // Regressionstest: scripts/seed-own-recipes.js schreibt per PostgREST-Upsert
  // (on_conflict=external_id). Ohne UNIQUE-Constraint scheitert das mit 42P10 —
  // ein Fake-fetch in den Skript-Tests kann das nicht sehen, nur die echte DB.

  test("recipes: external_id ist eindeutig — Upsert per on_conflict aktualisiert statt zu duplizieren (0066)", async (t) => {
    if (!recipesTableReady) return t.skip("recipes nicht lesbar — Migration 0060/0062 fehlt");
    if (!ENV.SUPABASE_SERVICE_ROLE_KEY) return t.skip("SUPABASE_SERVICE_ROLE_KEY fehlt — kein Schreib-/Aufräumpfad");
    const service = ENV.SUPABASE_SERVICE_ROLE_KEY;
    const externalId = `own-rls-test-${Date.now()}`;
    cleanupTasks.push(async () => {
      await rest("DELETE", `recipes?external_id=eq.${externalId}`, { token: service });
    });
    const row = (title) => ({
      source: "own",
      external_id: externalId,
      status: "approved",
      title,
      meal_type: ["lunch"],
      servings: 1,
    });
    const upsert = (title) =>
      rest("POST", "recipes?on_conflict=external_id", {
        token: service,
        body: [row(title)],
        prefer: "resolution=merge-duplicates,return=representation",
      });

    const first = await upsert("RLS-Test-Upsert-1");
    if (first.data?.code === "42P10") {
      return t.skip("Migration 0066 (UNIQUE auf recipes.external_id) noch nicht eingespielt");
    }
    assert.equal(first.ok, true, `erster Upsert: ${JSON.stringify(first.data)}`);
    const second = await upsert("RLS-Test-Upsert-2");
    assert.equal(second.ok, true, `zweiter Upsert: ${JSON.stringify(second.data)}`);

    const read = await rest("GET", `recipes?external_id=eq.${externalId}&select=id,title`, { token: service });
    assert.equal(read.data?.length, 1, "derselbe external_id darf nur eine Zeile ergeben");
    assert.equal(read.data[0].title, "RLS-Test-Upsert-2", "der zweite Upsert muss die Zeile aktualisieren");
  });
}
