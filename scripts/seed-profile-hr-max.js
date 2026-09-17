/* ============================================================
   SCRIPTS/SEED-PROFILE-HR-MAX.JS — Einmal-Seed für den Golden Master

   Fahrplan 17 E2: hrMax/hrRest wandern von app/src/config.ts (harte
   Literale) auf profiles.hr_max (Migration 0039, Fahrplan 17 E1). Golden-
   Master-Zusage: für Athlet 1/2/4 darf sich kein einziger berechneter Wert
   ändern. Dafür muss der heutige config.ts-Literalwert 1:1 in die DB
   wandern, BEVOR das Frontend auf profiles_own umschaltet.

   Nur Athlet 1 hat einen Literalwert (hrMax: 201, s. app/src/config.ts
   ATHLETES[0]) — Athlet 2/4 sind dort schon `null`, für sie gibt es nichts
   zu seeden (Skript überspringt sie mit einer Log-Zeile).

   ACHTUNG: dieser Wert MUSS mit app/src/config.ts::ATHLETES[].hrMax
   übereinstimmen (Spiegel-Prinzip wie NAME_TO_SLUG in
   scripts/lib/sync-config-fetch.js) — bei einer künftigen Änderung dort
   NICHT dieses Skript erneut laufen lassen (die DB-Zeile ist dann längst
   die echte Quelle, nicht mehr config.ts).

   Auth-Modell wie scripts/rename-athlete4-cards.js: Sign-in als der
   Athlet selbst (E-Mail+Passwort über die Supabase-Auth-REST-API), kein
   Service-Role-Key nötig — Migration 0039 grantet `hr_max` bereits für
   `authenticated` auf die eigene Zeile (RLS "id = auth.uid()").

   Idempotent: liest hr_max zuerst, schreibt nur, wenn er noch NULL ist.

   Flags / Env:
     (kein Flag)  Dry-Run — loggt, schreibt nichts
     --apply      schreibt wirklich
     --env=prod   nutzt die *_PROD-Credentials aus .env (dashboard-prod auf
                  supabase.co — Altlast). Für den echten Live-Stack (apps01)
                  zusätzlich URL + anon-Key als Shell-Env überschreiben:
                    SUPABASE_URL_OVERRIDE / SUPABASE_ANON_KEY_OVERRIDE
     CLAUDE.md: jeder echte --apply-Lauf gegen apps01 wird einzeln von Alex
     bestätigt.
   ============================================================ */

import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PROD = args.includes("--env=prod");

// Golden-Master-Werte — Spiegel von app/src/config.ts::ATHLETES[].hrMax.
// Nur Athlet 1 hat einen Literalwert; 2/4 sind dort `null` (nichts zu tun).
const HR_MAX_SEED = {
  athlete1: { email: "SUPABASE_ATHLETE1_EMAIL", password: "SUPABASE_ATHLETE1_PASSWORD", hrMax: 201 },
};

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

log.info(`🌐 Ziel-Umgebung: ${PROD ? "prod" : "dev"} (${SUPABASE_URL})`);
log.info(
  APPLY
    ? "🚀 hr_max seeden (--apply) …"
    : "🔍 Dry-Run (kein --apply — es wird nichts geschrieben) …"
);

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

// Lesen über die View profiles_own (Migration 0039) — hr_max ist auf der
// Basistabelle bewusst NICHT für authenticated select-gegrantet (V1-Kommentar
// dort: Datenschutz, die Tabelle hat eine "using (true)"-RLS-Policy, ohne
// Spalten-Grant wäre hr_max sonst für jede eingeloggte Person lesbar).
// profiles_own filtert serverseitig auf die eigene Zeile (auth.uid()).
async function fetchCurrentHrMax(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles_own?select=hr_max`, {
    headers: restHeaders(accessToken),
  });
  if (!res.ok) {
    throw new Error(`profiles_own-Abfrage fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  return rows[0]?.hr_max ?? null;
}

async function patchHrMax(userId, hrMax, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: restHeaders(accessToken, { Prefer: "return=minimal" }),
    body: JSON.stringify({ hr_max: hrMax }),
  });
  if (!res.ok) {
    throw new Error(`profiles-Update (id=${userId}) fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
}

async function main() {
  for (const [slug, seed] of Object.entries(HR_MAX_SEED)) {
    const email = PROD ? ENV[`${seed.email}_PROD`] : ENV[seed.email];
    const password = PROD ? ENV[`${seed.password}_PROD`] : ENV[seed.password];
    if (!email || !password) {
      log.warn(`${slug}: keine Credentials in .env (${seed.email}${PROD ? "_PROD" : ""}) — übersprungen.`);
      continue;
    }

    const { accessToken, userId } = await signIn(email, password);
    const current = await fetchCurrentHrMax(accessToken);

    if (current != null) {
      log.info(`${slug}: hr_max bereits gesetzt (${current}) — übersprungen (idempotent).`);
      continue;
    }

    log.info(`${slug}: hr_max ist NULL → würde auf ${seed.hrMax} gesetzt.`);
    if (APPLY) {
      await patchHrMax(userId, seed.hrMax, accessToken);
      log.info(`✅ ${slug}: hr_max = ${seed.hrMax} geschrieben.`);
    }
  }

  if (!APPLY) {
    log.info("Dry-Run — mit --apply wird wirklich geschrieben.");
  }
  log.summary();
}

main().catch((err) => {
  log.error("Fehler:", err.message);
  process.exit(1);
});
