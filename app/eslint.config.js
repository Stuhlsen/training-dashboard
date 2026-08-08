import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist"] },
  // Portierte core-Schicht (Etappe 2a): reines JS, Regeln wie in der
  // Root-eslint.config.js, damit die Kopie nicht stiller ungelintet läuft.
  //
  // Module und Tests sind bewusst getrennt: core/ hat per Schichtenregel
  // (AGENTS.md) KEINE Globals — kein document/window/localStorage/fetch, aber
  // auch kein process/console. Ohne Globals-Eintrag macht `no-undef` diese
  // Regel hier zur Lint-Fehlermeldung statt zur bloßen Konvention. Die Tests
  // laufen dagegen unter Node (vitest-Projekt "core") und brauchen
  // node-Globals (u.a. `process` für die Doku-Pfadauflösung).
  {
    files: ["src/core/**/*.js"],
    ignores: ["src/core/**/*.test.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {},
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      eqeqeq: ["warn", "smart"],
      // /app/ nutzt ESLint 10 (Regel in "recommended"), das Root-Repo noch
      // ESLint 9 (Regel dort nicht vorhanden). Einziger Treffer ist
      // session-classify.js:70-72 — tote `= 0`-Initialisierer, beide Zweige
      // weisen unbedingt zu, also rein stilistisch. Bewusst nicht gefixt:
      // 2a portiert core/ inhaltlich 1:1, und bis zur Umschaltung (Etappe 10)
      // laufen Original und Kopie parallel. Aufräumkandidat für Etappe 10.
      "no-useless-assignment": "off",
    },
  },
  {
    files: ["src/core/**/*.test.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      eqeqeq: ["warn", "smart"],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { args: "none" }],
    },
  },
);
