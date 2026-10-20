/* ============================================================
   DEMO/GENERATE.JS — `npm run demo:generate` (Fahrplan 31 E3)
   Erzeugt die fiktiven rides-demo*.json nach data-demo/ — ohne Datenbank.
   Ablauf: Sperren → Lade-Hook → Zeitachse (E1) → Payload (E2) →
   validate.js → atomar schreiben (tmp-Datei + rename wie
   scripts/lib/output.js). Schreibt NIE nach data/ (Regel Nr. 1, V1).

   Aufruf: node scripts/demo/generate.js [--seed <wert>]
   - today = lokales Datum des Rechners
   - seed  = DEFAULT_SEED, per --seed überschreibbar; der Startwert legt
             auch die Epoche fest (lib/epoch.js, Q19)
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { assertDemoOutputPath, DEMO_DATA_DIR } from "./lib/guards.js";
import { DEMO_ROSTER } from "./lib/roster.js";
import { epochForSeed } from "./lib/epoch.js";
import { log } from "../lib/log.js";

const DEFAULT_SEED = "demo";

/** Zieldateien: Dateiname aus dem roster-Endpoint, Ordner immer data-demo/. */
const TARGETS = DEMO_ROSTER.map((athlete) => ({
  athlete,
  file: path.join(DEMO_DATA_DIR, path.basename(athlete.endpoint)),
}));

/** @param {string[]} argv @returns {{ seed: string }} */
function parseArgs(argv) {
  let seed = DEFAULT_SEED;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" && argv[i + 1]) {
      seed = argv[++i];
    } else if (arg.startsWith("--seed=") && arg.length > "--seed=".length) {
      seed = arg.slice("--seed=".length);
    } else {
      throw new Error(`Unbekanntes Argument: ${arg} (erlaubt: --seed <wert>)`);
    }
  }
  return { seed };
}

/** Lokales Datum als YYYY-MM-DD — bewusst nicht toISOString() (UTC). */
function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Atomar schreiben; die Sperre prüft direkt davor noch einmal. */
function writeDemoJson(file, payload) {
  assertDemoOutputPath(file);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmpFile = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}`);
  assertDemoOutputPath(tmpFile);
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), "utf-8");
  fs.renameSync(tmpFile, file);
}

async function main() {
  // Erste Anweisung: Sperren, bevor irgendetwas geladen oder geöffnet wird.
  for (const { file } of TARGETS) assertDemoOutputPath(file);

  const { seed } = parseArgs(process.argv.slice(2));
  const today = localToday();
  const epoch = epochForSeed(seed);

  // Lade-Hook vor allem, was app/src/core/ zieht (s. lib/register-app-core.js).
  await import("./lib/register-app-core.js");
  const { buildDemoTimeline } = await import("./lib/timeline.js");
  const { buildDemoAthlete } = await import("./lib/payload.js");
  const { validateRidesPayload } = await import("../../app/src/core/validate.js");

  const results = TARGETS.map(({ athlete, file }) => {
    const timeline = buildDemoTimeline({ seed, athleteId: athlete.id, epoch, today });
    const { json } = buildDemoAthlete(timeline, athlete);
    const warnings = validateRidesPayload(json);
    if (warnings.length > 0) {
      throw new Error(`${athlete.id}: validate.js meldet ${warnings.length} Warnung(en): ${warnings.join("; ")}`);
    }
    return { athlete, file, json };
  });

  // Erst schreiben, wenn beide Athleten fehlerfrei erzeugt sind.
  for (const { athlete, file, json } of results) {
    writeDemoJson(file, json);
    log.info(`✓ ${athlete.id}: ${json.rides.length} Einheiten → ${path.relative(process.cwd(), file)}`);
  }
  log.info(`seed=${seed} · epoch=${epoch} · today=${today}`);
}

main().catch((err) => {
  log.error(err.message);
  process.exitCode = 1;
});
