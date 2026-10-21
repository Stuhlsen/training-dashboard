/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { parseEnvFile, resolveDemoRuntime, type DemoRuntimeConfig } from "./src/dev-server/demo-runtime.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Versions-Footer (Issue #6). `git describe` braucht den echten Repo-Verlauf
 *  (Tags) — vorhanden bei lokalem Dev/Build und im GH-Pages-Workflow (Checkout
 *  des ganzen Repos), NICHT im Docker-Build: dort ist der Build-Context nur
 *  `./app` (s. publish-images.yml), `.git` liegt außerhalb und ist gar nicht
 *  erst kopiert — `execSync` wirft dort, `VITE_APP_VERSION` (vom Dockerfile
 *  per ARG aus dem Tag-Namen gesetzt) greift als Fallback.
 *
 *  GH Pages baut `main` bei JEDEM Push neu, nicht nur beim Taggen — dort wäre
 *  die volle "-N-gHASH[-dirty]"-Beschreibung fast immer der Normalfall statt
 *  der Ausnahme. `GITHUB_ACTIONS=true` (von jedem GH-Actions-Runner automatisch
 *  gesetzt, kein eigenes Plumbing nötig) schaltet dort auf "nur der letzte
 *  Tag" um — lokal (Dev-Server/-Build) bleibt der volle Debug-Stand, der ist
 *  dort hilfreich. */
function resolveVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    const cmd =
      process.env.GITHUB_ACTIONS === "true"
        ? "git describe --tags --abbrev=0"
        : "git describe --tags --always --dirty";
    return execSync(cmd, { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return "dev";
  }
}

/** Liefert die per Cron erzeugten `/data/*.json` im DEV-Server aus
 *  (Konzept 5.5, in Etappe 2b bestätigt: die JSON-Pipeline bleibt
 *  unangetastet, die React-App liest dieselben Dateien).
 *
 *  Nötig nur lokal: der Dev-Server wurzelt in `/app/`, die Dateien liegen
 *  im Repo-Root daneben. In Produktion (Etappe 10) liegt `/data/` neben
 *  der gebauten App, dort greift derselbe URL-Pfad ohne Zutun — deshalb
 *  `apply: "serve"` und KEIN Kopieren in den Build: eine Kopie wäre ein
 *  zweiter, sofort veraltender Stand derselben Daten.
 *
 *  Bewusst kein Symlink und kein `publicDir: "../data"`: ersteres braucht
 *  unter Windows erhöhte Rechte, letzteres würde Vites eigenes `public/`
 *  verdrängen. */
function serveRepoData(dataDir: "data" | "data-demo"): Plugin {
  const root = path.join(REPO_ROOT, dataDir);
  return {
    name: "serve-repo-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const name = path.basename(decodeURIComponent((req.url ?? "").split("?")[0]));
        const file = path.join(root, name);
        // basename() oben schneidet jeden Pfadanteil weg — ein
        // "../../.env" kann hier gar nicht erst ankommen. Die Prüfung
        // bleibt trotzdem stehen, falls die Zeile darüber je gelockert wird.
        if (!name.endsWith(".json") || !file.startsWith(root + path.sep)) {
          return next();
        }
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** Laufzeit-Config des Demo-Modus (Fahrplan 31, E5) — Prüfung und Regeln in
 *  `src/dev-server/demo-runtime.ts` (getestet). Hier nur das I/O: Umgebung
 *  plus NUR `<repo>/.env.demo`. Bewusst nicht Vites `loadEnv()`: das läse
 *  die echte `.env` mit (Fahrplan 31, E4: die echte .env wird nie geladen).
 *  Fehlt etwas, wirft resolveDemoRuntime() — der Dev-Server startet nicht. */
function demoRuntimeConfig(): DemoRuntimeConfig {
  const file = path.join(REPO_ROOT, ".env.demo");
  const fileVars = existsSync(file) ? parseEnvFile(readFileSync(file, "utf8")) : {};
  return resolveDemoRuntime(process.env, fileVars);
}

/** Demo-Modus im Dev-Server (`npm run dev` = `vite --mode demo`): schreibt
 *  `window.__RUNTIME_CONFIG__` direkt in index.html — derselbe Endpunkt wie
 *  im Container (config.json), aber ohne Request, der scheitern kann
 *  (index.html überspringt config.json auf Port 5173). `/config.json` liefert
 *  zusätzlich dieselben Werte, falls Vite auf einen anderen Port ausweicht
 *  und index.html dort doch nachlädt. */
function serveDemoRuntimeConfig(runtime: DemoRuntimeConfig): Plugin {
  const json = JSON.stringify(runtime);
  return {
    name: "serve-demo-runtime-config",
    apply: "serve",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { "data-cookieconsent": "ignore" },
          children: `window.__RUNTIME_CONFIG__ = ${json.replace(/</g, "\\u003c")};`,
          injectTo: "head-prepend",
        },
      ];
    },
    configureServer(server) {
      server.middlewares.use("/config.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(json);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  // GitHub Pages liefert die Projektseite unter /training-dashboard/ (Etappe
  // 10c). Nur im Build setzen, nicht im Dev-Server, sonst müsste lokal unter
  // /training-dashboard/ statt / entwickelt werden.
  base: command === "build" ? "/training-dashboard/" : "/",
  // Modus "demo" nur im Dev-Server: /data aus data-demo/ (nie data/), Demo-
  // Config in index.html. Jeder andere Modus verhält sich wie bisher.
  plugins:
    command === "serve" && mode === "demo"
      ? [react(), serveRepoData("data-demo"), serveDemoRuntimeConfig(demoRuntimeConfig())]
      : [react(), serveRepoData("data")],
  define: {
    __APP_VERSION__: JSON.stringify(resolveVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    // Zwei Projekte, damit die portierte core-Schicht (Etappe 2a) nicht
    // unnötig jsdom hochfährt: core/ ist reine Rechenlogik ohne DOM-Zugriff
    // (Schichtenregel, s. AGENTS.md) und läuft in "node". Alles andere —
    // die Supabase-Config, React-Komponenten ab Etappe 4 — braucht jsdom.
    projects: [
      {
        extends: true,
        test: { name: "core", include: ["src/core/**/*.test.js"], environment: "node" },
      },
      {
        extends: true,
        test: {
          // Bewusst inkl. .js und mit explizitem exclude statt eines auf
          // {ts,tsx} verengten include: sonst liefe ein neuer .js-Test
          // außerhalb src/core/ in KEINEM der beiden Projekte — also still
          // gar nicht. Genau diese Lücke hatte das Root-`npm test`.
          name: "app",
          include: ["src/**/*.test.{js,ts,tsx}"],
          exclude: ["src/core/**"],
          environment: "jsdom",
          // Unmountet nach jedem Test (s. Kopf von setup.ts) — verhindert
          // sporadische "window is not defined"-Fehler nach dem jsdom-Abbau.
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
  },
}));
