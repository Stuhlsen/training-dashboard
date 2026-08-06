/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
