/* ============================================================
   SCRIPTS/RENAME-ATHLETE4-CARDS.JS — Einmal-Umbenennung

   Der Commit "clearer athlete-4 card names" (v1.23.0) hat die
   Einsteigervorlage scripts/lib/plan-athlete4.js umbenannt
   ("Lockere Einheit" ×20 → "Z2 50 Min locker", "3×8 Min Tempo" →
   "Tempo 3×8 Min", …). Die Vorlage speist aber nur rides-4.json
   (Adhärenz/Lücken) — der Planungstab baut sein Wochenraster
   ausschließlich aus der Supabase-Tabelle plan_cards, deren `title`-
   Spalte einmalig beim Seed aus der ALTEN Vorlage befüllt wurde
   (scripts/migrate-plan-to-supabase.js, plan-to-cards.js: `title: s.name`).
   Eine Code-Änderung an der Vorlage benennt bestehende plan_cards-Zeilen
   NICHT um — das macht dieses Skript.

   MATCH über (alter Titel + `week`), NICHT über `planned_date`: der
   apps01-Live-Plan ist gegen die Vorlagendaten verschoben (andere
   Startwoche / Offset), die `week`-Labels (KW36–47, Erholung = KW39/KW43)
   entsprechen aber unverändert der Vorlagen-Blockstruktur. Nur zwei alte
   Titel sind erholungswochenabhängig ("Lockere Einheit",
   "Längere lockere Ausfahrt") — dafür wird `week` gebraucht.

   Vorgehen pro Athlet-4-Zeile:
     - title ∈ NEUE Titel            → schon umbenannt, überspringen (idempotent)
     - title unbekannt              → WARNEN + überspringen (selbst bearbeitete
                                      oder unerwartete Karte bleibt unangetastet)
     - erholungswochenabhängiger Titel ohne `week` → WARNEN + überspringen
     - sonst                        → PATCH title = neuer Titel

   NUR die `title`-Spalte wird geändert. workout_type/workout/week/phase/…
   bleiben unberührt (der Commit hat nur `name` geändert, keinen `typ`).

   KEINE SQL-Schema-Migration in supabase/migrations/: nur Zeilenwerte,
   kein Schema. Wie delete-rest-day-cards.js.

   Auth-Modell wie scripts/delete-rest-day-cards.js: Sign-in als der Athlet
   (E-Mail+Passwort über die Supabase-Auth-REST-API), kein Service-Role-Key
   — die RLS-Policy "plan_cards: athlete_id = auth.uid()" greift normal.
   Reine fetch-Aufrufe, kein @supabase/supabase-js.

   Flags / Env:
     (kein Flag)  Dry-Run — loggt die Änderungen, schreibt nichts
     --apply      schreibt wirklich
     --env=prod   nutzt die *_PROD-Credentials aus .env (dashboard-prod auf
                  supabase.co — Altlast). Für den echten Live-Stack (apps01)
                  zusätzlich URL + anon-Key als Shell-Env überschreiben:
                    SUPABASE_URL_OVERRIDE / SUPABASE_ANON_KEY_OVERRIDE
                  (beide zusammen; der anon-Key ist per Design öffentlich,
                  steht in der von apps01 ausgelieferten config.json).
     CLAUDE.md: jeder echte --apply-Lauf wird einzeln von Alex bestätigt.
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PROD = args.includes("--env=prod");

requireEnv(
  PROD
    ? ["SUPABASE_URL_PROD", "SUPABASE_ANON_KEY_PROD"]
    : ["SUPABASE_URL", "SUPABASE_ANON_KEY"]
);

const URL_OVERRIDE = process.env.SUPABASE_URL_OVERRIDE || "";
const ANON_OVERRIDE = process.env.SUPABASE_ANON_KEY_OVERRIDE || "";
if (!!URL_OVERRIDE !== !!ANON_OVERRIDE) {
  log.error("SUPABASE_URL_OVERRIDE und SUPABASE_ANON_KEY_OVERRIDE nur zusammen setzen.");
  process.exit(1);
}
const SUPABASE_URL = URL_OVERRIDE || (PROD ? ENV.SUPABASE_URL_PROD : ENV.SUPABASE_URL);
const SUPABASE_ANON_KEY = ANON_OVERRIDE || (PROD ? ENV.SUPABASE_ANON_KEY_PROD : ENV.SUPABASE_ANON_KEY);
if (URL_OVERRIDE) log.info("⚙️  URL/anon-Key via Shell-Override (apps01-Pfad).");

const A4_EMAIL = PROD ? ENV.SUPABASE_ATHLETE4_EMAIL_PROD : ENV.SUPABASE_ATHLETE4_EMAIL;
const A4_PASSWORD = PROD ? ENV.SUPABASE_ATHLETE4_PASSWORD_PROD : ENV.SUPABASE_ATHLETE4_PASSWORD;
if (!A4_EMAIL || !A4_PASSWORD) {
  log.error(
    `Athlet 4: keine ${PROD ? "SUPABASE_ATHLETE4_*_PROD" : "SUPABASE_ATHLETE4_*"}-Credentials in .env.`
  );
  process.exit(1);
}

// Erholungswochen der 12-Wochen-Vorlage (weekPlan(): recovery bei i===3/7,
// kw = KW${36+i}) → KW39 und KW43.
const RECOVERY_WEEKS = new Set(["KW39", "KW43"]);

// Alle Titel, die die NEUE Vorlage erzeugt — trifft einer schon zu, ist die
// Zeile bereits umbenannt (idempotenter Re-Lauf).
const NEW_TITLES = new Set([
  "Z2 50 Min locker",
  "Z2 40 Min sehr locker",
  "Z2 Dauer 85 Min",
  "Z2 Dauer 60 Min (reduziert)",
  "Lange Z2 90 Min",
  "Z2 50 Min (Erholungswoche)",
  "Tempo 3×8 Min",
  "Sweet Spot 2×15 Min",
  "20-Min-FTP-Test",
]);

/** Alter Titel (+ week für die beiden erholungsabhängigen Fälle) → neuer
 *  Titel. `null` = unbekannter Titel (nicht anfassen). */
function resolveNewTitle(oldTitle, week) {
  const recovery = RECOVERY_WEEKS.has(week);
  switch (oldTitle) {
    case "Lockere Einheit":
      return recovery ? "Z2 40 Min sehr locker" : "Z2 50 Min locker";
    case "Längere lockere Ausfahrt":
      return recovery ? "Z2 Dauer 60 Min (reduziert)" : "Z2 Dauer 85 Min";
    case "Lange ruhige Ausfahrt":
      return "Lange Z2 90 Min";
    case "Lockere Ausfahrt (Erholungswoche)":
      return "Z2 50 Min (Erholungswoche)";
    case "3×8 Min Tempo":
      return "Tempo 3×8 Min";
    case "2×15 Min Sweet Spot":
      return "Sweet Spot 2×15 Min";
    case "20-Min-Test":
      return "20-Min-FTP-Test";
    default:
      return null;
  }
}

const WEEK_DEPENDENT = new Set(["Lockere Einheit", "Längere lockere Ausfahrt"]);

log.info(`🌐 Ziel-Umgebung: ${PROD ? "prod" : "dev"} (${SUPABASE_URL})`);

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
  return { accessToken: json.access_token, userId: json.user.id };
}

function restHeaders(accessToken, extra) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function fetchCards(userId, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/plan_cards?athlete_id=eq.${userId}&select=id,planned_date,title,workout_type,week,status&order=planned_date.asc`,
    { headers: restHeaders(accessToken) }
  );
  if (!res.ok) {
    throw new Error(`plan_cards-Abfrage fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function patchTitle(id, title, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/plan_cards?id=eq.${id}`, {
    method: "PATCH",
    headers: restHeaders(accessToken, { Prefer: "return=minimal" }),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    throw new Error(`plan_cards-Update (id=${id}) fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function main() {
  log.info(
    APPLY
      ? "🚀 Athlet-4-Karten umbenennen (--apply) …"
      : "🔍 Dry-Run (kein --apply — es wird nichts geschrieben) …"
  );

  const { accessToken, userId } = await signIn(A4_EMAIL, A4_PASSWORD);
  const cards = await fetchCards(userId, accessToken);
  log.info(`Athlet 4: ${cards.length} plan_cards-Zeile(n)\n`);

  const toRename = [];
  let already = 0;
  for (const c of cards) {
    if (NEW_TITLES.has(c.title)) {
      already++;
      continue;
    }
    if (WEEK_DEPENDENT.has(c.title) && !c.week) {
      // Kein week-Label (apps01-Seed-Artefakt, eine Karte am 08.09.). Beide
      // erholungsabhängigen Titel bekommen dann die NICHT-Erholungs-Variante
      // — auf apps01 tragen alle echten Erholungskarten (KW39/KW43) ihr
      // week-Label, ein weekloser Fall ist also eine normale Woche.
      log.warn(`   ${c.planned_date} · [—] "${c.title}" — kein week, nehme Nicht-Erholungs-Variante`);
    }
    const want = resolveNewTitle(c.title, c.week);
    if (!want) {
      log.warn(`   ${c.planned_date} · [${c.week ?? "—"}] "${c.title}" — kein bekannter Alt-Titel → übersprungen (unangetastet)`);
      continue;
    }
    log.info(`   ${c.planned_date} · [${c.week ?? "—"}] "${c.title}"  →  "${want}"  (${c.workout_type})`);
    toRename.push({ id: c.id, title: want });
  }

  log.info(
    `\nZusammenfassung: ${toRename.length} umzubenennen · ${already} bereits aktuell · ` +
      `${cards.length - toRename.length - already} übersprungen`
  );

  if (!toRename.length) {
    log.info("Nichts zu tun.");
    log.summary();
    return;
  }

  if (!APPLY) {
    log.info(`Dry-Run — mit --apply werden die ${toRename.length} Titel geschrieben.`);
    log.summary();
    return;
  }

  for (const r of toRename) {
    await patchTitle(r.id, r.title, accessToken);
  }
  log.info(`✅ ${toRename.length} Karten-Titel aktualisiert.`);
  log.summary();
}

main().catch((err) => {
  log.error("Fehler:", err.message);
  process.exit(1);
});
