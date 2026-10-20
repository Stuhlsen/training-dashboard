/* ============================================================
   DEMO/LIB/TS-RESOLVE-HOOK.JS — Node-Lade-Hook für app/src/ (Fahrplan 31 E1)
   app/src/core/ ist JS, importiert aber einzelne Sport-Module aus
   app/src/sports/ als `./x.js`, die in Wahrheit `x.ts` heißen (Vite/TS-
   Auflösung). Reines Node findet diese Dateien nicht. Der Hook versucht
   bei einem fehlgeschlagenen `.js`-Import innerhalb von app/src/ dieselbe
   Datei mit `.ts`; Node 24 entfernt die (rein löschbaren) Typen selbst.
   Registriert wird er über register-app-core.js, nie global.
   ============================================================ */

/** @param {string} specifier @param {object} context @param {Function} nextResolve */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const fromApp = context.parentURL?.includes("/app/src/");
    if (err?.code === "ERR_MODULE_NOT_FOUND" && fromApp && specifier.endsWith(".js")) {
      return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
    }
    throw err;
  }
}
