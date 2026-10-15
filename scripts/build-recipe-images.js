/* ============================================================
   scripts/build-recipe-images.js — Einmal-Skript (Fahrplan 25, F3)

   Wandelt freigegebene KI-Rezeptbilder (<external_id>.png) in WebP
   um und schreibt das Manifest, über das die App Bilder auflöst:

     app/public/recipe-images/<external_id>.webp
     app/src/core/recipe-images-manifest.json   (sortierte external_ids)

   Aufruf (Repo-Root):
     node scripts/build-recipe-images.js <png-ordner> [--quality 75]

   Werkzeug: `ffmpeg` (libwebp) aus dem PATH — bewusst keine neue
   npm-Abhängigkeit im Root. Kante höchstens 800 px, Metadaten
   (inkl. C2PA-Block) werden nicht übernommen; die Kennzeichnung
   übernimmt das Label in der Oberfläche (RecipeImage).
   Die Quell-PNGs werden nur gelesen, nie verändert und nie ins Repo kopiert.
   ============================================================ */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_EDGE = 800;
export const DEFAULT_QUALITY = 75;

const SOURCE_NAME = /^(own-[a-z0-9-]+)\.png$/;
const WEBP_NAME = /^(own-[a-z0-9-]+)\.webp$/;

/** external_id aus einem PNG-Dateinamen, sonst null (Fremddateien werden übersprungen). */
export function externalIdFromPng(fileName) {
  return SOURCE_NAME.exec(fileName)?.[1] ?? null;
}

/** Sortierte, eindeutige external_ids aus den vorhandenen WebP-Dateinamen. */
export function buildManifest(webpFileNames) {
  const ids = webpFileNames.map((n) => WEBP_NAME.exec(n)?.[1]).filter(Boolean);
  return [...new Set(ids)].sort();
}

/** ffmpeg-Argumente: längste Kante ≤ MAX_EDGE, nie hochskalieren, ohne Metadaten. */
export function ffmpegArgs(input, output, quality) {
  const scale = `scale='min(${MAX_EDGE},iw)':'min(${MAX_EDGE},ih)':force_original_aspect_ratio=decrease`;
  return [
    "-v",
    "error",
    "-y",
    "-i",
    input,
    "-vf",
    scale,
    "-c:v",
    "libwebp",
    "-quality",
    String(quality),
    "-map_metadata",
    "-1",
    output,
  ];
}

function parseArgs(argv) {
  const qIdx = argv.indexOf("--quality");
  const quality = qIdx === -1 ? DEFAULT_QUALITY : Number(argv[qIdx + 1]);
  const inputDir = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--quality");
  if (!inputDir || !Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error("Aufruf: node scripts/build-recipe-images.js <png-ordner> [--quality 1-100]");
  }
  return { inputDir, quality };
}

function main() {
  const { inputDir, quality } = parseArgs(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = path.join(root, "app", "public", "recipe-images");
  const manifestPath = path.join(root, "app", "src", "core", "recipe-images-manifest.json");
  mkdirSync(outDir, { recursive: true });

  for (const file of readdirSync(inputDir)) {
    const id = externalIdFromPng(file);
    if (!id) {
      console.log(`übersprungen: ${file}`);
      continue;
    }
    execFileSync(
      "ffmpeg",
      ffmpegArgs(path.join(inputDir, file), path.join(outDir, `${id}.webp`), quality)
    );
  }

  const files = readdirSync(outDir);
  const manifest = buildManifest(files);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const bytes = files
    .filter((f) => WEBP_NAME.test(f))
    .reduce((sum, f) => sum + statSync(path.join(outDir, f)).size, 0);
  console.log(
    `${manifest.length} Bilder, ${(bytes / 1024 / 1024).toFixed(2)} MB, Qualität ${quality}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
