/* ESLint Flat Config — läuft ohne Install via `npx --yes eslint@9 …`
   Node-Globals für scripts/ und tests/. */
export default [
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
