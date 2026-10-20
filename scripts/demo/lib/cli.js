/* ============================================================
   DEMO/LIB/CLI.JS — Gemeinsames der Demo-Einstiegspunkte
   (demo:generate, demo:seed, demo:reset — Fahrplan 31 E3/E4)
   Argumente, lokales "heute" und der Zeilen-Bauer für die DB.
   Kein I/O außer dem dynamischen Laden von app/src/core/.
   ============================================================ */

import { DEMO_ROSTER } from "./roster.js";
import { epochForSeed } from "./epoch.js";

export const DEFAULT_SEED = "demo";

/** @param {string[]} argv @returns {{ seed: string }} */
export function parseArgs(argv) {
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
export function localToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Lädt Lade-Hook, Zeitachse (E1) und Payload (E2) und liefert je Athlet
 * die Supabase-Zeilen (V4). Dieselbe Epoche wie demo:generate (V3/E3).
 * @param {{ seed: string, today: string }} opts
 * @returns {Promise<(athlete: import("./roster.js").DemoAthlete) => Record<string, object[]>>}
 */
export async function loadRowsFor({ seed, today }) {
  const epoch = epochForSeed(seed);
  await import("./register-app-core.js");
  const { buildDemoTimeline } = await import("./timeline.js");
  const { buildDemoAthlete } = await import("./payload.js");
  return (athlete) => {
    if (!DEMO_ROSTER.includes(athlete)) throw new Error(`Kein Demo-Athlet: ${athlete?.id}`);
    const timeline = buildDemoTimeline({ seed, athleteId: athlete.id, epoch, today });
    return buildDemoAthlete(timeline, athlete).rows;
  };
}
