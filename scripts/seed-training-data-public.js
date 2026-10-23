/* ============================================================
   SCRIPTS/SEED-TRAINING-DATA-PUBLIC.JS — Einmal-Seed für den Schalter
   profiles.training_data_public bei athlete1–athlete4

   Fahrplan 26 E1 (Q7): die vier Bestandsathleten sind heute für alle
   Eingeloggten sichtbar, neue Accounts bleiben privat (Spalten-Default
   false, Migration 0078). Der Schalter der vier wird NICHT in der Migration
   gesetzt — das bräuchte Namen oder UUIDs in SQL. Stattdessen löst dieses
   Skript die Profile über dieselben Pseudonyme auf, die schon in
   scripts/lib/sync-config-fetch.js::NAME_TO_SLUG stehen. Keine UUID, kein
   Schlüssel im Code.

   Wann: einmal gegen den apps01-Stack, BEVOR das Frontend in E5 die Tabellen
   liest. Vorher liest niemand die Tabellen, der Wert zählt bis dahin nicht.

   Auth-Modell: service_role (RLS-Bypass), wie der Sync. Ziel-Stack kommt aus
   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Shell-Wert gewinnt gegen .env, s.
   scripts/lib/env.js). Für apps01 beide inline in der Shell setzen — NICHT die
   *_PROD-Werte aus .env, die zeigen auf das tote supabase.co-Projekt.
   CLAUDE.md: jeder echte --apply-Lauf gegen apps01 wird einzeln von Alex
   bestätigt.

   Idempotent: setzt nur Profile, bei denen der Schalter noch false ist.
   Fehlende Profile (z. B. Athlet ohne Login) werden gemeldet, nicht angelegt.

   Flags:
     (kein Flag)  Dry-Run — loggt, schreibt nichts
     --apply      schreibt wirklich
   ============================================================ */

import { fileURLToPath } from "node:url";
import { ENV, requireEnv } from "./lib/env.js";
import { log } from "./lib/log.js";
import { slugForName } from "./lib/sync-config-fetch.js";

const SLUGS = ["athlete1", "athlete2", "athlete3", "athlete4"];

/**
 * Wählt aus den Profilzeilen die der vier Bestandsathleten, deren Schalter
 * noch aus ist.
 * @param {Array<{id:string, display_name:string|null, training_data_public:boolean}>} profiles
 * @returns {{ toSet: Array<{id:string, slug:string}>, alreadyOn: string[], missing: string[] }}
 */
export function planSeed(profiles) {
  const seen = new Map();
  for (const p of profiles) {
    const slug = slugForName(p.display_name);
    if (slug && !seen.has(slug)) seen.set(slug, p);
  }
  const toSet = [];
  const alreadyOn = [];
  for (const [slug, p] of seen) {
    if (p.training_data_public) alreadyOn.push(slug);
    else toSet.push({ id: p.id, slug });
  }
  const missing = SLUGS.filter((s) => !seen.has(s));
  return { toSet, alreadyOn, missing };
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const base = `${ENV.SUPABASE_URL}/rest/v1`;
  const headers = {
    apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  log.info(`🌐 Ziel: ${new URL(ENV.SUPABASE_URL).host}`);
  log.info(APPLY ? "🚀 Schalter setzen (--apply) …" : "🔍 Dry-Run (kein --apply) …");

  const res = await fetch(`${base}/profiles?select=id,display_name,training_data_public`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`profiles-Abfrage fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  const { toSet, alreadyOn, missing } = planSeed(await res.json());

  for (const slug of alreadyOn) log.info(`${slug}: Schalter schon an — übersprungen (idempotent).`);
  for (const slug of missing) log.warn(`${slug}: kein Profil gefunden — übersprungen.`);

  for (const { id, slug } of toSet) {
    log.info(`${slug}: Schalter ist aus → wird angeschaltet.`);
    if (!APPLY) continue;
    const patch = await fetch(`${base}/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ training_data_public: true }),
    });
    if (!patch.ok) {
      throw new Error(
        `${slug}: Update fehlgeschlagen (HTTP ${patch.status}): ${await patch.text()}`
      );
    }
    log.info(`✅ ${slug}: training_data_public = true.`);
  }

  if (!APPLY) log.info("Dry-Run — mit --apply wird wirklich geschrieben.");
  log.summary();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    log.error("Fehler:", err.message);
    process.exit(1);
  });
}
