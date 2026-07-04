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
};

/**
 * Bricht mit klarer Fehlermeldung ab, wenn Pflicht-Secrets fehlen.
 * @param {string[]} names Schlüssel aus ENV, die gesetzt sein müssen
 */
export function requireEnv(names) {
  const missing = names.filter((n) => !ENV[n]);
  if (missing.length) {
    console.error(`❌ Fehlende Umgebungsvariablen: ${missing.join(", ")} — .env oder GitHub Secrets prüfen.`);
    process.exit(1);
  }
}
