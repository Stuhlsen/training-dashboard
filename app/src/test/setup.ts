/* ============================================================
   TEST/SETUP.TS — globales Aufräumen für das Vitest-Projekt "app"

   Ohne `globals: true` registriert Testing Library sein automatisches
   `cleanup()` nicht — gerenderte Komponenten und Hooks blieben nach jedem
   Test gemountet. Ein Hook-Test, der nur auf eine von mehreren Queries
   wartet, endet dann, während die übrigen noch laufen; deren Antworten
   lösen React-Updates aus, nachdem jsdom die Umgebung schon abgebaut hat
   → sporadisch "ReferenceError: window is not defined" in CI
   (useBlockTransition/useExportPrefs, 20.10.2026). Unmounten nach jedem
   Test meldet die Query-Beobachter ab, späte Antworten erreichen React
   nicht mehr.
   ============================================================ */

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
