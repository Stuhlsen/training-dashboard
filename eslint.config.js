/* ESLint Flat Config — läuft ohne Install via `npx --yes eslint@9 …`
   Browser-Globals für assets/, Node-Globals für scripts/ und tests/. */
export default [
  {
    files: ["assets/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        prompt: "readonly",
        alert: "readonly",
        console: "readonly",
        history: "readonly",
        location: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        btoa: "readonly",
        unescape: "readonly",
        Node: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      eqeqeq: ["warn", "smart"],
    },
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortController: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      eqeqeq: ["warn", "smart"],
    },
  },
];
