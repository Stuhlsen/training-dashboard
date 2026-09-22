/* ============================================================
   SCRIPTS/GENERATE-MEDIA.JS — KI-Bilder über OpenRouter
   Einmalige Preview-Generierung für die öffentliche Landingpage.

   Verwendung:
     OPENROUTER_API_KEY=... node scripts/generate-media.js

   Die .env wird über scripts/lib/env.js geladen. Der API-Key wird
   niemals ausgegeben oder in eine Datei geschrieben.
   ============================================================ */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./lib/env.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "app", "public", "assets", "landing");
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const MODEL = process.env.OPENROUTER_IMAGE_MODEL?.trim();

const PROMPTS = {
  cycling:
    "Bright, sunlit editorial sports photograph of a solitary road cyclist on a scenic mountain gravel road in warm golden-hour daylight, wide open valley view, realistic photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center and left side visually calm for UI overlay.",
  running:
    "Bright, sunlit editorial sports photograph of a solitary trail runner on a mountain gravel path in golden-hour daylight, warm sunlight, wide open sky, realistic photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center and left side visually calm for UI overlay.",
  swimming:
    "Bright, sunlit editorial sports photograph of a swimmer in an outdoor pool or open water in warm golden-hour daylight, sparkling sunlit water, realistic photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center and left side visually calm for UI overlay.",
  landing:
    "Bright, sunlit premium sports-training atmosphere combining subtle visual traces of cycling, running and swimming in one coherent outdoor scene in warm golden-hour daylight, wide open landscape, realistic editorial photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center visually calm for landing-page typography.",
};

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function extractImageSource(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  const candidates = [];

  // OpenRouter liefert Bilder bei modalities:["text","image"] (Nano-Banana-
  // Familie) als eigenes message.images[]-Array zurück, nicht im content-Feld
  // — content ist dabei sogar null. Beobachtet gegen google/gemini-3.1-flash-image.
  if (Array.isArray(message?.images)) {
    for (const part of message.images) {
      if (typeof part?.image_url?.url === "string") candidates.push(part.image_url.url);
      if (typeof part?.url === "string") candidates.push(part.url);
    }
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part?.image_url?.url === "string") candidates.push(part.image_url.url);
      if (typeof part?.url === "string") candidates.push(part.url);
      if (typeof part?.text === "string") candidates.push(part.text);
    }
  } else if (typeof content === "string") {
    candidates.push(content);
  }

  const dataUrl = candidates.find((value) => value.startsWith("data:image/"));
  if (dataUrl) return { type: "data", value: dataUrl };

  const remoteUrl = candidates
    .flatMap((value) => value.match(/https?:\/\/[^\\s)\\]]+/g) ?? [])
    .find((value) => /\.(png|jpe?g|webp)(\?|$)/i.test(value));
  if (remoteUrl) return { type: "url", value: remoteUrl };

  throw new Error("Die OpenRouter-Antwort enthält keine verwertbare Bild-URL oder Data-URL.");
}

async function requestImage(category, prompt) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://training-dashboard.clear-solutions-it.com",
      "X-Title": "Training Dashboard media preview",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["text", "image"],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${category}: OpenRouter-Fehler: ${detail}`);
  }
  return extractImageSource(body);
}

async function saveImage(category, source) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${category}-preview.png`);

  if (source.type === "data") {
    const match = source.value.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/s);
    if (!match) throw new Error(`${category}: unbekanntes Data-URL-Format.`);
    await fs.writeFile(outputPath, Buffer.from(match[2], "base64"));
    return outputPath;
  }

  const response = await fetch(source.value);
  if (!response.ok) throw new Error(`${category}: Bild-Download fehlgeschlagen (HTTP ${response.status}).`);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

async function main() {
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY fehlt in .env.");
  if (!MODEL) {
    throw new Error(
      "OPENROUTER_IMAGE_MODEL fehlt in .env. Bitte die aktuelle exakte Nano-Banana-2-Modell-ID aus OpenRouter eintragen; sie wird bewusst nicht geraten.",
    );
  }

  // Ohne Argument: alle Kategorien (Vollstart). Mit Argumenten: nur die
  // genannten Kategorien neu erzeugen, z.B. `node scripts/generate-media.js
  // cycling` — spart Kosten, wenn nur eine Kategorie erneut probiert wird.
  const requested = process.argv.slice(2);
  const entries = requested.length
    ? Object.entries(PROMPTS).filter(([category]) => requested.includes(category))
    : Object.entries(PROMPTS);
  if (requested.length && entries.length !== requested.length) {
    const known = Object.keys(PROMPTS).join(", ");
    throw new Error(`Unbekannte Kategorie in [${requested.join(", ")}]. Bekannt: ${known}.`);
  }

  for (const [category, prompt] of entries) {
    console.log(`Generiere Preview: ${category}`);
    const source = await requestImage(category, prompt);
    const outputPath = await saveImage(category, source);
    console.log(`Gespeichert: ${path.relative(ROOT, outputPath)}`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
