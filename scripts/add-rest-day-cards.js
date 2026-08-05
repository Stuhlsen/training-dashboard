/* ============================================================
   SCRIPTS/ADD-REST-DAY-CARDS.JS — Einmal-Nachtrag: fehlende
   Ruhetag-Karten (D6, docs/konzept-progressionssteuerung.md) für
   Athlet 1 in plan_cards nachtragen, ohne bestehende Zeilen
   anzufassen.

   Hintergrund: scripts/lib/plan2.js bekam nachträglich Mi/So-
   Ruhetag-Einträge in PLANNED_SESSIONS. scripts/migrate-plan-to-
   supabase.js ist für einen erneuten Lauf ungeeignet — dessen
   --force löscht ALLE plan_cards des Athleten inkl. seither
   entstandener CRUD-Änderungen (Vorschläge, Verschiebungen, Wahoo-
   Push-IDs); das Skript ist laut eigenem Kopfkommentar nur für das
   Vor-CRUD-Zeitfenster gedacht, das ist längst vorbei. Deshalb hier
   ein reines Insert-only-Nachtragsskript: fügt NUR neue Ruhetag-
   Zeilen für Termine hinzu, an denen in Supabase noch KEINE Karte
   existiert (unabhängig vom Typ — eine bereits per Drag&Drop dorthin
   verschobene Karte hat Vorrang, keine Dopplung), lässt alles andere
   unangetastet. Nur ab heute (kein rückwirkendes Befüllen — vergangene
   Ruhetage haben im Planungstab ohnehin keine sichtbare Wirkung).

   Flags:
     (kein Flag)  Dry-Run — loggt nur, schreibt nichts
     --apply      schreibt wirklich
     --env=prod   schreibt gegen dashboard-prod (SUPABASE_*_PROD-Variablen)
                  statt dashboard-dev (Default). Getrennte Variablen bewusst,
                  s. scripts/lib/env.js — kein Umbiegen der von npm test/
                  npm run sync genutzten Dev-Werte.
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { PLANNED_SESSIONS } from "./lib/plan2.js";
import { localISODate } from "../assets/js/core/format.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const IS_PROD = args.includes("--env=prod");

const TARGET = IS_PROD
  ? {
      label: "dashboard-prod",
      url: ENV.SUPABASE_URL_PROD,
      anonKey: ENV.SUPABASE_ANON_KEY_PROD,
      email: ENV.SUPABASE_ATHLETE1_EMAIL_PROD,
      password: ENV.SUPABASE_ATHLETE1_PASSWORD_PROD,
    }
  : {
      label: "dashboard-dev",
      url: ENV.SUPABASE_URL,
      anonKey: ENV.SUPABASE_ANON_KEY,
      email: ENV.SUPABASE_ATHLETE1_EMAIL,
      password: ENV.SUPABASE_ATHLETE1_PASSWORD,
    };

requireEnv(
  IS_PROD
    ? [
        "SUPABASE_URL_PROD",
        "SUPABASE_ANON_KEY_PROD",
        "SUPABASE_ATHLETE1_EMAIL_PROD",
        "SUPABASE_ATHLETE1_PASSWORD_PROD",
      ]
    : ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_ATHLETE1_EMAIL", "SUPABASE_ATHLETE1_PASSWORD"]
);

async function signIn(url, anonKey, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Supabase-Login fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return { accessToken: json.access_token, userId: json.user.id };
}

function restHeaders(anonKey, accessToken, extra) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function fetchExistingDates(url, anonKey, userId, accessToken) {
  const res = await fetch(`${url}/rest/v1/plan_cards?athlete_id=eq.${userId}&select=planned_date`, {
    headers: restHeaders(anonKey, accessToken),
  });
  if (!res.ok) {
    throw new Error(`plan_cards-Abfrage fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  return new Set(rows.map((r) => r.planned_date));
}

async function insertRows(url, anonKey, userId, accessToken, rows) {
  const res = await fetch(`${url}/rest/v1/plan_cards`, {
    method: "POST",
    headers: restHeaders(anonKey, accessToken, { Prefer: "return=minimal" }),
    body: JSON.stringify(rows.map((r) => ({ ...r, athlete_id: userId }))),
  });
  if (!res.ok) {
    throw new Error(`plan_cards-Insert fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function main() {
  const today = localISODate();
  log.info(`Ziel: ${TARGET.label}`);
  log.info(
    APPLY ? "🚀 Ruhetag-Nachtrag (--apply) …" : "🔍 Dry-Run (kein --apply — es wird nichts geschrieben) …"
  );

  const { accessToken, userId } = await signIn(TARGET.url, TARGET.anonKey, TARGET.email, TARGET.password);
  const existingDates = await fetchExistingDates(TARGET.url, TARGET.anonKey, userId, accessToken);

  const candidates = Object.entries(PLANNED_SESSIONS)
    .filter(([date, s]) => s.typ === "Ruhetag" && date >= today)
    .sort(([a], [b]) => a.localeCompare(b));

  const toInsert = [];
  for (const [date, s] of candidates) {
    if (existingDates.has(date)) {
      log.warn(`${date}: bereits eine Karte in plan_cards vorhanden — übersprungen (keine Dopplung).`);
      continue;
    }
    toInsert.push({
      planned_date: date,
      sort_order: 0,
      title: s.name,
      workout_type: s.typ,
      km: s.km ?? null,
      duration_min: null,
      tss_planned: null,
      status: "geplant",
      cancel_reason: null,
      moved_from_date: null,
      move_reason: null,
      week: s.week ?? null,
      phase: s.phase ?? null,
      note: s.details ?? null,
      workout: null,
      pushed_external_id: null,
    });
  }

  log.info(`${toInsert.length} neue Ruhetag-Karte(n) ab ${today}:`);
  for (const r of toInsert) {
    log.info(`   ${r.planned_date} · ${r.title} (${r.week}/${r.phase})`);
  }

  if (!APPLY) {
    log.info("Dry-Run — nichts geschrieben (--apply zum tatsächlichen Schreiben).");
    log.summary();
    return;
  }

  if (!toInsert.length) {
    log.info("Nichts zu schreiben.");
    log.summary();
    return;
  }

  await insertRows(TARGET.url, TARGET.anonKey, userId, accessToken, toInsert);
  log.info(`✅ ${toInsert.length} plan_cards geschrieben.`);
  log.summary();
}

main().catch((err) => {
  log.error("Fehler:", err.message);
  process.exit(1);
});
