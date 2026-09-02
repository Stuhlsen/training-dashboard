/* ============================================================
   SCRIPTS/LIB/ENV.JS — .env-Loader + Secrets-Zugriff
   Lädt die lokale .env (nicht committen, steht in .gitignore)
   und stellt alle Umgebungswerte gebündelt bereit.
   Keine Klarnamen, keine Koordinaten im Code — alles via Secrets.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// === .env laden (nur lokal — in der Action kommen die Werte als env vars) ===
// Ein vorab in der Shell gesetzter, NICHT-LEERER Wert (z. B.
// "$env:SUPABASE_URL = ..." vor npm test, s. docs/docker-lokal-einrichten.md
// Abschnitt 3) gewinnt gegen die .env-Datei — ohne dieses "nur wenn noch
// unset" wuerde .env den bewussten Override still ueberschreiben, empirisch
// beim DKR3-Testlauf aufgefallen. Ein leerer String zaehlt bewusst als
// "nicht gesetzt" (nicht nur undefined) — sonst wuerde z. B. ein Docker-
// Dry-Run mit "-e NOTION_API_KEY=" (s. Abschnitt 2, gezielt fuer
// requireEnv()-Fail-Fast-Tests) einen spaeteren echten .env-Wert im selben
// Prozess blockieren.
// "preset" wird VOR dem Einlesen von .env erfasst — nur diese Schluessel
// werden beim Parsen uebersprungen. Ohne diese Trennung wuerde ein
// doppelter Schluessel INNERHALB von .env selbst zum Bug: nach der ersten
// Zeile waere process.env[k] schon gesetzt, die zweite (untere, eigentlich
// neuere) Zeile wuerde dann faelschlich ignoriert statt wie erwartet zu
// gewinnen.
const envPath = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(envPath)) {
  const preset = new Set(Object.keys(process.env).filter((k) => process.env[k]));
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const [key, ...rest] = t.split("=");
      const k = key.trim();
      if (!preset.has(k)) process.env[k] = rest.join("=").trim();
    }
  }
}

export const ENV = {
  NOTION_KEY: process.env.NOTION_API_KEY,
  DB_ID: process.env.NOTION_DATABASE_ID,
  // --- Athlet 1, 2 + 4: intervals.icu-Key/-ID und der grobe Standort kommen
  //     seit Fahrplan 7 CRED3/CRED4 aus der Supabase-Tabelle athlete_sync_config
  //     (scripts/lib/sync-config-fetch.js, EIN service_role-Aufruf). Jeder
  //     Athlet ist eine normale profile_id-Zeile — es gibt kein
  //     INTERVALS_API_KEY(_2/_4) / WEATHER_LAT/LON(_2/_4) mehr, weder hier
  //     noch in der .env (Fahrplan 7 CRED5). ---
  // Supabase. SUPABASE_SERVICE_ROLE_KEY: seit CRED3 der Zugang des Sync zu
  // athlete_sync_config / profiles / plan_cards / ftp_history (RLS-Bypass,
  // ein Aufruf statt Login pro Athlet). Nur lokal in .env bzw. auf apps01,
  // nie im Frontend, nie im Repo. SUPABASE_ANON_KEY bleibt für den anonymen
  // session_formats-Read (scripts/lib/formats-fetch.js) und die RLS-Tests.
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  SUPABASE_ATHLETE1_EMAIL: process.env.SUPABASE_ATHLETE1_EMAIL || "",
  SUPABASE_ATHLETE1_PASSWORD: process.env.SUPABASE_ATHLETE1_PASSWORD || "",
  // Athlet 2: vom Sync NICHT mehr gelesen (seit CRED4 eine normale
  // profile_id-Zeile in athlete_sync_config). Der {email,password}-Legacy-
  // Zweig in scripts/lib/plan-cards-fetch.js / ftp-history.js wird nur noch
  // von scripts/backtest-ladder.js und
  // scripts/report-derived-workout-structure.js genutzt.
  SUPABASE_ATHLETE2_EMAIL: process.env.SUPABASE_ATHLETE2_EMAIL || "",
  SUPABASE_ATHLETE2_PASSWORD: process.env.SUPABASE_ATHLETE2_PASSWORD || "",
  // Athlet 4 ("Bentastiic"): vom Sync NICHT mehr gelesen (s. CRED3-Hinweis
  // oben), aber weiter von den Einmal-Skripten
  // scripts/migrate-plan-to-supabase.js und scripts/delete-rest-day-cards.js
  // gebraucht.
  SUPABASE_ATHLETE4_EMAIL: process.env.SUPABASE_ATHLETE4_EMAIL || "",
  SUPABASE_ATHLETE4_PASSWORD: process.env.SUPABASE_ATHLETE4_PASSWORD || "",
  // Nur für tests/supabase-rls.test.js (Live-RLS-Check gegen dashboard-dev,
  // Account "Trainer-ST", coacht dort den SUPABASE_ATHLETE1_EMAIL-Account
  // "Stuhlsen") — s. AGENTS.md "Test-Sicherheit".
  SUPABASE_TRAINER_EMAIL: process.env.SUPABASE_TRAINER_EMAIL || "",
  SUPABASE_TRAINER_PASSWORD: process.env.SUPABASE_TRAINER_PASSWORD || "",
  // Optionale Prod-Gegenstücke — nur für gezielte, manuell mit --env=prod
  // gestartete Einmal-Skripte (z.B. scripts/delete-rest-day-cards.js), NIE von
  // npm test/npm run sync gelesen. Bewusst eigene Variablen statt die
  // Dev-Werte oben zu überschreiben, damit ein versehentlicher npm-test-Lauf
  // weiterhin gegen dashboard-dev läuft, nicht gegen echte Athletendaten.
  SUPABASE_URL_PROD: process.env.SUPABASE_URL_PROD || "",
  SUPABASE_ANON_KEY_PROD: process.env.SUPABASE_ANON_KEY_PROD || "",
  SUPABASE_ATHLETE1_EMAIL_PROD: process.env.SUPABASE_ATHLETE1_EMAIL_PROD || "",
  SUPABASE_ATHLETE1_PASSWORD_PROD: process.env.SUPABASE_ATHLETE1_PASSWORD_PROD || "",
  SUPABASE_ATHLETE4_EMAIL_PROD: process.env.SUPABASE_ATHLETE4_EMAIL_PROD || "",
  SUPABASE_ATHLETE4_PASSWORD_PROD: process.env.SUPABASE_ATHLETE4_PASSWORD_PROD || "",
};

/**
 * Bricht mit klarer Fehlermeldung ab, wenn Pflicht-Secrets fehlen.
 * @param {string[]} names Schlüssel aus ENV, die gesetzt sein müssen
 */
export function requireEnv(names) {
  const missing = names.filter((n) => !ENV[n]);
  if (missing.length) {
    console.error(
      `❌ Fehlende Umgebungsvariablen: ${missing.join(", ")} — .env oder GitHub Secrets prüfen.`
    );
    process.exit(1);
  }
}
