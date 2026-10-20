/* ============================================================
   DEMO/LIB/GUARDS.JS — harte Sicherungen (Fahrplan 31 E3, Vertrag V1)
   Regel Nr. 1: Echte Daten verschwinden nie. Jede Funktion wirft, sobald
   ein Ziel nicht eindeutig Demo ist. Bewusst KEINE Ausnahme per
   Umgebungsvariable und kein --force — wer hier lockern will, fragt Alex.
   Jeder Demo-Einstiegspunkt ruft die passenden Sperren als erste
   Anweisung, bevor eine Verbindung aufgebaut oder Datei geöffnet wird.
   Kein Import aus app/ — dieses Modul muss vor allem anderen ladbar sein.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Erlaubter Ausgabeordner auf dem Entwicklerrechner. */
export const DEMO_DATA_DIR = path.join(REPO_ROOT, "data-demo");

/** Erlaubter Ausgabeordner im demo-seed-Container (Volume demo_data). */
export const CONTAINER_DATA_DIR = path.resolve("/demo/data");

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEMO_EMAIL_SUFFIX = "@demo.local";

/**
 * Wirft, außer die URL zeigt exakt auf localhost/127.0.0.1 (Port beliebig).
 * @param {unknown} url
 */
export function assertDemoTarget(url) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("Demo-Sperre: Ziel-URL fehlt");
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Demo-Sperre: Ziel-URL ist ungültig");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Demo-Sperre: Protokoll ${parsed.protocol} nicht erlaubt`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Demo-Sperre: Host ${parsed.hostname} ist nicht localhost`);
  }
}

/** @param {string} child @param {string} parent */
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/**
 * Echter Pfad trotz Symlinks/Junctions, auch wenn die Datei (oder ihr
 * Ordner) noch nicht existiert: nächsten existierenden Vorfahren über
 * fs.realpathSync auflösen, Rest wieder anhängen.
 * @param {string} absPath
 */
function realPathOf(absPath) {
  const rest = [];
  let current = absPath;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest);
    } catch (err) {
      if (err?.code !== "ENOENT") throw err;
      const parent = path.dirname(current);
      if (parent === current) return absPath;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

/** Erlaubte Ordner, jeweils wie angegeben und real aufgelöst. */
const allowedRoots = () =>
  [DEMO_DATA_DIR, CONTAINER_DATA_DIR].flatMap((dir) => [dir, realPathOf(dir)]);

/**
 * Wirft, außer `p` liegt (auch nach Auflösen von Symlinks) innerhalb von
 * <repo>/data-demo/ oder /demo/data.
 * @param {unknown} p
 */
export function assertDemoOutputPath(p) {
  if (typeof p !== "string" || p.trim() === "") {
    throw new Error("Demo-Sperre: Ausgabepfad fehlt");
  }
  const resolved = path.resolve(p);
  const roots = allowedRoots();
  if (!roots.some((root) => isInside(resolved, root))) {
    throw new Error(`Demo-Sperre: ${resolved} liegt nicht in data-demo/ oder /demo/data`);
  }
  const real = realPathOf(resolved);
  if (!roots.some((root) => isInside(real, root))) {
    throw new Error(`Demo-Sperre: ${resolved} zeigt über einen Link nach ${real}`);
  }
}

/**
 * Wirft, außer die E-Mail endet auf @demo.local (mit Text davor).
 * @param {unknown} email
 */
export function assertDemoAccount(email) {
  if (typeof email !== "string") {
    throw new Error("Demo-Sperre: E-Mail fehlt");
  }
  const normalized = email.trim().toLowerCase();
  const local = normalized.slice(0, -DEMO_EMAIL_SUFFIX.length);
  if (!normalized.endsWith(DEMO_EMAIL_SUFFIX) || local === "" || local.includes("@")) {
    throw new Error("Demo-Sperre: Account ist kein @demo.local-Account");
  }
}
