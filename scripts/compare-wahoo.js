/* ============================================================
   SCRIPTS/COMPARE-WAHOO.JS — Wahoo-Fahrten neben rides.json legen
   (Fahrplan 19 B5). Nur lesen: keine Netzwerkaufrufe, nichts wird geschrieben.

   Aufruf:  npm run compare:wahoo
            npm run compare:wahoo -- --wahoo <wahoo-1.json> --rides <rides.json>
                                     [--tz Europe/Berlin] [--json]

   Exit-Code: 0 = Bericht ausgegeben ODER „noch keine Wahoo-Daten",
              1 = Eingabedatei ist kaputt (kein JSON / falsche Form),
              2 = falsche Argumente.
   Logik, Paarung und Toleranzen: scripts/lib/wahoo-compare.js
   ============================================================ */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  DEFAULT_TIME_ZONE,
  buildComparison,
  formatReport,
  readInput,
} from "./lib/wahoo-compare.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "..", "data");

const out = (text) => process.stdout.write(`${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);

/** @returns {number} Exit-Code */
export function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        wahoo: { type: "string", default: path.join(DATA_DIR, "wahoo-1.json") },
        rides: { type: "string", default: path.join(DATA_DIR, "rides.json") },
        tz: { type: "string", default: DEFAULT_TIME_ZONE },
        json: { type: "boolean", default: false },
      },
    }));
    new Intl.DateTimeFormat("en-US", { timeZone: values.tz });
  } catch {
    err("Falsche Argumente. Erlaubt: --wahoo <Datei> --rides <Datei> --tz <Zeitzone> --json");
    return 2;
  }

  const wahoo = readInput(values.wahoo);
  if (wahoo.state === "invalid") {
    err(`Wahoo-Datei kaputt (${wahoo.error}): ${values.wahoo}`);
    return 1;
  }
  const rides = readInput(values.rides);
  if (rides.state === "invalid") {
    err(`rides.json kaputt (${rides.error}): ${values.rides}`);
    return 1;
  }

  if (wahoo.state === "missing" || wahoo.data.rides.length === 0) {
    out(
      "Noch keine Wahoo-Daten — nichts zu vergleichen. Das ist in Ordnung, solange Wahoo nicht verbunden ist oder der Sync noch nicht gelaufen ist."
    );
    return 0;
  }
  if (rides.state === "missing") {
    out("rides.json fehlt oder ist leer — nichts zum Vergleichen.");
    return 0;
  }

  const result = buildComparison(wahoo.data, rides.data, values.tz);
  if (values.json) {
    out(
      JSON.stringify(
        {
          timeZone: result.timeZone,
          pairs: result.rows,
          onlyWahoo: result.onlyWahoo.length,
          onlyIcu: result.onlyIcu.length,
          summary: result.summary,
        },
        null,
        2
      )
    );
  } else {
    out(formatReport(result));
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
