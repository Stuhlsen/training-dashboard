/* ============================================================
   SCRIPTS/LIB/PLAN1-HISTORY.JS — Plan 1 (Athlet 1) als eingefrorene
   Historie.

   Fahrplan 10 E3a: Plan 1 war die manuell in Notion gepflegte
   Vorbereitungs-/Aufbauphase (24.03.–20.06.2026, 57 Fahrten, FTP
   166→193W). Sie ist abgeschlossen und wächst nie mehr (AGENTS.md
   „Trainingspläne"). Der Sync hat sie bis dahin bei JEDEM Lauf neu über
   die Notion-API geholt — eine externe Abhängigkeit für unveränderliche
   Daten.

   Jetzt einmal eingefroren nach plan1-history.json (im Repo committed,
   anders als data/*.json). Die frühere scripts/lib/notion.js
   (queryNotionPlan1 + NOTION_API_KEY/NOTION_DATABASE_ID) ist damit
   entfallen. Ortsangaben in den Freitextfeldern (name/notizen) wurden
   vor dem Einfrieren neutralisiert (Datenschutz, s. AGENTS.md „Wichtige
   Konventionen").

   Jede Zeile hat exakt die Struktur, die queryNotionPlan1() lieferte —
   inkl. dataSource:"notion" (bleibt als historisches Quellen-Label
   stehen, impliziert keinen Live-Notion-Aufruf mehr) und notionWetter
   (Freitext-Wetter-Fallback, s. generate-data.js). generate-data.js
   verarbeitet sie unverändert weiter (Wetter-Zuweisung, id-Vergabe,
   Merge mit Plan 2).
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, "plan1-history.json");

/**
 * Plan 1 (eingefroren), chronologisch. Ersetzt den früheren
 * `await queryNotionPlan1()`-Aufruf 1:1 (jetzt synchron — reiner
 * lokaler Datei-Read, kein Netz).
 * @returns {Array<Object>} Fahrt-Objekte wie aus notion.js
 */
export function loadPlan1History() {
  return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
}
