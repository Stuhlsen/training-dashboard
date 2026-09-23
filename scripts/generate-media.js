/* ============================================================
   SCRIPTS/GENERATE-MEDIA.JS — KI-Medien über OpenRouter
   Einmalige Medien-Generierung für die öffentliche Landingpage.

   Verwendung:
     OPENROUTER_API_KEY=... OPENROUTER_IMAGE_MODEL=... node scripts/generate-media.js trenner-1 trenner-2 trenner-3
     OPENROUTER_API_KEY=... OPENROUTER_VIDEO_MODEL=... node scripts/generate-media.js hero-video

   Die .env wird über scripts/lib/env.js geladen. API-Keys werden
   niemals ausgegeben oder in eine Datei geschrieben.
   ============================================================ */

// Doku: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
// Doku: https://openrouter.ai/blog/tutorials/video-generation-api/

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./lib/env.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "app", "public", "assets", "landing");
const IMAGE_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const VIDEO_API_URL = "https://openrouter.ai/api/v1/videos";
const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL?.trim();
const VIDEO_MODEL = process.env.OPENROUTER_VIDEO_MODEL?.trim();
const REQUEST_HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://training-dashboard.clear-solutions-it.com",
  "X-Title": "Training Dashboard media preview",
};
const IMAGE_FILES = {
  cycling: "cycling-preview.png",
  running: "running-preview.png",
  swimming: "swimming-preview.png",
  landing: "landing-preview.png",
  "trenner-1": "trenner-1.png",
  "trenner-2": "trenner-2.png",
  "trenner-3": "trenner-3.png",
};
const VIDEO_FILE = "hero.mp4";
const VIDEO_POLL_INTERVAL_MS = 30_000;
const VIDEO_TIMEOUT_MS = 20 * 60 * 1_000;

const PROMPTS = {
  cycling:
    "Bright, sunlit editorial sports photograph of a solitary road cyclist on a scenic mountain gravel road in warm golden-hour daylight, wide open valley view, realistic photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center and left side visually calm for UI overlay.",
  running:
    "Bright, sunlit editorial sports photograph of a solitary trail runner on a mountain gravel path in golden-hour daylight, warm sunlight, wide open sky, realistic photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center and left side visually calm for UI overlay.",
  swimming:
    "Bright, sunlit editorial sports photograph of a swimmer in an outdoor pool or open water in warm golden-hour daylight, sparkling sunlit water, realistic photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center and left side visually calm for UI overlay.",
  landing:
    "Bright, sunlit premium sports-training atmosphere combining subtle visual traces of cycling, running and swimming in one coherent outdoor scene in warm golden-hour daylight, wide open landscape, realistic editorial photography, atmospheric but bright and airy (not dark or moody), no text, no logos, no identifiable person, wide 16:9 composition, keep the center visually calm for landing-page typography.",
  "trenner-1":
    "Bright, warm editorial photograph of a broad open cycling landscape in clear daylight and golden hour, an airy road or trail leading through the scene, realistic photography, calm visual center, wide 21:9 panoramic composition, no text, no logos, no identifiable people, no recognizable real places or landmarks.",
  "trenner-2":
    "Bright, warm editorial photograph of a broad open running landscape in clear daylight and golden hour, an airy path leading through the scene, realistic photography, calm visual center, wide 21:9 panoramic composition, no text, no logos, no identifiable people, no recognizable real places or landmarks.",
  "trenner-3":
    "Bright, warm editorial photograph of a broad open swimming landscape with sunlit water in clear daylight and golden hour, an airy horizon and calm visual center, realistic photography, wide 21:9 panoramic composition, no text, no logos, no identifiable people, no recognizable real places or landmarks.",
  "hero-video":
    "Bright, warm daylight, a calm slow camera movement over a wide open landscape in golden hour, a road or path winding through the landscape, gentle motion that works well as a repeating loop, no cuts, no text, no logos, no identifiable people, no real places, keep the left half visually calm for text overlay.",
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
    .flatMap((value) => value.match(/https?:\/\/[^\s)\]]+/g) ?? [])
    .find((value) => /\.(png|jpe?g|webp)(\?|$)/i.test(value));
  if (remoteUrl) return { type: "url", value: remoteUrl };

  throw new Error("Die OpenRouter-Antwort enthält keine verwertbare Bild-URL oder Data-URL.");
}

async function requestImage(category, prompt) {
  const response = await fetch(IMAGE_API_URL, {
    method: "POST",
    headers: REQUEST_HEADERS,
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["text", "image"],
      // Bei chat/completions liegt das Seitenverhältnis unter image_config,
      // nicht top-level (top-level aspect_ratio gilt nur für /api/v1/images).
      image_config: { aspect_ratio: category.startsWith("trenner-") ? "21:9" : "16:9" },
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
  const outputPath = path.join(OUTPUT_DIR, IMAGE_FILES[category]);

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

async function requestVideo(prompt) {
  const response = await fetch(VIDEO_API_URL, {
    method: "POST",
    headers: REQUEST_HEADERS,
    body: JSON.stringify({
      model: VIDEO_MODEL,
      prompt,
      duration: 6,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: false,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`hero-video: OpenRouter-Fehler: ${detail}`);
  }
  if (!body?.id || !body?.polling_url) {
    throw new Error("hero-video: OpenRouter-Antwort enthält keine Job-ID oder Polling-URL.");
  }
  return body;
}

async function pollVideo(job) {
  const startedAt = Date.now();
  let status = job.status;
  let result = job;

  while (status !== "completed") {
    if (["failed", "cancelled", "expired"].includes(status)) {
      throw new Error(`hero-video: Video-Job ${status}: ${result.error || "keine weiteren Details"}.`);
    }
    if (Date.now() - startedAt >= VIDEO_TIMEOUT_MS) {
      throw new Error("hero-video: Video-Job wurde nach 20 Minuten ohne Ergebnis abgebrochen.");
    }

    console.log(`hero-video: Status ${status || "unbekannt"}; nächste Prüfung in 30 s.`);
    await new Promise((resolve) => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
    const response = await fetch(job.polling_url, { headers: REQUEST_HEADERS });
    result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.error?.message || `HTTP ${response.status}`;
      throw new Error(`hero-video: Statusabfrage fehlgeschlagen: ${detail}`);
    }
    status = result?.status;
  }

  return result;
}

async function saveVideo(job) {
  const response = await fetch(`${VIDEO_API_URL}/${encodeURIComponent(job.id)}/content?index=0`, {
    headers: REQUEST_HEADERS,
  });
  if (!response.ok) throw new Error(`hero-video: Video-Download fehlgeschlagen (HTTP ${response.status}).`);

  const outputPath = path.join(OUTPUT_DIR, VIDEO_FILE);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
}

function printHelp() {
  console.log("Keine Kategorie angegeben. Es wird nichts erzeugt.");
  console.log("Verfügbare Kategorien:");
  for (const category of Object.keys(PROMPTS)) {
    const filename = category === "hero-video" ? VIDEO_FILE : IMAGE_FILES[category];
    console.log(`- ${category} → app/public/assets/landing/${filename}`);
  }
}

async function main() {
  const requested = process.argv.slice(2);
  if (!requested.length) {
    printHelp();
    return;
  }

  const unknown = requested.filter((category) => !PROMPTS[category]);
  if (unknown.length) {
    const known = Object.keys(PROMPTS).join(", ");
    throw new Error(`Unbekannte Kategorie in [${unknown.join(", ")}]. Bekannt: ${known}.`);
  }
  if (!API_KEY) throw new Error("OPENROUTER_API_KEY fehlt in .env.");

  for (const category of requested) {
    if (category === "hero-video") {
      if (!VIDEO_MODEL) {
        throw new Error(
          "OPENROUTER_VIDEO_MODEL fehlt in .env. Bitte die gewünschte exakte OpenRouter-Video-Modell-ID eintragen; sie wird bewusst nicht geraten.",
        );
      }
      console.log("Starte hero-video-Job.");
      const job = await requestVideo(PROMPTS[category]);
      const completed = await pollVideo(job);
      const outputPath = await saveVideo(completed);
      console.log(`Gespeichert: ${path.relative(ROOT, outputPath)}`);
      if (completed.usage?.cost !== undefined) console.log(`Kosten: ${completed.usage.cost}`);
      continue;
    }

    if (!IMAGE_MODEL) {
      throw new Error(
        "OPENROUTER_IMAGE_MODEL fehlt in .env. Bitte die aktuelle exakte Nano-Banana-2-Modell-ID aus OpenRouter eintragen; sie wird bewusst nicht geraten.",
      );
    }
    console.log(`Generiere Bild: ${category}`);
    const source = await requestImage(category, PROMPTS[category]);
    const outputPath = await saveImage(category, source);
    console.log(`Gespeichert: ${path.relative(ROOT, outputPath)}`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
