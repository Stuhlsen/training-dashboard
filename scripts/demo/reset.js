/* ============================================================
   DEMO/RESET.JS — `npm run demo:reset` (Fahrplan 31 E4)
   Löscht NUR die @demo.local-Accounts aus der Demo-Besetzung (ihre
   Zeilen fallen per Cascade) und legt danach alles neu an.
   Mit anderem --seed verschiebt sich die Epoche (Q19).

   Aufruf: node scripts/demo/reset.js [--seed <wert>]
   Umgebung wie demo:seed: DEMO_SUPABASE_URL, DEMO_SERVICE_ROLE_KEY.
   ============================================================ */

import { assertDemoTarget } from "./lib/guards.js";
import { demoEmails, runReset, runSeed } from "./lib/seed-run.js";
import { loadSeedSources, localToday, parseArgs } from "./lib/cli.js";
import { log } from "../lib/log.js";

async function main() {
  // Erste Anweisung: Sperren, bevor irgendeine Verbindung aufgebaut wird.
  assertDemoTarget(process.env.DEMO_SUPABASE_URL);
  demoEmails();

  const { seed } = parseArgs(process.argv.slice(2));
  const today = localToday();
  // Zeilen vor dem Löschen bauen: scheitert der Generator, bleibt die DB, wie sie ist.
  const { rowsFor, payloadFor } = await loadSeedSources({ seed, today });
  const target = {
    url: process.env.DEMO_SUPABASE_URL,
    serviceKey: process.env.DEMO_SERVICE_ROLE_KEY,
  };

  const deleted = await runReset(target);
  log.info(`✓ Gelöscht: ${deleted.length ? deleted.join(", ") : "nichts (keine Demo-Accounts)"}`);

  const summary = await runSeed({ ...target, rowsFor, payloadFor });
  log.info(`✓ Neu angelegt: ${summary.accountsCreated} Accounts`);
  for (const [table, { added }] of Object.entries(summary.tables))
    log.info(`  ${table}: +${added}`);
  log.info(`seed=${seed} · today=${today}`);
}

main().catch((err) => {
  log.error(err.message);
  process.exitCode = 1;
});
