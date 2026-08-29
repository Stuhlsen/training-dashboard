/* ============================================================
   SCRIPTS/DELETE-REST-DAY-CARDS.JS — Einmal-Aufräumen (Fahrplan 6,
   RUH6): entfernt die alten Ruhetag-Zeilen aus plan_cards, nachdem
   RUH1–RUH5 Ruhetage auf das abgeleitete Plan-Wochen-Modell
   (app/src/core/plan-week-model.js) umgestellt haben.

   Ab RUH2 erzeugt die Pipeline keine `workout_type = "Ruhetag"`-
   Karten mehr; die schon in Supabase liegenden Alt-Zeilen (aus
   scripts/add-rest-day-cards.js bzw. der Erstmigration) würden sonst
   als Doppelkarten neben dem abgeleiteten Ruhetag stehen bleiben.
   Dieses Skript löscht sie — für ALLE Athleten, deren Login in .env
   steht.

   KEINE SQL-Schema-Migration in supabase/migrations/: es werden nur
   Zeilen entfernt, keine Spalten/Tabellen/Policies geändert. Ein
   Migrationsskript wäre hier fehl am Platz (nichts am Schema
   reproduzierbar nachzuvollziehen).

   Athlet 2s Karte "Ausrüstung checken" (Renntag-Vorbereitung) trägt
   im Code seit RUH2 `typ: "Notiz"` (s. scripts/lib/plan-athlete2.js
   ~Zeile 517), die vor RUH2 migrierte Supabase-Zeile hat aber noch
   `workout_type = "Ruhetag"` mit dem Titel "Ruhetag — Ausrüstung
   checken". Deshalb löscht dieses Skript nur Zeilen mit dem EXAKTEN
   Titel "Ruhetag" — abweichende Titel werden geloggt und
   übersprungen.

   Auth-Modell wie scripts/migrate-plan-to-supabase.js: Sign-in als
   der jeweilige Athlet (E-Mail+Passwort über die Supabase-Auth-REST-
   API), kein Service-Role-Key — die RLS-Policy "plan_cards:
   athlete_id = auth.uid()" greift ganz normal. Reine fetch-Aufrufe,
   kein @supabase/supabase-js.

   Flags:
     (kein Flag)  Dry-Run — loggt die zu löschenden Zeilen, schreibt nichts
     --apply      löscht wirklich
     --env=prod   Ziel dashboard-prod (nutzt die *_PROD-Variablen aus
                  .env, s. env.js) statt dashboard-dev (Default). Athlet 2
                  hat kein Prod-Konto → in prod nur Athlet 1 + 4.
                  CLAUDE.md: der --apply --env=prod-Lauf wird einzeln von
                  Alex bestätigt, nie automatisch.
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PROD = args.includes("--env=prod");

const SUPABASE_URL = PROD ? ENV.SUPABASE_URL_PROD : ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = PROD ? ENV.SUPABASE_ANON_KEY_PROD : ENV.SUPABASE_ANON_KEY;

requireEnv(
  PROD
    ? [
        "SUPABASE_URL_PROD",
        "SUPABASE_ANON_KEY_PROD",
        "SUPABASE_ATHLETE1_EMAIL_PROD",
        "SUPABASE_ATHLETE1_PASSWORD_PROD",
      ]
    : ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_ATHLETE1_EMAIL", "SUPABASE_ATHLETE1_PASSWORD"]
);

log.info(`🌐 Ziel-Umgebung: ${PROD ? "prod" : "dev"} (${SUPABASE_URL})`);

// Athletenliste wie scripts/migrate-plan-to-supabase.js: Athlet 1 immer,
// Athlet 2 nur dev (kein Prod-Konto), Athlet 4 nur wenn Credentials da.
const ATHLETES = [
  {
    label: "Athlet 1",
    email: PROD ? ENV.SUPABASE_ATHLETE1_EMAIL_PROD : ENV.SUPABASE_ATHLETE1_EMAIL,
    password: PROD ? ENV.SUPABASE_ATHLETE1_PASSWORD_PROD : ENV.SUPABASE_ATHLETE1_PASSWORD,
  },
];

if (!PROD && ENV.SUPABASE_ATHLETE2_EMAIL && ENV.SUPABASE_ATHLETE2_PASSWORD) {
  ATHLETES.push({
    label: "Athlet 2",
    email: ENV.SUPABASE_ATHLETE2_EMAIL,
    password: ENV.SUPABASE_ATHLETE2_PASSWORD,
  });
}

const a4Email = PROD ? ENV.SUPABASE_ATHLETE4_EMAIL_PROD : ENV.SUPABASE_ATHLETE4_EMAIL;
const a4Password = PROD ? ENV.SUPABASE_ATHLETE4_PASSWORD_PROD : ENV.SUPABASE_ATHLETE4_PASSWORD;
if (a4Email && a4Password) {
  ATHLETES.push({ label: "Athlet 4", email: a4Email, password: a4Password });
} else {
  log.info(
    `ℹ️  Athlet 4: keine ${PROD ? "SUPABASE_ATHLETE4_*_PROD" : "SUPABASE_ATHLETE4_*"}-Credentials in .env — übersprungen`
  );
}

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

async function fetchRestDayCards(userId, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/plan_cards?athlete_id=eq.${userId}&workout_type=eq.Ruhetag&select=id,planned_date,title,status`,
    { headers: restHeaders(accessToken) }
  );
  if (!res.ok) {
    throw new Error(`plan_cards-Abfrage fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function deleteById(ids, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/plan_cards?id=in.(${ids.join(",")})`,
    { method: "DELETE", headers: restHeaders(accessToken, { Prefer: "return=minimal" }) }
  );
  if (!res.ok) {
    throw new Error(`plan_cards-Löschen fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function processAthlete({ label, email, password }) {
  log.info(`\n🔄 ${label} — Login…`);
  const { accessToken, userId } = await signIn(email, password);

  const cards = (await fetchRestDayCards(userId, accessToken)).sort((a, b) =>
    a.planned_date.localeCompare(b.planned_date)
  );
  log.info(`${label}: ${cards.length} Zeile(n) mit workout_type = "Ruhetag"`);

  const toDelete = [];
  for (const c of cards) {
    if (c.title === "Ruhetag") {
      log.info(`   ${c.planned_date} · ${c.title} · status=${c.status}  → löschen`);
      toDelete.push(c);
    } else {
      log.warn(`   ${c.planned_date} · "${c.title}" · abweichender Titel — übersprungen (nicht gelöscht)`);
    }
  }

  if (!toDelete.length) return { label, deleted: 0 };

  if (!APPLY) {
    log.info(`${label}: Dry-Run — ${toDelete.length} Zeile(n) würden gelöscht (--apply zum tatsächlichen Löschen).`);
    return { label, deleted: 0 };
  }

  await deleteById(toDelete.map((c) => c.id), accessToken);
  log.info(`${label}: ✅ ${toDelete.length} Ruhetag-Zeile(n) gelöscht.`);
  return { label, deleted: toDelete.length };
}

async function main() {
  log.info(
    APPLY
      ? "🚀 Ruhetag-Aufräumen (--apply) …"
      : "🔍 Dry-Run (kein --apply — es wird nichts gelöscht) …"
  );

  const results = [];
  for (const a of ATHLETES) {
    results.push(await processAthlete(a));
  }

  log.info("\n📊 Ergebnis:");
  for (const r of results) {
    log.info(`   ${r.label}: ${APPLY ? `${r.deleted} gelöscht` : "Dry-Run"}`);
  }
  log.summary();
}

main().catch((err) => {
  log.error("Fehler:", err.message);
  process.exit(1);
});
