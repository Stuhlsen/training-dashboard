/* ============================================================
   FEATURES/NUTRITION/RECIPE-PHOTO.TS — Foto im Browser verkleinern
   (Fahrplan 25, S2a; Q9: WebP, längste Kante höchstens 1200 px)

   Braucht Canvas/DOM, liegt deshalb hier und nicht in core/. Die reine
   Größenrechnung (fitWithin) steht in core/recipe-submission.js.
   ============================================================ */

import { PHOTO_MAX_EDGE, fitWithin } from "../../core/recipe-submission.js";

/** Größte Originaldatei, die wir überhaupt zu dekodieren versuchen. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const WEBP_QUALITY = 0.85;

export class PhotoError extends Error {}

/** Verkleinert ein Foto auf WebP mit höchstens 1200 px Kantenlänge. */
export async function shrinkToWebp(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new PhotoError("Das ist keine Bilddatei.");
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError("Die Datei ist zu groß (höchstens 25 MB).");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoError("Das Bild konnte nicht gelesen werden.");
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("Das Bild konnte nicht verkleinert werden.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
    // Ältere Browser fallen still auf PNG zurück — dann lieber ablehnen als falsch hochladen
    if (!blob || blob.type !== "image/webp") throw new PhotoError("Dein Browser kann keine WebP-Bilder erzeugen.");
    return blob;
  } finally {
    bitmap.close();
  }
}
