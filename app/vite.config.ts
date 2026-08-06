/// <reference types="vitest/config" />
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
function serveRepoData(): Plugin {
  return {
    name: "serve-repo-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const name = path.basename(decodeURIComponent((req.url ?? "").split("?")[0]));
        const file = path.join(REPO_ROOT, "data", name);
        // basename() oben schneidet jeden Pfadanteil weg — ein
        // "../../.env" kann hier gar nicht erst ankommen. Die Prüfung
        // bleibt trotzdem stehen, falls die Zeile darüber je gelockert wird.
        if (!name.endsWith(".json") || !file.startsWith(path.join(REPO_ROOT, "data"))) {
          return next();
        }
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json");
        createReadStream(file).pipe(res);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveRepoData()],
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
        },
      },
    ],
  },
});
