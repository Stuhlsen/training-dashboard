/* ============================================================
   SCRIPTS/LIB/OUTPUT.JS — Lokale Dateien lesen/schreiben
   subjective.json/adjustments.json laden und die generierten
   rides.json/rides-2.json schreiben.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");

export const OUT_FILE = path.join(DATA_DIR, "rides.json");
export const OUT_FILE_2 = path.join(DATA_DIR, "rides-2.json");
const SUBJECTIVE_FILE = path.join(DATA_DIR, "subjective.json");
const ADJUSTMENTS_FILE = path.join(DATA_DIR, "adjustments.json");

/** JSON-Datei tolerant laden — {} wenn nicht vorhanden/lesbar */
function loadJsonFile(file, label) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch (e) {
    log.warn(`${label} nicht lesbar:`, e.message);
  }
  return {};
}

export function loadSubjective() {
  return loadJsonFile(SUBJECTIVE_FILE, "subjective.json");
}

export function loadAdjustments() {
  return loadJsonFile(ADJUSTMENTS_FILE, "adjustments.json");
}

/** Output-Objekt als JSON schreiben (Verzeichnis wird angelegt)
 *  @param {string} file @param {Object} output */
export function writeOutput(file, output) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(output, null, 2), "utf-8");
}
