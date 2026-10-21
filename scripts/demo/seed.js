/* ============================================================
   DEMO/SEED.JS — `npm run demo:seed` (Fahrplan 31 E4)
   Legt die Demo-Accounts an und ergänzt ihre Zeilen in der LOKALEN
   Demo-Datenbank. Bestehendes bleibt (Q15), s. lib/seed-run.js.

   Aufruf: node scripts/demo/seed.js [--seed <wert>]
   Umgebung (nur von dort, nie im Code):
   - DEMO_SUPABASE_URL      z. B. http://localhost:8000 — nur localhost
   - DEMO_SERVICE_ROLE_KEY  service_role-JWT des Demo-Stacks
   Bewusst NICHT SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: die zeigen auf
   echte Backends. Die echte .env wird nicht geladen.
   ============================================================ */

import { assertDemoTarget } from "./lib/guards.js";
import { demoEmails, runSeed } from "./lib/seed-run.js";
import { loadSeedSources, localToday, parseArgs } from "./lib/cli.js";
import { log } from "../lib/log.js";

async function main() {
  // Erste Anweisung: Sperren, bevor irgendeine Verbindung aufgebaut wird.
  assertDemoTarget(process.env.DEMO_SUPABASE_URL);
  demoEmails();

  const { seed } = parseArgs(process.argv.slice(2));
  const today = localToday();
  const { rowsFor, payloadFor } = await loadSeedSources({ seed, today });
  const summary = await runSeed({
    url: process.env.DEMO_SUPABASE_URL,
    serviceKey: process.env.DEMO_SERVICE_ROLE_KEY,
    rowsFor,
    payloadFor,
  });

  log.info(
    `✓ Accounts neu: ${summary.accountsCreated} · Profile ergänzt: ${summary.profiles}` +
      ` · Passwort markiert: ${summary.passwordsMarked}`
  );
  for (const [table, { added, updated }] of Object.entries(summary.tables)) {
    log.info(`  ${table}: +${added} neu · ${updated} nachgezogen`);
  }
  log.info(`seed=${seed} · today=${today}`);
}

main().catch((err) => {
  log.error(err.message);
  process.exitCode = 1;
});
