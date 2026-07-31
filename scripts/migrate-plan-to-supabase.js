/* ============================================================
   SCRIPTS/MIGRATE-PLAN-TO-SUPABASE.JS — Einmal-Migration
   Basisplan (scripts/lib/plan2.js + plan-athlete2.js) + Adjustments
   (data/adjustments.json + -2.json) → plan_cards (Supabase).

   Referenz: docs/phase-3-konzept-planungstab.md §8.4,
   docs/dashboard-2.0-fahrplan-aktuell.md Phase 3.

   Läuft NUR lokal (kein Teil von sync-data.yml/generate-data.js), braucht
   eigene Secrets in .env (SUPABASE_URL, SUPABASE_ANON_KEY,
   SUPABASE_ATHLETE{1,2}_EMAIL/_PASSWORD) — s. AGENTS.md.

   Auth-Modell: Sign-in als der jeweilige Athlet (E-Mail+Passwort über die
   Supabase-Auth-REST-API), nicht Service-Role-Key — die bestehende RLS-
   Policy "plan_cards: Athlet+Trainer schreiben" (athlete_id = auth.uid())
   greift dann ganz normal, kein privilegierter Key nötig. athlete_id kommt
   direkt aus der Auth-Antwort (user.id), kein separates UUID-Secret.

   Kein npm-Package (@supabase/supabase-js) — reine fetch-Aufrufe gegen die
   PostgREST-/Auth-REST-API. Bewusst NICHT über scripts/lib/http.js::
   fetchJson (das schluckt Fehler zu `null` und passt nicht zum "brich
   kontrolliert mit klarer Meldung ab"-Verhalten, das dieses Skript für
   Login-/Schreibfehler braucht) — kein Timeout/Retry hier, aber unkritisch
   für einen manuell gestarteten, einmaligen Lokal-Lauf. "fallow" bleibt
   die einzige devDependency (AGENTS.md).

   Flags:
     (kein Flag)  Dry-Run — loggt nur, schreibt nichts
     --apply      schreibt wirklich
     --force      löscht vorher alle plan_cards des Athleten (nur mit
                  --apply relevant) — nötig für einen echten Re-Lauf,
                  sonst bricht das Skript kontrolliert ab (Lehre aus
                  0004_events.sql: kein stilles Doppel-Schreiben/Löschen).
                  ACHTUNG: löscht ALLE plan_cards-Zeilen des Athleten, nicht
                  nur migrationseigene — sobald der Karten-CRUD-Schritt
                  existiert und Athleten/Trainer eigene Karten anlegen,
                  reißt --force die auch mit. Dieses Skript ist nur für das
                  Vor-CRUD-Zeitfenster gedacht (s. docs/offene-punkte.md).
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { PLANNED_SESSIONS } from "./lib/plan2.js";
import { PLANNED_SESSIONS_ATHLETE2 } from "./lib/plan-athlete2.js";
import { loadAdjustments, loadAdjustments2 } from "./lib/output.js";
import { buildPlanCardRows } from "./lib/plan-to-cards.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");

requireEnv([
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_ATHLETE1_EMAIL",
  "SUPABASE_ATHLETE1_PASSWORD",
  "SUPABASE_ATHLETE2_EMAIL",
  "SUPABASE_ATHLETE2_PASSWORD",
]);

const ATHLETES = [
  {
    label: "Athlet 1",
    sessions: PLANNED_SESSIONS,
    adjustments: loadAdjustments(),
    email: ENV.SUPABASE_ATHLETE1_EMAIL,
    password: ENV.SUPABASE_ATHLETE1_PASSWORD,
  },
  {
    label: "Athlet 2",
    sessions: PLANNED_SESSIONS_ATHLETE2,
    adjustments: loadAdjustments2(),
    email: ENV.SUPABASE_ATHLETE2_EMAIL,
    password: ENV.SUPABASE_ATHLETE2_PASSWORD,
  },
];

/** Signiert als Athlet ein, liefert {accessToken, userId}. Wirft bei Fehler
 *  (falsches Passwort, unbekannter Account) — das ist fatal fürs Skript. */
async function signIn(email, password) {
  const res = await fetch(`${ENV.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ENV.SUPABASE_ANON_KEY },
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
    apikey: ENV.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Zählt bestehende plan_cards des Athleten (Idempotenz-Guard). */
async function countExistingCards(userId, accessToken) {
  const res = await fetch(
    `${ENV.SUPABASE_URL}/rest/v1/plan_cards?athlete_id=eq.${userId}&select=id`,
    { headers: restHeaders(accessToken) }
  );
  if (!res.ok) {
    throw new Error(`plan_cards-Check fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  return (await res.json()).length;
}

async function deleteExistingCards(userId, accessToken) {
  const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/plan_cards?athlete_id=eq.${userId}`, {
    method: "DELETE",
    headers: restHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`plan_cards-Löschen fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
}

/** Fügt Zeilen in Batches ein (PostgREST verkraftet größere Arrays
 *  problemlos, batching hier nur als Sicherheitsnetz gegen sehr große Pläne). */
async function insertCards(userId, accessToken, rows) {
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({ ...r, athlete_id: userId }));
    const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/plan_cards`, {
      method: "POST",
      headers: restHeaders(accessToken, { Prefer: "return=minimal" }),
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      throw new Error(`plan_cards-Insert fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
    }
  }
}

function loadRidesFile(name) {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")).rides || [];
  } catch (e) {
    log.warn(`${name} nicht lesbar für Median-TSS-Berechnung:`, e.message);
    return [];
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Nebenprodukt (log-only, s. Plan): Median-TRIMP (Belastungs-Proxy für
 *  TSS in diesem Projekt, s. ride.trimp) je Session-Typ aus den Ist-
 *  Fahrten — Grundlage für die spätere Konfliktlogik (Schritt 4), hier
 *  bewusst nur geloggt, nicht persistiert oder in state/config.js verdrahtet. */
function logMedianTssPerType() {
  const rides = [...loadRidesFile("rides.json"), ...loadRidesFile("rides-2.json")];
  const byTyp = new Map();
  for (const r of rides) {
    if (!r.typ || r.trimp == null) continue;
    if (!byTyp.has(r.typ)) byTyp.set(r.typ, []);
    byTyp.get(r.typ).push(r.trimp);
  }
  log.info("\n📊 Median-TRIMP je Typ (Ist-Fahrten, Nebenprodukt für spätere Konfliktlogik):");
  for (const [typ, values] of [...byTyp.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    log.info(`   ${typ}: Median ${median(values)} (n=${values.length})`);
  }
}

async function migrateAthlete({ label, sessions, adjustments, email, password }) {
  log.info(`\n🔄 ${label} — Login…`);
  const { accessToken, userId } = await signIn(email, password);

  const existing = await countExistingCards(userId, accessToken);
  if (existing > 0 && !FORCE) {
    log.error(
      `${label}: plan_cards ist bereits befüllt (${existing} Zeilen) — Skript ist nur für die ` +
        `einmalige Erstmigration gedacht. Mit --force erneut ausführen, um vorher alle Zeilen ` +
        `dieses Athleten zu löschen und neu zu schreiben.`
    );
    return;
  }

  const rows = buildPlanCardRows(sessions, adjustments);
  const movedCount = rows.filter((r) => r.moved_from_date).length;
  const cancelledCount = rows.filter((r) => r.status === "ausgefallen").length;

  log.info(`${label}: ${rows.length} Sessions → plan_cards (${movedCount} verschoben, ${cancelledCount} ausgefallen)`);
  log.info(`${label}: Beispielzeilen:`);
  for (const r of rows.slice(0, 3)) {
    log.info(`   ${r.planned_date} · ${r.title} (${r.workout_type}) · status=${r.status}`);
  }

  if (!APPLY) {
    log.info(`${label}: Dry-Run — nichts geschrieben (--apply zum tatsächlichen Schreiben).`);
    return;
  }

  if (existing > 0 && FORCE) {
    log.info(`${label}: --force — lösche ${existing} bestehende plan_cards…`);
    await deleteExistingCards(userId, accessToken);
  }

  await insertCards(userId, accessToken, rows);
  log.info(`✅ ${label}: ${rows.length} plan_cards geschrieben.`);
}

async function main() {
  log.info(APPLY ? "🚀 Migration (--apply) …" : "🔍 Dry-Run (kein --apply — es wird nichts geschrieben) …");
  // Bewusst sequenziell statt Promise.all: bei einem Einmal-Skript zählt
  // lesbare, athletenweise geordnete Log-Ausgabe mehr als der kleine
  // Zeitgewinn aus Parallelisierung (ein paar HTTP-Roundtrips pro Athlet).
  for (const athlete of ATHLETES) {
    await migrateAthlete(athlete);
  }
  logMedianTssPerType();
  log.summary();
  if (log.counts.errors > 0) process.exit(1);
}

main().catch((err) => {
  log.error("Fehler:", err.message);
  process.exit(1);
});
