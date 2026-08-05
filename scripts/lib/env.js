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
const envPath = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) {
      const [key, ...rest] = t.split("=");
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

export const ENV = {
  NOTION_KEY: process.env.NOTION_API_KEY,
  DB_ID: process.env.NOTION_DATABASE_ID,
  INTERVALS_KEY: process.env.INTERVALS_API_KEY || "",
  INTERVALS_ATHLETE: process.env.INTERVALS_ATHLETE_ID || "",
  // Zweiter Athlet (read-only Vergleich, kein eigener Trainingsplan)
  INTERVALS_KEY_2: process.env.INTERVALS_API_KEY_2 || "",
  INTERVALS_ATHLETE_2: process.env.INTERVALS_ATHLETE_ID_2 || "",
  // Standorte ausschließlich über Secrets — keine Koordinaten im Code
  WEATHER_LAT: process.env.WEATHER_LAT || null,
  WEATHER_LON: process.env.WEATHER_LON || null,
  WEATHER_LAT_2: process.env.WEATHER_LAT_2 || null,
  WEATHER_LON_2: process.env.WEATHER_LON_2 || null,
  // Für scripts/migrate-plan-to-supabase.js (Einmal-Migration) UND seit
  // Progressionssteuerung C1 auch für generate-data.js/npm run sync
  // (scripts/lib/plan-cards-fetch.js, scripts/lib/ftp-history.js) — ohne
  // diese Werte degradieren beide geräuschlos (keine plan_cards/keine
  // FTP-Historie, s. dortige Kommentare), kein Fehler.
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_ATHLETE1_EMAIL: process.env.SUPABASE_ATHLETE1_EMAIL || "",
  SUPABASE_ATHLETE1_PASSWORD: process.env.SUPABASE_ATHLETE1_PASSWORD || "",
  SUPABASE_ATHLETE2_EMAIL: process.env.SUPABASE_ATHLETE2_EMAIL || "",
  SUPABASE_ATHLETE2_PASSWORD: process.env.SUPABASE_ATHLETE2_PASSWORD || "",
  // Nur für tests/supabase-rls.test.js (Live-RLS-Check gegen dashboard-dev,
  // Account "Trainer-ST", coacht dort den SUPABASE_ATHLETE1_EMAIL-Account
  // "Stuhlsen") — s. AGENTS.md "Test-Sicherheit".
  SUPABASE_TRAINER_EMAIL: process.env.SUPABASE_TRAINER_EMAIL || "",
  SUPABASE_TRAINER_PASSWORD: process.env.SUPABASE_TRAINER_PASSWORD || "",
  // Optionale Prod-Gegenstücke — nur für gezielte, manuell mit --env=prod
  // gestartete Einmal-Skripte (z.B. scripts/add-rest-day-cards.js), NIE von
  // npm test/npm run sync gelesen. Bewusst eigene Variablen statt die
  // Dev-Werte oben zu überschreiben, damit ein versehentlicher npm-test-Lauf
  // weiterhin gegen dashboard-dev läuft, nicht gegen echte Athletendaten.
  SUPABASE_URL_PROD: process.env.SUPABASE_URL_PROD || "",
  SUPABASE_ANON_KEY_PROD: process.env.SUPABASE_ANON_KEY_PROD || "",
  SUPABASE_ATHLETE1_EMAIL_PROD: process.env.SUPABASE_ATHLETE1_EMAIL_PROD || "",
  SUPABASE_ATHLETE1_PASSWORD_PROD: process.env.SUPABASE_ATHLETE1_PASSWORD_PROD || "",
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
