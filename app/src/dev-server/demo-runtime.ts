/* ============================================================
   DEV-SERVER/DEMO-RUNTIME.TS — Laufzeit-Config für `npm run dev`
   (Fahrplan 31, E5)

   Nur vom Vite-Dev-Server (vite.config.ts) genutzt, nie vom App-Bundle
   importiert. Rein (kein fs, kein process) — vite.config.ts liest
   Umgebung und `.env.demo` selbst und reicht beides herein. So ist die
   Prüfung ohne Node-Typen testbar.
   ============================================================ */

export interface DemoRuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  env: "demo";
}

/** Zerlegt den Inhalt von `.env.demo` (KEY=VALUE, `#`-Kommentare, optionale
 *  Anführungszeichen). */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

const HINT =
  "Setze DEMO_SUPABASE_URL (z. B. http://localhost:8000) und DEMO_ANON_KEY in der " +
  "Umgebung oder in <repo>/.env.demo. Für echte Daten: npm run dev:real.";

/** URL + anon-Key des lokalen Demo-Stacks aus `DEMO_SUPABASE_URL`/
 *  `DEMO_ANON_KEY` — Umgebung vor Datei. Wirft (laut, mit Hinweis), wenn
 *  etwas fehlt oder die URL nicht http(s) auf localhost/127.0.0.1 ist — es
 *  gibt keinen Rückfall auf dashboard-dev. Fehlermeldungen nennen nur
 *  Variablennamen, nie Werte. Dieselbe Regel wie die Ziel-Sperre in
 *  `scripts/demo/lib/guards.js` (der Docker-Build sieht nur `./app`, ein
 *  Import von dort bräche ihn). */
export function resolveDemoRuntime(
  env: Readonly<Record<string, string | undefined>>,
  file: Readonly<Record<string, string>>,
): DemoRuntimeConfig {
  const url = env.DEMO_SUPABASE_URL || file.DEMO_SUPABASE_URL || "";
  const key = env.DEMO_ANON_KEY || file.DEMO_ANON_KEY || "";
  if (!url || !key) {
    const missing = [!url && "DEMO_SUPABASE_URL", !key && "DEMO_ANON_KEY"].filter(Boolean);
    throw new Error(`Demo-Modus: ${missing.join(" und ")} ${missing.length > 1 ? "fehlen" : "fehlt"}. ${HINT}`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Demo-Modus: DEMO_SUPABASE_URL ist keine gültige URL. ${HINT}`);
  }
  const local =
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    !parsed.username &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (!local) {
    throw new Error(`Demo-Modus: DEMO_SUPABASE_URL muss auf localhost/127.0.0.1 zeigen. ${HINT}`);
  }
  return { supabaseUrl: url, supabaseAnonKey: key, env: "demo" };
}
