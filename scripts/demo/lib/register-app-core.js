/* ============================================================
   DEMO/LIB/REGISTER-APP-CORE.JS — Hook-Registrierung (Fahrplan 31 E1)
   Muss geladen sein, BEVOR ein Modul importiert wird, das (direkt oder
   indirekt) app/src/core/plan-generator.js lädt — also per dynamischem
   `await import()` danach, oder per `node --import` vor dem Einstiegspunkt.
   Statische Imports reichen nicht: ESM löst alle statischen Imports auf,
   bevor dieser Code läuft.
   ============================================================ */

import { register } from "node:module";

register("./ts-resolve-hook.js", import.meta.url);
